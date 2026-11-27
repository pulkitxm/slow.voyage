import { expect, test } from 'bun:test'
import { boulderLayout, planBoulders, planPlants, plantKinds, plantLook } from './boulders'
import { landscapeIds, landscapeProfiles } from './landscapes'
import { roadCoordinates } from './road'
import { defaults, random, shoreHeight, World } from './world'

test('boulders are scattered beside the road, never on it or in water, the same way every time', () => {
  for (const landscape of landscapeIds) {
    const world = new World({ ...defaults, landscape })
    let placed = 0
    for (let tile = 0; tile < 30; tile++) {
      const list = planBoulders(world, tile * 120, 120, random(tile * 613 + 5))
      const again = planBoulders(world, tile * 120, 120, random(tile * 613 + 5))
      expect(again).toEqual(list)
      expect(list.length).toBeLessThanOrEqual(landscapeProfiles[landscape].boulders * 3)
      for (const boulder of list) {
        placed++
        const offset = Math.abs(roadCoordinates(world, boulder.x, boulder.s).distance)
        expect(offset).toBeGreaterThan(boulderLayout.nearest - 1.5)
        expect(world.height(boulder.x, boulder.s)).toBeGreaterThanOrEqual(shoreHeight + 0.3)
        expect(boulder.radius).toBeGreaterThan(0.15)
        expect(boulder.radius).toBeLessThan(1.6)
      }
    }
    expect(placed).toBeGreaterThan(landscapeProfiles[landscape].boulders * 10)
  }
})

test('each landscape plants only its own plants, beside the road and out of the water', () => {
  for (const landscape of landscapeIds) {
    const world = new World({ ...defaults, landscape })
    let planted = 0
    for (let tile = 0; tile < 30; tile++) {
      const list = planPlants(world, tile * 120, 120, random(tile * 389 + 11))
      expect(list.length).toBeLessThanOrEqual(landscapeProfiles[landscape].plants)
      for (const plant of list) {
        planted++
        expect(plantKinds[landscape]).toContain(plant.kind)
        expect(Math.abs(roadCoordinates(world, plant.x, plant.s).distance)).toBeGreaterThan(
          boulderLayout.plantNearest - 1.5,
        )
        expect(world.height(plant.x, plant.s)).toBeGreaterThanOrEqual(shoreHeight + 0.3)
        expect(plant.radius).toBeLessThan(0.7)
      }
    }
    expect(planted).toBeGreaterThan(landscapeProfiles[landscape].plants * 10)
  }
})

test('shrubs, bushes and jungle plants can be driven through and every landscape has its own', () => {
  const kinds = boulderLayout.kinds
  const added = kinds.slice(8)
  expect(added.length).toBe(7)
  for (const plant of added) {
    expect(plant.rock).toBe(false)
    expect(plant.solid).toBe(0)
    expect(plant.size[1]).toBeLessThanOrEqual(3)
  }
  for (const landscape of landscapeIds) {
    expect(new Set(plantKinds[landscape]).size).toBeGreaterThanOrEqual(3)
    expect(plantKinds[landscape].some((kind) => kind >= 8)).toBe(true)
    for (const kind of plantKinds[landscape]) expect(kinds[kind]).toBeDefined()
  }
  expect(plantKinds.desert).toContain(12)
  expect(plantKinds.jungle).toContain(13)
  expect(plantKinds.forest).not.toContain(12)
})

test('leafy shrubs and bushes are left out in winter while other plants stay', () => {
  for (const landscape of ['highlands', 'forest', 'fjord'] as const) {
    const summer = new World({ ...defaults, landscape })
    const winter = new World({ ...defaults, landscape, season: 'winter' })
    let leafy = 0
    let kept = 0
    for (let tile = 0; tile < 40; tile++) {
      for (const plant of planPlants(summer, tile * 120, 120, random(tile * 389 + 11)))
        if ('leafy' in (boulderLayout.kinds[plant.kind] ?? {})) leafy++
      for (const plant of planPlants(winter, tile * 120, 120, random(tile * 389 + 11))) {
        expect('leafy' in (boulderLayout.kinds[plant.kind] ?? {})).toBe(false)
        kept++
      }
    }
    expect(leafy).toBeGreaterThan(10)
    expect(kept).toBeGreaterThan(10)
  }
})

test('most plants stand close to the road edge where they can be seen', () => {
  const world = new World({ ...defaults, landscape: 'forest' })
  let near = 0
  let total = 0
  for (let tile = 0; tile < 60; tile++)
    for (const plant of planPlants(world, tile * 120, 120, random(tile * 389 + 11))) {
      total++
      if (Math.abs(roadCoordinates(world, plant.x, plant.s).distance) < 16) near++
    }
  expect(total).toBeGreaterThan(300)
  expect(near / total).toBeGreaterThan(0.6)
})

test('plants are toned below their painted brightness and darken toward the ground', () => {
  expect(plantLook.level).toBeLessThan(1)
  expect(plantLook.keep).toBeLessThan(1)
  expect(plantLook.root).toBeLessThan(0.7)
  expect(plantLook.crown).toBeGreaterThan(0.2)
  expect(plantLook.cast).toBeGreaterThan(0.05)
  expect(plantLook.cast).toBeLessThan(0.3)
})

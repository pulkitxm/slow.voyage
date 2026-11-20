import { expect, test } from 'bun:test'
import { boulderLayout, planBoulders, planPlants, plantKinds } from './boulders'
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

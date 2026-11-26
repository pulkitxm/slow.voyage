import { describe, expect, test } from 'bun:test'
import { landmarksBetween } from './landmarks'
import { landscapeIds } from './landscapes'
import { CarPhysics } from './physics'
import { guardrailAt, roadCoordinates, roadLayout } from './road'
import { chevrons, roadCurvature } from './roadside'
import { stretchWaterfalls } from './waterfalls'
import { defaults, type RoadMode, roadModes, World } from './world'

const stretch = 12000

function sharpest(world: World) {
  let curvature = 0
  for (let s = 0; s < stretch; s += 5)
    curvature = Math.max(curvature, Math.abs(roadCurvature(world, s)))
  return curvature
}

function railShare(world: World, side: number) {
  let railed = 0
  let total = 0
  for (let s = 0; s < stretch; s += roadLayout.railSegmentLength) {
    total++
    if (guardrailAt(world, s, side)) railed++
  }
  return railed / total
}

describe('road modes', () => {
  test('the endless straight never turns while the land keeps changing', () => {
    for (const landscape of landscapeIds) {
      const world = new World({ ...defaults, landscape, roadMode: 'straight' })
      const heights = new Set<number>()
      for (let s = 0; s < stretch; s += 50) {
        const road = world.road(s)
        expect(Math.abs(road.yaw)).toBe(0)
        expect(Math.abs(road.dx)).toBe(0)
        expect(Math.abs(road.x)).toBe(0)
        heights.add(Math.round(world.height(60, s)))
      }
      expect(heights.size).toBeGreaterThan(5)
      expect(chevrons(world, 0, stretch).feet.length).toBe(0)
    }
  })

  test('the calm drive only has long, wide curves', () => {
    for (const seed of [42, 7, 90210]) {
      const calm = sharpest(new World({ ...defaults, seed, roadMode: 'calm' }))
      const winding = sharpest(new World({ ...defaults, seed }))
      expect(1 / calm).toBeGreaterThan(600)
      expect(calm).toBeLessThan(winding * 0.4)
      let turn = 0
      const world = new World({ ...defaults, seed, roadMode: 'calm' })
      for (let s = 0; s < stretch; s += 25)
        turn += Math.abs(world.road(s + 25).yaw - world.road(s).yaw)
      expect(turn).toBeGreaterThan(1)
    }
  })

  test('the calm drive halves the walkers on the verge', async () => {
    const { lifeLayout, planSlot } = await import('./life')
    expect(lifeLayout.calmShare).toBe(0.5)
    const count = (roadMode: RoadMode) => {
      const world = new World({ ...defaults, roadMode })
      let walkers = 0
      for (let slot = 0; slot < 200; slot++)
        if (planSlot(world, slot, 'lively')?.members[0]?.kind === 'person') walkers++
      return walkers
    }
    expect(count('calm')).toBeLessThan(count('winding') * 0.7)
  })

  test.each(roadModes)('%s keeps rails, open verges and landmarks along the road', (roadMode) => {
    for (const landscape of landscapeIds) {
      const world = new World({ ...defaults, landscape, roadMode })
      for (const side of [-1, 1]) {
        const share = railShare(world, side)
        expect(share).toBeLessThan(0.8)
      }
      expect(landmarksBetween(world, 0, stretch).length).toBeGreaterThan(4)
      stretchWaterfalls(world, 0)
    }
  })

  test.each(roadModes)(
    '%s autodrive stays on the pavement without touching a barrier',
    (roadMode) => {
      for (const landscape of ['highlands', 'alpine', 'canyon', 'fjord'] as const) {
        const settings = { ...defaults, landscape, roadMode }
        const world = new World(settings)
        const car = new CarPhysics(world)
        car.reset(900)
        let widest = 0
        for (let step = 0; step < 45 * 120; step++) {
          car.update(1 / 120, car.autoInput(26), settings)
          widest = Math.max(widest, Math.abs(roadCoordinates(world, car.x, car.s).distance))
        }
        expect(car.s).toBeGreaterThan(900 + 45 * 15)
        expect(widest).toBeLessThan(roadLayout.halfWidth)
        expect(car.hits).toBe(0)
      }
    },
  )

  test('landmarks and waterfalls follow the road of the chosen mode', () => {
    const winding = new World({ ...defaults, landscape: 'fjord' })
    const straight = new World({ ...defaults, landscape: 'fjord', roadMode: 'straight' })
    const a = landmarksBetween(winding, 0, stretch).map((mark) => mark.x)
    const b = landmarksBetween(straight, 0, stretch).map((mark) => mark.x)
    expect(a).not.toEqual(b)
    for (const mark of landmarksBetween(straight, 0, stretch))
      expect(Math.abs(roadCoordinates(straight, mark.x, mark.s).distance)).toBeGreaterThan(20)
  })
})

import { describe, expect, test } from 'bun:test'
import { worldLoop } from './field'
import { lapLandmarks } from './landmarks'
import { landscapeIds } from './landscapes'
import { CarPhysics } from './physics'
import { guardrailAt, roadCoordinates, roadLayout } from './road'
import { chevrons, roadCurvature } from './roadside'
import { lapWaterfalls } from './waterfalls'
import { defaults, type RoadMode, roadModes, World } from './world'

function sharpest(world: World) {
  let curvature = 0
  for (let s = 0; s < worldLoop.length; s += 5)
    curvature = Math.max(curvature, Math.abs(roadCurvature(world, s)))
  return curvature
}

function railShare(world: World, side: number) {
  let railed = 0
  let total = 0
  for (let s = 0; s < worldLoop.length; s += roadLayout.railSegmentLength) {
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
      for (let s = 0; s < worldLoop.length; s += 50) {
        const road = world.road(s)
        expect(Math.abs(road.yaw)).toBe(0)
        expect(Math.abs(road.dx)).toBe(0)
        expect(Math.abs(road.x)).toBe(0)
        heights.add(Math.round(world.height(60, s)))
      }
      expect(heights.size).toBeGreaterThan(5)
      expect(chevrons(world, 0, worldLoop.length).feet.length).toBe(0)
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
      for (let s = 0; s < worldLoop.length; s += 25)
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

  test.each(roadModes)('%s repeats every lap and keeps rails and open verges', (roadMode) => {
    for (const landscape of landscapeIds) {
      const world = new World({ ...defaults, landscape, roadMode })
      for (const s of [0, 1234, 7777]) {
        const here = world.road(s)
        const lap = world.road(s + worldLoop.length)
        expect(lap.x).toBeCloseTo(here.x, 6)
        expect(lap.y).toBeCloseTo(here.y, 6)
      }
      for (const side of [-1, 1]) {
        const share = railShare(world, side)
        expect(share).toBeLessThan(0.8)
      }
      expect(lapLandmarks(world).length).toBeGreaterThan(4)
      lapWaterfalls(world)
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
    const a = lapLandmarks(winding).map((mark) => mark.x)
    const b = lapLandmarks(straight).map((mark) => mark.x)
    expect(a).not.toEqual(b)
    for (const mark of lapLandmarks(straight))
      expect(Math.abs(roadCoordinates(straight, mark.x, mark.s).distance)).toBeGreaterThan(20)
  })
})

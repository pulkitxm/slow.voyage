import { expect, test } from 'bun:test'
import { CarPhysics } from './physics'
import { roadLayout } from './road'
import { potholeDepth, puddleDepth, roadConditionAt, roadConditionLayout } from './road-condition'
import { defaults, World } from './world'

const samples = Array.from({ length: 4000 }, (_, index) => ({
  s: index * 0.61,
  distance: ((index * 37) % 100) / 100 - 0.5,
})).map(({ s, distance }) => ({ s, distance: distance * roadLayout.halfWidth * 2 }))

test('road condition repeats with its period', () => {
  for (const { s, distance } of samples.slice(0, 200)) {
    const here = roadConditionAt(s, distance)
    const next = roadConditionAt(s + roadConditionLayout.period, distance)
    for (const key of ['water', 'dirt', 'damage', 'patch'] as const)
      expect(next[key]).toBeCloseTo(here[key], 4)
  }
})

test('only a broken road has potholes, and they stay shallow', () => {
  let deepest = 0
  for (const { s, distance } of samples) {
    expect(potholeDepth('worn', s, distance)).toBe(0)
    expect(potholeDepth('fresh', s, distance)).toBe(0)
    deepest = Math.max(deepest, potholeDepth('broken', s, distance))
  }
  expect(deepest).toBeGreaterThan(0.03)
  expect(deepest).toBeLessThanOrEqual(roadConditionLayout.potholeDepth)
})

test('puddles gather only in the wet and spread in a storm', () => {
  const covered = (weather: string) =>
    samples.filter(({ s, distance }) => puddleDepth(weather, s, distance) > 0.5).length
  expect(covered('clear')).toBe(0)
  expect(covered('rain')).toBeGreaterThan(samples.length * 0.05)
  expect(covered('storm')).toBeGreaterThan(covered('rain'))
  expect(covered('storm')).toBeLessThan(samples.length * 0.6)
})

test('a broken road lowers the pavement under a wheel', () => {
  const smooth = new World({ ...defaults })
  const broken = new World({ ...defaults, roadWear: 'broken' })
  let dropped = 0
  for (let s = 0; s < 1200; s += 0.5) {
    const road = smooth.road(s)
    const x = road.x + Math.cos(road.yaw) * 1.4
    const gap = smooth.surface(x, s).height - broken.surface(x, s).height
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(broken.surface(x, s).onRoad).toBe(true)
    dropped = Math.max(dropped, gap)
  }
  expect(dropped).toBeGreaterThan(0.02)
})

test('autodrive holds a potholed road for a minute and feels the holes', () => {
  const settings = { ...defaults, roadWear: 'broken' as const }
  const car = new CarPhysics(new World(settings))
  car.reset(0)
  let deepest = 0
  for (let step = 0; step < 60 * 120; step++) {
    car.update(1 / 120, car.autoInput(settings.cruiseSpeed), settings)
    if (step > 240) expect(car.offroad).toBe(false)
    for (const wheel of car.suspension.wheels)
      deepest = Math.max(deepest, car.world.road(wheel.s).y - wheel.ground)
  }
  expect(car.hits).toBe(0)
  expect(car.distance).toBeGreaterThan(900)
  expect(deepest).toBeGreaterThan(0.02)
})

test('standing water drags a wheel and takes grip only in the wet', () => {
  const soaked = new CarPhysics(new World({ ...defaults, weather: 'storm' }))
  const dry = new CarPhysics(new World({ ...defaults }))
  let wettest = 0
  for (const car of [soaked, dry]) {
    car.reset(0)
    for (let step = 0; step < 40 * 120; step++) {
      car.update(1 / 120, car.autoInput(22), car.world.settings)
      for (const wheel of car.suspension.wheels) {
        if (car === dry) expect(wheel.puddle).toBe(0)
        else wettest = Math.max(wettest, wheel.puddle)
      }
    }
    expect(car.hits).toBe(0)
    expect(car.offroad).toBe(false)
  }
  expect(wettest).toBeGreaterThan(0.5)
  expect(soaked.distance).toBeGreaterThan(500)
})

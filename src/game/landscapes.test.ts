import { expect, test } from 'bun:test'
import { smoothStep, worldLoop } from './field'
import { landscapeIds, landscapeProfiles, terraced } from './landscapes'
import { CarPhysics } from './physics'
import { decodeSettings } from './settings'
import { defaults, shoreHeight, World } from './world'

test('terraces stay continuous, keep the road level and leave smooth ground untouched', () => {
  expect(terraced(13.7, 0, smoothStep)).toBe(13.7)
  expect(terraced(0, 26, smoothStep)).toBe(0)
  let previous = terraced(-120, 26, smoothStep)
  for (let value = -120; value <= 120; value += 0.01) {
    const shaped = terraced(value, 26, smoothStep)
    expect(shaped).toBeGreaterThanOrEqual(previous - 1e-9)
    expect(shaped - previous).toBeLessThan(0.08)
    previous = shaped
  }
  expect(
    Math.abs(terraced(26 * 3 + 2, 26, smoothStep) - terraced(26 * 3 + 6, 26, smoothStep)),
  ).toBeLessThan(1.6)
})

test.each(landscapeIds)('%s keeps its whole lap above the water line', (landscape) => {
  for (const seed of [42, 7, 90210]) {
    const world = new World({ ...defaults, landscape, seed })
    for (let s = 0; s < worldLoop.length; s += 30)
      expect(world.road(s).y).toBeGreaterThan(shoreHeight + 0.5)
  }
})

test.each(landscapeIds)('%s repeats after a lap and joins across the side seam', (landscape) => {
  const world = new World({ ...defaults, landscape })
  for (const s of [0, 615, 4810, 9990]) {
    const center = world.road(s).x
    for (const offset of [-1400, -220, 9, 480, 1499]) {
      const height = world.height(center + offset, s)
      expect(world.height(center + offset, s + worldLoop.length)).toBeCloseTo(height, 5)
      expect(world.height(center + offset + worldLoop.width, s)).toBeCloseTo(height, 5)
    }
    const seam = center + worldLoop.width / 2
    expect(Math.abs(world.height(seam - 0.001, s) - world.height(seam + 0.001, s))).toBeLessThan(
      0.01,
    )
  }
})

test.each(landscapeIds)('%s is a saved choice and carries a complete profile', (landscape) => {
  expect(decodeSettings({ landscape }).landscape).toBe(landscape)
  const profile = landscapeProfiles[landscape]
  expect(profile.relief).toBeGreaterThan(0)
  expect(profile.roadside.conifers + profile.roadside.narrow).toBeLessThanOrEqual(1)
  if (profile.woodland) expect(profile.woodland.start).toBeLessThan(profile.woodland.reach)
})

test.each(['forest', 'canyon', 'fjord', 'jungle'] as const)(
  '%s autodrive holds the pavement for two minutes without touching a barrier',
  (landscape) => {
    const settings = { ...defaults, landscape }
    const car = new CarPhysics(new World(settings))
    car.reset(0)
    for (let step = 0; step < 120 * 120; step++) {
      car.update(1 / 120, car.autoInput(settings.cruiseSpeed), settings)
      if (step > 240) expect(car.offroad).toBe(false)
    }
    expect(car.hits).toBe(0)
    expect(car.distance).toBeGreaterThan(1500)
  },
)

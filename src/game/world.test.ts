import { expect, test } from 'bun:test'
import { defaults, World } from './world'

test('road generation is deterministic at arbitrary distances and query orders', () => {
  const world = new World({ ...defaults })
  const samples = [-3000, -120, 0, 180, 1200, 10000, 100000, 1000000]
  const original = samples.map((s) => world.road(s))
  expect(
    [...samples]
      .reverse()
      .map((s) => world.road(s))
      .reverse(),
  ).toEqual(original)
  const other = new World({ ...defaults, seed: 43 })
  expect(samples.map((s) => other.road(s))).not.toEqual(original)
})

test('road tangents and grade agree with measured positions', () => {
  const world = new World({ ...defaults })
  for (const s of [-456, 0, 37, 129, 450, 1200, 4143, 100000]) {
    const before = world.road(s - 0.001),
      after = world.road(s + 0.001),
      road = world.road(s)
    expect(road.dx).toBeCloseTo((after.x - before.x) / 0.002, 6)
    expect(road.dy).toBeCloseTo((after.y - before.y) / 0.002, 6)
    expect(Math.abs(after.yaw - before.yaw)).toBeLessThan(0.001)
  }
})

test('landscape profiles produce distinct elevation and grade ranges', () => {
  const ranges: number[] = []
  for (const landscape of ['desert', 'highlands', 'alpine'] as const) {
    const world = new World({ ...defaults, landscape })
    const heights: number[] = []
    for (let s = 0; s < 20000; s += 25) {
      const road = world.road(s)
      expect(Number.isFinite(road.x + road.y + road.dx + road.dy)).toBe(true)
      expect(Math.abs(road.dy)).toBeLessThan(0.16)
      heights.push(road.y)
    }
    ranges.push(Math.max(...heights) - Math.min(...heights))
  }
  expect(ranges[1]).toBeGreaterThan((ranges[0] ?? Infinity) * 2)
  expect(ranges[2]).toBeGreaterThan((ranges[1] ?? Infinity) * 2)
})

test('distant road sections do not repeat the initial curve', () => {
  const world = new World({ ...defaults })
  const initial = [0, 50, 100, 150].map((s) => world.road(s).dx)
  for (const offset of [3600, 10000, 50000, 100000])
    expect([0, 50, 100, 150].map((s) => world.road(s + offset).dx)).not.toEqual(initial)
})

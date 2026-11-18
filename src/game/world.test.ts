import { expect, test } from 'bun:test'
import { worldLoop } from './field'
import { groundLayout } from './ground-grid'
import { createWoodland } from './woodland'
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

test('the road, terrain and woodland repeat exactly after one lap', () => {
  for (const landscape of ['highlands', 'alpine', 'desert'] as const) {
    for (const seed of [42, 7, 90210]) {
      const world = new World({ ...defaults, landscape, seed })
      for (const s of [-5400, 0, 37.5, 1199.99, 6000, 11999]) {
        for (const laps of [1, -2, 5]) {
          const shifted = s + laps * worldLoop.length
          const road = world.road(s)
          const again = world.road(shifted)
          expect(again.x).toBeCloseTo(road.x, 6)
          expect(again.y).toBeCloseTo(road.y, 6)
          expect(again.dx).toBeCloseTo(road.dx, 9)
          expect(again.dy).toBeCloseTo(road.dy, 9)
          for (const offset of [-900, -40, 12, 300, 1400])
            expect(world.height(road.x + offset, shifted)).toBeCloseTo(
              world.height(road.x + offset, s),
              5,
            )
        }
      }
    }
  }
  const world = new World({ ...defaults })
  const tiles = worldLoop.length / groundLayout.tileLength
  const first = createWoodland(world, 3, 'high')
  const second = createWoodland(world, 3 + tiles, 'high')
  expect(first.length).toBeGreaterThan(0)
  expect(second.length).toBe(first.length)
  for (const [index, tree] of first.entries()) {
    expect(second[index]?.x).toBeCloseTo(tree.x, 6)
    expect((second[index]?.s ?? 0) - worldLoop.length).toBeCloseTo(tree.s, 6)
    expect(second[index]?.variant).toBe(tree.variant)
  }
})

test('the lap length holds whole terrain tiles and control cells', () => {
  expect(worldLoop.length % groundLayout.tileLength).toBe(0)
  expect(worldLoop.length % 1000).toBe(0)
})

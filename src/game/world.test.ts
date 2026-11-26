import { expect, test } from 'bun:test'
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

test('the road, terrain and woodland never repeat', () => {
  for (const landscape of ['highlands', 'alpine', 'desert'] as const) {
    for (const seed of [42, 7, 90210]) {
      const world = new World({ ...defaults, landscape, seed })
      for (const shift of [12000, -24000, 60000, 1200000]) {
        let same = 0
        const samples = [-5400, 0, 37.5, 1199.99, 6000, 11999]
        for (const s of samples) {
          const road = world.road(s)
          const again = world.road(s + shift)
          if (Math.abs(again.x - road.x) < 0.01 && Math.abs(again.y - road.y) < 0.01) same++
        }
        expect(same).toBeLessThan(2)
      }
      const heights = (shiftX: number, shiftS: number) =>
        [-900, -40, 300, 1400].map((offset) => world.height(offset + shiftX, 800 + shiftS))
      expect(heights(3000, 0)).not.toEqual(heights(0, 0))
      expect(heights(0, 12000)).not.toEqual(heights(0, 0))
    }
  }
  const world = new World({ ...defaults })
  const first = createWoodland(world, 3, 'high')
  const second = createWoodland(world, 103, 'high')
  expect(first.length).toBeGreaterThan(0)
  expect(second.map((tree) => tree.x)).not.toEqual(first.map((tree) => tree.x))
})

test('terrain stays continuous far from the road in every direction', () => {
  for (const landscape of ['highlands', 'alpine', 'desert'] as const) {
    const world = new World({ ...defaults, landscape })
    for (const s of [0, 310, 2750, 640000, -11810])
      for (const x of [-25000, -1500, 1500, 4000, 90000]) {
        const inside = (world.height(x, s) - world.height(x - 0.05, s)) / 0.05
        const beyond = (world.height(x + 0.05, s) - world.height(x, s)) / 0.05
        expect(Number.isFinite(world.height(x, s))).toBe(true)
        expect(Math.abs(inside - beyond)).toBeLessThan(0.02)
      }
  }
})

import { expect, test } from 'bun:test'
import {
  CanopyIndex,
  canopyCover,
  canopyShade,
  shadeDepth,
  shadeStops,
  shadeTone,
  tuftLight,
  tuftShade,
} from './canopy'

test('standing under a tree is as dark as the pool drawn on the ground there', () => {
  const pools = [10, 50, 8]
  const reach = 8 * canopyShade.spread
  expect(canopyCover(pools, 10, 50)).toBeCloseTo(canopyShade.opacity, 9)
  expect(canopyCover(pools, 10 + reach, 50)).toBe(0)
  expect(canopyCover(pools, 10 + reach * 2, 50)).toBe(0)
  const edge = canopyCover(pools, 10 + reach * 0.6, 50)
  expect(edge).toBeGreaterThan(0)
  expect(edge).toBeLessThan(canopyShade.opacity)
  expect(canopyCover([], 10, 50)).toBe(0)
})

test('overlapping crowns deepen the shade without ever reaching black', () => {
  const one = canopyCover([0, 0, 6], 0, 0)
  const two = canopyCover([0, 0, 6, 1, 0, 6], 0, 0)
  const many = canopyCover(
    Array.from({ length: 12 }, (_, index) => [index * 0.2, 0, 7]).flat(),
    1,
    0,
  )
  expect(two).toBeGreaterThan(one)
  expect(many).toBeGreaterThan(two)
  expect(many).toBeLessThan(1)
  expect(canopyCover([0, 0, 0], 0, 0)).toBe(0)
})

test('the canopy index answers the same as checking every tree', () => {
  const pools: number[] = []
  let seed = 7
  const next = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let tree = 0; tree < 220; tree++)
    pools.push(next() * 120 - 60, 1000 + next() * 120, 2 + next() * 10)
  const index = new CanopyIndex(pools)
  let shaded = 0
  for (let probe = 0; probe < 600; probe++) {
    const x = next() * 130 - 65
    const s = 995 + next() * 130
    const cover = index.cover(x, s)
    expect(cover).toBeCloseTo(canopyCover(pools, x, s), 9)
    if (cover > 0) shaded++
  }
  expect(shaded).toBeGreaterThan(100)
  expect(new CanopyIndex([]).cover(3, 4)).toBe(0)
})

test('grass under a crown is darkened a little more than the ground beneath it', () => {
  expect(tuftLight(0)).toBe(1)
  const under = tuftLight(canopyShade.opacity)
  expect(under).toBeLessThan(1 - canopyShade.opacity)
  expect(under).toBeGreaterThan(0.3)
  expect(tuftLight(1)).toBe(0.2)
  expect(tuftShade.depth).toBeGreaterThan(1)
})

test('the drawn pool of shade fades in its green channel the way the cover model does', () => {
  expect(shadeStops[0]).toEqual([0, 1])
  expect(shadeStops.at(-1)).toEqual([1, 0])
  let last = 2
  for (const [away, depth] of shadeStops) {
    expect(depth).toBeCloseTo(shadeDepth(away), 9)
    expect(depth).toBeLessThan(last)
    last = depth
    const tone = shadeTone(depth).match(/^rgb\((\d+), (\d+), (\d+)\)$/)
    expect(tone).not.toBeNull()
    expect(Number(tone?.[2])).toBe(Math.round(255 * depth))
    expect(tone?.[1]).toBe(tone?.[2])
    expect(tone?.[3]).toBe(tone?.[2])
  }
  const pools = [10, 50, 8]
  const reach = 8 * canopyShade.spread
  expect(canopyCover(pools, 10 + reach * 0.6, 50)).toBeCloseTo(
    canopyShade.opacity * shadeDepth(0.6),
    9,
  )
})

import { expect, test } from 'bun:test'
import { canopyCover, canopyShade } from './canopy'

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

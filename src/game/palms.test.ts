import { expect, test } from 'bun:test'
import { landscapeIds, landscapeProfiles } from './landscapes'
import { fernGeometry, palmGeometry, palmLayout } from './palms'

test('only the jungle grows palms', () => {
  for (const landscape of landscapeIds)
    expect(landscapeProfiles[landscape].palms > 0).toBe(landscape === 'jungle')
})

test('palms stand tall on a trunk at the origin and differ by seed', () => {
  const heights = [1, 2, 3].map((seed) => {
    const geometry = palmGeometry(seed)
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox
    if (!bounds) throw new Error('Palm bounds are unavailable')
    expect(bounds.min.y).toBeCloseTo(0, 5)
    expect(bounds.max.y).toBeGreaterThan(7)
    expect(bounds.max.y).toBeLessThan(15)
    expect(Math.hypot(bounds.min.x, bounds.min.z)).toBeLessThan(9)
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count)
    return bounds.max.y
  })
  expect(new Set(heights.map((height) => height.toFixed(2))).size).toBe(3)
})

test('ferns stay low and keep clear of the carriageway band', () => {
  const geometry = fernGeometry(1)
  geometry.computeBoundingBox()
  expect(geometry.boundingBox?.max.y ?? 9).toBeLessThan(1.4)
  expect(palmLayout.nearest).toBeGreaterThan(5)
})

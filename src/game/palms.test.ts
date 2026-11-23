import { expect, test } from 'bun:test'
import { landscapeIds, landscapeProfiles } from './landscapes'
import { fernGeometry, palmGeometry, palmLayout, palmTrunk } from './palms'

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

test('palm trunks shade as round columns with ring scars and a flared base', () => {
  const geometry = palmGeometry(2)
  const trunk = Number(geometry.userData.trunk)
  expect(trunk).toBe(palmTrunk.rings * palmTrunk.sides * 6)
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const color = geometry.getAttribute('color')
  const seen = new Map<string, string>()
  const tones = new Set<string>()
  let widest = 0
  let middle = 0
  for (let index = 0; index < trunk; index++) {
    expect(Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index))).toBeCloseTo(1, 5)
    expect(normal.getY(index)).toBeCloseTo(0, 5)
    const place = [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => value.toFixed(4))
      .join('/')
    const facing =
      `${(normal.getX(index) + 0).toFixed(3)}/${(normal.getZ(index) + 0).toFixed(3)}`.replaceAll(
        '-0.000',
        '0.000',
      )
    expect(seen.get(place) ?? facing).toBe(facing)
    seen.set(place, facing)
    tones.add(color.getX(index).toFixed(3))
    const height = position.getY(index)
    if (height < 0.01) widest = Math.max(widest, Math.abs(position.getX(index)))
    if (Math.abs(height - 4) < 0.3) middle = Math.max(middle, 0.001)
  }
  expect(tones.size).toBeGreaterThan(palmTrunk.rings / 2)
  expect(widest).toBeGreaterThan(palmLayout.trunk * 1.4)
  expect(palmTrunk.sides).toBeGreaterThanOrEqual(10)
  expect(palmTrunk.scar).toBeLessThan(0.85)
  expect(middle).toBeGreaterThan(0)
})

import { expect, test } from 'bun:test'
import { landscapeIds, landscapeProfiles } from './landscapes'
import { roadCoordinates, roadLayout } from './road'
import { stretchWaterfalls, waterfallClearing, waterfallLayout } from './waterfalls'
import { defaults, shoreHeight, World } from './world'

test.each(landscapeIds)(
  '%s waterfalls stand clear of the road and above the water',
  (landscape) => {
    const world = new World({ ...defaults, landscape })
    const falls = stretchWaterfalls(world, 0)
    expect(falls.length).toBeLessThanOrEqual(landscapeProfiles[landscape].falls)
    for (const fall of falls) {
      expect(fall.height).toBeGreaterThanOrEqual(waterfallLayout.lowest)
      expect(fall.height).toBeLessThanOrEqual(waterfallLayout.tallest)
      expect(Math.hypot(fall.facing.x, fall.facing.s)).toBeCloseTo(1, 6)
      expect(fall.foot.y).toBeGreaterThan(shoreHeight)
      for (const point of [fall.foot, ...fall.path])
        expect(Math.abs(roadCoordinates(world, point.x, point.s).distance)).toBeGreaterThan(
          roadLayout.halfWidth + 8,
        )
      for (let index = 1; index < fall.path.length; index++)
        expect(fall.path[index]?.y ?? 0).toBeLessThanOrEqual((fall.path[index - 1]?.y ?? 0) + 0.05)
    }
  },
)

test('mountain and jungle roads pass several waterfalls and the desert has none', () => {
  expect(
    stretchWaterfalls(new World({ ...defaults, landscape: 'alpine' }), 0).length,
  ).toBeGreaterThan(2)
  expect(
    stretchWaterfalls(new World({ ...defaults, landscape: 'jungle' }), 0).length,
  ).toBeGreaterThan(2)
  expect(stretchWaterfalls(new World({ ...defaults, landscape: 'desert' }), 0)).toEqual([])
})

test('waterfalls face the road and keep a clearing in front', () => {
  const world = new World({ ...defaults, landscape: 'jungle' })
  for (const fall of stretchWaterfalls(world, 0)) {
    const here = Math.abs(roadCoordinates(world, fall.foot.x, fall.foot.s).distance)
    const ahead = Math.abs(
      roadCoordinates(world, fall.foot.x + fall.facing.x * 10, fall.foot.s + fall.facing.s * 10)
        .distance,
    )
    expect(ahead).toBeLessThan(here)
    expect(
      waterfallClearing([fall], fall.foot.x + fall.facing.x * 12, fall.foot.s + fall.facing.s * 12),
    ).toBe(true)
    expect(waterfallClearing([fall], fall.foot.x + 300, fall.foot.s)).toBe(false)
  }
})

test('each stretch of road has its own waterfalls and none sit too close together', () => {
  const world = new World({ ...defaults, landscape: 'alpine' })
  const falls = [0, 1, 2, 3].flatMap((stretch) => stretchWaterfalls(world, stretch))
  expect(new Set(falls.map((fall) => fall.id)).size).toBe(falls.length)
  const along = falls.map((fall) => fall.s).sort((a, b) => a - b)
  for (let index = 1; index < along.length; index++)
    expect((along[index] ?? 0) - (along[index - 1] ?? 0)).toBeGreaterThanOrEqual(
      waterfallLayout.apart,
    )
  const first = stretchWaterfalls(world, 0).map((fall) => fall.foot.x)
  expect(stretchWaterfalls(world, 1).map((fall) => fall.foot.x)).not.toEqual(first)
})

import { expect, test } from 'bun:test'
import { landscapeIds, landscapeProfiles } from './landscapes'
import { roadCoordinates, roadLayout } from './road'
import { lapWaterfalls, waterfallClearing, waterfallLayout } from './waterfalls'
import { defaults, shoreHeight, World } from './world'

test.each(landscapeIds)(
  '%s waterfalls stand clear of the road and above the water',
  (landscape) => {
    const world = new World({ ...defaults, landscape })
    const falls = lapWaterfalls(world)
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
  expect(lapWaterfalls(new World({ ...defaults, landscape: 'alpine' })).length).toBeGreaterThan(2)
  expect(lapWaterfalls(new World({ ...defaults, landscape: 'jungle' })).length).toBeGreaterThan(2)
  expect(lapWaterfalls(new World({ ...defaults, landscape: 'desert' }))).toEqual([])
})

test('waterfalls face the road and keep a clearing in front', () => {
  const world = new World({ ...defaults, landscape: 'jungle' })
  for (const fall of lapWaterfalls(world)) {
    const here = Math.abs(roadCoordinates(world, fall.foot.x, fall.foot.s).distance)
    const ahead = Math.abs(
      roadCoordinates(world, fall.foot.x + fall.facing.x * 10, fall.foot.s + fall.facing.s * 10)
        .distance,
    )
    expect(ahead).toBeLessThan(here)
    expect(
      waterfallClearing(
        [fall],
        0,
        fall.foot.x + fall.facing.x * 12,
        fall.foot.s + fall.facing.s * 12,
      ),
    ).toBe(true)
    expect(waterfallClearing([fall], 0, fall.foot.x + 300, fall.foot.s)).toBe(false)
  }
})

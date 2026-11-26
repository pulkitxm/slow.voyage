import { expect, test } from 'bun:test'

const stretch = 12000

import {
  landmarkFootprints,
  landmarkGeometry,
  landmarkLayout,
  landmarkNames,
  landmarksBetween,
} from './landmarks'
import { landscapeIds } from './landscapes'
import { chevrons, delineators, roadCurvature, roadsideLayout } from './roadside'
import { defaults, shoreHeight, World } from './world'

test.each(landscapeIds)(
  '%s landmarks are stable, dry and within reach of the road',
  (landscape) => {
    for (const seed of [42, 7, 90210]) {
      const world = new World({ ...defaults, landscape, seed })
      const list = landmarksBetween(world, 0, stretch)
      expect(landmarksBetween(new World({ ...defaults, landscape, seed }), 0, stretch)).toEqual(
        list,
      )
      expect(list.length).toBeGreaterThan(3)
      expect(list.length).toBeLessThanOrEqual(stretch / landmarkLayout.spacing)
      expect(new Set(list.map((landmark) => landmark.id)).size).toBe(list.length)
      for (const landmark of list) {
        const distance = Math.abs(landmark.x - world.road(landmark.s).x)
        expect(distance).toBeGreaterThanOrEqual(landmarkLayout.nearest)
        expect(distance).toBeLessThanOrEqual(landmarkLayout.farthest)
        expect(landmark.s).toBeGreaterThanOrEqual(0)
        expect(landmark.s).toBeLessThan(stretch)
        expect(landmark.height).toBeGreaterThan(shoreHeight + 1)
        expect(landmarkNames[landmark.kind].length).toBeGreaterThan(0)
        expect(landmarkFootprints[landmark.kind]).toBeGreaterThan(0)
      }
    }
  },
)

test('every landmark kind builds finite coloured geometry at its site', () => {
  for (const kind of Object.keys(landmarkNames) as (keyof typeof landmarkNames)[]) {
    const built = landmarkGeometry({ id: 0, kind, x: 40, s: 900, height: 12, yaw: 1 })
    const body = built.body
    if (!body) throw new Error('Landmark body missing')
    const position = body.getAttribute('position')
    expect(body.getAttribute('color').count).toBe(position.count)
    body.computeBoundingBox()
    const box = body.boundingBox
    if (!box) throw new Error('Landmark bounds missing')
    expect(Number.isFinite(box.min.x + box.max.y + box.min.z)).toBe(true)
    expect(box.min.y).toBeGreaterThan(11)
    expect(Math.abs((box.min.x + box.max.x) / 2 - 40)).toBeLessThan(8)
    expect(Math.abs((box.min.z + box.max.z) / 2 + 900)).toBeLessThan(8)
    body.dispose()
    built.glow?.dispose()
  }
})

test('delineators line open verges and chevrons mark only real bends', () => {
  const world = new World({ ...defaults })
  let posts = 0
  let panels = 0
  for (let start = 0; start < stretch; start += 120) {
    const line = delineators(world, start, 120)
    expect(line.posts.length).toBe(line.reflectors.length)
    expect(line.posts.length).toBeLessThanOrEqual(8)
    posts += line.posts.length
    const signs = chevrons(world, start, 120)
    panels += signs.panels.length
    for (const piece of [...line.posts, ...line.reflectors, ...signs.posts, ...signs.panels])
      piece.dispose()
  }
  expect(posts).toBeGreaterThan(300)
  expect(panels).toBeGreaterThan(4)
  let bends = 0
  for (let s = 0; s < stretch; s += roadsideLayout.chevronSpacing)
    if (Math.abs(roadCurvature(world, s)) >= roadsideLayout.chevronCurve) bends++
  expect(panels).toBeLessThanOrEqual(bends)
})

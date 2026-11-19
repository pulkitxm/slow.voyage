import { expect, test } from 'bun:test'
import { worldLoop } from './field'
import {
  landmarkFootprints,
  landmarkGeometry,
  landmarkLayout,
  landmarkNames,
  landmarkOffset,
  lapLandmarks,
} from './landmarks'
import { landscapeIds } from './landscapes'
import { chevrons, delineators, roadCurvature, roadsideLayout, startGantry } from './roadside'
import { defaults, shoreHeight, World } from './world'

test.each(landscapeIds)(
  '%s landmarks are stable, dry and within reach of the road',
  (landscape) => {
    for (const seed of [42, 7, 90210]) {
      const world = new World({ ...defaults, landscape, seed })
      const list = lapLandmarks(world)
      expect(lapLandmarks(new World({ ...defaults, landscape, seed }))).toEqual(list)
      expect(list.length).toBeGreaterThan(3)
      expect(list.length).toBeLessThanOrEqual(landmarkLayout.slots)
      for (const landmark of list) {
        const distance = Math.abs(landmark.x - world.road(landmark.s).x)
        expect(distance).toBeGreaterThanOrEqual(landmarkLayout.nearest)
        expect(distance).toBeLessThanOrEqual(landmarkLayout.farthest)
        expect(landmark.s).toBeGreaterThanOrEqual(0)
        expect(landmark.s).toBeLessThan(worldLoop.length)
        expect(landmark.height).toBeGreaterThan(shoreHeight + 1)
        expect(landmarkNames[landmark.kind].length).toBeGreaterThan(0)
        expect(landmarkFootprints[landmark.kind]).toBeGreaterThan(0)
      }
    }
  },
)

test('landmark offsets take the short way around the lap and across the side seam', () => {
  const landmark = { id: 0, kind: 'cairn' as const, x: 1400, s: 11950, height: 5, yaw: 0 }
  const offset = landmarkOffset(landmark, -1450, 30 + worldLoop.length * 3)
  expect(offset.s).toBeCloseTo(-80, 6)
  expect(offset.x).toBeCloseTo(-150, 6)
})

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
  for (let start = 0; start < worldLoop.length; start += 120) {
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
  for (let s = 0; s < worldLoop.length; s += roadsideLayout.chevronSpacing)
    if (Math.abs(roadCurvature(world, s)) >= roadsideLayout.chevronCurve) bends++
  expect(panels).toBeLessThanOrEqual(bends)
})

test('the start gantry spans the road with room for the tallest vehicle', () => {
  const world = new World({ ...defaults })
  const gantry = startGantry(world, 0)
  expect(gantry.clearance).toBeGreaterThan(4)
  expect(gantry.feet.length).toBe(2)
  const road = world.road(0)
  for (const foot of gantry.feet) expect(Math.hypot(foot.x - road.x, foot.s)).toBeGreaterThan(4.5)
  for (const piece of [...gantry.frame, gantry.banner]) piece.dispose()
})

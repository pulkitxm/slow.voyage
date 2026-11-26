import { expect, test } from 'bun:test'
import { mapOffset, roadGuide, terrainTone } from './minimap'
import { roadPoint } from './road'
import { defaults, World } from './world'

test('map offsets place points ahead of and beside the vehicle in its own frame', () => {
  const world = new World({ ...defaults })
  for (const s of [0, 840, 5200]) {
    const road = world.road(s)
    const pose = { x: road.x, s, yaw: road.yaw }
    const ahead = mapOffset(pose, road.x - Math.sin(road.yaw) * 50, s + Math.cos(road.yaw) * 50)
    expect(ahead.forward).toBeCloseTo(50, 6)
    expect(ahead.right).toBeCloseTo(0, 6)
    const beside = roadPoint(road, s, 30)
    const offset = mapOffset(pose, beside.x, beside.s)
    expect(offset.right).toBeCloseTo(30, 6)
    expect(offset.forward).toBeCloseTo(0, 6)
  }
})

test('the road guide reports the distance and bearing back to the pavement', () => {
  const world = new World({ ...defaults })
  for (const s of [120, 3300, 9100]) {
    const road = world.road(s)
    for (const side of [-1, 1]) {
      const point = roadPoint(road, s, side * 140)
      const guide = roadGuide(world, { x: point.x, s: point.s, yaw: road.yaw })
      expect(Math.abs(guide.distance - 140)).toBeLessThan(1)
      expect(Math.abs(guide.s - s)).toBeLessThan(5)
      expect(Math.abs(guide.angle + (side * Math.PI) / 2)).toBeLessThan(0.05)
    }
    expect(roadGuide(world, { x: road.x, s, yaw: road.yaw }).distance).toBeCloseTo(0, 6)
  }
})

test('map tones separate water, woodland, desert and alpine snow', () => {
  const summer = { ...defaults }
  const water = terrainTone(summer, 0, 0, 0)
  const meadow = terrainTone(summer, 20, 0, 0)
  const wood = terrainTone(summer, 20, 0, 1)
  expect(water[2]).toBeGreaterThan(water[0])
  expect(meadow[1]).toBeGreaterThan(meadow[2])
  expect(wood[1]).toBeLessThan(meadow[1])
  const snow = terrainTone({ ...defaults, landscape: 'alpine' }, 300, 0, 0)
  expect(Math.min(...snow)).toBeGreaterThan(230)
  const sand = terrainTone({ ...defaults, landscape: 'desert' }, 20, 0, 1)
  expect(sand[0]).toBeGreaterThan(sand[2])
})

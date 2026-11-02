import { expect, test } from 'bun:test'
import { guardrailAt, roadCoordinates, roadLayout, roadPoint } from './road'
import { roadStrip } from './road-mesh'
import { defaults, World } from './world'

test('barrier occupancy is constant across each rendered section, including negative distances', () => {
  const world = {
    guardrail: (s: number, side: number) => side > 0 && ((s > 20 && s < 23) || (s > -3 && s < -2)),
  }
  for (const s of [20, 20.001, 22.5, 24.999, -4.999, -0.001]) {
    expect(guardrailAt(world, s, 1)).toBe(true)
    expect(guardrailAt(world, s, -1)).toBe(false)
  }
  for (const s of [19.999, 25, -5.001, 0]) expect(guardrailAt(world, s, 1)).toBe(false)
})

test('road-normal positions round trip through bends, grades and distant coordinates', () => {
  for (const landscape of ['highlands', 'alpine', 'desert'] as const) {
    const world = new World({ ...defaults, landscape })
    for (const s of [-1200, 0, 180, 450, 16280, 1000000]) {
      const road = world.road(s)
      for (const distance of [-4, -3, -2.99, 0, 2.99, 3, 4]) {
        const point = roadPoint(road, s, distance)
        const frame = roadCoordinates(world, point.x, point.s)
        expect(frame.s).toBeCloseTo(s, 5)
        expect(frame.distance).toBeCloseTo(distance, 6)
        const surface = world.surface(point.x, point.s)
        if (Math.abs(distance) < 3) {
          expect(surface.onRoad).toBe(true)
          expect(surface.height).toBeCloseTo(road.y, 6)
        }
        if (Math.abs(distance) > 3) expect(surface.onRoad).toBe(false)
      }
    }
  }
})

test('pavement stays six meters wide along the road normal and clears the terrain', () => {
  for (const landscape of ['highlands', 'alpine', 'desert'] as const) {
    const world = new World({ ...defaults, landscape })
    for (const start of [-1200, 0, 360, 16200]) {
      const mesh = roadStrip(world, start, 120, -roadLayout.halfWidth, roadLayout.halfWidth)
      const position = mesh.getAttribute('position')
      for (let index = 0; index < position.count; index += 2) {
        const x = position.getX(index + 1) - position.getX(index)
        const s = -position.getZ(index + 1) + position.getZ(index)
        const along = start + (index / 2) * 5
        const road = world.road(along)
        expect(Math.abs(Math.hypot(x, s) - 6)).toBeLessThan(0.003)
        expect(Math.abs(x * road.dx + s)).toBeLessThan(0.003)
        for (const edge of [index, index + 1]) {
          const ground = world.height(position.getX(edge), -position.getZ(edge))
          expect(position.getY(edge) - ground).toBeCloseTo(roadLayout.surfaceRecess, 3)
        }
      }
      const indices = mesh.index
      if (!indices) throw new Error('Pavement triangles missing')
      for (let triangle = 0; triangle < indices.count; triangle += 3) {
        const vertices = [
          indices.getX(triangle),
          indices.getX(triangle + 1),
          indices.getX(triangle + 2),
        ]
        const x = vertices.reduce((sum, index) => sum + position.getX(index), 0) / 3
        const s = -vertices.reduce((sum, index) => sum + position.getZ(index), 0) / 3
        const y = vertices.reduce((sum, index) => sum + position.getY(index), 0) / 3
        expect(world.surface(x, s).onRoad).toBe(true)
        expect(Math.abs(world.surface(x, s).height - y)).toBeLessThan(0.005)
        expect(y - world.height(x, s)).toBeGreaterThan(0.012)
      }
      mesh.dispose()
    }
  }
})

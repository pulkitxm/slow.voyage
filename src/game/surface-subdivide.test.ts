import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { subdividePlanarSurface } from './surface-subdivide'

test('curved surface subdivision preserves shared edges and window boundaries', () => {
  const shape = new THREE.Shape()
  shape.moveTo(-1, -1)
  shape.lineTo(1, -1)
  shape.lineTo(1, 1)
  shape.lineTo(-1, 1)
  shape.closePath()
  const hole = new THREE.Path()
  hole.moveTo(-0.31, -0.23)
  hole.lineTo(-0.31, 0.23)
  hole.lineTo(0.31, 0.23)
  hole.lineTo(0.31, -0.23)
  hole.closePath()
  shape.holes.push(hole)
  const source = new THREE.ShapeGeometry(shape)
  const geometry = subdividePlanarSurface(source, 0.08)
  const positions = geometry.getAttribute('position')
  const indices = geometry.index
  if (!indices) throw new Error('Surface index missing')
  const edges = new Map<string, { a: number; b: number; count: number }>()
  let area = 0
  for (let triangle = 0; triangle < indices.count; triangle += 3) {
    const a = new THREE.Vector2(
      positions.getX(indices.getX(triangle)),
      positions.getY(indices.getX(triangle)),
    )
    const b = new THREE.Vector2(
      positions.getX(indices.getX(triangle + 1)),
      positions.getY(indices.getX(triangle + 1)),
    )
    const c = new THREE.Vector2(
      positions.getX(indices.getX(triangle + 2)),
      positions.getY(indices.getX(triangle + 2)),
    )
    const signedArea = b.clone().sub(a).cross(c.clone().sub(a)) / 2
    expect(signedArea).toBeGreaterThan(0)
    area += signedArea
    for (let edge = 0; edge < 3; edge++) {
      const a = indices.getX(triangle + edge)
      const b = indices.getX(triangle + ((edge + 1) % 3))
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      const entry = edges.get(key) ?? { a, b, count: 0 }
      entry.count++
      edges.set(key, entry)
      expect(
        Math.hypot(positions.getX(a) - positions.getX(b), positions.getY(a) - positions.getY(b)),
      ).toBeLessThanOrEqual(0.080001)
    }
  }
  expect(area).toBeCloseTo(4 - 0.62 * 0.46, 6)
  for (const { a, b, count } of edges.values()) {
    expect(count).toBeLessThanOrEqual(2)
    if (count === 2) continue
    const x = (positions.getX(a) + positions.getX(b)) / 2
    const y = (positions.getY(a) + positions.getY(b)) / 2
    const outer = Math.abs(Math.abs(x) - 1) < 0.000001 || Math.abs(Math.abs(y) - 1) < 0.000001
    const window =
      Math.abs(Math.abs(x) - 0.31) < 0.000001 || Math.abs(Math.abs(y) - 0.23) < 0.000001
    expect(outer || window).toBe(true)
  }
  geometry.dispose()
  source.dispose()
})

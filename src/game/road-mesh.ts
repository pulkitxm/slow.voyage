import * as THREE from 'three'
import { roadPoint } from './road'
import type { World } from './world'

export function roadStrip(
  world: World,
  start: number,
  length: number,
  left: number,
  right: number,
  lift = 0,
) {
  const positions: number[] = []
  const indices: number[] = []
  const uv: number[] = []
  const steps = Math.ceil(length / 5)
  for (let i = 0; i <= steps; i++) {
    const s = start + (i * length) / steps
    const road = world.road(s)
    for (const [u, distance] of [
      [0, left],
      [1, right],
    ] as const) {
      const point = roadPoint(road, s, distance)
      positions.push(point.x, point.y + lift, -point.s)
      uv.push(u, i / steps)
    }
    if (i < steps) {
      const n = i * 2
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

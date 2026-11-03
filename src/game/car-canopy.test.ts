import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createCarCanopy } from './car-canopy'

function fixture() {
  const materials = [
    new THREE.MeshStandardMaterial(),
    new THREE.MeshStandardMaterial(),
    new THREE.MeshStandardMaterial(),
  ] as const
  const group = createCarCanopy(...materials)
  const meshes = group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)
  group.updateMatrixWorld(true)
  return {
    group,
    meshes,
    materials,
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose()
      for (const material of materials) material.dispose()
    },
  }
}

test('curved canopy is closed across paint, window seals, and glazing with shared normals', () => {
  const canopy = fixture()
  const edges = new Map<string, { count: number; a: THREE.Vector3; b: THREE.Vector3 }>()
  const sharedNormals = new Map<string, THREE.Vector3>()
  const key = (point: THREE.Vector3) =>
    [point.x, point.y, point.z].map((value) => Math.round(value * 100000)).join(':')
  for (const mesh of canopy.meshes) {
    const positions = mesh.geometry.getAttribute('position')
    const normals = mesh.geometry.getAttribute('normal')
    const indices = mesh.geometry.index
    if (!indices) throw new Error('Canopy index missing')
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, vertex)
      const normal = new THREE.Vector3().fromBufferAttribute(normals, vertex)
      const identity = key(point)
      const previous = sharedNormals.get(identity)
      if (previous) expect(previous.distanceTo(normal)).toBeLessThan(0.0001)
      else sharedNormals.set(identity, normal)
    }
    for (let triangle = 0; triangle < indices.count; triangle += 3) {
      for (let edge = 0; edge < 3; edge++) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle + edge))
        const b = new THREE.Vector3().fromBufferAttribute(
          positions,
          indices.getX(triangle + ((edge + 1) % 3)),
        )
        const ends = [key(a), key(b)].sort()
        const identity = ends.join('/')
        const entry = edges.get(identity) ?? { count: 0, a, b }
        entry.count++
        edges.set(identity, entry)
      }
    }
  }
  let boundaries = 0
  for (const { count, a, b } of edges.values()) {
    expect(count).toBeLessThanOrEqual(2)
    if (count === 2) continue
    boundaries++
    expect(a.y).toBeCloseTo(0.88, 5)
    expect(b.y).toBeCloseTo(0.88, 5)
  }
  expect(boundaries).toBeGreaterThan(100)
  canopy.dispose()
})

test('outside rays reach the curved glass and roof without holes or painted window covers', () => {
  const canopy = fixture()
  const ray = new THREE.Raycaster()
  for (let column = -13; column <= 13; column++)
    for (let row = 0; row < 45; row++) {
      ray.set(new THREE.Vector3(column * 0.05, 2, -0.925 + row * 0.05), new THREE.Vector3(0, -1, 0))
      const hit = ray.intersectObjects(canopy.meshes)[0]
      expect(hit).toBeDefined()
      expect(hit?.point.y).toBeGreaterThan(0.88)
    }
  for (const [origin, direction, material] of [
    [[0, 2, -0.5], [0, -1, 0], canopy.materials[1]],
    [[0, 2, 1], [0, -1, 0], canopy.materials[1]],
    [[0, 2, 0.25], [0, -1, 0], canopy.materials[0]],
    [[2, 1.06, 0], [-1, 0, 0], canopy.materials[1]],
    [[-2, 1.06, 0], [1, 0, 0], canopy.materials[1]],
  ] as const) {
    ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction))
    const hit = ray.intersectObjects(canopy.meshes)[0]
    expect((hit?.object as THREE.Mesh | undefined)?.material).toBe(material)
  }
  canopy.dispose()
})

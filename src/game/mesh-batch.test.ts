import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { batchUntexturedMeshes } from './mesh-batch'

function worldVertices(root: THREE.Group) {
  root.updateMatrixWorld(true)
  const vertices: string[] = []
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const positions = object.geometry.getAttribute('position'),
      normals = object.geometry.getAttribute('normal'),
      normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld),
      index = object.geometry.index
    for (let i = 0; i < (index?.count ?? positions.count); i++) {
      const vertex = index ? index.getX(i) : i
      const point = new THREE.Vector3()
        .fromBufferAttribute(positions, vertex)
        .applyMatrix4(object.matrixWorld)
      const normal = new THREE.Vector3()
        .fromBufferAttribute(normals, vertex)
        .applyNormalMatrix(normalMatrix)
      vertices.push(
        [...point.toArray(), ...normal.toArray()]
          .map((value) => Math.round(value * 10000) / 10000)
          .join(','),
      )
    }
  })
  return vertices.sort()
}

test('static batching preserves world surfaces, animation ownership, and shared buffers', () => {
  const root = new THREE.Group()
  root.position.set(3, 5, -2)
  root.rotation.y = 0.37
  root.scale.set(1.3, 0.9, 1.2)
  const paint = new THREE.MeshStandardMaterial(),
    trim = new THREE.MeshStandardMaterial({ color: '#222222' }),
    shared = new THREE.BoxGeometry(0.4, 0.6, 0.8),
    retired = new THREE.SphereGeometry(0.35, 8, 6)
  const door = new THREE.Mesh(shared, paint),
    body = new THREE.Mesh(retired, paint),
    bumper = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.1), trim)
  door.position.set(0.7, 0.5, -0.3)
  door.rotation.z = 0.2
  body.position.set(-0.2, 0.4, 0.6)
  const pivot = new THREE.Group()
  pivot.position.set(-0.7, 0.3, -0.5)
  pivot.rotation.y = 0.5
  const wheel = new THREE.Mesh(shared, paint)
  wheel.rotation.x = 0.3
  pivot.add(wheel)
  root.add(door, body, bumper, pivot)
  const before = worldVertices(root)
  let retiredDisposals = 0,
    sharedDisposals = 0
  retired.addEventListener('dispose', () => retiredDisposals++)
  shared.addEventListener('dispose', () => sharedDisposals++)
  batchUntexturedMeshes(root, [pivot])
  expect(worldVertices(root)).toEqual(before)
  expect(wheel.parent).toBe(pivot)
  expect(root.getObjectById(wheel.id)).toBe(wheel)
  expect(sharedDisposals).toBe(0)
  expect(retiredDisposals).toBe(1)
  let meshes = 0
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes++
  })
  expect(meshes).toBe(3)
  pivot.rotation.y = -0.5
  expect(worldVertices(root)).not.toEqual(before)
  const geometries = new Set<THREE.BufferGeometry>()
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) geometries.add(object.geometry)
  })
  for (const geometry of geometries) geometry.dispose()
  expect(sharedDisposals).toBe(1)
  paint.dispose()
  trim.dispose()
})

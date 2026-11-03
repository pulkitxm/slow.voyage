import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createCarBody } from './car-body'
import { vehicleMetrics } from './vehicles'

function fixture(vehicle: 'touring' | 'roadster') {
  const metrics = vehicleMetrics[vehicle]
  const paint = new THREE.MeshStandardMaterial()
  const interior = new THREE.MeshStandardMaterial()
  const well = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
  const group = createCarBody(metrics.wheelbase, metrics.wheelRadius, paint, interior, well)
  group.updateMatrixWorld(true)
  return {
    group,
    paint,
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose()
      })
      paint.dispose()
      interior.dispose()
      well.dispose()
    },
  }
}

test.each(['touring', 'roadster'] as const)(
  '%s rounded ends share positions and normals with both side skins',
  (vehicle) => {
    const body = fixture(vehicle)
    const skins = body.group.children.filter(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.name === 'side-skin',
    )
    const vertices: { point: THREE.Vector3; normal: THREE.Vector3 }[] = []
    for (const skin of skins) {
      const positions = skin.geometry.getAttribute('position')
      const normals = skin.geometry.getAttribute('normal')
      for (let vertex = 0; vertex < positions.count; vertex++) {
        vertices.push({
          point: new THREE.Vector3().fromBufferAttribute(positions, vertex),
          normal: new THREE.Vector3().fromBufferAttribute(normals, vertex),
        })
      }
    }
    let shared = 0
    for (const name of ['front-panel', 'rear-panel']) {
      const panel = body.group.getObjectByName(name)
      if (!(panel instanceof THREE.Mesh)) throw new Error('Body end panel missing')
      const positions = panel.geometry.getAttribute('position')
      const normals = panel.geometry.getAttribute('normal')
      const rows = new Map<
        number,
        { minimum: number; maximum: number; left: number; right: number }
      >()
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const y = positions.getY(vertex),
          x = positions.getX(vertex)
        const row = rows.get(y) ?? {
          minimum: Infinity,
          maximum: -Infinity,
          left: vertex,
          right: vertex,
        }
        if (x < row.minimum) {
          row.minimum = x
          row.left = vertex
        }
        if (x > row.maximum) {
          row.maximum = x
          row.right = vertex
        }
        rows.set(y, row)
      }
      for (const row of rows.values())
        for (const vertex of [row.left, row.right]) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, vertex)
          const normal = new THREE.Vector3().fromBufferAttribute(normals, vertex)
          let nearest: (typeof vertices)[number] | undefined
          let distance = Infinity
          for (const candidate of vertices) {
            const squared = candidate.point.distanceToSquared(point)
            if (squared < distance) {
              distance = squared
              nearest = candidate
            }
          }
          expect(Math.sqrt(distance)).toBeLessThan(0.000001)
          expect(nearest?.normal.dot(normal)).toBeGreaterThan(0.99999)
          shared++
        }
    }
    expect(shared).toBeGreaterThan(90)
    body.dispose()
  },
)

test.each(['touring', 'roadster'] as const)(
  '%s outer shoulder stays closed through all approach angles',
  (vehicle) => {
    const body = fixture(vehicle)
    const ray = new THREE.Raycaster()
    for (const y of [0.8, 0.83, 0.86])
      for (let sample = 0; sample < 180; sample++) {
        const angle = (sample * Math.PI) / 90
        const origin = new THREE.Vector3(Math.sin(angle) * 5, y, Math.cos(angle) * 5)
        ray.set(origin, new THREE.Vector3(0, y, 0).sub(origin).normalize())
        const hit = ray.intersectObject(body.group, true)[0]
        expect(hit).toBeDefined()
        expect((hit?.object as THREE.Mesh | undefined)?.material).toBe(body.paint)
      }
    body.dispose()
  },
)

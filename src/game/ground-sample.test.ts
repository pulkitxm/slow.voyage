import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { groundGeometry } from './ground'
import { renderedGround } from './ground-fixture'
import { GroundSampler } from './ground-sample'
import { openSurface } from './open-grid'
import { defaults, World } from './world'

for (const landscape of ['highlands', 'alpine', 'desert'] as const) {
  test.each([12, 96])(
    `${landscape} ground samples match rendered triangles with %i rows`,
    (rows) => {
      const world = new World({ ...defaults, landscape })
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
      const ray = new THREE.Raycaster()
      for (const start of [-120, 360, 999960]) {
        const ground = groundGeometry(world, start, new THREE.Color(), new THREE.Color(), rows)
        const mesh = new THREE.Mesh(ground, material)
        const sampler = new GroundSampler(ground, start, rows)
        for (const fraction of [0, 0.004, 0.37, 0.503, 0.997, 1]) {
          const s = start + fraction * 120
          for (const offset of [-25.9, -23.7, -18.7, -4.2, 3.8, 9.3, 23.7, 25.9]) {
            const x = world.road(s).x + offset
            ray.set(new THREE.Vector3(x, 10000, -s), new THREE.Vector3(0, -1, 0))
            const hit = ray.intersectObject(mesh)[0]
            expect(hit).toBeDefined()
            if (!hit) throw new Error('Rendered ground missing')
            expect(Math.abs(sampler.sample(x, s) - hit.point.y)).toBeLessThan(0.0002)
            expect(sampler.normal.length()).toBeCloseTo(1, 6)
            expect(sampler.normal.y).toBeGreaterThan(0)
          }
        }
        ground.dispose()
      }
      material.dispose()
    },
  )
}

test('beyond the corridor the sampler reads the open ground that is drawn there', () => {
  const world = new World({ ...defaults, landscape: 'alpine' })
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const ray = new THREE.Raycaster()
  const start = 360
  const ground = groundGeometry(world, start, new THREE.Color(), new THREE.Color())
  const sampler = new GroundSampler(ground, start, 96, (x, s) => openSurface(world, x, s))
  for (const fraction of [0.004, 0.37, 0.997])
    for (const offset of [-649, -143, -31, 31, 143, 649]) {
      const s = start + fraction * 120
      const x = world.road(s).x + offset
      const open = renderedGround(world, x, s)
      ray.set(new THREE.Vector3(x, 10000, -s), new THREE.Vector3(0, -1, 0))
      const hit = ray.intersectObject(new THREE.Mesh(open, material))[0]
      open.dispose()
      if (!hit?.face) throw new Error('Open ground missing')
      expect(Math.abs(sampler.sample(x, s) - hit.point.y)).toBeLessThan(0.0002)
      expect(sampler.normal.dot(hit.face.normal)).toBeGreaterThan(0.999999)
    }
  ground.dispose()
  material.dispose()
})

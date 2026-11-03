import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { groundGeometry } from './ground'
import { GroundSampler } from './ground-sample'
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
          for (const offset of [-649, -465, -143, -18.7, -4.2, 3.8, 9.3, 23.7, 143, 465, 649]) {
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

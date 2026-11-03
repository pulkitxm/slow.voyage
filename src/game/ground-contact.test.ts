import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { groundGeometry } from './ground'
import { defaults, World } from './world'

for (const landscape of ['highlands', 'alpine', 'desert'] as const) {
  test(`${landscape} off-road contact heights and slopes match rendered triangles`, () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    const ray = new THREE.Raycaster()
    const normal = new THREE.Vector3()
    let maximumHeightError = 0
    let maximumNormalError = 0
    let measurements = 0
    try {
      for (const seed of [42, 43, 99]) {
        const world = new World({ ...defaults, landscape, seed })
        for (const start of [-1200, -120, 360, 999960]) {
          const geometry = groundGeometry(world, start, new THREE.Color(), new THREE.Color())
          const mesh = new THREE.Mesh(geometry, material)
          try {
            for (const fraction of [0.007, 0.37, 0.503, 0.997]) {
              const s = start + fraction * 120
              for (const distance of [-1499, -649, -143, -23.7, -4.2, 4.2, 23.7, 143, 649, 1499]) {
                const x = world.road(s).x + distance
                const surface = world.surface(x, s)
                if (surface.onRoad) continue
                ray.set(new THREE.Vector3(x, 10000, -s), new THREE.Vector3(0, -1, 0))
                const hit = ray.intersectObject(mesh)[0]
                if (!hit?.face) throw new Error('Contact point has no rendered terrain')
                maximumHeightError = Math.max(
                  maximumHeightError,
                  Math.abs(surface.height - hit.point.y),
                )
                normal.set(-surface.slopeX, 1, surface.slopeS).normalize()
                maximumNormalError = Math.max(maximumNormalError, 1 - normal.dot(hit.face.normal))
                measurements++
              }
            }
          } finally {
            geometry.dispose()
          }
        }
      }
      expect(measurements).toBeGreaterThan(400)
      expect(maximumHeightError).toBeLessThan(0.00001)
      expect(maximumNormalError).toBeLessThan(0.000001)
    } finally {
      material.dispose()
    }
  })
}

test('unmeshed terrain keeps finite procedural contact beyond the rendered corridor', () => {
  const world = new World(defaults)
  for (const s of [-1200, 0, 1000000]) {
    const road = world.road(s)
    for (const distance of [-2000, 2000]) {
      const surface = world.surface(road.x + distance, s)
      expect(Number.isFinite(surface.height + surface.slopeX + surface.slopeS)).toBe(true)
      expect(surface.onRoad).toBe(false)
    }
  }
})

test('off-road heights agree at shared edges and rounded distant rows', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const ray = new THREE.Raycaster()
  let maximumError = 0
  try {
    for (const seed of [42, 43]) {
      const world = new World({ ...defaults, landscape: 'alpine', seed })
      for (const s of [-4194328.75, -120, 0, 360, 999960, 4194328.75]) {
        const start = Math.floor(s / 120) * 120
        const geometry = groundGeometry(world, start, new THREE.Color(), new THREE.Color())
        const mesh = new THREE.Mesh(geometry, material)
        try {
          for (const distance of [-649, -143, 143, 649]) {
            const x = world.road(s).x + distance
            ray.set(new THREE.Vector3(x, 10000, -s), new THREE.Vector3(0, -1, 0))
            const hit = ray.intersectObject(mesh)[0]
            if (!hit) throw new Error('Rendered terrain is missing at a row boundary')
            maximumError = Math.max(
              maximumError,
              Math.abs(world.surface(x, s).height - hit.point.y),
            )
          }
          const positions = geometry.getAttribute('position')
          const columns = positions.count / 97
          for (const row of [0, 47, 95]) {
            for (const fraction of [0.15, 0.35, 0.65, 0.85]) {
              const column = Math.floor(columns * fraction)
              const b = row * columns + column + 1
              const c = (row + 1) * columns + column
              const x = positions.getX(b) * 0.37 + positions.getX(c) * 0.63
              const along = -(positions.getZ(b) * 0.37 + positions.getZ(c) * 0.63)
              const height = positions.getY(b) * 0.37 + positions.getY(c) * 0.63
              maximumError = Math.max(
                maximumError,
                Math.abs(world.surface(x, along).height - height),
              )
            }
          }
        } finally {
          geometry.dispose()
        }
      }
    }
    expect(maximumError).toBeLessThan(0.00001)
  } finally {
    material.dispose()
  }
})

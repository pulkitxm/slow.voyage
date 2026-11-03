import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { groundGeometry } from './ground'
import { GroundSampler } from './ground-sample'
import { roadLayout, roadPoint } from './road'
import { defaults, World } from './world'

const grass = new THREE.Color('#819e48')
const light = new THREE.Color('#b2c76b')

for (const landscape of ['highlands', 'alpine', 'desert'] as const) {
  test(`${landscape} ground mesh follows the driving surface with unit normals`, () => {
    const world = new World({ ...defaults, landscape })
    const ground = groundGeometry(world, 360, grass, light)
    const position = ground.getAttribute('position')
    const normal = ground.getAttribute('normal')
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index)
      const s = -position.getZ(index)
      expect(position.getY(index)).toBeCloseTo(world.height(x, s), 3)
      expect(Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index))).toBeCloseTo(
        1,
        6,
      )
      if (Math.abs(x - world.road(s).x) > 4.6) {
        const surface = world.surface(x, s)
        expect(position.getY(index)).toBeCloseTo(surface.height, 3)
        const length = Math.hypot(surface.slopeX, 1, surface.slopeS)
        expect(normal.getX(index)).toBeCloseTo(-surface.slopeX / length, 4)
        expect(normal.getZ(index)).toBeCloseTo(surface.slopeS / length, 4)
      }
    }
    expect(ground.index?.count).toBeGreaterThan(5000)
    ground.dispose()
  })

  test.each([12, 96])(
    `${landscape} adjacent ground tiles share boundary data with %i rows`,
    (rows) => {
      const world = new World({ ...defaults, landscape })
      const a = groundGeometry(world, 360, grass, light)
      const b = groundGeometry(world, 480, grass, light, rows)
      const positions = a.getAttribute('position')
      let columns = 0
      while (columns < positions.count && positions.getZ(columns) === -360) columns++
      for (const name of [
        'position',
        'normal',
        'color',
        'uv',
        'roadDistance',
        'groveCover',
        'bankHeight',
      ]) {
        const end = a.getAttribute(name)
        const start = b.getAttribute(name)
        for (let column = 0; column < columns; column++)
          for (let component = 0; component < end.itemSize; component++)
            expect(end.getComponent(positions.count - columns + column, component)).toBe(
              start.getComponent(column, component),
            )
      }
      a.dispose()
      b.dispose()
    },
  )

  test(`${landscape} preserves a level shoulder before the terrain bank`, () => {
    const world = new World({ ...defaults, landscape })
    for (const s of [-1200, 180, 450, 12000, 1000000]) {
      const road = world.road(s)
      for (const offset of [-1, 0, 1]) {
        const point = roadPoint(road, s, offset * (roadLayout.halfWidth + roadLayout.verge))
        expect(world.height(point.x, point.s)).toBeCloseTo(road.y - roadLayout.surfaceRecess, 6)
      }
    }
  })
}

test('an uphill highlands bank has a distinct cut face above a level verge', () => {
  const world = new World({ ...defaults })
  const s = 450
  const road = world.road(s)
  let peak = { slope: 0, offset: 0 }
  for (let offset = 5.4; offset < 18.5; offset += 0.1) {
    const slope = world.surface(road.x + offset, s).slopeX
    if (slope > peak.slope) peak = { slope, offset }
  }
  expect(peak.slope).toBeGreaterThan(0.65)
  expect(peak.offset).toBeGreaterThan(7)
  expect(peak.offset).toBeLessThan(14)
  expect(world.height(road.x + 24, s) - road.y).toBeGreaterThan(5)
})

test.each(['highlands', 'alpine', 'desert'] as const)(
  '%s ground within camera orbit range stays within ten centimeters of the driving surface',
  (landscape) => {
    let maximumError = 0
    for (const seed of [42, 43, 99]) {
      const world = new World({ ...defaults, landscape, seed })
      for (const start of [-1200, -120, 0, 360, 480, 1200]) {
        const ground = groundGeometry(world, start, grass, light)
        const positions = ground.getAttribute('position')
        const indices = ground.index
        if (!indices) throw new Error('Ground triangles missing')
        for (let triangle = 0; triangle < indices.count; triangle += 3) {
          const a = indices.getX(triangle),
            b = indices.getX(triangle + 1),
            c = indices.getX(triangle + 2)
          for (const weights of [
            [1 / 3, 1 / 3, 1 / 3],
            [0.5, 0.5, 0],
            [0, 0.5, 0.5],
            [0.5, 0, 0.5],
          ] as const) {
            const x =
              positions.getX(a) * weights[0] +
              positions.getX(b) * weights[1] +
              positions.getX(c) * weights[2]
            const s = -(
              positions.getZ(a) * weights[0] +
              positions.getZ(b) * weights[1] +
              positions.getZ(c) * weights[2]
            )
            if (Math.abs(x - world.road(s).x) > 90) continue
            const height =
              positions.getY(a) * weights[0] +
              positions.getY(b) * weights[1] +
              positions.getY(c) * weights[2]
            maximumError = Math.max(maximumError, Math.abs(height - world.height(x, s)))
          }
        }
        ground.dispose()
      }
    }
    expect(maximumError).toBeLessThan(0.1)
  },
)

for (const landscape of ['highlands', 'alpine', 'desert'] as const) {
  test.each([12, 96])(
    `${landscape} distant mesh stays within two meters of the height field in the sampled woodland range with %i rows`,
    (rows) => {
      let maximumError = 0
      for (const seed of [42, 43, 99]) {
        const world = new World({ ...defaults, landscape, seed })
        for (const start of [-1200, -120, 360, 1200]) {
          const geometry = groundGeometry(world, start, grass, light, rows)
          const ground = new GroundSampler(geometry, start, rows)
          for (const fraction of [0.07, 0.31, 0.67, 0.93]) {
            const s = start + fraction * 120
            for (let distance = -649; distance <= 649; distance += 23) {
              const x = world.road(s).x + distance
              maximumError = Math.max(
                maximumError,
                Math.abs(ground.sample(x, s) - world.height(x, s)),
              )
            }
          }
          geometry.dispose()
        }
      }
      expect(maximumError).toBeLessThan(2)
    },
  )
}

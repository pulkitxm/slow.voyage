import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { groundGeometry } from './ground'
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

  test(`${landscape} adjacent ground tiles share positions, normals, colors, and bank metadata`, () => {
    const world = new World({ ...defaults, landscape })
    const a = groundGeometry(world, 360, grass, light)
    const b = groundGeometry(world, 480, grass, light)
    const columns = a.getAttribute('position').count / 25
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
          expect(end.getComponent(24 * columns + column, component)).toBe(
            start.getComponent(column, component),
          )
    }
    a.dispose()
    b.dispose()
  })

  test(`${landscape} preserves a level shoulder before the terrain bank`, () => {
    const world = new World({ ...defaults, landscape })
    for (const s of [-1200, 180, 450, 12000, 1000000]) {
      const road = world.road(s)
      for (const offset of [-5.3, -4.5, 0, 4.5, 5.3])
        expect(world.height(road.x + offset, s)).toBeCloseTo(road.y - 0.16, 8)
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

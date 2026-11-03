import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  footprints,
  outline,
  railFaces,
  railObstacles,
  type Trunk,
  terrainBounds,
  trunkObstacle,
  trunkRadius,
} from './collision'
import { neutralInput } from './controls'
import { createVehicleModel } from './model'
import { CarPhysics, type Input } from './physics'
import { roadCoordinates } from './road'
import { defaults, type Settings, type Vehicle, World } from './world'

const vehicles = ['touring', 'roadster', 'motorcycle', 'bus'] as const

class OpenWorld extends World {
  constructor(
    settings: Settings,
    public rails = false,
  ) {
    super(settings)
  }
  override road(_s: number) {
    return { x: 0, y: 0, dx: 0, dy: 0, yaw: 0 }
  }
  override surface(_x: number, _s: number) {
    return { height: 0, onRoad: true, sand: false, slopeX: 0, slopeS: 0 }
  }
  override guardrail(_s: number, _side: number) {
    return this.rails
  }
}

function gap(car: CarPhysics, trunk: Trunk) {
  const footprint = footprints[car.world.settings.vehicle]
  const cos = Math.cos(car.yaw),
    sin = Math.sin(car.yaw)
  const dx = trunk.x - car.x,
    ds = trunk.s - car.s
  const right = dx * cos + ds * sin
  const forward = -dx * sin + ds * cos
  const outsideX = Math.max(0, Math.abs(right) - footprint.halfWidth)
  const outsideS = Math.max(0, forward - footprint.front, -forward - footprint.rear)
  return Math.hypot(outsideX, outsideS) - trunk.radius
}

function driveAt(
  vehicle: Vehicle,
  speed: number,
  trunk: Trunk,
  seconds = 3,
  input: Input = neutralInput,
) {
  const settings = { ...defaults, vehicle }
  const car = new CarPhysics(new OpenWorld(settings))
  car.reset(0)
  car.speed = speed
  car.suspension.reset(car)
  car.trunks = () => [trunk]
  let closest = Number.POSITIVE_INFINITY
  let impact = 0
  for (let step = 0; step < seconds * 120; step++) {
    car.update(1 / 120, input, settings)
    closest = Math.min(closest, gap(car, trunk))
    impact = Math.max(impact, car.impact)
  }
  return { car, closest, impact }
}

describe('vehicle footprints', () => {
  test.each(vehicles)('%s footprint matches its rendered body', (vehicle) => {
    const model = createVehicleModel({ ...defaults, vehicle })
    model.group.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model.group)
    const footprint = footprints[vehicle]
    expect(footprint.front).toBeCloseTo(-box.min.z, 1)
    expect(footprint.rear).toBeCloseTo(box.max.z, 1)
    expect(footprint.halfWidth).toBeCloseTo(box.max.x, 1)
  })

  test.each(vehicles)('%s outline samples every edge no more than 1.5 m apart', (vehicle) => {
    const points = outline(footprints[vehicle])
    const left = points.filter((point) => point.localX < 0).map((point) => point.localS)
    for (let index = 1; index < left.length; index++)
      expect((left[index - 1] ?? 0) - (left[index] ?? 0)).toBeLessThanOrEqual(1.5)
    expect(Math.max(...left)).toBeCloseTo(footprints[vehicle].front, 9)
    expect(Math.min(...left)).toBeCloseTo(-footprints[vehicle].rear, 9)
  })
})

describe('tree trunks', () => {
  test('trunk size follows the drawn canopy width', () => {
    expect(trunkRadius(4)).toBeCloseTo(0.33, 6)
    expect(trunkRadius(9)).toBeGreaterThan(trunkRadius(4))
  })

  test('reports contact only where the body overlaps the trunk', () => {
    const footprint = footprints.touring
    const pose = { x: 0, s: 0, yaw: 0 }
    expect(
      trunkObstacle(pose, footprint, { x: 0, s: footprint.front + 0.5, radius: 0.4 }),
    ).toBeNull()
    expect(trunkObstacle(pose, footprint, { x: 3, s: 0, radius: 0.4 })).toBeNull()
    const ahead = trunkObstacle(pose, footprint, { x: 0, s: footprint.front + 0.3, radius: 0.4 })
    expect(ahead?.penetration).toBeCloseTo(0.1, 6)
    expect(ahead?.normalS).toBeCloseTo(1, 6)
    expect(ahead?.material).toBe('trunk')
    const corner = trunkObstacle(pose, footprint, {
      x: footprint.halfWidth + 0.2,
      s: footprint.front + 0.2,
      radius: 0.4,
    })
    expect(corner?.normalX).toBeCloseTo(Math.SQRT1_2, 6)
    expect(corner?.contacts[0]?.localX).toBe(footprint.halfWidth)
  })

  test('a trunk swallowed in one step is pushed out of the nearest edge', () => {
    const footprint = footprints.touring
    const obstacle = trunkObstacle({ x: 0, s: 0, yaw: 0 }, footprint, {
      x: 0.6,
      s: 0.2,
      radius: 0.3,
    })
    expect(obstacle?.normalX).toBe(1)
    expect(obstacle?.penetration).toBeCloseTo(footprint.halfWidth - 0.6 + 0.3, 6)
  })

  test.each(vehicles)('%s stops dead against a tree it drives straight into', (vehicle) => {
    for (const speed of [8, 20, 45]) {
      const trunk = { x: 0, s: 15, radius: trunkRadius(6) }
      const { car, closest, impact } = driveAt(vehicle, speed, trunk)
      expect(closest).toBeGreaterThan(-0.05)
      expect(Math.abs(car.speed)).toBeLessThan(2)
      expect(car.s).toBeLessThan(trunk.s)
      expect(impact).toBeGreaterThan(speed > 10 ? 0.9 : 0.3)
      expect(Number.isFinite(car.x + car.s + car.yaw)).toBe(true)
    }
  })

  test.each(vehicles)('%s clipping a tree with its flank glances off and slows', (vehicle) => {
    const footprint = footprints[vehicle]
    const trunk = { x: footprint.halfWidth + 0.33, s: 40, radius: 0.4 }
    const free = driveAt(vehicle, 20, { x: 50, s: 40, radius: 0.4 }, 4)
    const { car, closest, impact } = driveAt(vehicle, 20, trunk, 4)
    expect(closest).toBeGreaterThan(-0.05)
    expect(impact).toBeGreaterThan(0)
    expect(car.s).toBeGreaterThan(trunk.s)
    expect(car.distance).toBeLessThan(free.car.distance)
    expect(car.x).toBeLessThan(0)
  })

  test('the car keeps driving past trees beside the road', () => {
    const free = driveAt('touring', 25, { x: 50, s: 40, radius: 0.5 }, 3)
    const { car, impact } = driveAt('touring', 25, { x: 3.5, s: 40, radius: 0.5 }, 3)
    expect(impact).toBe(0)
    expect(car.s).toBeCloseTo(free.car.s, 9)
  })
})

describe('guard rails', () => {
  function railRun(vehicle: Vehicle, start: number, yaw: number, speed: number) {
    const settings = { ...defaults, vehicle }
    const car = new CarPhysics(new OpenWorld(settings, true))
    car.reset(0)
    car.x = start
    car.yaw = yaw
    car.speed = speed
    car.suspension.reset(car)
    let worst = 0
    for (let step = 0; step < 240; step++) {
      car.update(1 / 120, { ...neutralInput, throttle: 0.3 }, settings)
      for (const point of outline(footprints[vehicle])) {
        const x = car.x + point.localX * Math.cos(car.yaw) - point.localS * Math.sin(car.yaw)
        const s = car.s + point.localX * Math.sin(car.yaw) + point.localS * Math.cos(car.yaw)
        worst = Math.max(worst, Math.abs(roadCoordinates(car.world, x, s).distance))
      }
    }
    return { car, worst }
  }

  test.each(vehicles)('%s body never passes through a rail it steers into at speed', (vehicle) => {
    for (const side of [-1, 1]) {
      const { car, worst } = railRun(vehicle, 0, -side * 0.35, 35)
      expect(worst).toBeLessThan(railFaces.inner + 0.01)
      expect(car.impact).toBeGreaterThanOrEqual(0)
      expect(car.speed).toBeLessThan(35)
    }
  })

  test('a car beyond the rail is held outside it', () => {
    const settings = { ...defaults }
    const car = new CarPhysics(new OpenWorld(settings, true))
    car.reset(0)
    car.x = 6
    car.yaw = 0.5
    car.speed = 15
    car.suspension.reset(car)
    let nearest = Number.POSITIVE_INFINITY
    for (let step = 0; step < 240; step++) {
      car.update(1 / 120, neutralInput, settings)
      for (const point of outline(footprints.touring)) {
        const x = car.x + point.localX * Math.cos(car.yaw) - point.localS * Math.sin(car.yaw)
        nearest = Math.min(nearest, x)
      }
    }
    expect(nearest).toBeGreaterThan(railFaces.outer - 0.01)
  })

  test('there is nothing to hit where the road has no rail', () => {
    const world = new OpenWorld({ ...defaults }, false)
    expect(railObstacles(world, { x: 3, s: 0, yaw: 0.3 }, footprints.touring)).toEqual([])
  })
})

class ShoreWorld extends OpenWorld {
  override surface(x: number, _s: number) {
    const onRoad = Math.abs(x) < 3
    return { height: onRoad ? 1 : 1 - 0.05 * x, onRoad, sand: false, slopeX: -0.05, slopeS: 0 }
  }
}

function deepestPoint(car: CarPhysics) {
  let deepest = Number.POSITIVE_INFINITY
  for (const point of outline(footprints[car.world.settings.vehicle])) {
    const cos = Math.cos(car.yaw),
      sin = Math.sin(car.yaw)
    const x = car.x + point.localX * cos - point.localS * sin
    const s = car.s + point.localX * sin + point.localS * cos
    deepest = Math.min(deepest, car.world.surface(x, s).height)
  }
  return deepest
}

describe('terrain bounds', () => {
  const throttle: Input = { ...neutralInput, throttle: 1 }
  const reverse: Input = { ...neutralInput, brake: 1 }

  test.each(vehicles)('%s wades into shallow water but cannot drive into the deep', (vehicle) => {
    const settings = { ...defaults, vehicle }
    const car = new CarPhysics(new ShoreWorld(settings))
    car.reset(0)
    car.x = 4
    car.yaw = -Math.PI / 2
    car.suspension.reset(car)
    let deepest = Number.POSITIVE_INFINITY
    for (let step = 0; step < 20 * 120; step++) {
      car.update(1 / 120, throttle, settings)
      deepest = Math.min(deepest, deepestPoint(car))
      expect(Number.isFinite(car.x + car.s + car.y + car.speed)).toBe(true)
    }
    expect(deepest).toBeLessThan(0)
    expect(deepest).toBeGreaterThan(-terrainBounds.wadeDepth - 0.05)
    expect(car.wading).toBeGreaterThan(0)
    expect(car.scrapeMaterial).toBe('water')
    expect(Math.abs(car.speed)).toBeLessThan(1)
    const stuck = car.x
    for (let step = 0; step < 9 * 120; step++) car.update(1 / 120, reverse, settings)
    expect(car.x).toBeLessThan(stuck - 3)
  })

  test.each(vehicles)('%s stops softly at the edge of the generated world', (vehicle) => {
    const settings = { ...defaults, vehicle }
    for (const side of [1, -1]) {
      const car = new CarPhysics(new OpenWorld(settings))
      car.reset(0)
      car.x = side * (terrainBounds.edge - 60)
      car.yaw = -side * (Math.PI / 2)
      car.suspension.reset(car)
      for (let step = 0; step < 15 * 120; step++) {
        car.update(1 / 120, throttle, settings)
        expect(Math.abs(car.x)).toBeLessThan(terrainBounds.edge + 0.05)
      }
      expect(Math.abs(car.x)).toBeGreaterThan(terrainBounds.edge - 5)
      expect(car.hitMaterial).toBe('edge')
    }
  })

  test('driving full throttle toward the real coastline ends at the water line', () => {
    const settings = { ...defaults, vehicle: 'touring' as const }
    const world = new World(settings)
    const car = new CarPhysics(world)
    car.reset(900)
    car.x = world.road(900).x + 12
    car.yaw = -Math.PI / 2 + 0.3
    car.suspension.reset(car)
    for (let step = 0; step < 40 * 120; step++) {
      car.update(1 / 120, throttle, settings)
      expect(deepestPoint(car)).toBeGreaterThan(-terrainBounds.wadeDepth - 0.3)
    }
  })
})

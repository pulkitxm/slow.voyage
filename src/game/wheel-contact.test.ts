import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createVehicleModel, positionVehicle } from './model'
import { CarPhysics } from './physics'
import { roadStrip } from './road-mesh'
import { defaults, World } from './world'

function supportPoint(tire: THREE.Mesh, normal: THREE.Vector3) {
  const positions = tire.geometry.getAttribute('position')
  const point = new THREE.Vector3()
  const lowest = new THREE.Vector3()
  let minimum = Infinity
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index).applyMatrix4(tire.matrixWorld)
    const distance = normal.dot(point)
    if (distance < minimum) {
      minimum = distance
      lowest.copy(point)
    }
  }
  return lowest
}

for (const vehicle of ['touring', 'roadster', 'bus'] as const)
  test.each([450, 900])(
    `${vehicle} rendered tires rest on steep alpine terrain from start %i`,
    (startS) => {
      const settings = { ...defaults, vehicle, landscape: 'alpine' as const, seed: 43 }
      const world = new World(settings)
      const physics = new CarPhysics(world)
      physics.reset(startS)
      physics.x += 143
      physics.suspension.reset(physics)
      const model = createVehicleModel(settings)
      const normal = new THREE.Vector3()
      try {
        for (let tick = 0; tick <= 240; tick++) {
          if (tick)
            physics.update(
              1 / 120,
              {
                throttle: 0,
                brake: 1,
                boost: false,
                steer: 0,
                steeringSource: null,
                handbrake: false,
                regenBrake: 0,
              },
              settings,
            )
          if (tick !== 0 && tick !== 240) continue
          positionVehicle(model, physics, vehicle, 1 / 60)
          model.update(physics.suspension.wheels, false, false, physics.speed)
          model.group.updateMatrixWorld(true)
          for (const [index, group] of model.wheels.entries()) {
            const wheel = physics.suspension.wheels[index]
            const tire = group.children[0]
            if (!wheel?.contact || !(tire instanceof THREE.Mesh)) continue
            normal.set(-wheel.slopeX, 1, wheel.slopeS).normalize()
            const point = supportPoint(tire, normal)
            const gap = point.y - world.surface(point.x, -point.z).height
            expect(gap).toBeGreaterThan(-0.02)
            expect(gap).toBeLessThan(0.04)
          }
        }
        expect(Math.abs(physics.pitch)).toBeGreaterThan(0.2)
      } finally {
        model.dispose()
      }
    },
  )

for (const vehicle of ['touring', 'roadster', 'motorcycle', 'bus'] as const) {
  test.each([42, 43, 99])(
    `${vehicle} rendered tires contact the pavement through curves and grades with seed %i`,
    (seed) => {
      const settings = { ...defaults, vehicle, seed }
      const world = new World(settings)
      const physics = new CarPhysics(world)
      const model = createVehicleModel(settings)
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
      const ray = new THREE.Raycaster()
      const normal = new THREE.Vector3()
      const down = new THREE.Vector3(0, -1, 0)
      let road: THREE.Mesh | null = null
      let roadId = Infinity
      let minimum = Infinity
      let maximum = -Infinity
      let measurements = 0
      try {
        for (let tick = 0; tick < 120 * 30; tick++) {
          physics.update(1 / 120, physics.autoInput(22), settings)
          if (tick % 2 === 0) {
            positionVehicle(model, physics, vehicle, 1 / 60)
            model.update(physics.suspension.wheels, false, false, physics.speed)
          }
          if (tick % 30) continue
          model.group.updateMatrixWorld(true)
          const id = Math.floor(physics.s / 120)
          if (id !== roadId) {
            road?.geometry.dispose()
            road = new THREE.Mesh(roadStrip(world, (id - 1) * 120, 360, -3, 3), material)
            road.updateMatrixWorld(true)
            roadId = id
          }
          for (const [index, group] of model.wheels.entries()) {
            const wheel = physics.suspension.wheels[index]
            const tire = group.children[0]
            if (!wheel?.contact || !wheel.onRoad) continue
            if (!(tire instanceof THREE.Mesh)) throw new Error('Rendered tire is missing')
            normal.set(-wheel.slopeX, 1, wheel.slopeS).normalize()
            const point = supportPoint(tire, normal)
            ray.set(new THREE.Vector3(point.x, point.y + 5, point.z), down)
            const hit = road ? ray.intersectObject(road, false)[0] : undefined
            if (!hit) throw new Error('Pavement is missing below a contacted tire')
            const gap = point.y - hit.point.y
            minimum = Math.min(minimum, gap)
            maximum = Math.max(maximum, gap)
            measurements++
          }
        }
        expect(measurements).toBeGreaterThan(100)
        expect(minimum).toBeGreaterThan(-0.006)
        expect(maximum).toBeLessThan(0.006)
      } finally {
        road?.geometry.dispose()
        material.dispose()
        model.dispose()
      }
    },
  )

  test(`${vehicle} rendered tires retain the suspension droop while airborne`, () => {
    const settings = { ...defaults, vehicle }
    const world = new World(settings)
    const physics = new CarPhysics(world)
    const model = createVehicleModel(settings)
    try {
      physics.y += 1.5
      physics.suspension.updateOffsets(physics)
      positionVehicle(model, physics, vehicle, 1 / 60)
      model.update(physics.suspension.wheels, false, false, 0)
      model.group.updateMatrixWorld(true)
      for (const [index, group] of model.wheels.entries()) {
        const wheel = physics.suspension.wheels[index]
        const tire = group.children[0]
        if (!wheel || !(tire instanceof THREE.Mesh)) throw new Error('Rendered tire is missing')
        expect(wheel.contact).toBe(false)
        const point = supportPoint(tire, new THREE.Vector3(0, 1, 0))
        expect(point.y - world.surface(point.x, -point.z).height).toBeGreaterThan(1.2)
      }
    } finally {
      model.dispose()
    }
  })
}

import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { DrivingCamera } from './camera'
import { CarModel } from './car'
import { createVehicleModel } from './model'
import { Suspension } from './suspension'
import { vehicleMetrics } from './vehicles'
import { defaults, World } from './world'

function visible(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

test.each(['touring', 'roadster'] as const)(
  '%s coachwork has wheel openings through full suspension travel and steering lock',
  (vehicle) => {
    const world = new World({ ...defaults, vehicle })
    const metrics = vehicleMetrics[vehicle]
    const model = new CarModel(world.settings)
    const suspension = new Suspension(world)
    const paint: THREE.Mesh[] = []
    model.exterior.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material === model.body) paint.push(object)
    })
    const bounds = new THREE.Box3()
    for (const mesh of paint) bounds.expandByObject(mesh)
    expect(bounds.min.y).toBeLessThan(0.25)
    expect(bounds.max.y).toBeGreaterThan(1.2)
    expect(bounds.max.y).toBeLessThan(1.26)
    expect(bounds.getSize(new THREE.Vector3()).z).toBeGreaterThan(4)
    expect(bounds.getSize(new THREE.Vector3()).z).toBeLessThan(4.4)
    const ray = new THREE.Raycaster()
    let samples = 0
    for (const offset of [-metrics.suspensionTravel, 0, metrics.suspensionTravel]) {
      for (const steering of [-metrics.maxSteering, 0, metrics.maxSteering]) {
        suspension.updateSteering(steering)
        for (const wheel of suspension.wheels) wheel.offset = offset
        model.update(suspension.wheels, false, false, 0)
        model.group.updateMatrixWorld(true)
        for (let wheel = 0; wheel < model.wheels.length; wheel++) {
          const spin = model.wheels[wheel],
            pivot = model.wheelPivots[wheel],
            tire = spin?.children[0]
          if (!(tire instanceof THREE.Mesh) || !pivot) throw new Error('Tire missing')
          const position = tire.geometry.getAttribute('position')
          const side = Math.sign(pivot.position.x)
          for (let i = 0; i < position.count; i += 4) {
            const point = new THREE.Vector3()
              .fromBufferAttribute(position, i)
              .applyMatrix4(tire.matrixWorld)
            if (side * point.x < side * pivot.position.x) continue
            ray.set(new THREE.Vector3(side * 2, point.y, point.z), new THREE.Vector3(-side, 0, 0))
            ray.far = 2 - side * point.x - 0.005
            expect(ray.intersectObjects(paint, false)).toHaveLength(0)
            samples++
          }
        }
      }
    }
    expect(samples).toBeGreaterThan(1000)
    model.dispose()
  },
)

test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
  '%s model has valid geometry, preserves lights in bonnet view, and releases its resources',
  (vehicle) => {
    const model = createVehicleModel({ ...defaults, vehicle })
    const light = new THREE.SpotLight()
    model.group.add(light, light.target)
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    model.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(material)
      const positions = object.geometry.getAttribute('position')
      const normals = object.geometry.getAttribute('normal')
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(
          true,
        )
        expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 4)
      }
    })
    expect(geometries.size).toBeGreaterThan(10)
    const bounds = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3())
    expect(bounds.x).toBeGreaterThan(0.7)
    expect(bounds.x).toBeLessThan(2.5)
    expect(bounds.y).toBeGreaterThan(1.2)
    expect(bounds.z).toBeLessThan(7)
    model.setExteriorVisible(false)
    model.group.traverse((object) => {
      if (object instanceof THREE.Mesh)
        expect(visible(object)).toBe(!!model.firstPerson.getObjectById(object.id))
    })
    expect(light.visible).toBe(true)
    expect(light.target.visible).toBe(true)
    model.setExteriorVisible(true)
    model.group.traverse((object) => {
      if (object instanceof THREE.Mesh)
        expect(visible(object)).toBe(!model.firstPerson.getObjectById(object.id))
    })
    const disposed = new Set<THREE.BufferGeometry | THREE.Material>()
    for (const resource of [...geometries, ...materials])
      resource.addEventListener('dispose', () => disposed.add(resource))
    model.dispose()
    expect(disposed.size).toBe(geometries.size + materials.size)
    light.dispose()
  },
)

test.each(['motorcycle', 'bus'] as const)(
  '%s instruments follow speed magnitude and steering without changing the chassis',
  (vehicle) => {
    const world = new World({ ...defaults, vehicle })
    const model = createVehicleModel(world.settings)
    const suspension = new Suspension(world)
    const needle = model.firstPerson.getObjectByName('speed-needle')
    if (!needle) throw new Error('Speed instrument missing')
    model.update(suspension.wheels, false, false, 0)
    const stopped = needle.rotation.y
    model.update(suspension.wheels, false, false, 25)
    const moving = needle.rotation.y
    expect(moving).toBeLessThan(stopped)
    model.update(suspension.wheels, false, false, -25)
    expect(needle.rotation.y).toBe(moving)
    model.update(suspension.wheels, false, false, 70)
    const maximum = needle.rotation.y
    model.update(suspension.wheels, false, false, 120)
    expect(needle.rotation.y).toBe(maximum)
    const wheel = model.firstPerson.getObjectByName('steering-wheel')
    if (wheel) {
      suspension.updateSteering(0.2)
      model.update(suspension.wheels, false, false, 25)
      const right = wheel.rotation.z
      suspension.updateSteering(-0.2)
      model.update(suspension.wheels, false, false, 25)
      expect(right).toBeGreaterThan(0)
      expect(wheel.rotation.z).toBeLessThan(0)
      expect(
        suspension.wheels.filter((wheel) => !wheel.front).every((wheel) => wheel.steering === 0),
      ).toBe(true)
      suspension.updateSteering(0)
      model.update(suspension.wheels, false, false, 25)
      expect(wheel.rotation.z).toBe(0)
    }
    expect(model.group.rotation.toArray()).toEqual([0, 0, 0, 'XYZ'])
    model.dispose()
  },
)

test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
  '%s bonnet view shows a vehicle anchor below the road sightline',
  (vehicle) => {
    const world = new World({ ...defaults, vehicle })
    const road = world.road(0)
    const subject = { x: road.x, y: road.y, s: 0, yaw: road.yaw, speed: 0 }
    const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 3600)
    new DrivingCamera(camera).update(subject, world, 'bonnet', 1 / 60)
    camera.updateMatrixWorld()
    const model = createVehicleModel(world.settings)
    model.group.position.set(subject.x, subject.y, -subject.s)
    model.group.rotation.y = subject.yaw
    model.setExteriorVisible(false)
    model.group.updateMatrixWorld(true)
    const points: THREE.Vector3[] = []
    model.firstPerson.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const position = object.geometry.getAttribute('position')
      for (let i = 0; i < position.count; i++) {
        const point = new THREE.Vector3()
          .fromBufferAttribute(position, i)
          .applyMatrix4(object.matrixWorld)
          .project(camera)
        if (Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && Math.abs(point.z) <= 1)
          points.push(point)
      }
    })
    expect(points.length).toBeGreaterThan(0)
    expect(points.every((point) => point.y < -0.25)).toBe(true)
    model.dispose()
  },
)

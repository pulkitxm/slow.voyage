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

function coachwork(model: CarModel) {
  const meshes: THREE.Mesh[] = []
  model.exterior.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      !model.wheelPivots.some((pivot) => pivot.getObjectById(object.id))
    )
      meshes.push(object)
  })
  return meshes
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
      if (!(object instanceof THREE.Mesh)) return
      if (object.material === model.body) paint.push(object)
    })
    const occluders = coachwork(model)
    const bounds = new THREE.Box3()
    for (const mesh of paint) bounds.expandByObject(mesh)
    expect(bounds.min.y).toBeLessThan(0.25)
    expect(bounds.max.y).toBeGreaterThan(1.2)
    expect(bounds.max.y).toBeLessThan(vehicle === 'touring' ? 1.38 : 1.26)
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
            expect(ray.intersectObjects(occluders, false)).toHaveLength(0)
            samples++
          }
        }
      }
    }
    expect(samples).toBeGreaterThan(1000)
    model.dispose()
  },
)

test.each(['touring', 'roadster'] as const)(
  '%s rear tires remain visible from the driving camera at rest and speed',
  (vehicle) => {
    const world = new World({ ...defaults, vehicle })
    world.road = () => ({ x: 0, y: 0, dx: 0, dy: 0, yaw: 0 })
    world.height = () => 0
    const model = new CarModel(world.settings)
    model.group.updateMatrixWorld(true)
    const occluders = coachwork(model)
    const ray = new THREE.Raycaster()
    for (const aspect of [16 / 9, 9 / 16]) {
      for (const speed of [0, 20, 45, -20]) {
        const camera = new THREE.PerspectiveCamera(68, aspect, 0.1, 3600)
        new DrivingCamera(camera).update({ x: 0, y: 0, s: 0, yaw: 0, speed }, world, 'chase', 0)
        const eye = camera.position
        for (const spin of model.wheels.slice(0, 2)) {
          const tire = spin.children[0]
          if (!(tire instanceof THREE.Mesh)) throw new Error('Rear tire missing')
          const position = tire.geometry.getAttribute('position'),
            normals = tire.geometry.getAttribute('normal'),
            normalMatrix = new THREE.Matrix3().getNormalMatrix(tire.matrixWorld)
          let exposed = 0,
            candidates = 0
          for (let i = 0; i < position.count; i++) {
            const point = new THREE.Vector3()
              .fromBufferAttribute(position, i)
              .applyMatrix4(tire.matrixWorld)
            const normal = new THREE.Vector3()
              .fromBufferAttribute(normals, i)
              .applyNormalMatrix(normalMatrix)
            if (point.y < 0.03 || point.y > 0.28 || normal.dot(eye.clone().sub(point)) <= 0)
              continue
            candidates++
            ray.set(eye, point.clone().sub(eye).normalize())
            ray.far = eye.distanceTo(point) - 0.003
            if (!ray.intersectObjects(occluders, false).length) exposed++
          }
          expect(candidates).toBeGreaterThan(50)
          expect(exposed / candidates).toBeGreaterThan(0.2)
        }
      }
    }
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
    if (vehicle === 'bus') {
      expect(bounds.z).toBeGreaterThan(9.25)
      expect(bounds.z).toBeLessThan(9.5)
      expect(bounds.y).toBeGreaterThan(2.9)
      expect(bounds.y).toBeLessThan(3)
    } else expect(bounds.z).toBeLessThan(7)
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
    const disposed = new Map<THREE.BufferGeometry | THREE.Material, number>()
    for (const resource of [...geometries, ...materials])
      resource.addEventListener('dispose', () =>
        disposed.set(resource, (disposed.get(resource) ?? 0) + 1),
      )
    model.dispose()
    expect(disposed.size).toBe(geometries.size + materials.size)
    expect([...disposed.values()].every((count) => count === 1)).toBe(true)
    light.dispose()
  },
)

test('the roadster cockpit is open over both seats and has a continuous interior floor', () => {
  const model = new CarModel({ ...defaults, vehicle: 'roadster' })
  model.group.updateMatrixWorld(true)
  const ray = new THREE.Raycaster()
  for (const x of [-0.58, -0.34, 0, 0.34, 0.58]) {
    for (const z of [-0.08, 0.2, 0.5]) {
      ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0))
      const first = ray.intersectObject(model.exterior, true)[0]
      if (!first) throw new Error('The cockpit opens through the floor')
      expect(first.point.y).toBeGreaterThanOrEqual(0.3)
      expect(first.point.y).toBeLessThan(1.15)
      if (Math.abs(x) > 0.55) expect(first.point.y).toBeLessThan(0.5)
      if (x === 0) expect(first.point.y).toBeLessThan(0.65)
    }
  }
  const suspension = new Suspension(new World({ ...defaults, vehicle: 'roadster' }))
  const wheel = model.exterior.getObjectByName('exterior-steering-wheel')
  if (!wheel) throw new Error('Exterior steering wheel missing')
  suspension.updateSteering(0.2)
  model.update(suspension.wheels, false, false, 0)
  expect(wheel.rotation.z).toBeGreaterThan(0)
  suspension.updateSteering(-0.2)
  model.update(suspension.wheels, false, false, 0)
  expect(wheel.rotation.z).toBeLessThan(0)
  model.dispose()
})

test.each(['touring', 'roadster'] as const)(
  '%s lamp lenses remain visible ahead of their body panels',
  (vehicle) => {
    const model = new CarModel({ ...defaults, vehicle })
    model.group.updateMatrixWorld(true)
    const ray = new THREE.Raycaster()
    for (const side of [-1, 1]) {
      for (const direction of [-1, 1]) {
        ray.set(
          new THREE.Vector3(side * 0.5, direction < 0 ? 0.786 : 0.825, direction * 3),
          new THREE.Vector3(0, 0, -direction),
        )
        const first = ray.intersectObject(model.exterior, true)[0]
        if (!(first?.object instanceof THREE.Mesh)) throw new Error('Lamp lens missing')
        expect(first.object.material).toBe(direction < 0 ? model.lights : model.brake)
      }
    }
    for (const direction of [-1, 1]) {
      const material = direction < 0 ? model.lights : model.brake
      const eye = new THREE.Vector3(0, 2, direction * 4.42)
      let samples = 0
      model.exterior.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || object.material !== material) return
        const positions = object.geometry.getAttribute('position'),
          indices = object.geometry.index
        for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
          const points = [0, 1, 2].map((corner) =>
            new THREE.Vector3()
              .fromBufferAttribute(positions, indices ? indices.getX(i + corner) : i + corner)
              .applyMatrix4(object.matrixWorld),
          )
          const [a, b, c] = points
          if (!a || !b || !c) throw new Error('Lamp triangle missing')
          const point = a
            .clone()
            .add(b)
            .add(c)
            .multiplyScalar(1 / 3)
          const normal = b.clone().sub(a).cross(c.clone().sub(a))
          if (normal.dot(eye.clone().sub(point)) <= 0) continue
          samples++
          ray.set(eye, point.clone().sub(eye).normalize())
          const first = ray.intersectObject(model.exterior, true)[0]
          if (!(first?.object instanceof THREE.Mesh)) throw new Error('Lamp triangle hidden')
          expect(first.object.material).toBe(material)
        }
      })
      expect(samples).toBeGreaterThan(20)
    }
    model.dispose()
  },
)

test('the bus steering rim stays in front of the dashboard in the seated driving view', () => {
  const world = new World({ ...defaults, vehicle: 'bus' })
  world.road = () => ({ x: 0, y: 0, dx: 0, dy: 0, yaw: 0 })
  world.height = () => 0
  const model = createVehicleModel(world.settings)
  const suspension = new Suspension(world)
  const wheel = model.firstPerson.getObjectByName('steering-wheel')
  if (!wheel) throw new Error('Steering wheel missing')
  model.setExteriorVisible(false)
  const ray = new THREE.Raycaster()
  for (const aspect of [16 / 9, 9 / 16]) {
    const camera = new THREE.PerspectiveCamera(68, aspect, 0.1, 3600)
    new DrivingCamera(camera).update({ x: 0, y: 0, s: 0, yaw: 0, speed: 20 }, world, 'bonnet', 0)
    camera.updateMatrixWorld()
    for (const steering of [-0.3, 0, 0.3]) {
      suspension.updateSteering(steering)
      model.update(suspension.wheels, false, false, 20)
      model.group.updateMatrixWorld(true)
      let samples = 0
      for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * Math.PI * 2
        const point = new THREE.Vector3(
          Math.sin(angle) * 0.22,
          Math.cos(angle) * 0.22,
          0.018,
        ).applyMatrix4(wheel.matrixWorld)
        const screen = point.clone().project(camera)
        if (Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1) continue
        ray.set(camera.position, point.clone().sub(camera.position).normalize())
        const first = ray.intersectObject(model.firstPerson, true)[0]
        if (!first) throw new Error('Visible steering rim missing')
        expect(wheel.getObjectById(first.object.id)).toBeDefined()
        samples++
      }
      expect(samples).toBeGreaterThan(5)
    }
  }
  model.dispose()
})

test.each(['motorcycle', 'bus'] as const)(
  '%s instrument contrast is independent of exterior paint and responds to night lighting',
  (vehicle) => {
    const colors = []
    for (const color of ['#f8f8f8', '#151919']) {
      const world = new World({ ...defaults, vehicle, color })
      const model = createVehicleModel(world.settings)
      const suspension = new Suspension(world)
      const pointer = model.firstPerson.getObjectByName('speed-needle')?.children[0]
      if (
        !(pointer instanceof THREE.Mesh) ||
        !(pointer.material instanceof THREE.MeshStandardMaterial)
      )
        throw new Error('Instrument pointer missing')
      expect(pointer.material).not.toBe(model.body)
      colors.push(pointer.material.color.getHex())
      model.update(suspension.wheels, false, false, 20)
      const day = pointer.material.emissiveIntensity
      model.update(suspension.wheels, false, true, 20)
      expect(pointer.material.emissiveIntensity).toBeGreaterThan(day)
      model.dispose()
    }
    expect(colors[0]).toBe(colors[1])
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

test('coach glazing stays separated from the painted body through profile changes', () => {
  const model = new CarModel({ ...defaults, vehicle: 'bus' })
  model.group.updateMatrixWorld(true)
  const paint: THREE.Mesh[] = []
  model.exterior.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material === model.body) paint.push(object)
  })
  const ray = new THREE.Raycaster()
  for (const sign of [-1, 1])
    for (const y of [1.9, 2.25, 2.6])
      for (const z of [-1, 0, 2, 4]) {
        ray.set(new THREE.Vector3(sign * 3, y, z), new THREE.Vector3(-sign, 0, 0))
        const first = ray.intersectObject(model.exterior, true)[0]
        const body = ray.intersectObjects(paint, false)[0]
        if (!(first?.object instanceof THREE.Mesh) || !body)
          throw new Error('Coach window surface missing')
        expect(first.object.material).not.toBe(model.body)
        expect(body.distance - first.distance).toBeGreaterThan(0.004)
      }
  for (const x of [-0.8, 0, 0.8])
    for (const y of [1.8, 2.1, 2.4, 2.6]) {
      ray.set(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1))
      const first = ray.intersectObject(model.exterior, true)[0]
      const body = ray.intersectObjects(paint, false)[0]
      if (!(first?.object instanceof THREE.Mesh) || !body)
        throw new Error('Coach rear window missing')
      expect(first.object.material).not.toBe(model.body)
      expect(body.distance - first.distance).toBeGreaterThan(0.008)
    }
  model.dispose()
})

test('coach tires retain their measured width and reference wheel-axis inset', () => {
  const world = new World({ ...defaults, vehicle: 'bus' })
  const model = new CarModel(world.settings)
  const suspension = new Suspension(world)
  const radius = vehicleMetrics.bus.wheelRadius
  for (const offset of [-0.16, 0, 0.16])
    for (const steering of [-0.65, 0, 0.65]) {
      suspension.updateSteering(steering)
      for (const wheel of suspension.wheels) wheel.offset = offset
      model.update(suspension.wheels, false, false, 0)
      model.group.updateMatrixWorld(true)
      for (let i = 0; i < model.wheels.length; i++) {
        const tire = model.wheels[i]?.children[0],
          state = suspension.wheels[i]
        if (!(tire instanceof THREE.Mesh) || !state) throw new Error('Coach tire missing')
        const center = tire.getWorldPosition(new THREE.Vector3())
        const axis = new THREE.Vector3(state.localX, radius + offset, -state.localS)
        expect(center.distanceTo(axis)).toBeCloseTo(0.076, 5)
        expect(center.distanceTo(axis)).toBeLessThan(0.248 / 2)
        if (steering === 0)
          expect(new THREE.Box3().setFromObject(tire).getSize(new THREE.Vector3()).x).toBeCloseTo(
            0.248,
            5,
          )
      }
    }
  model.dispose()
})

test('coach wheel openings clear full suspension travel and Ackermann steering', () => {
  const world = new World({ ...defaults, vehicle: 'bus' })
  const model = new CarModel(world.settings)
  const suspension = new Suspension(world)
  const metrics = vehicleMetrics.bus
  const panels = coachwork(model)
  const ray = new THREE.Raycaster()
  let samples = 0
  for (const offset of [-metrics.suspensionTravel, 0, metrics.suspensionTravel]) {
    for (const steering of Array.from(
      { length: 21 },
      (_, i) => metrics.maxSteering * (i / 10 - 1),
    )) {
      suspension.updateSteering(steering)
      for (const wheel of suspension.wheels) wheel.offset = offset
      model.update(suspension.wheels, false, false, 0)
      model.group.updateMatrixWorld(true)
      for (let i = 0; i < model.wheels.length; i++) {
        const tire = model.wheels[i]?.children[0],
          pivot = model.wheelPivots[i]
        if (!(tire instanceof THREE.Mesh) || !pivot) throw new Error('Coach tire missing')
        const positions = tire.geometry.getAttribute('position')
        const sign = Math.sign(pivot.position.x)
        for (let vertex = 0; vertex < positions.count; vertex += 4) {
          const point = new THREE.Vector3()
            .fromBufferAttribute(positions, vertex)
            .applyMatrix4(tire.matrixWorld)
          if (sign * point.x < sign * pivot.position.x) continue
          ray.set(new THREE.Vector3(sign * 2, point.y, point.z), new THREE.Vector3(-sign, 0, 0))
          ray.far = 2 - sign * point.x - 0.005
          expect(ray.intersectObjects(panels, false)).toHaveLength(0)
          samples++
        }
      }
    }
  }
  expect(samples).toBeGreaterThan(1000)
  model.dispose()
})

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

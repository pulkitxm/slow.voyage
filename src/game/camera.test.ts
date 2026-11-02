import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { DrivingCamera } from './camera'
import { createVehicleModel } from './model'
import { defaults, World } from './world'

function fixture(aspect = 16 / 9) {
  const world = new World({ ...defaults })
  const road = world.road(0)
  const camera = new THREE.PerspectiveCamera(68, aspect, 0.1, 3600)
  const view = new DrivingCamera(camera)
  const subject = { x: road.x, y: road.y, s: 0, yaw: road.yaw, speed: 0 }
  view.update(subject, world, 'chase', 1 / 60)
  return { world, camera, view, subject }
}

test('camera gestures keep pointer ownership and bound look and zoom', () => {
  const { view } = fixture()
  expect(view.beginDrag(1, 400, 300, 'chase')).toBe(true)
  expect(view.beginDrag(2, 400, 300, 'chase')).toBe(false)
  expect(view.moveDrag(2, 600, 500, 800, 600)).toBe(false)
  expect(view.moveDrag(1, 600, 200, 800, 600)).toBe(true)
  expect(view.yaw).toBeCloseTo(-Math.PI / 2)
  expect(view.pitch).toBeCloseTo(Math.PI / 6)
  expect(view.endDrag(2)).toBe(false)
  expect(view.endDrag(1)).toBe(true)
  view.scroll(-1e6, 'chase')
  view.scroll(-1e6, 'chase')
  expect(view.zoom).toBe(0.72)
  for (let i = 0; i < 5; i++) view.scroll(1e6, 'chase')
  expect(view.zoom).toBe(2.6)
  expect(view.scroll(100, 'bonnet')).toBe(false)
  view.center()
  expect([view.yaw, view.pitch, view.zoom]).toEqual([0, 0, 1])
})

test('bonnet look recenters after release without changing vehicle heading', () => {
  const { view, world, subject } = fixture()
  view.update(subject, world, 'bonnet', 1 / 60)
  view.beginDrag(7, 400, 300, 'bonnet')
  view.moveDrag(7, -1000, -1000, 800, 600)
  expect(view.yaw).toBe(1.55)
  view.update(subject, world, 'bonnet', 1 / 60)
  expect(view.yaw).toBe(1.55)
  view.endDrag(7)
  const yaw = subject.yaw
  for (let i = 0; i < 180; i++) view.update(subject, world, 'bonnet', 1 / 60)
  expect(Math.abs(view.yaw) + Math.abs(view.pitch)).toBeLessThan(1e-6)
  expect(subject.yaw).toBe(yaw)
})

test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
  '%s stays outside the camera near plane at closest zoom and fits portrait framing',
  (vehicle) => {
    for (const aspect of [16 / 9, 9 / 16]) {
      const { view, world, subject, camera } = fixture(aspect)
      world.settings.vehicle = vehicle
      view.snap()
      view.update(subject, world, 'chase', 1 / 60)
      const model = createVehicleModel(world.settings)
      model.group.position.set(subject.x, subject.y, -subject.s)
      model.group.rotation.y = subject.yaw
      const box = new THREE.Box3().setFromObject(model.group)
      camera.updateMatrixWorld()
      const projected = new THREE.Box3()
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z])
            projected.expandByPoint(new THREE.Vector3(x, y, z).project(camera))
      expect(projected.min.x).toBeGreaterThan(-1)
      expect(projected.max.x).toBeLessThan(1)
      view.scroll(-1000, 'chase')
      view.snap()
      view.update(subject, world, 'chase', 1 / 60)
      expect(box.distanceToPoint(camera.position)).toBeGreaterThan(camera.near + 0.2)
      model.dispose()
    }
  },
)

test('speed field of view is smooth, bounded, and symmetric in reverse', () => {
  const result = (speed: number, rate: number) => {
    const { view, world, subject, camera } = fixture()
    subject.speed = speed
    for (let i = 0; i < rate * 3; i++) view.update(subject, world, 'chase', 1 / rate)
    return camera.fov
  }
  expect(result(0, 60)).toBe(68)
  expect(result(45, 60)).toBeCloseTo(76, 3)
  expect(result(-45, 60)).toBeCloseTo(result(45, 60), 6)
  expect(result(1000, 60)).toBeLessThanOrEqual(76)
  expect(result(25, 30)).toBeCloseTo(result(25, 144), 6)
})

test('the orbit boom stays clear of an intervening hillside', () => {
  const { view, world, subject, camera } = fixture()
  const ground = subject.y
  world.height = (x, s) => ground + (x < subject.x - 1 && s < subject.s + 1 ? 2.5 : 0)
  view.beginDrag(1, 400, 300, 'chase')
  view.moveDrag(1, 600, 300, 800, 600)
  view.endDrag(1)
  view.snap()
  view.update(subject, world, 'chase', 1 / 60)
  const direction = new THREE.Vector3()
  camera.getWorldDirection(direction)
  const t = (subject.x - camera.position.x) / direction.x
  const pivot = camera.position.clone().addScaledVector(direction, t)
  for (let i = 1; i <= 12; i++) {
    const point = pivot.clone().lerp(camera.position, i / 12)
    expect(point.y).toBeGreaterThanOrEqual(world.height(point.x, -point.z) + 0.349)
  }
})

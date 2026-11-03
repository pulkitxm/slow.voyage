import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { DrivingCamera } from './camera'
import { groundGeometry } from './ground'
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

test('controller look holds bonnet angles while active and recenters when released', () => {
  const { view, subject, world } = fixture()
  view.update(subject, world, 'bonnet', 1 / 60)
  for (let i = 0; i < 60; i++) {
    view.controllerLook({ x: 1, y: 1, zoom: 0 }, 'bonnet', 1 / 60)
    view.update(subject, world, 'bonnet', 1 / 60)
  }
  expect(view.yaw).toBe(1.55)
  expect(view.pitch).toBe(0.65)
  for (let i = 0; i < 120; i++) {
    view.controllerLook({ x: 0, y: 0, zoom: 0 }, 'bonnet', 1 / 60)
    view.update(subject, world, 'bonnet', 1 / 60)
  }
  expect(Math.abs(view.yaw)).toBeLessThan(0.001)
  expect(Math.abs(view.pitch)).toBeLessThan(0.001)
})

test('controller orbit respects pointer ownership, zoom bounds and elapsed time', () => {
  for (const fps of [30, 60, 120]) {
    const { view } = fixture()
    for (let i = 0; i < fps; i++) view.controllerLook({ x: 0.5, y: 0, zoom: 1 }, 'chase', 1 / fps)
    expect(view.yaw).toBeCloseTo(0.85, 8)
    expect(view.zoom).toBe(0.72)
    view.beginDrag(1, 0, 0, 'chase')
    view.controllerLook({ x: 1, y: 1, zoom: -1 }, 'chase', 0.05)
    expect(view.yaw).toBeCloseTo(0.85, 8)
    expect(view.zoom).toBe(0.72)
  }
})

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
  world.surface = (x, s) => ({
    height: ground + (x < subject.x - 1 && s < subject.s + 1 ? 2.5 : 0),
    slopeX: 0,
    slopeS: 0,
    onRoad: false,
  })
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
    expect(point.y).toBeGreaterThanOrEqual(world.surface(point.x, -point.z).height + 0.349)
  }
})

test.each([
  { mode: 'chase', s: 900, offset: 650 },
  { mode: 'cinematic', s: 240, offset: -650 },
] as const)('$mode stays above rendered far off-road terrain', ({ mode, s, offset }) => {
  const world = new World({ ...defaults, landscape: 'alpine', vehicle: 'bus', seed: 43 })
  const road = world.road(s)
  const x = road.x + offset
  const subject = { x, y: world.surface(x, s).height, s, yaw: road.yaw, speed: 20 }
  const camera = new THREE.PerspectiveCamera(68, 0.55, 0.1, 3600)
  const view = new DrivingCamera(camera)
  view.update(subject, world, mode, 1 / 60)
  if (mode === 'chase') {
    view.yaw = Math.PI / 2
    view.pitch = 0.1
    view.zoom = 2.6
  }
  view.snap()
  view.update(subject, world, mode, 1 / 60)
  const geometry = groundGeometry(
    world,
    Math.floor(-camera.position.z / 120) * 120,
    new THREE.Color(),
    new THREE.Color(),
  )
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  try {
    const mesh = new THREE.Mesh(geometry, material)
    const ray = new THREE.Raycaster(
      camera.position.clone().add(new THREE.Vector3(0, 100, 0)),
      new THREE.Vector3(0, -1, 0),
    )
    const hit = ray.intersectObject(mesh)[0]
    if (!hit) throw new Error('Rendered ground missing under off-road camera')
    expect(camera.position.y - hit.point.y).toBeGreaterThanOrEqual(0.34999)
  } finally {
    geometry.dispose()
    material.dispose()
  }
})

test.each([0, 20])(
  'portrait bus orbit stays above the rendered alpine cut face at %i m/s',
  (speed) => {
    const world = new World({ ...defaults, landscape: 'alpine', vehicle: 'bus', seed: 43 })
    const s = -1080
    const road = world.road(s)
    const subject = { x: road.x + 2, y: road.y, s, yaw: road.yaw, speed }
    const camera = new THREE.PerspectiveCamera(68, 0.55, 0.1, 3600)
    const view = new DrivingCamera(camera)
    view.update(subject, world, 'chase', 1 / 60)
    view.yaw = (Math.PI * 5) / 3
    view.pitch = 0.4
    view.zoom = 2.6
    view.snap()
    view.update(subject, world, 'chase', 1 / 60)
    const start = Math.floor(-camera.position.z / 120) * 120
    const ground = groundGeometry(
      world,
      start,
      new THREE.Color('#819e48'),
      new THREE.Color('#b2c76b'),
    )
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(ground, material)
    mesh.updateMatrixWorld()
    const ray = new THREE.Raycaster(
      camera.position.clone().add(new THREE.Vector3(0, 100, 0)),
      new THREE.Vector3(0, -1, 0),
    )
    const hit = ray.intersectObject(mesh)[0]
    if (!hit) throw new Error('Rendered ground missing under camera')
    expect(camera.position.y - hit.point.y).toBeGreaterThan(0.2)
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    const targetDistance =
      Math.hypot(camera.position.x - subject.x, camera.position.z + subject.s) /
      Math.hypot(direction.x, direction.z)
    const sightline = new THREE.Raycaster(
      camera.position,
      direction,
      camera.near,
      targetDistance - 0.1,
    )
    expect(sightline.intersectObject(mesh)).toHaveLength(0)
    ground.dispose()
    material.dispose()
  },
)

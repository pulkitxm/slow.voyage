import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { cameraFeel, DrivingCamera } from './camera'
import { defaults, World } from './world'

function roll(camera: THREE.PerspectiveCamera) {
  return new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').z
}

function drive(motion: number, turning: number, braking = 0) {
  const world = new World({ ...defaults })
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 3000)
  const view = new DrivingCamera(camera)
  view.motion = motion
  const road = world.road(200)
  const subject = { x: road.x, y: road.y, s: 200, yaw: road.yaw, speed: 30 }
  let steepest = 0
  let widest = 0
  for (let step = 0; step < 90; step++) {
    subject.yaw += (turning * 1) / 60
    subject.speed = Math.max(5, subject.speed - (braking * 1) / 60)
    subject.s += (subject.speed * Math.cos(subject.yaw)) / 60
    subject.x -= (subject.speed * Math.sin(subject.yaw)) / 60
    view.update(subject, world, 'bonnet', 1 / 60)
    steepest = Math.max(steepest, Math.abs(roll(camera)))
    widest = Math.max(widest, camera.fov)
  }
  return { steepest, widest }
}

test('the view leans in a bend and stays level on the straight', () => {
  expect(drive(1, 0.5).steepest).toBeGreaterThan(0.01)
  expect(drive(1, 0.5).steepest).toBeLessThanOrEqual(cameraFeel.leanLimit + 0.005)
  expect(drive(1, 0).steepest).toBeLessThan(0.003)
})

test('steady camera motion removes the lean and narrows the speed widening', () => {
  expect(drive(0, 0.5).steepest).toBeLessThan(1e-6)
  expect(drive(0, 0).widest).toBeLessThan(drive(1, 0).widest)
})

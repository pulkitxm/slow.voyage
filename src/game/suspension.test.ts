import { expect, test } from 'bun:test'
import { type ChassisPose, Suspension } from './suspension'
import { vehicleMetrics } from './vehicles'
import { defaults, type Vehicle, World } from './world'

class TestWorld extends World {
  elevation = (_x: number, _s: number) => 0
  override surface(x: number, s: number) {
    return {
      height: this.elevation(x, s),
      onRoad: true,
      sand: false,
      slopeX: (this.elevation(x + 0.2, s) - this.elevation(x - 0.2, s)) / 0.4,
      slopeS: (this.elevation(x, s + 0.2) - this.elevation(x, s - 0.2)) / 0.4,
    }
  }
}

function fixture(vehicle: Vehicle = 'touring') {
  const world = new TestWorld({ ...defaults, vehicle })
  const suspension = new Suspension(world)
  const pose: ChassisPose = {
    x: 0,
    s: 0,
    y: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    verticalSpeed: 0,
    pitchRate: 0,
    rollRate: 0,
    speed: 0,
    lateralSpeed: 0,
    yawRate: 0,
    steering: 0,
  }
  suspension.reset(pose)
  return { world, suspension, pose }
}

test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
  '%s suspension supports its weight without resting drift',
  (vehicle) => {
    const { suspension, pose } = fixture(vehicle)
    for (let i = 0; i < 120 * 6; i++) suspension.update(1 / 120, pose, 0, 0, false)
    expect(Math.abs(pose.y) + Math.abs(pose.pitch) + Math.abs(pose.roll)).toBeLessThan(1e-8)
    expect(suspension.wheels.every((wheel) => wheel.contact)).toBe(true)
    const totalLoad = suspension.wheels.reduce((sum, wheel) => sum + wheel.load, 0)
    expect(totalLoad).toBeCloseTo(vehicleMetrics[vehicle].mass * 9.81, 4)
  },
)

test('a bump under one front wheel compresses that corner and tilts the chassis', () => {
  const { world, suspension, pose } = fixture()
  world.elevation = (x, s) => (x > 0 && s > 0 ? 0.05 : 0)
  suspension.update(1 / 120, pose, 0, 0, false)
  const front = suspension.wheels.filter((wheel) => wheel.front)
  const left = front.find((wheel) => wheel.localX < 0)
  const right = front.find((wheel) => wheel.localX > 0)
  expect(right?.load).toBeGreaterThan(left?.load ?? Infinity)
  expect(right?.compression).toBeGreaterThan(left?.compression ?? Infinity)
  expect(pose.pitch).toBeGreaterThan(0)
  expect(pose.roll).toBeGreaterThan(0)
  expect(suspension.wheels.every((wheel) => Math.abs(wheel.offset) <= 0.07)).toBe(true)
})

test('airborne wheels lose load and the chassis falls, lands, and settles', () => {
  const { suspension, pose } = fixture()
  pose.y = 2
  for (let i = 0; i < 24; i++) suspension.update(1 / 120, pose, 0, 0, false)
  expect(suspension.wheels.every((wheel) => !wheel.contact && wheel.load === 0)).toBe(true)
  expect(pose.verticalSpeed).toBeCloseTo(-9.81 * 0.2, 5)
  expect(pose.y).toBeGreaterThan(1.79)
  expect(pose.y).toBeLessThan(1.81)
  for (let i = 0; i < 120 * 4; i++) suspension.update(1 / 120, pose, 0, 0, false)
  expect(suspension.wheels.every((wheel) => wheel.contact && wheel.load > 0)).toBe(true)
  expect(Math.abs(pose.y)).toBeLessThan(0.001)
  expect(Math.abs(pose.verticalSpeed)).toBeLessThan(0.001)
})

test('longitudinal acceleration transfers weight to the rear axle', () => {
  const { suspension, pose } = fixture()
  for (let i = 0; i < 120 * 4; i++) suspension.update(1 / 120, pose, 3, 0, false)
  const frontLoad = suspension.wheels
    .filter((wheel) => wheel.front)
    .reduce((sum, wheel) => sum + wheel.load, 0)
  const rearLoad = suspension.wheels
    .filter((wheel) => !wheel.front)
    .reduce((sum, wheel) => sum + wheel.load, 0)
  const metrics = vehicleMetrics.touring
  const transfer = (metrics.mass * 3 * metrics.centerOfMassHeight) / metrics.wheelbase
  expect(rearLoad - frontLoad).toBeCloseTo(transfer * 2, 0)
  expect(pose.pitch).toBeGreaterThan(0)
})

test('front wheels steer independently and the outside wheel travels farther', () => {
  const { suspension, pose } = fixture()
  pose.speed = 5
  pose.steering = 0.4
  pose.yawRate = (pose.speed / vehicleMetrics.touring.wheelbase) * Math.tan(pose.steering)
  suspension.update(1 / 120, pose, 0, 0, false)
  const left = suspension.wheels.find((wheel) => wheel.front && wheel.localX < 0)
  const right = suspension.wheels.find((wheel) => wheel.front && wheel.localX > 0)
  expect(left?.steering).toBeGreaterThan(right?.steering ?? Infinity)
  expect(Math.abs(right?.rotation ?? 0)).toBeGreaterThan(Math.abs(left?.rotation ?? 0))
})

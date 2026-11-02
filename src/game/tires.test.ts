import { expect, test } from 'bun:test'
import { CarPhysics, type Input } from './physics'
import { solveTires } from './tires'
import { vehicleMetrics } from './vehicles'
import { defaults, type Settings, World } from './world'

class FlatWorld extends World {
  override road(_s: number) {
    return { x: 0, y: 0, dx: 0, dy: 0, yaw: 0 }
  }
  override surface(_x: number, _s: number) {
    return { height: 0, onRoad: true, slopeX: 0, slopeS: 0 }
  }
  override guardrail(_s: number, _side: number) {
    return false
  }
}
const coast: Input = { throttle: 0, brake: 0, steer: 0, handbrake: false, regenBrake: 0 }
const step = 1 / 120
function car(settings: Settings = defaults) {
  return new CarPhysics(new FlatWorld(settings))
}

test.each([1, 8])('tires share a friction budget under %i m/s² braking', (brake) => {
  const settings = { ...defaults, grip: 0.7, season: 'winter' as const }
  const body = car(settings)
  body.speed = 30
  body.steering = 0.3
  body.suspension.updateSteering(body.steering)
  solveTires(step, body, body.suspension.wheels, settings, 0, brake, false)
  for (const wheel of body.suspension.wheels) {
    const budget = settings.grip * 0.58 * wheel.load * step
    expect(Math.hypot(wheel.longitudinalImpulse, wheel.lateralImpulse)).toBeLessThanOrEqual(
      budget + 1e-8,
    )
  }
  expect(body.speed).toBeLessThan(30)
  if (brake === 8) {
    expect(Math.abs(body.yawRate)).toBeLessThan(0.001)
    expect(body.suspension.wheels.every((wheel) => wheel.locked)).toBe(true)
  } else {
    expect(body.yawRate).toBeGreaterThan(0)
    expect(body.suspension.wheels.every((wheel) => !wheel.locked)).toBe(true)
  }
})

test('unequal grip changes wheel traction independently', () => {
  const body = car()
  body.speed = 5
  for (const wheel of body.suspension.wheels) wheel.onRoad = wheel.localX > 0
  solveTires(step, body, body.suspension.wheels, defaults, 20, 0, false)
  const left = body.suspension.wheels.filter((wheel) => wheel.localX < 0)
  const right = body.suspension.wheels.filter((wheel) => wheel.localX > 0)
  expect(left.reduce((sum, wheel) => sum + wheel.longitudinalImpulse, 0)).toBeLessThan(
    right.reduce((sum, wheel) => sum + wheel.longitudinalImpulse, 0),
  )
  expect(body.yawRate).toBeGreaterThan(0)
})

test('gravity makes an unpowered vehicle roll downhill', () => {
  class SlopeWorld extends FlatWorld {
    override surface(_x: number, s: number) {
      return { height: s * 0.1, onRoad: true, slopeX: 0, slopeS: 0.1 }
    }
  }
  const body = new CarPhysics(new SlopeWorld({ ...defaults }))
  const altitude = body.y
  for (let i = 0; i < 120; i++) body.update(step, coast, defaults)
  expect(body.speed).toBeLessThan(-0.6)
  expect(body.y).toBeLessThan(altitude)
})

test('airborne throttle and steering do not accelerate or turn the chassis', () => {
  const driven = car(),
    free = car()
  for (const body of [driven, free]) {
    body.y += 3
    body.speed = 10
    body.suspension.updateOffsets(body)
  }
  for (let i = 0; i < 24; i++) {
    driven.update(step, { ...coast, throttle: 1, steer: 1 }, defaults)
    free.update(step, coast, defaults)
  }
  expect(driven.speed).toBeCloseTo(free.speed, 8)
  expect(driven.yawRate).toBe(0)
  expect(driven.yaw).toBe(0)
  expect(driven.suspension.wheels.every((wheel) => !wheel.contact)).toBe(true)
})

test('winter grip increases the stopping distance from the same speed', () => {
  const distances: number[] = []
  for (const season of ['summer', 'winter'] as const) {
    const settings = { ...defaults, season }
    const body = car(settings)
    body.speed = 25
    for (let i = 0; i < 120 * 8 && body.speed > 0.5; i++)
      body.update(step, { ...coast, brake: 1 }, settings)
    expect(body.speed).toBeLessThanOrEqual(0.5)
    distances.push(body.distance)
  }
  expect(distances[1]).toBeGreaterThan((distances[0] ?? Infinity) * 1.25)
})

test('low-speed tire motion converges to the geometric turning radius', () => {
  const body = car()
  body.speed = 8
  for (let i = 0; i < 120 * 3; i++)
    body.update(step, { ...coast, throttle: 0.16, steer: 0.35 }, defaults)
  const geometricYawRate = (body.speed / vehicleMetrics.touring.wheelbase) * Math.tan(body.steering)
  expect(Math.abs(body.yawRate / geometricYawRate - 1)).toBeLessThan(0.05)
  expect(body.roll).toBeLessThan(0)
  const inner = body.suspension.wheels.filter((wheel) => wheel.localX < 0)
  const outer = body.suspension.wheels.filter((wheel) => wheel.localX > 0)
  expect(outer.reduce((sum, wheel) => sum + wheel.load, 0)).toBeGreaterThan(
    inner.reduce((sum, wheel) => sum + wheel.load, 0),
  )
})

test('the handbrake locks rear wheel rotation while the front wheels keep rolling', () => {
  const body = car()
  body.speed = 20
  for (let i = 0; i < 120; i++)
    body.update(step, { ...coast, steer: 0.4, handbrake: true }, defaults)
  const rear = body.suspension.wheels.filter((wheel) => !wheel.front)
  const front = body.suspension.wheels.filter((wheel) => wheel.front)
  expect(rear.every((wheel) => wheel.rotation === 0)).toBe(true)
  expect(front.every((wheel) => Math.abs(wheel.rotation) > 10)).toBe(true)
})

test('unpowered tire constraints dissipate planar kinetic energy', () => {
  const body = car()
  const metrics = vehicleMetrics.touring
  const yawInertia =
    (metrics.mass * ((metrics.wheelbase * 1.5) ** 2 + metrics.trackWidth ** 2)) / 12
  body.speed = 20
  body.lateralSpeed = 4
  body.yawRate = 1
  const energy = () =>
    0.5 * metrics.mass * (body.speed ** 2 + body.lateralSpeed ** 2) +
    0.5 * yawInertia * body.yawRate ** 2
  let previous = energy()
  for (let i = 0; i < 120 * 3; i++) {
    body.update(step, coast, defaults)
    const next = energy()
    expect(next).toBeLessThanOrEqual(previous + 1e-5)
    previous = next
  }
})

test('the bus takes longer than the touring car to reach full steering lock', () => {
  const angles: number[] = []
  for (const vehicle of ['touring', 'bus'] as const) {
    const settings = { ...defaults, vehicle }
    const body = car(settings)
    for (let i = 0; i < 120 / 2; i++) body.update(step, { ...coast, steer: 1 }, settings)
    angles.push(body.steering)
  }
  expect(angles[0]).toBeGreaterThan(0.5)
  expect(angles[1]).toBeLessThan(0.25)
})

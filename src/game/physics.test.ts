import { describe, expect, test } from 'bun:test'
import { CarPhysics } from './physics'
import { defaults, World } from './world'

class FlatWorld extends World {
  override road(_s: number) {
    return { x: 0, y: 0, dx: 0, dy: 0, yaw: 0 }
  }
}

const coast = { throttle: 0, brake: 0, steer: 0, handbrake: false }
function simulate(car: CarPhysics, duration: number, input = coast, dt = 1 / 120) {
  for (let t = 0; t < duration; t += dt) car.update(dt, input, defaults)
}
describe('vehicle dynamics', () => {
  test('accelerates, coasts, and brakes with distinct stopping forces', () => {
    const car = new CarPhysics(new FlatWorld({ ...defaults }))
    simulate(car, 4, { ...coast, throttle: 1 })
    expect(car.speed).toBeGreaterThan(12)
    const speed = car.speed
    simulate(car, 1)
    expect(car.speed).toBeLessThan(speed)
    const rollingLoss = speed - car.speed
    simulate(car, 1, { ...coast, brake: 1 })
    expect(speed - rollingLoss - car.speed).toBeGreaterThan(rollingLoss * 3)
  })
  test('handles reverse without producing invalid state', () => {
    const car = new CarPhysics(new FlatWorld({ ...defaults }))
    simulate(car, 3, { ...coast, brake: 1 })
    expect(car.speed).toBeLessThan(0)
    expect(car.telemetry().gear).toBe('R')
    expect(Number.isFinite(car.x + car.y + car.s)).toBe(true)
  })
  test('autodrive follows several kilometers of generated curves', () => {
    const car = new CarPhysics(new World({ ...defaults }))
    for (let i = 0; i < 120 * 240; i++) car.update(1 / 120, car.autoInput(24), defaults)
    expect(car.distance).toBeGreaterThan(4500)
    expect(Math.abs(car.x - car.world.road(car.s).x)).toBeLessThan(4.5)
    expect(car.offroad).toBe(false)
  })
  test('gives similar results at different simulation rates', () => {
    const a = new CarPhysics(new FlatWorld({ ...defaults }))
    const b = new CarPhysics(new FlatWorld({ ...defaults }))
    simulate(a, 3, { ...coast, throttle: 1 }, 1 / 60)
    simulate(b, 3, { ...coast, throttle: 1 }, 1 / 120)
    expect(Math.abs(a.speed - b.speed)).toBeLessThan(0.15)
    expect(Math.abs(a.distance - b.distance)).toBeLessThan(0.4)
  })
})
describe('world continuity', () => {
  test('road joins stay smooth at streaming boundaries far from the origin', () => {
    const world = new World({ ...defaults })
    for (const s of [0, 120, 240, 1200, 12000, 100000]) {
      const a = world.road(s - 0.001)
      const b = world.road(s + 0.001)
      expect(Math.abs(a.x - b.x)).toBeLessThan(0.005)
      expect(Math.abs(a.y - b.y)).toBeLessThan(0.005)
      expect(Math.abs(world.height(b.x, s + 0.001) + 0.16 - b.y)).toBeLessThan(0.001)
    }
  })
})

test('different vehicles reach distinct natural cruising limits', () => {
  const speeds: number[] = []
  for (const vehicle of ['touring', 'bus'] as const) {
    const settings = { ...defaults, vehicle }
    const car = new CarPhysics(new FlatWorld(settings))
    for (let i = 0; i < 120 * 90; i++) car.update(1 / 120, { ...coast, throttle: 1 }, settings)
    speeds.push(car.speed)
  }
  expect(speeds[0]).toBeGreaterThan(40)
  expect(speeds[0]).toBeLessThan(50)
  expect(speeds[1]).toBeGreaterThan(27)
  expect(speeds[1]).toBeLessThan(35)
})

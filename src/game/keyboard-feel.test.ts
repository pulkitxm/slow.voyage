import { describe, expect, test } from 'bun:test'
import { neutralInput } from './controls'
import { CarPhysics } from './physics'
import { defaults, type Settings, type SteeringFeel, type Vehicle, World } from './world'

class OpenRoad extends World {
  override road(_s: number) {
    return { x: 0, y: 0, dx: 0, dy: 0, yaw: 0 }
  }
  override surface(_x: number, _s: number) {
    return { height: 0, onRoad: true, sand: false, slopeX: 0, slopeS: 0 }
  }
  override guardrail() {
    return false
  }
}

const cars = ['touring', 'roadster', 'hatchback', 'supercar', 'pickup', 'bus'] as const

function press(vehicle: Vehicle, speed: number, hold: number, feel: SteeringFeel = 'balanced') {
  const settings: Settings = { ...defaults, vehicle, steeringFeel: feel }
  const car = new CarPhysics(new OpenRoad(settings))
  car.reset(300)
  car.speed = speed
  car.suspension.reset(car)
  const dt = 1 / 120
  const trace: number[] = []
  let offset = 0
  let peak = 0
  let reverse = 0
  for (let step = 0; step < 4 * 120; step++) {
    const time = step * dt
    car.speed = speed
    car.update(
      dt,
      { ...neutralInput, steer: time < hold ? 1 : 0, steeringSource: 'digital' },
      settings,
    )
    const cornering = (car.yawRate * car.speed) / 9.81
    trace.push(Math.abs(cornering))
    if (Math.abs(cornering) > Math.abs(peak)) peak = cornering
    if (time > hold && Math.sign(cornering) !== Math.sign(peak))
      reverse = Math.max(reverse, Math.abs(cornering))
    if (Math.abs(time - hold - 1) < dt / 2) offset = Math.abs(car.x)
  }
  return { trace, offset, peak: Math.abs(peak), reverse, heading: Math.abs(car.yaw) }
}

describe('keyboard steering at highway speed', () => {
  test.each(cars)('%s a 0.15 s tap at 30 to 45 m/s is a gentle lane nudge', (vehicle) => {
    for (const speed of [30, 38, 45]) {
      const tap = press(vehicle, speed, 0.15)
      expect(tap.peak).toBeGreaterThan(0.02)
      expect(tap.peak).toBeLessThan(0.16)
      expect(tap.offset).toBeLessThan(0.3)
      expect(tap.heading).toBeLessThan(0.01)
    }
  })

  test.each(cars)('%s a 0.3 s press moves less than a third of a lane', (vehicle) => {
    for (const speed of [30, 38, 45]) expect(press(vehicle, speed, 0.3).offset).toBeLessThan(1)
  })

  test.each(cars)('%s holding builds smoothly toward the grip limit', (vehicle) => {
    for (const speed of [30, 38, 45]) {
      const { trace } = press(vehicle, speed, 2)
      const half = trace.findIndex((value) => value >= 0.5) / 120
      expect(half).toBeGreaterThan(0.45)
      expect(half).toBeLessThan(1.4)
      for (let index = 1; index < 0.9 * 120; index++)
        expect(trace[index] ?? 0).toBeGreaterThanOrEqual((trace[index - 1] ?? 0) - 0.002)
      expect(Math.max(...trace)).toBeGreaterThan(0.8)
    }
  })

  test.each(cars)('%s releasing after a hold recentres without swinging back', (vehicle) => {
    for (const speed of [30, 38, 45])
      for (const hold of [0.3, 1, 2]) {
        const release = press(vehicle, speed, hold)
        expect(release.reverse).toBeLessThan(Math.max(0.02, release.peak * 0.05))
        expect(release.trace[release.trace.length - 1]).toBeLessThan(0.01)
      }
  })

  test('relaxed steering is calmer than balanced and direct keeps the quick rack', () => {
    for (const speed of [30, 45]) {
      const relaxed = press('touring', speed, 0.3, 'relaxed')
      const balanced = press('touring', speed, 0.3, 'balanced')
      const direct = press('touring', speed, 0.3, 'direct')
      expect(relaxed.offset).toBeLessThan(balanced.offset * 0.8)
      expect(direct.offset).toBeGreaterThan(balanced.offset * 2)
    }
  })

  test('the light touch only applies at speed, so town driving keeps full lock', () => {
    const slow = press('touring', 8, 0.3, 'balanced')
    const direct = press('touring', 8, 0.3, 'direct')
    expect(slow.peak).toBeCloseTo(direct.peak, 2)
  })
})

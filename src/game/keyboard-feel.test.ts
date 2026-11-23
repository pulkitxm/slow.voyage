import { describe, expect, test } from 'bun:test'
import { neutralInput } from './controls'
import { CarPhysics } from './physics'
import { Steering } from './steering'
import { defaults, type Settings, type SteeringAssist, type Vehicle, World } from './world'

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

function press(vehicle: Vehicle, speed: number, hold: number, assist: SteeringAssist = 'light') {
  const settings: Settings = { ...defaults, vehicle, steeringAssist: assist }
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

describe('keyboard steering with light assist at highway speed', () => {
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

  test('strong assist is calmer than light and free steering turns in much harder', () => {
    for (const speed of [30, 45]) {
      const relaxed = press('touring', speed, 0.3, 'strong')
      const balanced = press('touring', speed, 0.3, 'light')
      const direct = press('touring', speed, 0.3, 'off')
      expect(relaxed.offset).toBeLessThan(balanced.offset * 0.8)
      expect(direct.offset).toBeGreaterThan(balanced.offset * 2)
    }
  })

  test('the light touch only applies at speed, so town driving keeps full lock', () => {
    const slow = press('touring', 8, 0.3, 'light')
    const free = press('touring', 8, 0.3, 'off')
    expect(slow.peak / free.peak).toBeGreaterThan(0.9)
    expect(slow.peak / free.peak).toBeLessThan(1.02)
  })
})

describe('free steering', () => {
  test('is the default', () => {
    expect(defaults.steeringAssist).toBe('off')
  })

  test.each(cars)('%s answers a key as strongly at 45 m/s as it does at 10 m/s', (vehicle) => {
    const slow = press(vehicle, 10, 1, 'off')
    for (const speed of [30, 38, 45]) {
      const fast = press(vehicle, speed, 1, 'off')
      for (const frame of [17, 35]) {
        expect(fast.trace[frame] ?? 0).toBeGreaterThan((slow.trace[frame] ?? 0) * 0.6)
      }
      expect(fast.trace[59] ?? 0).toBeGreaterThan((slow.trace[59] ?? 0) * 0.95)
      const assisted = press(vehicle, speed, 1, 'light')
      expect(fast.trace[35] ?? 0).toBeGreaterThan((assisted.trace[35] ?? 0) * 3)
    }
  })

  test.each([...cars, 'motorcycle'] as const)(
    '%s builds cornering as quickly on the motorway as it does in town',
    (vehicle) => {
      const town = press(vehicle, 15, 1, 'off').trace[23] ?? 0
      expect(town).toBeGreaterThan(0.25)
      for (const speed of [22, 30, 45]) {
        const motorway = press(vehicle, speed, 1, 'off').trace[23] ?? 0
        expect(motorway).toBeGreaterThan(town * 0.85)
        expect(motorway).toBeLessThan(town * 1.5)
      }
    },
  )

  test.each(cars)('%s rack reaches its target equally fast at any speed', (vehicle) => {
    const times = [0, 20, 45].map((speed) => {
      const rack = new Steering()
      let elapsed = 0
      let target = 0
      for (let step = 0; step < 480; step++) {
        rack.update(1 / 120, 1, 'digital', speed, vehicle, 0.05, 'off')
        target = Math.max(target, rack.angle)
      }
      const settle = new Steering()
      while (settle.angle < target * 0.9 && elapsed < 4) {
        settle.update(1 / 120, 1, 'digital', speed, vehicle, 0.05, 'off')
        elapsed += 1 / 120
      }
      return elapsed
    })
    expect(Math.abs((times[1] ?? 0) - (times[0] ?? 0))).toBeLessThan(0.02)
    expect(Math.abs((times[2] ?? 0) - (times[0] ?? 0))).toBeLessThan(0.02)
  })

  test.each(cars)('%s recentres after a hold without swinging back', (vehicle) => {
    for (const speed of [30, 45])
      for (const hold of [0.3, 1]) {
        const release = press(vehicle, speed, hold, 'off')
        expect(release.reverse).toBeLessThan(Math.max(0.03, release.peak * 0.06))
        expect(release.trace[release.trace.length - 1]).toBeLessThan(0.02)
      }
  })
})

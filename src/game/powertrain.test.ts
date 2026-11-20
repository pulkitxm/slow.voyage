import { describe, expect, it, test } from 'bun:test'
import { neutralInput } from './controls'
import { CarPhysics, type Input } from './physics'
import { engineProfiles, Gearbox, torqueShare } from './powertrain'
import { vehicleMetrics } from './vehicles'
import { defaults, type Settings, type Vehicle, World } from './world'

class FlatWorld extends World {
  override road(_s: number) {
    return { x: 0, y: 0, dx: 0, dy: 0, yaw: 0 }
  }
}

const vehicles = Object.keys(engineProfiles) as Vehicle[]
const step = 1 / 60

function hold(gearbox: Gearbox, speed: number, throttle: number, seconds: number) {
  for (let t = 0; t < seconds; t += step) gearbox.update(speed, throttle, step)
}

describe('engine profiles', () => {
  it.each(vehicles)('%s never hunts between gears at any throttle', (vehicle) => {
    const profile = engineProfiles[vehicle]
    for (let gear = 1; gear < profile.gearTops.length; gear++) {
      const ratio = (profile.gearTops[gear - 1] ?? 0) / (profile.gearTops[gear] ?? 1)
      expect(profile.cruiseShift * ratio).toBeGreaterThan(profile.downshift * 1.1)
      expect(profile.downshift / ratio).toBeLessThan(profile.cruiseShift)
    }
  })

  it.each(vehicles)('%s stays below redline in top gear at top speed', (vehicle) => {
    const profile = engineProfiles[vehicle]
    const top = profile.gearTops.at(-1) ?? 0
    expect(vehicleMetrics[vehicle].maxSpeed).toBeLessThan(top)
  })

  it('gives each vehicle its own rev range', () => {
    const redlines = new Set(vehicles.map((vehicle) => engineProfiles[vehicle].redline))
    expect(redlines.size).toBe(vehicles.length)
    expect(engineProfiles.bus.redline).toBeLessThan(engineProfiles.touring.redline)
    expect(engineProfiles.motorcycle.redline).toBeGreaterThan(engineProfiles.roadster.redline)
  })
})

describe('gearbox', () => {
  it.each(vehicles)('%s idles in neutral at rest', (vehicle) => {
    const gearbox = new Gearbox(engineProfiles[vehicle])
    hold(gearbox, 0, 0, 2)
    expect(gearbox.rpm).toBeCloseTo(engineProfiles[vehicle].idle, 0)
    expect(gearbox.label(0)).toBe('N')
  })

  it.each(vehicles)('%s revs against the clutch when launching', (vehicle) => {
    const gearbox = new Gearbox(engineProfiles[vehicle])
    hold(gearbox, 0, 1, 1)
    expect(gearbox.rpm).toBeGreaterThan(engineProfiles[vehicle].idle * 1.3)
    expect(gearbox.label(0)).toBe('1')
  })

  it.each(vehicles)('%s climbs through every gear under acceleration', (vehicle) => {
    const profile = engineProfiles[vehicle]
    const gearbox = new Gearbox(profile)
    const maxSpeed = vehicleMetrics[vehicle].maxSpeed
    let previousGear = 1
    for (let speed = 0; speed <= maxSpeed; speed += 0.05) {
      gearbox.update(speed, 1, step)
      expect(gearbox.gear).toBeGreaterThanOrEqual(previousGear)
      expect(gearbox.rpm).toBeLessThanOrEqual(profile.redline)
      previousGear = gearbox.gear
    }
    expect(gearbox.gear).toBeGreaterThanOrEqual(profile.gearTops.length - 1)
  })

  it.each(vehicles)('%s shifts earlier when cruising than when flooring it', (vehicle) => {
    const gentle = new Gearbox(engineProfiles[vehicle])
    const hard = new Gearbox(engineProfiles[vehicle])
    const speed = vehicleMetrics[vehicle].maxSpeed * 0.5
    for (let v = 0; v <= speed; v += 0.05) {
      gentle.update(v, 0.2, step)
      hard.update(v, 1, step)
    }
    expect(gentle.gear).toBeGreaterThan(hard.gear)
    expect(gentle.rpm).toBeLessThan(hard.rpm)
  })

  it.each(vehicles)('%s holds a steady gear at constant speed and throttle', (vehicle) => {
    for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
      for (const throttle of [0.1, 0.4, 1]) {
        const gearbox = new Gearbox(engineProfiles[vehicle])
        const speed = vehicleMetrics[vehicle].maxSpeed * fraction
        for (let v = 0; v <= speed; v += 0.05) gearbox.update(v, throttle, step)
        hold(gearbox, speed, throttle, 3)
        const shifts = gearbox.shifts
        hold(gearbox, speed, throttle, 10)
        expect(gearbox.shifts).toBe(shifts)
      }
    }
  })

  it.each(vehicles)('%s steps down to first gear while braking to a stop', (vehicle) => {
    const gearbox = new Gearbox(engineProfiles[vehicle])
    const top = vehicleMetrics[vehicle].maxSpeed
    for (let v = 0; v <= top; v += 0.05) gearbox.update(v, 1, step)
    for (let v = top; v >= 0; v -= 0.08) {
      gearbox.update(v, 0, step)
      expect(gearbox.rpm).toBeGreaterThanOrEqual(engineProfiles[vehicle].idle - 1)
    }
    hold(gearbox, 0, 0, 3)
    expect(gearbox.gear).toBe(1)
  })

  it('kicks down a gear when the throttle is floored at low revs', () => {
    const gearbox = new Gearbox(engineProfiles.touring)
    for (let v = 0; v <= 30; v += 0.05) gearbox.update(v, 0.2, step)
    const cruising = gearbox.gear
    hold(gearbox, 30, 1, 0.5)
    expect(gearbox.gear).toBeLessThan(cruising)
    expect(gearbox.rpm).toBeLessThan(engineProfiles.touring.redline)
  })

  it('cuts engine load during a shift', () => {
    const gearbox = new Gearbox(engineProfiles.bus)
    let sawCut = false
    for (let v = 0; v <= 12; v += 0.02) {
      gearbox.update(v, 1, step)
      if (gearbox.shifting > 0 && gearbox.load < 0.6) sawCut = true
    }
    expect(sawCut).toBe(true)
  })

  it('reports reverse while rolling backwards', () => {
    const gearbox = new Gearbox(engineProfiles.touring)
    hold(gearbox, -3, 0, 1)
    expect(gearbox.label(-3)).toBe('R')
    expect(gearbox.gear).toBe(1)
  })
})

describe('manual gearbox', () => {
  const settings: Settings = { ...defaults, vehicle: 'touring' }
  const profile = engineProfiles.touring
  const stick = (throttle: number, brake = 0, shift = 0): Input => ({
    ...neutralInput,
    throttle,
    brake,
    manual: true,
    shift,
  })
  const flat = () => {
    const car = new CarPhysics(new FlatWorld(settings))
    car.reset(300)
    car.suspension.reset(car)
    return car
  }
  const run = (car: CarPhysics, seconds: number, input: Input) => {
    for (let step = 0; step < seconds * 120; step++) car.update(1 / 120, input, settings)
  }

  test('first gear tops out at its limiter and never shifts by itself', () => {
    const car = flat()
    run(car, 14, stick(1))
    const top = profile.gearTops[0] ?? 0
    expect(car.gearbox.gear).toBe(1)
    expect(car.speed).toBeGreaterThan(top * 0.9)
    expect(car.speed).toBeLessThan(top * 1.04)
    expect(car.gearbox.limited).toBe(true)
    expect(car.telemetry().gear).toBe('1')
  })

  test('shifting up at the limiter lets the car pull on', () => {
    const car = flat()
    run(car, 8, stick(1))
    const held = car.speed
    car.update(1 / 120, stick(1, 0, 1), settings)
    expect(car.gearbox.gear).toBe(2)
    run(car, 4, stick(1))
    expect(car.speed).toBeGreaterThan(held + 4)
  })

  test('a tall gear from rest is sluggish compared with first', () => {
    const low = flat()
    const tall = flat()
    for (let click = 0; click < 3; click++) {
      tall.update(1 / 120, stick(0, 0, 1), settings)
      run(tall, 0.5, stick(0))
    }
    expect(tall.gearbox.gear).toBe(4)
    run(low, 3, stick(1))
    run(tall, 3, stick(1))
    expect(tall.speed).toBeLessThan(low.speed * 0.7)
    expect(tall.speed).toBeGreaterThan(0.5)
  })

  test('lifting off slows the car more in a low gear than a high one', () => {
    const coast = (gear: number) => {
      const car = flat()
      car.speed = 11
      car.gearbox.gear = gear
      car.gearbox.manual = true
      run(car, 2, stick(0))
      return car.speed
    }
    expect(coast(1)).toBeLessThan(coast(5) - 1)
  })

  test('a downshift that would over-rev is refused and reverse needs a standstill', () => {
    const car = flat()
    car.speed = 30
    car.gearbox.gear = 4
    car.update(1 / 120, stick(0.5, 0, -1), settings)
    expect(car.gearbox.gear).toBe(3)
    run(car, 0.5, stick(0.5))
    car.update(1 / 120, stick(0.5, 0, -1), settings)
    expect(car.gearbox.gear).toBe(3)
    const parked = flat()
    parked.update(1 / 120, stick(0, 0, -1), settings)
    expect(parked.gearbox.gear).toBe(-1)
    expect(parked.telemetry().gear).toBe('R')
    run(parked, 2, stick(1))
    expect(parked.speed).toBeLessThan(-1)
    run(parked, 4, stick(0, 1))
    expect(Math.abs(parked.speed)).toBeLessThan(0.3)
  })

  test('the brake holds the car at rest in a forward gear instead of reversing', () => {
    const car = flat()
    run(car, 3, stick(0, 1))
    expect(Math.abs(car.speed)).toBeLessThan(0.05)
    expect(car.gearbox.gear).toBe(1)
  })

  test('the torque share peaks in the upper revs and cuts at the limiter', () => {
    expect(torqueShare(0.75)).toBeGreaterThan(torqueShare(0.3))
    expect(torqueShare(0.75)).toBeGreaterThan(torqueShare(1))
    expect(torqueShare(1.05)).toBe(0)
  })
})

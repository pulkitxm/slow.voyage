import { describe, expect, it } from 'bun:test'
import { engineProfiles, Gearbox } from './powertrain'
import { vehicleMetrics } from './vehicles'
import type { Vehicle } from './world'

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

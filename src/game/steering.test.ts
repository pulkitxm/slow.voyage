import { expect, test } from 'bun:test'
import { Steering, steeringLimit } from './steering'
import { vehicleMetrics } from './vehicles'
import type { SteeringSource, Vehicle } from './world'

const vehicles = ['touring', 'roadster', 'motorcycle', 'bus'] as const

function advance(
  rack: Steering,
  seconds: number,
  command: number,
  source: SteeringSource | null,
  speed: number,
  vehicle: Vehicle,
  rate = 120,
) {
  for (let step = 0; step < Math.round(seconds * rate); step++)
    rack.update(1 / rate, command, source, speed, vehicle)
}

for (const vehicle of vehicles) {
  test(`${vehicle} release uses its calibrated centering time`, () => {
    const rack = new Steering()
    rack.angle = vehicleMetrics[vehicle].maxSteering
    const expected = (
      { touring: 0.3646495, roadster: 0.3646495, motorcycle: 1.3127382, bus: 0.729299 } as const
    )[vehicle]
    let elapsed = 0
    while (rack.angle > vehicleMetrics[vehicle].maxSteering * 0.1 && elapsed < 4) {
      rack.update(1 / 120, 0, null, 0, vehicle)
      elapsed += 1 / 120
    }
    expect(elapsed).toBeGreaterThanOrEqual(expected - 0.000001)
    expect(elapsed).toBeLessThan(expected + 1 / 120)
  })

  test.each([0, 20])(
    `${vehicle} digital steering reaches 90 percent at its calibrated time at %i m/s`,
    (speed) => {
      const expected = (
        {
          touring: [0.729299, 0.8913654444],
          roadster: [0.729299, 0.8669025849],
          motorcycle: [1.3127382, 1.4996677208],
          bus: [1.458598, 1.914409875],
        } as const
      )[vehicle][speed === 0 ? 0 : 1]
      const rack = new Steering()
      const target = steeringLimit(speed, vehicle)
      let elapsed = 0
      while (rack.angle < target * 0.9 && elapsed < 4) {
        rack.update(1 / 120, 1, 'digital', speed, vehicle)
        elapsed += 1 / 120
      }
      expect(elapsed).toBeGreaterThanOrEqual(expected - 0.000001)
      expect(elapsed).toBeLessThan(expected + 1 / 120)
      const reverse = new Steering()
      advance(reverse, elapsed, 1, 'digital', -speed, vehicle)
      expect(reverse.angle).toBeCloseTo(rack.angle, 12)
    },
  )

  test(`${vehicle} centers under its last source and reverses without escaping the rack`, () => {
    for (const source of ['digital', 'mouse', 'analog', 'automatic'] as const) {
      const rack = new Steering()
      advance(rack, 5, 1, source, 20, vehicle)
      const before = rack.angle
      advance(rack, 5, 0, null, 20, vehicle)
      expect(Math.abs(rack.angle)).toBeLessThan(0.00001)
      expect(rack.source).toBe(source)
      expect(before).toBeGreaterThan(0.1)
      advance(rack, 1, 1, source, 20, vehicle)
      for (let step = 0; step < 600; step++) {
        rack.update(1 / 120, -1, source, 20, vehicle)
        expect(Math.abs(rack.angle)).toBeLessThanOrEqual(vehicleMetrics[vehicle].maxSteering)
        expect(Number.isFinite(rack.rate)).toBe(true)
      }
      expect(rack.angle).toBeLessThan(-0.1)
    }
  })

  test(`${vehicle} digital and mouse trajectories agree at 60 and 120 Hz`, () => {
    for (const source of ['digital', 'mouse'] as const) {
      const a = new Steering()
      const b = new Steering()
      for (const command of [1, -1, 0, 0.3, 0]) {
        advance(a, 0.5, command, source, 20, vehicle, 60)
        advance(b, 0.5, command, source, 20, vehicle, 120)
        expect(a.angle).toBeCloseTo(b.angle, 10)
        expect(a.rate).toBeCloseTo(b.rate, 10)
      }
    }
  })

  test(`${vehicle} changes input owner without resetting the moving rack`, () => {
    const rack = new Steering()
    advance(rack, 0.2, 1, 'analog', 12, vehicle)
    for (const source of ['digital', 'mouse', 'digital', 'automatic'] as const) {
      const angle = rack.angle
      const rate = rack.rate
      rack.update(0.000001, -1, source, 12, vehicle)
      expect(Math.abs(rack.angle - angle)).toBeLessThan(0.00001)
      expect(Math.abs(rack.rate - rate)).toBeLessThan(0.001)
      expect(rack.source).toBe(source)
    }
  })
}

test('mouse command slews through a reversal instead of inheriting keyboard delay', () => {
  const mouse = new Steering()
  const keyboard = new Steering()
  advance(mouse, 0.25, 1, 'mouse', 0, 'bus')
  advance(keyboard, 0.25, 1, 'digital', 0, 'bus')
  expect(mouse.angle).toBeGreaterThan(0.55)
  expect(keyboard.angle).toBeLessThan(0.15)
  advance(mouse, 0.125, -1, 'mouse', 0, 'bus')
  expect(mouse.mouseCommand).toBeCloseTo(0.5, 10)
})

test('increased speed reduces the target without snapping the existing wheel angle', () => {
  const rack = new Steering()
  advance(rack, 5, 1, 'digital', 0, 'touring')
  const angle = rack.angle
  rack.update(1 / 120, 1, 'digital', 45, 'touring')
  expect(rack.angle).toBeGreaterThan(angle - 0.01)
  expect(rack.angle).toBeGreaterThan(steeringLimit(45, 'touring'))
  advance(rack, 5, 1, 'digital', 45, 'touring')
  expect(rack.angle).toBeCloseTo(steeringLimit(45, 'touring'), 5)
})

test('vehicle changes obey the physical stop and eliminate outward rack velocity', () => {
  for (const source of ['digital', 'mouse', 'analog', 'automatic'] as const) {
    const rack = new Steering()
    advance(rack, 5, 1, source, 0, 'touring')
    rack.update(1 / 120, 1, source, 0, 'motorcycle')
    expect(rack.angle).toBeLessThanOrEqual(0.4)
    expect(rack.rate).toBeLessThanOrEqual(0)
  }
})

test('releasing input clears stored mouse slew and reset clears all rack motion', () => {
  const rack = new Steering()
  advance(rack, 0.1, 1, 'mouse', 20, 'touring')
  const angle = rack.angle
  const rate = rack.rate
  rack.releaseInput()
  expect(rack.mouseCommand).toBe(0)
  expect(rack.angle).toBe(angle)
  expect(rack.rate).toBe(rate)
  rack.reset()
  expect(rack.angle).toBe(0)
  expect(rack.rate).toBe(0)
  expect(rack.mouseCommand).toBe(0)
  expect(rack.source).toBe('digital')
})

import { expect, test } from 'bun:test'
import { NitroTank, nitroForce, nitroLayout } from './nitro'
import { vehicleMetrics } from './vehicles'

test('a full tank burns for its rated time and then refuses to fire', () => {
  const tank = new NitroTank()
  let burned = 0
  while (tank.step(true, 1 / 120)) burned += 1 / 120
  expect(burned).toBeGreaterThan(nitroLayout.burn - 0.05)
  expect(burned).toBeLessThan(nitroLayout.burn + 0.05)
  expect(tank.level).toBeLessThan(0.001)
  expect(tank.step(true, 1 / 120)).toBe(false)
})

test('an emptied tank must recover to the restart level before firing again', () => {
  const tank = new NitroTank()
  while (tank.step(true, 1 / 120));
  let waited = 0
  while (!tank.step(true, 1 / 120)) waited += 1 / 120
  expect(waited).toBeGreaterThan(nitroLayout.refill * nitroLayout.restart - 0.1)
  expect(waited).toBeLessThan(nitroLayout.refill * nitroLayout.restart + 0.1)
})

test('releasing early keeps the remaining charge available immediately', () => {
  const tank = new NitroTank()
  for (let step = 0; step < 240; step++) tank.step(true, 1 / 120)
  const partial = tank.level
  expect(partial).toBeGreaterThan(0.6)
  expect(tank.step(false, 1 / 120)).toBe(false)
  expect(tank.level).toBeGreaterThan(partial)
  expect(tank.step(true, 1 / 120)).toBe(true)
})

test('the surge fades out past the nominal top speed', () => {
  const metrics = vehicleMetrics.touring
  expect(nitroForce(0, metrics, 1)).toBeCloseTo(metrics.acceleration * 0.25, 8)
  expect(nitroForce(metrics.maxSpeed, metrics, 1)).toBeCloseTo(metrics.acceleration * 0.25, 8)
  expect(nitroForce(metrics.maxSpeed * 1.1, metrics, 1)).toBeCloseTo(
    metrics.acceleration * 0.125,
    8,
  )
  expect(nitroForce(metrics.maxSpeed * 1.25, metrics, 1)).toBe(0)
  expect(nitroForce(20, metrics, 2)).toBeCloseTo(nitroForce(20, metrics, 1) * 2, 8)
})

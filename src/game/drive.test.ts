import { expect, test } from 'bun:test'
import { forwardDriveForce } from './drive'
import { vehicleMetrics } from './vehicles'

test.each([
  { vehicle: 'touring', speed: 0, normal: 6.75, boosted: 9 },
  { vehicle: 'touring', speed: 27, normal: 4.5, boosted: 6.3 },
  { vehicle: 'touring', speed: 45, normal: 4.5, boosted: 4.5 },
  { vehicle: 'bus', speed: 0, normal: 4.5, boosted: 6 },
  { vehicle: 'bus', speed: 32, normal: 3, boosted: 3 },
] as const)('$vehicle drive reserve at $speed m/s', ({ vehicle, speed, normal, boosted }) => {
  expect(forwardDriveForce(speed, 1, false, vehicleMetrics[vehicle], 1)).toBeCloseTo(normal, 8)
  expect(forwardDriveForce(speed, 1, true, vehicleMetrics[vehicle], 1)).toBeCloseTo(boosted, 8)
})

test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
  '%s boost preserves linear pedal and power response',
  (vehicle) => {
    const metrics = vehicleMetrics[vehicle]
    for (const speed of [0, 10, 27, metrics.maxSpeed, metrics.maxSpeed * 1.5]) {
      for (const boost of [false, true]) {
        const full = forwardDriveForce(speed, 1, boost, metrics, 1)
        for (const throttle of [0, 0.1, 0.25, 0.5, 1]) {
          for (const power of [0.4, 1, 2]) {
            expect(forwardDriveForce(speed, throttle, boost, metrics, power)).toBeCloseTo(
              full * throttle * power,
              8,
            )
          }
        }
      }
      expect(forwardDriveForce(speed, 1, true, metrics, 1)).toBeGreaterThanOrEqual(
        forwardDriveForce(speed, 1, false, metrics, 1),
      )
    }
    expect(forwardDriveForce(metrics.maxSpeed * 2, 1, true, metrics, 1)).toBeCloseTo(
      metrics.acceleration * 0.5,
      8,
    )
  },
)

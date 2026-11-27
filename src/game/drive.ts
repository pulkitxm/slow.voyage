import type { VehicleMetrics } from './vehicles'
import { clamp } from './world'

export function forwardDriveForce(
  speed: number,
  throttle: number,
  boost: boolean,
  metrics: Pick<VehicleMetrics, 'acceleration' | 'maxSpeed'>,
  power: number,
) {
  const velocity = Math.abs(speed)
  const reserve = boost
    ? Math.max(0, 1 - velocity / metrics.maxSpeed)
    : Math.max(0, 0.5 * (1 - velocity / 27))
  return clamp(throttle, 0, 1) * metrics.acceleration * power * 0.5 * (1 + reserve)
}

export function reverseDriveForce(
  pedal: number,
  metrics: Pick<VehicleMetrics, 'reverse'>,
  power: number,
  governor: number,
) {
  return clamp(pedal, 0, 1) * metrics.reverse * power * 0.5 * governor
}

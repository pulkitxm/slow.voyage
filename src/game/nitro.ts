import type { VehicleMetrics } from './vehicles'
import { clamp } from './world'

export const nitroLayout = {
  burn: 7,
  refill: 22,
  restart: 0.25,
  surge: 0.5,
  overspeed: 0.2,
} as const

export class NitroTank {
  level = 1
  active = false
  private spent = false

  reset() {
    this.level = 1
    this.active = this.spent = false
  }

  step(requested: boolean, dt: number) {
    if (this.spent && this.level >= nitroLayout.restart) this.spent = false
    this.active = requested && !this.spent && this.level > 0
    this.level = clamp(
      this.level + (this.active ? -dt / nitroLayout.burn : dt / nitroLayout.refill),
      0,
      1,
    )
    if (this.level === 0) this.spent = true
    return this.active
  }
}

export function nitroForce(
  speed: number,
  metrics: Pick<VehicleMetrics, 'acceleration' | 'maxSpeed'>,
  power: number,
) {
  const over = (Math.abs(speed) - metrics.maxSpeed) / (metrics.maxSpeed * nitroLayout.overspeed)
  return metrics.acceleration * power * 0.5 * nitroLayout.surge * clamp(1 - over, 0, 1)
}

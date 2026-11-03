import { vehicleMetrics } from './vehicles'
import { clamp, type SteeringSource, type Vehicle } from './world'

const keyboardSoftening = { startSpeed: 20, span: 12, gripShare: 2 }
export const digitalResponse = { settle: 0.45, speedDelay: 0.25, centering: 0.5 }

export function steeringLimit(speed: number, vehicle: Vehicle) {
  const metrics = vehicleMetrics[vehicle]
  return metrics.maxSteering * (1 - 0.75 * clamp(Math.abs(speed) / metrics.maxSpeed, 0, 1))
}

export class Steering {
  angle = 0
  rate = 0
  source: SteeringSource = 'digital'
  mouseCommand = 0

  reset() {
    this.angle = this.rate = 0
    this.releaseInput()
  }

  releaseInput() {
    this.source = 'digital'
    this.mouseCommand = 0
  }

  private track(dt: number, target: number, response: number, targetRate = 0) {
    const omega = 3.88972 / response
    const offset = this.angle - target + (2 * targetRate) / omega
    const relativeRate = this.rate - targetRate
    const auxiliary = relativeRate + omega * offset
    const decay = Math.exp(-omega * dt)
    this.angle =
      target + targetRate * dt - (2 * targetRate) / omega + (offset + auxiliary * dt) * decay
    this.rate = targetRate + (relativeRate - omega * auxiliary * dt) * decay
  }

  update(
    dt: number,
    command: number,
    source: SteeringSource | null,
    speed: number,
    vehicle: Vehicle,
    gripLimit = Number.POSITIVE_INFINITY,
  ) {
    if (dt <= 0) return this.angle
    const metrics = vehicleMetrics[vehicle]
    const limit = steeringLimit(speed, vehicle)
    const highway = clamp(
      (Math.abs(speed) - keyboardSoftening.startSpeed) / keyboardSoftening.span,
      0,
      1,
    )
    const keyboardLimit =
      limit + (Math.min(limit, gripLimit * keyboardSoftening.gripShare) - limit) * highway
    const ratio = clamp(Math.abs(speed) / metrics.maxSpeed, 0, 1)
    const mouseLimit = limit * (1 - 0.4 * ratio)
    if (source && source !== this.source) {
      if (source === 'mouse') this.mouseCommand = clamp(this.angle / mouseLimit, -1, 1)
      this.source = source
    }
    const target = clamp(command, -1, 1)
    if (this.source === 'digital') {
      const factor =
        vehicle === 'motorcycle' ? 1 + ratio * ratio : 1 + digitalResponse.speedDelay * ratio
      const centering = target === 0 && vehicle !== 'motorcycle' ? digitalResponse.centering : 1
      this.track(
        dt,
        target * keyboardLimit,
        digitalResponse.settle * metrics.steeringInterval * factor * centering,
      )
    } else if (this.source === 'mouse') {
      const change = target - this.mouseCommand
      const rampTime = Math.min(dt, Math.abs(change) / 4)
      const rate = Math.sign(change) * 4
      if (rampTime > 0) {
        this.track(rampTime, this.mouseCommand * mouseLimit, 0.05, rate * mouseLimit)
        this.mouseCommand += rate * rampTime
      }
      if (dt > rampTime) this.track(dt - rampTime, target * mouseLimit, 0.05)
    } else {
      const error = target * limit - this.angle
      const desiredRate = clamp(error * 7, -metrics.steeringSpeed, metrics.steeringSpeed)
      this.rate += clamp(
        desiredRate - this.rate,
        -metrics.steeringAcceleration * dt,
        metrics.steeringAcceleration * dt,
      )
      const step = this.rate * dt
      if (Math.sign(step) === Math.sign(error) && Math.abs(step) >= Math.abs(error)) {
        this.angle += error
        this.rate = 0
      } else this.angle += step
    }
    this.angle = clamp(this.angle, -metrics.maxSteering, metrics.maxSteering)
    if (Math.abs(this.angle) === metrics.maxSteering && this.angle * this.rate > 0) this.rate = 0
    return this.angle
  }
}

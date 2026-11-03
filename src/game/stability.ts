import { clamp } from './world'

export interface StabilityState {
  speed: number
  lateralSpeed: number
  yawRate: number
  steering: number
}

export const stabilityLimits = {
  yawMargin: 0.95,
  yawDeadband: 0.04,
  yawDeadbandShare: 0.15,
  slipAngle: 0.08,
  yawResponse: 20,
  slipResponse: 8,
  minimumSpeed: 4,
}

export function stabilize(state: StabilityState, traction: number, wheelbase: number, dt: number) {
  const speed = Math.abs(state.speed)
  if (speed < stabilityLimits.minimumSpeed || traction <= 0) return 0
  const blend = clamp((speed - stabilityLimits.minimumSpeed) / 4, 0, 1)
  const yawLimit = (traction * stabilityLimits.yawMargin) / speed
  const requested = clamp((state.speed * Math.tan(state.steering)) / wheelbase, -yawLimit, yawLimit)
  const deadband =
    stabilityLimits.yawDeadband + Math.abs(requested) * stabilityLimits.yawDeadbandShare
  const error = state.yawRate - requested
  const excessYaw = error - clamp(error, -deadband, deadband)
  const yawCorrection = excessYaw * (1 - Math.exp(-stabilityLimits.yawResponse * dt)) * blend
  state.yawRate -= yawCorrection
  const slipLimit = Math.tan(stabilityLimits.slipAngle) * speed
  const excessSlip = state.lateralSpeed - clamp(state.lateralSpeed, -slipLimit, slipLimit)
  const slipCorrection = excessSlip * (1 - Math.exp(-stabilityLimits.slipResponse * dt)) * blend
  state.lateralSpeed -= slipCorrection
  return Math.abs(yawCorrection) + Math.abs(slipCorrection)
}

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
  brakingYawResponse: 60,
  slipResponse: 8,
  minimumSpeed: 4,
}
export const sportLimits = {
  yawDeadband: 0.1,
  yawDeadbandShare: 0.3,
  slipAngle: 0.2,
  yawResponse: 16,
  slipResponse: 8,
}
export interface StabilityMode {
  braking?: boolean
  sport?: boolean
}

export function stabilize(
  state: StabilityState,
  traction: number,
  wheelbase: number,
  dt: number,
  mode: StabilityMode = {},
) {
  const limits = mode.sport ? { ...stabilityLimits, ...sportLimits } : stabilityLimits
  const speed = Math.abs(state.speed)
  if (speed < limits.minimumSpeed || traction <= 0) return 0
  const blend = clamp((speed - limits.minimumSpeed) / 4, 0, 1)
  const yawLimit = (traction * limits.yawMargin) / speed
  const requested = clamp((state.speed * Math.tan(state.steering)) / wheelbase, -yawLimit, yawLimit)
  const deadband = limits.yawDeadband + Math.abs(requested) * limits.yawDeadbandShare
  const error = state.yawRate - requested
  const excessYaw = error - clamp(error, -deadband, deadband)
  const yawResponse = mode.braking ? limits.brakingYawResponse : limits.yawResponse
  const yawCorrection = excessYaw * (1 - Math.exp(-yawResponse * dt)) * blend
  state.yawRate -= yawCorrection
  const slipLimit = Math.tan(limits.slipAngle) * speed
  const excessSlip = state.lateralSpeed - clamp(state.lateralSpeed, -slipLimit, slipLimit)
  const slipCorrection = excessSlip * (1 - Math.exp(-limits.slipResponse * dt)) * blend
  state.lateralSpeed -= slipCorrection
  return Math.abs(yawCorrection) + Math.abs(slipCorrection)
}

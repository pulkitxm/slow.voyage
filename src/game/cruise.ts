import type { Input } from './physics'
import type { VehicleMetrics } from './vehicles'
import { clamp } from './world'

export const cruiseLimits = { reverse: 5, forward: 45 }

export function reverseDriveFactor(speed: number, driveForce: number, jerk: number) {
  const runout = Math.max(0, -driveForce) ** 2 / jerk
  return clamp((cruiseLimits.reverse + speed - runout) / 0.5, 0, 1)
}

export function cruisePedals(
  speed: number,
  target: number,
  metrics: VehicleMetrics,
  power: number,
  traction: number,
  brakingTraction: number,
  onRoad: boolean,
  grade: number,
  reverseFactor: number,
): Pick<Input, 'throttle' | 'brake' | 'regenBrake'> {
  const velocity = Math.abs(speed)
  const rolling = 0.1 + metrics.rollingResistance * velocity + (onRoad ? 0 : 1.4 + velocity * 0.04)
  const braking = Math.min(1, Math.max(0, brakingTraction - rolling) / metrics.brake)
  if (target === 0) return { throttle: 0, brake: 0, regenBrake: 1 }
  const resistance = rolling + metrics.drag * velocity * velocity
  const force = (target - speed) * 0.75 + Math.sign(speed || target) * resistance + grade * 9.81
  const direction = Math.sign(target)
  const transitionBrake = speed * direction < -0.05 ? 1 : 0
  if (force * direction <= 0)
    return {
      throttle: 0,
      brake: 0,
      regenBrake: Math.max(transitionBrake, Math.min(braking, Math.abs(force) / metrics.brake)),
    }
  const drive =
    direction > 0
      ? metrics.acceleration * power * 0.5 * (1 + Math.max(0, 0.5 * (1 - velocity / 27)))
      : metrics.reverse * 0.5 * reverseFactor
  const demand = Math.min(Math.abs(force), traction * 0.5 + rolling)
  const pedal = drive <= demand ? 1 : demand / drive
  return {
    throttle: direction > 0 ? pedal : 0,
    brake: direction < 0 ? pedal : 0,
    regenBrake: transitionBrake,
  }
}

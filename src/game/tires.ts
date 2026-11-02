import { surfaceGrip } from './grip'
import type { ChassisPose, WheelState } from './suspension'
import { vehicleMetrics, yawInertia } from './vehicles'
import { clamp, type Settings } from './world'

function applyImpulse(
  pose: ChassisPose,
  wheel: WheelState,
  lateral: number,
  longitudinal: number,
  inverseMass: number,
  inverseInertia: number,
) {
  const sin = Math.sin(wheel.steering),
    cos = Math.cos(wheel.steering)
  const right = lateral * cos - longitudinal * sin
  const forward = lateral * sin + longitudinal * cos
  pose.lateralSpeed += right * inverseMass
  pose.speed += forward * inverseMass
  pose.yawRate += (wheel.localX * forward - wheel.localS * right) * inverseInertia
}

function velocity(pose: ChassisPose, wheel: WheelState) {
  const right = pose.lateralSpeed - pose.yawRate * wheel.localS
  const forward = pose.speed + pose.yawRate * wheel.localX
  const sin = Math.sin(wheel.steering),
    cos = Math.cos(wheel.steering)
  return { longitudinal: forward * cos - right * sin, lateral: right * cos + forward * sin }
}

export function solveTires(
  dt: number,
  pose: ChassisPose,
  wheels: WheelState[],
  settings: Settings,
  drive: number,
  brake: number,
  handbrake: boolean,
) {
  const metrics = vehicleMetrics[settings.vehicle]
  const inverseMass = 1 / metrics.mass
  const inverseInertia = 1 / yawInertia(metrics)
  const quarterMass = metrics.mass / wheels.length
  const speedBefore = pose.speed,
    lateralBefore = pose.lateralSpeed
  const capacities: number[] = []
  for (const wheel of wheels) {
    const friction = surfaceGrip(settings, wheel.onRoad)
    const capacity = wheel.contact ? friction * wheel.load * dt : 0
    capacities.push(capacity)
    wheel.longitudinalImpulse = wheel.lateralImpulse = wheel.slip = 0
    wheel.locked = handbrake && !wheel.front
    if (!capacity) continue
    const rightGravity =
      -wheel.load * (wheel.slopeX * Math.cos(pose.yaw) + wheel.slopeS * Math.sin(pose.yaw))
    const forwardGravity =
      -wheel.load * (-wheel.slopeX * Math.sin(pose.yaw) + wheel.slopeS * Math.cos(pose.yaw))
    pose.lateralSpeed += rightGravity * inverseMass * dt
    pose.speed += forwardGravity * inverseMass * dt
    pose.yawRate +=
      (wheel.localX * forwardGravity - wheel.localS * rightGravity) * inverseInertia * dt
    const motion = velocity(pose, wheel)
    const rolling =
      0.1 +
      metrics.rollingResistance * Math.abs(motion.longitudinal) +
      (wheel.onRoad ? 0 : 1.4 + Math.abs(motion.longitudinal) * 0.04)
    const resistance = quarterMass * (rolling + brake) * dt
    wheel.locked ||= brake > 0 && resistance - Math.abs(drive) * quarterMass * dt >= capacity
    if (wheel.locked) {
      const slidingSpeed = Math.hypot(motion.longitudinal, motion.lateral)
      if (slidingSpeed > 0) {
        const rightDirection = (pose.lateralSpeed - pose.yawRate * wheel.localS) / slidingSpeed
        const forwardDirection = (pose.speed + pose.yawRate * wheel.localX) / slidingSpeed
        const lever = wheel.localX * forwardDirection - wheel.localS * rightDirection
        const effectiveInverseMass = inverseMass + lever * lever * inverseInertia
        const impulse = Math.min(capacity, slidingSpeed / effectiveInverseMass)
        wheel.longitudinalImpulse = (-motion.longitudinal / slidingSpeed) * impulse
        wheel.lateralImpulse = (-motion.lateral / slidingSpeed) * impulse
        applyImpulse(
          pose,
          wheel,
          wheel.lateralImpulse,
          wheel.longitudinalImpulse,
          inverseMass,
          inverseInertia,
        )
        wheel.slip = Math.min(1, slidingSpeed)
      }
      continue
    }
    const lever = wheel.localX * Math.cos(wheel.steering) + wheel.localS * Math.sin(wheel.steering)
    const effectiveInverseMass = inverseMass + lever * lever * inverseInertia
    const stoppingImpulse = -motion.longitudinal / effectiveInverseMass
    const brakingImpulse = clamp(stoppingImpulse, -resistance, resistance)
    const requested = drive * quarterMass * dt + brakingImpulse
    wheel.longitudinalImpulse = clamp(requested, -capacity, capacity)
    wheel.slip = Math.max(0, (Math.abs(requested) - capacity) / Math.max(1, capacity))
    applyImpulse(pose, wheel, 0, wheel.longitudinalImpulse, inverseMass, inverseInertia)
  }
  for (let iteration = 0; iteration < 4; iteration++) {
    for (let i = 0; i < wheels.length; i++) {
      const wheel = wheels[i]
      const capacity = capacities[i] ?? 0
      if (!wheel || !capacity || wheel.locked) continue
      const motion = velocity(pose, wheel)
      const lever =
        wheel.localX * Math.sin(wheel.steering) - wheel.localS * Math.cos(wheel.steering)
      const effectiveInverseMass = inverseMass + lever * lever * inverseInertia
      const limit = Math.sqrt(Math.max(0, capacity * capacity - wheel.longitudinalImpulse ** 2))
      const next = clamp(
        wheel.lateralImpulse - motion.lateral / effectiveInverseMass,
        -limit,
        limit,
      )
      const delta = next - wheel.lateralImpulse
      wheel.lateralImpulse = next
      applyImpulse(pose, wheel, delta, 0, inverseMass, inverseInertia)
    }
  }
  for (const wheel of wheels) {
    const motion = velocity(pose, wheel)
    wheel.slip = clamp(
      wheel.slip + Math.abs(motion.lateral) / Math.max(1, Math.abs(motion.longitudinal)),
      0,
      1,
    )
  }
  const drag = Math.min(1, metrics.drag * Math.hypot(pose.speed, pose.lateralSpeed) * dt)
  pose.speed *= 1 - drag
  pose.lateralSpeed *= 1 - drag
  return {
    forward: (pose.speed - speedBefore) / dt,
    lateral: (pose.lateralSpeed - lateralBefore) / dt,
  }
}

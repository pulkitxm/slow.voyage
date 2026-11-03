import { surfaceGrip } from './grip'
import type { ChassisPose, WheelState } from './suspension'
import { vehicleMetrics, yawInertia } from './vehicles'
import { clamp, type Settings } from './world'

const offroadDrag = 0.004
const longitudinalShare = { minimum: 0.6, maximum: 1, holdSpeed: 0.5 }

function longitudinalLimit(lateralDemand: number) {
  const lateral = clamp(lateralDemand, 0, 1)
  return clamp(
    Math.sqrt(1 - lateral * lateral),
    longitudinalShare.minimum,
    longitudinalShare.maximum,
  )
}

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

function solveLockedTire(
  pose: ChassisPose,
  wheel: WheelState,
  capacity: number,
  inverseMass: number,
  inverseInertia: number,
) {
  const motion = velocity(pose, wheel)
  const longitudinalLever =
    wheel.localX * Math.cos(wheel.steering) + wheel.localS * Math.sin(wheel.steering)
  const lateralLever =
    wheel.localX * Math.sin(wheel.steering) - wheel.localS * Math.cos(wheel.steering)
  const longitudinalMass = inverseMass + longitudinalLever ** 2 * inverseInertia
  const lateralMass = inverseMass + lateralLever ** 2 * inverseInertia
  const coupling = longitudinalLever * lateralLever * inverseInertia
  const freeLongitudinal =
    motion.longitudinal -
    longitudinalMass * wheel.longitudinalImpulse -
    coupling * wheel.lateralImpulse
  const freeLateral =
    motion.lateral - lateralMass * wheel.lateralImpulse - coupling * wheel.longitudinalImpulse
  const determinant = longitudinalMass * lateralMass - coupling * coupling
  let longitudinal = (-freeLongitudinal * lateralMass + freeLateral * coupling) / determinant
  let lateral = (-freeLateral * longitudinalMass + freeLongitudinal * coupling) / determinant
  const impulse = Math.hypot(longitudinal, lateral)
  if (impulse > capacity) {
    let lower = 0
    let upper = Math.hypot(freeLongitudinal, freeLateral) / capacity
    for (let iteration = 0; iteration < 24; iteration++) {
      const multiplier = (lower + upper) / 2
      const longitudinalTerm = longitudinalMass + multiplier
      const lateralTerm = lateralMass + multiplier
      const constrainedDeterminant = longitudinalTerm * lateralTerm - coupling * coupling
      const candidateLongitudinal =
        (-freeLongitudinal * lateralTerm + freeLateral * coupling) / constrainedDeterminant
      const candidateLateral =
        (-freeLateral * longitudinalTerm + freeLongitudinal * coupling) / constrainedDeterminant
      if (Math.hypot(candidateLongitudinal, candidateLateral) > capacity) lower = multiplier
      else upper = multiplier
    }
    const longitudinalTerm = longitudinalMass + upper
    const lateralTerm = lateralMass + upper
    const constrainedDeterminant = longitudinalTerm * lateralTerm - coupling * coupling
    longitudinal =
      (-freeLongitudinal * lateralTerm + freeLateral * coupling) / constrainedDeterminant
    lateral =
      (-freeLateral * longitudinalTerm + freeLongitudinal * coupling) / constrainedDeterminant
  }
  applyImpulse(
    pose,
    wheel,
    lateral - wheel.lateralImpulse,
    longitudinal - wheel.longitudinalImpulse,
    inverseMass,
    inverseInertia,
  )
  wheel.longitudinalImpulse = longitudinal
  wheel.lateralImpulse = lateral
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
  }
  const groundedLoad = wheels.reduce(
    (sum, wheel, index) => sum + ((capacities[index] ?? 0) > 0 ? wheel.load : 0),
    0,
  )
  const centripetal = Math.max(
    Math.abs(pose.yawRate * pose.speed),
    Math.abs((pose.speed * pose.speed * Math.tan(pose.steering)) / metrics.wheelbase),
  )
  for (let i = 0; i < wheels.length; i++) {
    const wheel = wheels[i]
    const capacity = capacities[i] ?? 0
    if (!wheel || !capacity) continue
    const share =
      capacity * longitudinalLimit(centripetal / (surfaceGrip(settings, wheel.onRoad) * 9.81))
    const driveImpulse = (drive * metrics.mass * wheel.load * dt) / Math.max(groundedLoad, 1)
    const motion = velocity(pose, wheel)
    const brakeLimit =
      Math.abs(motion.longitudinal) < longitudinalShare.holdSpeed ? capacity : share
    const rolling =
      0.1 +
      metrics.rollingResistance * Math.abs(motion.longitudinal) +
      (wheel.onRoad
        ? 0
        : 1.4 + Math.abs(motion.longitudinal) * 0.04 + motion.longitudinal ** 2 * offroadDrag)
    const brakeDemand = (brake * metrics.mass * wheel.load * dt) / Math.max(groundedLoad, 1)
    const resistance = Math.min(quarterMass * rolling * dt + brakeDemand, brakeLimit)
    wheel.locked ||=
      brake > 0 &&
      Math.abs(motion.longitudinal) < longitudinalShare.holdSpeed &&
      quarterMass * rolling * dt + brakeDemand - Math.abs(driveImpulse) >= capacity
    if (wheel.locked) {
      wheel.slip = Math.min(1, Math.hypot(motion.longitudinal, motion.lateral))
      continue
    }
    const lever = wheel.localX * Math.cos(wheel.steering) + wheel.localS * Math.sin(wheel.steering)
    const effectiveInverseMass = inverseMass + lever * lever * inverseInertia
    const stoppingImpulse = -motion.longitudinal / effectiveInverseMass
    const brakingImpulse = clamp(stoppingImpulse, -resistance, resistance)
    const requested = driveImpulse + brakingImpulse
    const limit = Math.min(brakeLimit, share)
    wheel.longitudinalImpulse = clamp(requested, -limit, limit)
    wheel.slip = Math.max(0, (Math.abs(requested) - limit) / Math.max(1, capacity))
    applyImpulse(pose, wheel, 0, wheel.longitudinalImpulse, inverseMass, inverseInertia)
  }
  const iterations = wheels.some((wheel) => wheel.locked) ? 12 : 4
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let i = 0; i < wheels.length; i++) {
      const wheel = wheels[i]
      const capacity = capacities[i] ?? 0
      if (!wheel || !capacity) continue
      if (wheel.locked) {
        solveLockedTire(pose, wheel, capacity, inverseMass, inverseInertia)
        continue
      }
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

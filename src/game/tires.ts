import { surfaceGrip } from './grip'
import type { ChassisPose, WheelState } from './suspension'
import { type Drivetrain, vehicleMetrics, yawInertia } from './vehicles'
import { clamp, type Settings } from './world'

export const standingWater = { grip: 0.12, planing: 36, drag: 0.5, surge: 0.0035 }
export const groundDrag = {
  grass: { base: 1, linear: 0.02, quartic: 0.0000068 },
  sand: { base: 1.8, linear: 0.03, quartic: 0.000018 },
}

function groundResistance(wheel: WheelState, speed: number) {
  if (wheel.onRoad) return 0
  const drag = wheel.sand ? groundDrag.sand : groundDrag.grass
  return drag.base + speed * drag.linear + speed ** 4 * drag.quartic
}
const longitudinalShare = { minimum: 0.6, maximum: 1, holdSpeed: 0.5 }
export const antilock = { reach: 1.3, peak: 0.9, rearShare: 0.75, valveShare: 0.3 }
export const breakaway = { spinGrip: 0.8, spinLateral: 0.3, spinSurface: 7 }
export const lockedGrip = { dry: 0.82, wet: 0.66, snow: 0.8 }

function slidingGrip(settings: Pick<Settings, 'season' | 'weather'>) {
  if (settings.season === 'winter') return lockedGrip.snow
  return settings.weather === 'rain' || settings.weather === 'storm'
    ? lockedGrip.wet
    : lockedGrip.dry
}
export interface TireResult {
  forward: number
  lateral: number
  antilock: boolean
  traction: boolean
}

export function driven(drivetrain: Drivetrain, wheel: Pick<WheelState, 'front'>) {
  return drivetrain === 'all' || (drivetrain === 'front') === wheel.front
}

function brakeShares(
  wheels: WheelState[],
  capacities: number[],
  bias: number,
  distribute: boolean,
) {
  if (distribute) {
    const load = wheels.reduce(
      (sum, wheel, index) => sum + ((capacities[index] ?? 0) > 0 ? wheel.load : 0),
      0,
    )
    return wheels.map((wheel) => wheel.load / Math.max(load, 1))
  }
  const front = wheels.filter((wheel) => wheel.front).length
  const rear = wheels.length - front
  return wheels.map((wheel) =>
    wheel.front ? (rear ? bias : 1) / Math.max(front, 1) : (front ? 1 - bias : 1) / rear,
  )
}

function longitudinalLimit(lateralDemand: number, ceiling: number) {
  const lateral = clamp(lateralDemand, 0, 1)
  return clamp(
    ceiling * Math.sqrt(1 - lateral * lateral),
    Math.min(longitudinalShare.minimum, ceiling),
    ceiling,
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
): TireResult {
  const metrics = vehicleMetrics[settings.vehicle]
  const inverseMass = 1 / metrics.mass
  const inverseInertia = 1 / yawInertia(metrics)
  const quarterMass = metrics.mass / wheels.length
  const speedBefore = pose.speed,
    lateralBefore = pose.lateralSpeed
  const capacities: number[] = []
  for (const wheel of wheels) {
    const planing = clamp(Math.abs(pose.speed) / standingWater.planing, 0, 1)
    const friction =
      surfaceGrip(settings, wheel.onRoad, wheel.sand) *
      (1 - standingWater.grip * wheel.puddle * planing)
    const capacity = wheel.contact ? friction * wheel.load * dt : 0
    capacities.push(capacity)
    wheel.longitudinalImpulse = wheel.lateralImpulse = wheel.slip = wheel.spin = 0
    wheel.locked = handbrake && !wheel.front
    if (!capacity) {
      wheel.skidding = wheel.spinning = false
      continue
    }
    const rightGravity =
      -wheel.load * (wheel.slopeX * Math.cos(pose.yaw) + wheel.slopeS * Math.sin(pose.yaw))
    const forwardGravity =
      -wheel.load * (-wheel.slopeX * Math.sin(pose.yaw) + wheel.slopeS * Math.cos(pose.yaw))
    pose.lateralSpeed += rightGravity * inverseMass * dt
    pose.speed += forwardGravity * inverseMass * dt
    pose.yawRate +=
      (wheel.localX * forwardGravity - wheel.localS * rightGravity) * inverseInertia * dt
  }
  const drivenLoad = wheels.reduce(
    (sum, wheel, index) =>
      sum + ((capacities[index] ?? 0) > 0 && driven(metrics.drivetrain, wheel) ? wheel.load : 0),
    0,
  )
  const brakeShare = brakeShares(wheels, capacities, metrics.brakeBias, settings.brakeDistribution)
  const reach = brake > 0 ? antilock.reach : 1
  const ceiling =
    brake > 0 ? reach * (settings.antilock ? antilock.peak : 1) : longitudinalShare.maximum
  const lockGrip = slidingGrip(settings)
  const rearShare = settings.antilock && settings.brakeDistribution ? antilock.rearShare : 1
  let antilockActive = false
  let tractionActive = false
  const centripetal = Math.max(
    Math.abs(pose.yawRate * pose.speed),
    Math.abs((pose.speed * pose.speed * Math.tan(pose.steering)) / metrics.wheelbase),
  )
  for (let i = 0; i < wheels.length; i++) {
    const wheel = wheels[i]
    const capacity = capacities[i] ?? 0
    if (!wheel || !capacity) continue
    const share =
      capacity *
      longitudinalLimit(
        centripetal / (surfaceGrip(settings, wheel.onRoad, wheel.sand) * 9.81),
        brake > 0 && !wheel.front ? ceiling * rearShare : ceiling,
      )
    const driveImpulse = driven(metrics.drivetrain, wheel)
      ? (drive * metrics.mass * wheel.load * dt) / Math.max(drivenLoad, 1)
      : 0
    const lever = wheel.localX * Math.cos(wheel.steering) + wheel.localS * Math.sin(wheel.steering)
    const effectiveInverseMass = inverseMass + lever * lever * inverseInertia
    const ground = velocity(pose, wheel).longitudinal
    const sink = quarterMass * groundResistance(wheel, Math.abs(ground)) * dt
    if (sink)
      applyImpulse(
        pose,
        wheel,
        0,
        clamp(-ground / effectiveInverseMass, -sink, sink),
        inverseMass,
        inverseInertia,
      )
    const motion = velocity(pose, wheel)
    const brakeLimit =
      Math.abs(motion.longitudinal) < longitudinalShare.holdSpeed ? capacity : share
    const rolling =
      0.1 +
      metrics.rollingResistance * Math.abs(motion.longitudinal) +
      wheel.puddle * (standingWater.drag + standingWater.surge * motion.longitudinal ** 2)
    const brakeDemand = Math.min(
      brake * metrics.mass * (brakeShare[i] ?? 0) * dt,
      settings.brakeDistribution || wheel.front
        ? Number.POSITIVE_INFINITY
        : capacity * antilock.reach * antilock.valveShare,
    )
    const holding = Math.abs(motion.longitudinal) < longitudinalShare.holdSpeed
    const clamping = quarterMass * rolling * dt + brakeDemand - Math.abs(driveImpulse)
    wheel.skidding =
      brake > 0 &&
      !settings.antilock &&
      !holding &&
      clamping > (wheel.skidding ? capacity * lockGrip : share)
    if (brake > 0 && settings.antilock && !holding && clamping > share) antilockActive = true
    const resistance = Math.min(quarterMass * rolling * dt + brakeDemand, brakeLimit)
    wheel.locked ||= wheel.skidding || (brake > 0 && holding && clamping >= capacity)
    if (wheel.locked) {
      wheel.spinning = false
      wheel.slip = Math.min(1, Math.hypot(motion.longitudinal, motion.lateral))
      continue
    }
    const stoppingImpulse = -motion.longitudinal / effectiveInverseMass
    const brakingImpulse = clamp(stoppingImpulse, -resistance, resistance)
    const requested = driveImpulse + brakingImpulse
    const limit = Math.min(brakeLimit, share)
    const overpowered =
      driveImpulse !== 0 &&
      Math.sign(requested) === Math.sign(driveImpulse) &&
      Math.abs(requested) > (wheel.spinning ? limit * breakaway.spinGrip : limit)
    wheel.spinning = overpowered && !settings.tractionControl
    if (overpowered && settings.tractionControl) tractionActive = true
    if (wheel.spinning) {
      wheel.longitudinalImpulse = Math.sign(driveImpulse) * limit * breakaway.spinGrip
      wheel.spin = Math.sign(driveImpulse) * breakaway.spinSurface
      wheel.slip = 1
    } else {
      wheel.longitudinalImpulse = clamp(requested, -limit, limit)
      wheel.slip = overpowered
        ? 0
        : Math.max(0, (Math.abs(requested) - limit) / Math.max(1, capacity))
    }
    applyImpulse(pose, wheel, 0, wheel.longitudinalImpulse, inverseMass, inverseInertia)
  }
  const iterations = wheels.some((wheel) => wheel.locked) ? 12 : 4
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let i = 0; i < wheels.length; i++) {
      const wheel = wheels[i]
      const capacity = capacities[i] ?? 0
      if (!wheel || !capacity) continue
      if (wheel.locked) {
        solveLockedTire(
          pose,
          wheel,
          wheel.skidding ? capacity * lockGrip : capacity,
          inverseMass,
          inverseInertia,
        )
        continue
      }
      const motion = velocity(pose, wheel)
      const lever =
        wheel.localX * Math.sin(wheel.steering) - wheel.localS * Math.cos(wheel.steering)
      const effectiveInverseMass = inverseMass + lever * lever * inverseInertia
      const limit = wheel.spinning
        ? capacity * breakaway.spinLateral
        : capacity *
          Math.sqrt(Math.max(0, 1 - (wheel.longitudinalImpulse / (capacity * reach)) ** 2))
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
    antilock: antilockActive,
    traction: tractionActive,
  }
}

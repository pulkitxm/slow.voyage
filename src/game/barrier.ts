import type { ChassisPose } from './suspension'
import { type VehicleMetrics, yawInertia } from './vehicles'

export interface BarrierContact {
  localX: number
  localS: number
  normalX: number
  normalS: number
}

export const barrierResponse = { restitution: 0.15, bounceLimit: 1.5, friction: 0.3 }

export function resolveBarrierImpulse(
  pose: Pick<ChassisPose, 'yaw' | 'speed' | 'lateralSpeed' | 'yawRate'>,
  contacts: BarrierContact[],
  metrics: VehicleMetrics,
  friction = barrierResponse.friction,
) {
  const inverseMass = 1 / metrics.mass
  const inverseInertia = 1 / yawInertia(metrics)
  let approach = 0
  const velocity = (right: number, forward: number, lever: number) =>
    pose.lateralSpeed * right + pose.speed * forward + pose.yawRate * lever
  const apply = (impulse: number, right: number, forward: number, lever: number) => {
    pose.lateralSpeed -= impulse * right * inverseMass
    pose.speed -= impulse * forward * inverseMass
    pose.yawRate -= impulse * lever * inverseInertia
  }
  const constraints = contacts.map((contact) => {
    const right = contact.normalX * Math.cos(pose.yaw) + contact.normalS * Math.sin(pose.yaw)
    const forward = -contact.normalX * Math.sin(pose.yaw) + contact.normalS * Math.cos(pose.yaw)
    const lever = contact.localX * forward - contact.localS * right
    const tangentLever = contact.localX * right + contact.localS * forward
    const speed = velocity(right, forward, lever)
    approach = Math.max(approach, speed)
    return {
      right,
      forward,
      lever,
      tangentLever,
      normalMass: inverseMass + lever * lever * inverseInertia,
      tangentMass: inverseMass + tangentLever * tangentLever * inverseInertia,
      target: -Math.min(
        Math.max(0, speed) * barrierResponse.restitution,
        barrierResponse.bounceLimit,
      ),
      impulse: 0,
      tangentImpulse: 0,
    }
  })
  for (let iteration = 0; iteration < 24; iteration++) {
    let maximum = 0
    for (const contact of constraints) {
      const speed = velocity(contact.right, contact.forward, contact.lever)
      const impulse = Math.max(0, contact.impulse + (speed - contact.target) / contact.normalMass)
      const delta = impulse - contact.impulse
      contact.impulse = impulse
      apply(delta, contact.right, contact.forward, contact.lever)
      maximum = Math.max(maximum, Math.abs(delta))
      if (!friction) continue
      const slide = velocity(-contact.forward, contact.right, contact.tangentLever)
      const bound = friction * contact.impulse
      const tangent = Math.max(
        -bound,
        Math.min(bound, contact.tangentImpulse + slide / contact.tangentMass),
      )
      const tangentDelta = tangent - contact.tangentImpulse
      contact.tangentImpulse = tangent
      apply(tangentDelta, -contact.forward, contact.right, contact.tangentLever)
      maximum = Math.max(maximum, Math.abs(tangentDelta))
    }
    if (maximum < 0.00000001) break
  }
  return approach
}

export const impactLoss = 0.9

export function impactShare(
  pose: Pick<ChassisPose, 'yaw' | 'speed' | 'lateralSpeed'>,
  normalX: number,
  normalS: number,
) {
  const velocityX = -Math.sin(pose.yaw) * pose.speed + Math.cos(pose.yaw) * pose.lateralSpeed
  const velocityS = Math.cos(pose.yaw) * pose.speed + Math.sin(pose.yaw) * pose.lateralSpeed
  const magnitude = Math.hypot(velocityX, velocityS)
  if (magnitude < 1e-6) return 1
  const into = Math.max(0, (velocityX * normalX + velocityS * normalS) / magnitude)
  return Math.max(0.05, 1 - impactLoss * into)
}

export const wallGlance = {
  steepest: 0.45,
  share: 0.3,
  least: 0.015,
  most: 0.06,
  from: 5,
  settle: 0.04,
}

export function glance(pose: { yaw: number; speed: number }, normalX: number, normalS: number) {
  if (Math.abs(pose.speed) < wallGlance.from) return pose.yaw
  const facing = Math.sign(pose.speed)
  const headingX = -Math.sin(pose.yaw) * facing
  const headingS = Math.cos(pose.yaw) * facing
  const into = headingX * normalX + headingS * normalS
  if (into <= 0) return pose.yaw
  const entry = Math.asin(Math.min(1, into))
  if (entry > wallGlance.steepest) return pose.yaw
  const alongX = headingX - into * normalX
  const alongS = headingS - into * normalS
  const length = Math.hypot(alongX, alongS) || 1
  const exit = Math.min(wallGlance.most, Math.max(wallGlance.least, entry * wallGlance.share))
  const leaveX = (alongX / length) * Math.cos(exit) - normalX * Math.sin(exit)
  const leaveS = (alongS / length) * Math.cos(exit) - normalS * Math.sin(exit)
  const heading = Math.atan2(-leaveX * facing, leaveS * facing)
  return pose.yaw + Math.atan2(Math.sin(heading - pose.yaw), Math.cos(heading - pose.yaw))
}

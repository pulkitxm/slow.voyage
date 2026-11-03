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

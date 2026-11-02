import type { ChassisPose } from './suspension'
import { type VehicleMetrics, yawInertia } from './vehicles'

export interface BarrierContact {
  localX: number
  localS: number
  normalX: number
  normalS: number
}

export function resolveBarrierImpulse(
  pose: Pick<ChassisPose, 'yaw' | 'speed' | 'lateralSpeed' | 'yawRate'>,
  contacts: BarrierContact[],
  metrics: VehicleMetrics,
) {
  const inverseMass = 1 / metrics.mass
  const inverseInertia = 1 / yawInertia(metrics)
  let approach = 0
  const constraints = contacts.map((contact) => {
    const right = contact.normalX * Math.cos(pose.yaw) + contact.normalS * Math.sin(pose.yaw)
    const forward = -contact.normalX * Math.sin(pose.yaw) + contact.normalS * Math.cos(pose.yaw)
    const lever = contact.localX * forward - contact.localS * right
    const speed = pose.lateralSpeed * right + pose.speed * forward + pose.yawRate * lever
    approach = Math.max(approach, speed)
    return { right, forward, lever, target: -Math.max(0, speed) * 0.15, impulse: 0 }
  })
  for (let iteration = 0; iteration < 24; iteration++) {
    let maximum = 0
    for (const contact of constraints) {
      const speed =
        pose.lateralSpeed * contact.right +
        pose.speed * contact.forward +
        pose.yawRate * contact.lever
      const effectiveInverseMass = inverseMass + contact.lever * contact.lever * inverseInertia
      const impulse = Math.max(0, contact.impulse + (speed - contact.target) / effectiveInverseMass)
      const delta = impulse - contact.impulse
      contact.impulse = impulse
      pose.lateralSpeed -= delta * contact.right * inverseMass
      pose.speed -= delta * contact.forward * inverseMass
      pose.yawRate -= delta * contact.lever * inverseInertia
      maximum = Math.max(maximum, Math.abs(delta))
    }
    if (maximum < 0.00000001) break
  }
  return approach
}

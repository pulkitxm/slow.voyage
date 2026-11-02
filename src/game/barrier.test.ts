import { expect, test } from 'bun:test'
import { resolveBarrierImpulse } from './barrier'
import { vehicleMetrics, yawInertia } from './vehicles'

test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
  '%s exchanges rotational and linear momentum at a rail contact without adding energy',
  (vehicle) => {
    const metrics = vehicleMetrics[vehicle]
    for (const side of [-1, 1]) {
      const pose = { yaw: 0, speed: 0, lateralSpeed: 0, yawRate: -side * 2 }
      const initialEnergy = 0.5 * yawInertia(metrics) * pose.yawRate ** 2
      const contact = {
        localX: (side * metrics.trackWidth) / 2,
        localS: metrics.wheelbase / 2,
        normalX: side,
        normalS: 0,
      }
      const approach = resolveBarrierImpulse(pose, [contact], metrics)
      const finalSpeed = side * (pose.lateralSpeed - pose.yawRate * contact.localS)
      const finalEnergy =
        0.5 * metrics.mass * (pose.speed ** 2 + pose.lateralSpeed ** 2) +
        0.5 * yawInertia(metrics) * pose.yawRate ** 2
      expect(approach).toBeGreaterThan(0)
      expect(finalSpeed).toBeCloseTo(-approach * 0.15, 8)
      expect(Math.abs(pose.yawRate)).toBeLessThan(2)
      expect(finalEnergy).toBeLessThan(initialEnergy)
      expect(pose.speed).toBe(0)
    }
  },
)

test('a parallel two-wheel rail impact keeps heading and tangential speed', () => {
  const metrics = vehicleMetrics.bus
  const pose = { yaw: 0, speed: 25, lateralSpeed: 2, yawRate: 0 }
  const contacts = [-1, 1].map((axle) => ({
    localX: metrics.trackWidth / 2,
    localS: (axle * metrics.wheelbase) / 2,
    normalX: 1,
    normalS: 0,
  }))
  resolveBarrierImpulse(pose, contacts, metrics)
  expect(pose.speed).toBe(25)
  expect(pose.lateralSpeed).toBeCloseTo(-0.3, 8)
  expect(pose.yawRate).toBeCloseTo(0, 8)
})

test('a separating rail contact receives no impulse', () => {
  const pose = { yaw: 0.3, speed: 10, lateralSpeed: -5, yawRate: 0 }
  const before = { ...pose }
  resolveBarrierImpulse(
    pose,
    [{ localX: 0.68, localS: 1.375, normalX: 1, normalS: 0 }],
    vehicleMetrics.touring,
  )
  expect(pose).toEqual(before)
})

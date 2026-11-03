import { expect, test } from 'bun:test'
import { barrierResponse, resolveBarrierImpulse } from './barrier'
import { vehicleMetrics, yawInertia } from './vehicles'

const energy = (
  pose: { speed: number; lateralSpeed: number; yawRate: number },
  metrics: (typeof vehicleMetrics)['touring'],
) =>
  0.5 * metrics.mass * (pose.speed ** 2 + pose.lateralSpeed ** 2) +
  0.5 * yawInertia(metrics) * pose.yawRate ** 2

test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
  '%s exchanges rotational and linear momentum at a rail contact without adding energy',
  (vehicle) => {
    const metrics = vehicleMetrics[vehicle]
    for (const friction of [0, barrierResponse.friction])
      for (const side of [-1, 1]) {
        const pose = { yaw: 0, speed: 0, lateralSpeed: 0, yawRate: -side * 2 }
        const initialEnergy = energy(pose, metrics)
        const contact = {
          localX: (side * metrics.trackWidth) / 2,
          localS: metrics.wheelbase / 2,
          normalX: side,
          normalS: 0,
        }
        const approach = resolveBarrierImpulse(pose, [contact], metrics, friction)
        const finalSpeed = side * (pose.lateralSpeed - pose.yawRate * contact.localS)
        expect(approach).toBeGreaterThan(0)
        expect(finalSpeed).toBeCloseTo(-approach * barrierResponse.restitution, 6)
        expect(Math.abs(pose.yawRate)).toBeLessThan(2)
        expect(energy(pose, metrics)).toBeLessThan(initialEnergy)
        if (!friction) expect(pose.speed).toBe(0)
      }
  },
)

test('a frictionless parallel rail impact keeps heading and tangential speed', () => {
  const metrics = vehicleMetrics.bus
  const pose = { yaw: 0, speed: 25, lateralSpeed: 2, yawRate: 0 }
  const contacts = [-1, 1].map((axle) => ({
    localX: metrics.trackWidth / 2,
    localS: (axle * metrics.wheelbase) / 2,
    normalX: 1,
    normalS: 0,
  }))
  resolveBarrierImpulse(pose, contacts, metrics, 0)
  expect(pose.speed).toBe(25)
  expect(pose.lateralSpeed).toBeCloseTo(-0.3, 8)
  expect(pose.yawRate).toBeCloseTo(0, 8)
})

test('scraping a rail sheds forward speed in proportion to how hard the car hits it', () => {
  const metrics = vehicleMetrics.touring
  const scrape = (lateralSpeed: number) => {
    const pose = { yaw: 0, speed: 25, lateralSpeed, yawRate: 0 }
    const before = energy(pose, metrics)
    resolveBarrierImpulse(
      pose,
      [-1, 1].map((end) => ({ localX: 0.85, localS: end * 2, normalX: 1, normalS: 0 })),
      metrics,
    )
    expect(energy(pose, metrics)).toBeLessThan(before)
    return pose
  }
  const brush = scrape(0.5)
  const slam = scrape(4)
  expect(brush.speed).toBeLessThan(25)
  expect(brush.speed).toBeGreaterThan(24)
  expect(slam.speed).toBeLessThan(brush.speed - 1)
  expect(25 - slam.speed).toBeLessThanOrEqual(
    barrierResponse.friction * 4 * (1 + barrierResponse.restitution) + 0.000001,
  )
  expect(slam.lateralSpeed).toBeCloseTo(-4 * barrierResponse.restitution, 6)
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

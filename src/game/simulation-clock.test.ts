import { expect, test } from 'bun:test'
import { neutralInput } from './controls'
import { CarPhysics } from './physics'
import { SimulationClock } from './simulation-clock'
import { defaults, World } from './world'

class FlatWorld extends World {
  override road() {
    return { x: 0, y: 0, dx: 0, dy: 0, yaw: 0 }
  }
}
test('driving covers the same distance at low and high rendering frame rates', () => {
  const results = [8, 15, 30, 60, 144].map((fps) => {
    const clock = new SimulationClock()
    const car = new CarPhysics(new FlatWorld({ ...defaults }))
    let steps = 0
    for (let frame = 0; frame < fps * 10; frame++)
      steps += clock.advance(1 / fps, (dt) =>
        car.update(dt, { ...neutralInput, throttle: 1 }, defaults),
      )
    return { steps, distance: car.distance, speed: car.speed }
  })
  const first = results[0]
  if (!first) throw new Error('No frame-rate simulations ran')
  for (const result of results) {
    expect(result.steps).toBe(1200)
    expect(result.distance).toBeCloseTo(first.distance, 6)
    expect(result.speed).toBeCloseTo(first.speed, 6)
  }
})
test('long stalls are bounded and a focus reset discards fractional time', () => {
  const clock = new SimulationClock()
  let elapsed = 0
  expect(
    clock.advance(5, (dt) => {
      elapsed += dt
    }),
  ).toBe(30)
  expect(elapsed).toBeCloseTo(0.25, 8)
  expect(clock.advance(1 / 60, () => {})).toBe(2)
  clock.advance(1 / 240, () => {})
  clock.reset()
  expect(clock.advance(1 / 240, () => {})).toBe(0)
  expect(clock.advance(Number.NaN, () => {})).toBe(0)
})

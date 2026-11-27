import { expect, test } from 'bun:test'
import { stabilityLimits, stabilize } from './stability'

const traction = 9.81
const wheelbase = 2.75
const step = 1 / 120

test('a tracked corner inside the deadband is left untouched', () => {
  const state = { speed: 30, lateralSpeed: 0.5, yawRate: 0, steering: 0.02 }
  state.yawRate = (state.speed * Math.tan(state.steering)) / wheelbase
  const before = { ...state }
  expect(stabilize(state, traction, wheelbase, step)).toBe(0)
  expect(state).toEqual(before)
})

test('a slide against the steering is pulled back toward the requested yaw', () => {
  const state = { speed: 32, lateralSpeed: -3.5, yawRate: -0.31, steering: 0.03 }
  for (let index = 0; index < 60; index++) stabilize(state, traction, wheelbase, step)
  const requested = Math.min(
    (state.speed * Math.tan(state.steering)) / wheelbase,
    (traction * stabilityLimits.yawMargin) / state.speed,
  )
  expect(state.yawRate).toBeGreaterThan(0)
  expect(Math.abs(state.yawRate - requested)).toBeLessThan(
    stabilityLimits.yawDeadband + Math.abs(requested) * stabilityLimits.yawDeadbandShare + 0.01,
  )
  expect(Math.abs(state.lateralSpeed)).toBeLessThan(
    Math.tan(stabilityLimits.slipAngle) * state.speed + 0.05,
  )
})

test('requested yaw never exceeds what the tires can sustain', () => {
  const state = { speed: 40, lateralSpeed: 0, yawRate: 1, steering: 0.2 }
  for (let index = 0; index < 240; index++) stabilize(state, traction, wheelbase, step)
  const limit = (traction * stabilityLimits.yawMargin) / state.speed
  expect(state.yawRate).toBeLessThan(limit * (1 + stabilityLimits.yawDeadbandShare) + 0.05)
})

test('parking speeds, airborne bodies, and reversing are handled without blowing up', () => {
  const slow = { speed: 2, lateralSpeed: 1, yawRate: 2, steering: 0.5 }
  expect(stabilize(slow, traction, wheelbase, step)).toBe(0)
  const airborne = { speed: 30, lateralSpeed: 5, yawRate: 2, steering: 0 }
  expect(stabilize(airborne, 0, wheelbase, step)).toBe(0)
  const reverse = { speed: -12, lateralSpeed: 0, yawRate: 0.6, steering: 0 }
  for (let index = 0; index < 120; index++) stabilize(reverse, traction, wheelbase, step)
  expect(Math.abs(reverse.yawRate)).toBeLessThan(stabilityLimits.yawDeadband + 0.01)
})

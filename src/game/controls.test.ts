import { expect, test } from 'bun:test'
import { mergeManualInput, neutralInput, releaseAssistance, resolveInput } from './controls'
import type { Input } from './physics'

test('speed assistance forwards service braking without dropping manual ownership rules', () => {
  const automatic = { ...neutralInput, regenBrake: 0.7 }
  for (const mode of ['full', 'speed'] as const)
    expect(resolveInput(neutralInput, automatic, mode, true).regenBrake).toBe(0.7)
  for (const mode of ['off', 'steer'] as const) {
    expect(resolveInput(neutralInput, automatic, mode, false).regenBrake).toBe(0)
    expect(resolveInput(neutralInput, automatic, mode, true).regenBrake).toBe(0.15)
  }
})

const manual = { ...neutralInput, throttle: 0.8, brake: 0.2, steer: 0.7 }
const automatic = { ...neutralInput, throttle: 0.3, steer: -0.4 }

test('enabled mouse replaces controller axes while keyboard and touch remain available', () => {
  const controller = { ...neutralInput, throttle: 1, steer: -0.8, handbrake: true }
  expect(mergeManualInput(neutralInput, neutralInput, controller, null)).toEqual(controller)
  expect(mergeManualInput(neutralInput, neutralInput, controller, neutralInput)).toEqual(
    neutralInput,
  )
  const mouse = { ...neutralInput, brake: 1, steer: 0.6 }
  expect(mergeManualInput({ ...neutralInput, steer: -1 }, neutralInput, controller, mouse)).toEqual(
    { ...mouse, steer: -1 },
  )
  expect(
    mergeManualInput(neutralInput, { ...neutralInput, throttle: 1 }, controller, mouse),
  ).toEqual({ ...mouse, throttle: 1 })
})

test('full assistance owns both axes until the driver takes one over', () => {
  const input = resolveInput(manual, automatic, 'full', true)
  expect(input.throttle).toBe(automatic.throttle)
  expect(input.brake).toBe(automatic.brake)
  expect(input.steer).toBe(automatic.steer)
  expect(input.regenBrake).toBe(0)
  expect(releaseAssistance('full', 'steer')).toBe('speed')
  expect(releaseAssistance('full', 'speed')).toBe('steer')
  expect(releaseAssistance('full', 'all')).toBe('off')
})

test('autosteer leaves acceleration and braking with the driver', () => {
  const input = resolveInput(manual, automatic, 'steer', false)
  expect(input.throttle).toBe(manual.throttle)
  expect(input.brake).toBe(manual.brake)
  expect(input.steer).toBe(automatic.steer)
  expect(releaseAssistance('steer', 'speed')).toBe('steer')
  expect(releaseAssistance('steer', 'steer')).toBe('off')
})

test('autospeed leaves steering with the driver', () => {
  const input = resolveInput(manual, automatic, 'speed', false)
  expect(input.throttle).toBe(automatic.throttle)
  expect(input.brake).toBe(automatic.brake)
  expect(input.steer).toBe(manual.steer)
  expect(releaseAssistance('speed', 'steer')).toBe('speed')
  expect(releaseAssistance('speed', 'speed')).toBe('off')
})

test('one-pedal braking applies only when the driver owns speed and releases both pedals', () => {
  expect(resolveInput({ ...neutralInput }, automatic, 'off', true).regenBrake).toBeGreaterThan(0)
  expect(resolveInput({ ...neutralInput }, automatic, 'steer', true).regenBrake).toBeGreaterThan(0)
  expect(resolveInput({ ...neutralInput }, automatic, 'speed', true).regenBrake).toBe(0)
  expect(resolveInput(manual, automatic, 'off', true).regenBrake).toBe(0)
  expect(resolveInput({ ...neutralInput }, automatic, 'off', false).regenBrake).toBe(0)
})

test('manual steering retains the source of the axis that wins priority', () => {
  const keyboard: Input = { ...neutralInput, steer: 1, steeringSource: 'digital' }
  const touch: Input = { ...keyboard, steer: -1 }
  const controller: Input = { ...neutralInput, steer: 0.4, steeringSource: 'analog' }
  const mouse: Input = { ...neutralInput, steer: -0.6, steeringSource: 'mouse' }
  expect(mergeManualInput(keyboard, touch, controller, mouse).steeringSource).toBe('digital')
  expect(mergeManualInput(neutralInput, touch, controller, mouse).steeringSource).toBe('digital')
  expect(mergeManualInput(neutralInput, neutralInput, controller, null).steeringSource).toBe(
    'analog',
  )
  expect(mergeManualInput(neutralInput, neutralInput, controller, mouse).steeringSource).toBe(
    'mouse',
  )
})

test('neutral inputs preserve centering ownership while an enabled mouse owns its center', () => {
  expect(mergeManualInput(neutralInput, neutralInput, neutralInput, null).steeringSource).toBe(null)
  expect(
    mergeManualInput(neutralInput, neutralInput, neutralInput, {
      ...neutralInput,
      steeringSource: 'mouse',
    }).steeringSource,
  ).toBe('mouse')
})

test('opposing digital keys retain the centered axis over a deflected device', () => {
  const keyboard: Input = { ...neutralInput, steeringSource: 'digital' }
  const controller: Input = { ...neutralInput, steer: 0.4, steeringSource: 'analog' }
  const mouse: Input = { ...neutralInput, steer: -0.6, steeringSource: 'mouse' }
  for (const pointer of [null, mouse]) {
    const input = mergeManualInput(keyboard, neutralInput, controller, pointer)
    expect(input.steer).toBe(0)
    expect(input.steeringSource).toBe('digital')
  }
})

test('assistance retains automatic steering ownership only while it steers', () => {
  const driver: Input = { ...neutralInput, steer: 0.4, steeringSource: 'digital' }
  const assisted: Input = { ...neutralInput, steer: -0.2, steeringSource: 'automatic' }
  for (const mode of ['full', 'steer'] as const)
    expect(resolveInput(driver, assisted, mode, false).steeringSource).toBe('automatic')
  for (const mode of ['off', 'speed'] as const)
    expect(resolveInput(driver, assisted, mode, false).steeringSource).toBe('digital')
})

import { expect, test } from 'bun:test'
import { neutralInput, releaseAssistance, resolveInput } from './controls'

const manual = { ...neutralInput, throttle: 0.8, brake: 0.2, steer: 0.7 }
const automatic = { ...neutralInput, throttle: 0.3, steer: -0.4 }

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

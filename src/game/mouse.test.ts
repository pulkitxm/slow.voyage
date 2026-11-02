import { expect, test } from 'bun:test'
import { neutralInput } from './controls'
import { MouseControls } from './mouse'

test('mouse steering is centered, deadzoned, and clamped on both sides', () => {
  const mouse = new MouseControls()
  expect(mouse.move(640, 1280, 1)).toBe(false)
  expect(mouse.move(635, 1280, 1)).toBe(false)
  expect(mouse.steer).toBe(0)
  expect(mouse.move(0, 1280, 1)).toBe(true)
  expect(mouse.steer).toBe(1)
  mouse.move(1280, 1280, 1)
  expect(mouse.steer).toBe(-1)
})

test('sensitivity scales steering and small deliberate movements remain active', () => {
  const mouse = new MouseControls()
  mouse.move(560, 1280, 0.5)
  const low = mouse.steer
  mouse.move(560, 1280, 1)
  expect(mouse.steer).toBeGreaterThan(low)
  expect(mouse.move(558, 1280, 1)).toBe(true)
  expect(mouse.move(558, 1280, 1)).toBe(false)
})

test('mouse buttons release cleanly and braking wins when both are held', () => {
  const mouse = new MouseControls()
  mouse.setButtons(1)
  expect(mouse.input().throttle).toBe(1)
  mouse.setButtons(3)
  expect(mouse.input().throttle).toBe(0)
  expect(mouse.input().brake).toBe(1)
  mouse.setButtons(2)
  expect(mouse.input().brake).toBe(1)
  mouse.setButtons(0)
  expect(mouse.input()).toEqual({ ...neutralInput, steeringSource: 'mouse' })
  mouse.move(200, 1280, 1)
  mouse.setButtons(1)
  mouse.reset()
  expect(mouse.input()).toEqual({ ...neutralInput, steeringSource: 'mouse' })
})

import { expect, test } from 'bun:test'
import { cinemaRelief, frameStrained } from './graphics'

test('slow frames count as strain unless the display is steadily capped', () => {
  expect(frameStrained(1 / 60, 1 / 60, 0.0002)).toBe(false)
  expect(frameStrained(1 / 24, 1 / 26, 0.006)).toBe(true)
  expect(frameStrained(1 / 30, 1 / 30, 0.0004)).toBe(false)
  expect(frameStrained(1 / 30, 1 / 30, 0.004)).toBe(true)
  expect(frameStrained(1 / 20, 1 / 20, 0.0002)).toBe(true)
  expect(cinemaRelief.scales[0]).toBe(1)
  expect([...cinemaRelief.scales].sort((a, b) => b - a)).toEqual([...cinemaRelief.scales])
})

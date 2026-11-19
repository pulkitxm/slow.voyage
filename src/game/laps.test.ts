import { expect, test } from 'bun:test'
import { worldLoop } from './field'
import { formatLap, LapClock } from './laps'
import { decodeSpot, encodeSpot } from './share'

test('only a lap driven from line to line is timed', () => {
  const clock = new LapClock()
  clock.reset(180)
  expect(clock.step(worldLoop.length - 1, 300)).toBe(null)
  expect(clock.step(worldLoop.length + 1, 1)).toBe(null)
  expect(clock.timed).toBe(true)
  expect(clock.step(worldLoop.length * 2 - 1, 400)).toBe(null)
  expect(clock.step(worldLoop.length * 2 + 1, 0.5)).toEqual({ time: 400.5, record: true })
  expect(clock.step(worldLoop.length * 3 + 1, 420)).toEqual({ time: 420, record: false })
  expect(clock.best).toBe(400.5)
  expect(clock.last).toBe(420)
  expect(clock.step(worldLoop.length * 4 + 1, 380)).toEqual({ time: 380, record: true })
})

test('reversing over the line cancels the lap being timed', () => {
  const clock = new LapClock()
  clock.reset(worldLoop.length - 5)
  clock.step(worldLoop.length + 5, 1)
  expect(clock.timed).toBe(true)
  clock.step(worldLoop.length - 5, 1)
  expect(clock.timed).toBe(false)
  expect(clock.step(worldLoop.length + 5, 1)).toBe(null)
  expect(clock.best).toBe(null)
})

test('lap times read as minutes, seconds and tenths', () => {
  expect(formatLap(0)).toBe('0:00.0')
  expect(formatLap(59.96)).toBe('0:59.9')
  expect(formatLap(478.44)).toBe('7:58.4')
  expect(formatLap(-3)).toBe('0:00.0')
})

test('a shared spot survives a round trip and rejects malformed links', () => {
  const spot = { landscape: 'canyon' as const, seed: 4721, distance: 3400 }
  expect(encodeSpot(spot)).toBe('#canyon-4721@3.4')
  expect(decodeSpot(encodeSpot(spot))).toEqual(spot)
  expect(encodeSpot({ ...spot, distance: worldLoop.length * 2 + 3400 })).toBe('#canyon-4721@3.4')
  expect(encodeSpot({ ...spot, distance: -600 })).toBe('#canyon-4721@11.4')
  for (const hash of ['', '#', '#moon-1@2', '#canyon-123456@1', '#canyon-1@99', '#canyon@3', 'x'])
    expect(decodeSpot(hash)).toBe(null)
})

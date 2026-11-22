import { expect, test } from 'bun:test'
import { cinemaRelief, frameStrained, StrainGauge } from './graphics'

test('slow frames count as strain unless the display is steadily capped', () => {
  expect(frameStrained(1 / 60, 1 / 60, 0.0002)).toBe(false)
  expect(frameStrained(1 / 24, 1 / 26, 0.006)).toBe(true)
  expect(frameStrained(1 / 30, 1 / 30, 0.0004)).toBe(false)
  expect(frameStrained(1 / 30, 1 / 30, 0.004)).toBe(true)
  expect(frameStrained(1 / 20, 1 / 20, 0.0002)).toBe(true)
  expect(cinemaRelief.scales[0]).toBe(1)
  expect([...cinemaRelief.scales].sort((a, b) => b - a)).toEqual([...cinemaRelief.scales])
})

function run(gauge: StrainGauge, seconds: number, frame: number, busy = false, scale = 0) {
  const verdicts: string[] = []
  for (let time = 0; time < seconds; time += frame) {
    const verdict = gauge.step(frame, frameStrained(frame, frame, 0.004), busy, scale)
    if (verdict) verdicts.push(verdict)
  }
  return verdicts
}

test('stalls right after a settings change never lower the resolution or block effects', () => {
  const gauge = new StrainGauge()
  gauge.hold()
  expect(gauge.step(2.5, true, false, 0)).toBeNull()
  expect(run(gauge, 3, 1 / 20)).toEqual([])
  expect(run(gauge, 8, 1 / 20, true)).toEqual([])
  expect(run(gauge, 2, 1 / 60)).toEqual([])
})

test('a single long stall counts as one short frame of strain', () => {
  const gauge = new StrainGauge()
  expect(gauge.step(2.9, true, false, 0)).toBeNull()
  expect(gauge.strain).toBeLessThanOrEqual(cinemaRelief.longestCounted)
})

test('sustained slow frames still lower the resolution once the grace has passed', () => {
  const gauge = new StrainGauge()
  gauge.hold()
  expect(run(gauge, cinemaRelief.grace + cinemaRelief.patience + 0.5, 1 / 20)).toEqual(['lower'])
})

test('a lowered resolution recovers after a long run of comfortable frames', () => {
  const gauge = new StrainGauge()
  expect(run(gauge, cinemaRelief.recovery - 1, 1 / 60, false, 1)).toEqual([])
  expect(run(gauge, 2, 1 / 60, false, 1)).toEqual(['raise'])
  expect(run(gauge, cinemaRelief.recovery + 2, 1 / 60, false, 0)).toEqual([])
})

test('recovery slows down after repeated strain so the resolution does not oscillate', () => {
  const gauge = new StrainGauge()
  expect(run(gauge, cinemaRelief.patience + 0.5, 1 / 20)).toEqual(['lower'])
  expect(run(gauge, cinemaRelief.patience + 0.5, 1 / 20, false, 1)).toEqual(['lower'])
  expect(run(gauge, cinemaRelief.recovery + 1, 1 / 60, false, 1)).toEqual([])
  expect(run(gauge, cinemaRelief.recovery, 1 / 60, false, 1)).toEqual(['raise'])
})

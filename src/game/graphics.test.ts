import { expect, test } from 'bun:test'
import {
  cinemaRelief,
  displayCapped,
  frameStrained,
  renderPace,
  renderWait,
  SoftwareGauge,
  StrainGauge,
  shadowOffset,
  shadowReach,
  sharpness,
  softwareRelief,
  textureDetail,
} from './graphics'

test('slow frames count as strain unless the display is steadily capped', () => {
  expect(frameStrained(1 / 60, 1 / 60, 0.0002)).toBe(false)
  expect(frameStrained(1 / 24, 1 / 26, 0.006)).toBe(true)
  expect(frameStrained(1 / 30, 1 / 30, 0.0004)).toBe(false)
  expect(frameStrained(1 / 30, 1 / 30, 0.004)).toBe(true)
  expect(frameStrained(1 / 20, 1 / 20, 0.0002)).toBe(true)
  expect(cinemaRelief.scales[0]).toBe(1)
  expect([...cinemaRelief.scales].sort((a, b) => b - a)).toEqual([...cinemaRelief.scales])
})

test('only a steady thirty frames a second counts as a capped display', () => {
  expect(displayCapped(1 / 30, 0.0004)).toBe(true)
  expect(displayCapped(1 / 30, 0.004)).toBe(false)
  expect(displayCapped(1 / 60, 0.0002)).toBe(false)
  expect(displayCapped(1 / 24, 0.0002)).toBe(false)
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

test('the shadow offset is wider than a shadow texel so bodywork does not shade itself in stripes', () => {
  for (const size of [1024, 4096]) {
    const texel = shadowReach.span / size
    expect(shadowOffset(size)).toBeGreaterThan(texel * 1.2)
    expect(shadowOffset(size)).toBeLessThan(texel * 2)
  }
  expect(shadowOffset(4096)).toBeLessThan(0.06)
  expect(shadowOffset(1024)).toBeGreaterThan(shadowOffset(4096) * 3.9)
})

test('software rendering drops resolution when frames are too slow for the simulation to keep time', () => {
  const gauge = new SoftwareGauge()
  for (let frame = 0; frame < softwareRelief.patience - 1; frame++)
    expect(gauge.step(softwareRelief.frame + 0.15, false, 0)).toBe(null)
  expect(gauge.step(softwareRelief.frame + 0.15, false, 0)).toBe('lower')
  for (let frame = 0; frame < softwareRelief.patience - 1; frame++)
    expect(gauge.step(softwareRelief.frame + 0.05, false, 1)).toBe(null)
  expect(gauge.step(softwareRelief.frame + 0.05, false, 1)).toBe('lower')
  const last = softwareRelief.scales.length - 1
  for (let frame = 0; frame < softwareRelief.patience * 3; frame++)
    expect(gauge.step(1, false, last)).toBe(null)
  expect(softwareRelief.frame).toBeLessThanOrEqual(0.25)
})

test('one slow frame, or slow frames while the world rebuilds, leave the software resolution alone', () => {
  const gauge = new SoftwareGauge()
  for (let round = 0; round < 6; round++) {
    for (let frame = 0; frame < softwareRelief.patience - 1; frame++)
      expect(gauge.step(0.4, false, 0)).toBe(null)
    expect(gauge.step(0.2, false, 0)).toBe(null)
  }
  for (let frame = 0; frame < 40; frame++) expect(gauge.step(0.6, true, 0)).toBe(null)
  expect(gauge.slow).toBe(0)
})

test('software resolution only returns when the next step up would still keep time', () => {
  const gauge = new SoftwareGauge()
  for (let frame = 0; frame < softwareRelief.recovery * 3; frame++)
    expect(gauge.step(0.2, false, 2)).toBe(null)
  for (let frame = 0; frame < softwareRelief.recovery - 1; frame++)
    expect(gauge.step(0.08, false, 2)).toBe(null)
  expect(gauge.step(0.08, false, 2)).toBe('raise')
  for (let frame = 0; frame < softwareRelief.recovery * 2; frame++)
    expect(gauge.step(0.05, false, 0)).toBe(null)
  for (let index = 1; index < softwareRelief.scales.length; index++) {
    const coarser = softwareRelief.scales[index] ?? 1
    const finer = softwareRelief.scales[index - 1] ?? 1
    expect(softwareRelief.comfortable * (finer / coarser) ** 2).toBeLessThan(softwareRelief.frame)
  }
})

test('textures drop anisotropic filtering when the renderer asks for none', () => {
  expect(sharpness(8)).toBe(8)
  expect(sharpness(4)).toBe(4)
  textureDetail.anisotropy = 1
  expect(sharpness(8)).toBe(1)
  expect(sharpness(4)).toBe(1)
  textureDetail.anisotropy = 8
  expect(sharpness(16)).toBe(8)
})

test('a software renderer draws the scene less often while a panel is open so the interface stays quick', () => {
  expect(renderWait(false, false)).toBe(0)
  expect(renderWait(true, false)).toBe(renderPace.idle)
  expect(renderWait(true, true)).toBe(renderPace.idle)
  expect(renderWait(false, true)).toBe(renderPace.panel)
  expect(renderPace.panel).toBeGreaterThan(softwareRelief.frame * 1000)
  expect(renderPace.panel).toBeLessThanOrEqual(500)
})

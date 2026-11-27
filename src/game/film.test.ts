import { expect, test } from 'bun:test'
import { ShaderChunk } from 'three'
import {
  filmCeiling,
  filmChunk,
  filmCurve,
  filmDevelop,
  filmLook,
  filmToneMapping,
  filmUndevelop,
  type Triple,
} from './film'

const original = ShaderChunk.tonemapping_pars_fragment

test('the film curve only ever brightens with more light and never clips', () => {
  let previous = filmCurve(0)
  expect(previous).toBe(0)
  for (let stop = -10; stop <= 3; stop += 0.05) {
    const shown = filmCurve(2 ** stop)
    expect(shown).toBeGreaterThan(previous)
    expect(shown).toBeLessThan(1)
    previous = shown
  }
  expect(filmCurve(64)).toBeGreaterThanOrEqual(previous)
  expect(filmCurve(64)).toBeLessThanOrEqual(1)
})

test('middle grey stays near middle grey and white paint in sunlight keeps detail', () => {
  const grey = filmCurve(0.18 * filmLook.exposure)
  expect(grey).toBeGreaterThan(0.16)
  expect(grey).toBeLessThan(0.26)
  const paint = filmCurve(0.75 * filmLook.exposure)
  expect(paint).toBeGreaterThan(0.7)
  expect(paint).toBeLessThan(0.86)
})

test('highlights roll off instead of reaching white together', () => {
  const steps = [1, 2, 4, 8].map((level) => filmCurve(level))
  for (let index = 1; index < steps.length; index++) {
    const gained = (steps[index] ?? 0) - (steps[index - 1] ?? 0)
    expect(gained).toBeGreaterThan(0)
    if (index > 1) expect(gained).toBeLessThan((steps[index - 1] ?? 0) - (steps[index - 2] ?? 0))
  }
})

test('developing keeps greys neutral and lets bright colours fade toward white', () => {
  const grey = filmDevelop([0.2, 0.2, 0.2])
  expect(grey[0]).toBeCloseTo(grey[1], 9)
  expect(grey[1]).toBeCloseTo(grey[2], 9)
  const spread = (color: Triple) => (Math.max(...color) - Math.min(...color)) / Math.max(...color)
  const glint: Triple = [3, 1.2, 0.3]
  const shown = filmDevelop(glint)
  expect(spread(shown)).toBeLessThan(spread(glint) * 0.7)
  expect(shown[0]).toBeGreaterThan(shown[1])
  expect(shown[1]).toBeGreaterThan(shown[2])
})

test('a colour chosen for the screen survives a trip through the film', () => {
  const shown: Triple[] = [
    [0.07, 0.24, 0.58],
    [0.56, 0.7, 0.82],
    [0.87, 0.44, 0.25],
    [0.004, 0.008, 0.02],
    [0.9, 0.94, 0.92],
  ]
  for (const exposure of [0.9, 1, 1.08])
    for (const color of shown) {
      const back = filmDevelop(filmUndevelop(color, exposure), exposure)
      for (const [index, channel] of color.entries()) expect(back[index]).toBeCloseTo(channel, 3)
    }
})

test('screen white asks for a finite amount of light', () => {
  const light = filmUndevelop([1, 1, 1])
  for (const channel of light) {
    expect(Number.isFinite(channel)).toBe(true)
    expect(channel).toBeLessThan(8)
  }
  expect(filmDevelop(light)[1]).toBeCloseTo(filmCeiling, 3)
})

test('the renderer develops every picture on the same film', () => {
  const developed = filmToneMapping(original)
  expect(developed).not.toBe(original)
  expect(developed).toContain(filmChunk)
  expect(developed).toContain('filmDevelop( color * toneMappingExposure )')
  expect(developed).not.toContain('vec3 CustomToneMapping( vec3 color ) { return color; }')
  expect(filmToneMapping(developed)).toBe(developed)
  expect(filmChunk).toContain(filmLook.exposure.toFixed(4))
  expect(filmChunk).toContain(filmLook.toe.toFixed(4))
})

import { expect, test } from 'bun:test'
import { effectsLevel, type Plume, wheelPlume } from './effects'
import { beamHaze } from './lamps'

const wheel = { onRoad: true, sand: false, slip: 0, locked: false, puddle: 0, contact: true }
const dry = { wet: false, snowy: false, wading: false, cover: 0.8 }

function plume(overrides: Partial<typeof wheel>, speed: number, ground = dry) {
  const out: Plume = { kind: null, strength: 0, water: 0 }
  return wheelPlume(out, { ...wheel, ...overrides }, speed, ground)
}

test('quality picks the effects level', () => {
  expect(effectsLevel(false, 'ultra', true)).toBe('ultra')
  expect(effectsLevel(false, 'high', false)).toBe('high')
  expect(effectsLevel(false, 'low', false)).toBe('off')
  expect(effectsLevel(true, 'ultra', false)).toBe('off')
})

test('sliding and locked tyres smoke on dry asphalt only', () => {
  expect(plume({ slip: 0.2 }, 20).kind).toBe(null)
  expect(plume({ slip: 0.7 }, 20).kind).toBe('smoke')
  expect(plume({ slip: 0.9 }, 0.5).kind).toBe('smoke')
  expect(plume({ locked: true }, 15).kind).toBe('smoke')
  expect(plume({ slip: 0.7 }, 20, { ...dry, wet: true }).kind).toBe('spray')
})

test('dust grows with speed, thins on grass and stays down on wet ground', () => {
  const slow = plume({ onRoad: false }, 6)
  const fast = plume({ onRoad: false }, 24)
  expect(slow.kind).toBe('dust')
  expect(fast.strength).toBeGreaterThan(slow.strength)
  const grass = plume({ onRoad: false }, 24, { ...dry, cover: 0.28 })
  expect(grass.strength).toBeLessThan(fast.strength)
  expect(plume({ onRoad: false }, 24, { ...dry, wet: true }).kind).toBe(null)
  expect(plume({ onRoad: false }, 1).kind).toBe(null)
})

test('wet roads throw spray that builds with speed and standing water', () => {
  const wet = { ...dry, wet: true }
  expect(plume({}, 5, wet).kind).toBe(null)
  const light = plume({}, 18, wet)
  expect(light.kind).toBe('spray')
  expect(plume({}, 28, wet).strength).toBeGreaterThan(light.strength)
  expect(plume({ puddle: 0.6 }, 18, wet).strength).toBeGreaterThan(light.strength)
  expect(plume({ contact: false }, 28, wet).kind).toBe(null)
})

test('beams thicken in fog and rain', () => {
  const clear = beamHaze(0.0018, false, true)
  expect(beamHaze(0.008, false, true)).toBeGreaterThan(clear)
  expect(beamHaze(0.0032, true, true)).toBeGreaterThan(clear)
  expect(beamHaze(0.008, true, true)).toBeLessThanOrEqual(1)
})

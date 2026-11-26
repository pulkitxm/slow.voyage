import { expect, test } from 'bun:test'
import { effectsLayout, effectsLevel, type Plume, RoadEffects, wheelPlume } from './effects'
import { beamHaze } from './lamps'
import { particleKind } from './particles'
import type { CarPhysics } from './physics'
import { defaults, type World } from './world'

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
  expect(light.water).toBe(0)
  expect(plume({ puddle: 0.6 }, 18, wet).water).toBeGreaterThan(0.5)
  expect(plume({ onRoad: false }, 10, { ...wet, wading: true }).water).toBe(1)
  expect(plume({ contact: false }, 28, wet).kind).toBe(null)
})

function sprayed(speed: number, puddle = 0) {
  const effects = new RoadEffects({ value: null })
  effects.setLevel('ultra')
  effects.setScene({ ...defaults, weather: 'rain' }, true)
  const wheels = [-1, 1].flatMap((localX) =>
    [true, false].map((front) => ({
      ...wheel,
      puddle,
      front,
      localX,
      x: localX * 0.8,
      s: front ? 1.3 : -1.3,
      ground: 0,
    })),
  )
  const car = { speed, lateralSpeed: 0, yaw: 0, wading: 0, hits: 0, scrape: 0 }
  const physics = { ...car, suspension: { wheels } } as unknown as CarPhysics
  for (let frame = 1; frame <= 30; frame++) {
    for (const each of wheels) each.s = (each.front ? 1.3 : -1.3) + (speed * frame) / 60
    effects.update(physics, {} as World, true, frame / 60, 1 / 60)
  }
  const data = (effects.particles as unknown as { data: Float32Array }).data
  const thrown: { kind: number; front: boolean; back: number; out: number; up: number }[] = []
  for (let at = 0; at < data.length; at += 16) {
    if ((data[at + 3] ?? 0) < 0) continue
    const behind = (data[at + 2] ?? 0) + speed * (data[at + 3] ?? 0)
    const front = behind < 0
    thrown.push({
      kind: Math.floor(data[at + 14] ?? 0),
      front,
      back: behind + (front ? 1.3 : -1.3),
      out: Math.abs(data[at] ?? 0) - 0.8,
      up: data[at + 1] ?? 0,
    })
  }
  effects.dispose()
  return thrown
}

test('spray leaves the back of each contact patch, mostly from the rear tyres', () => {
  const thrown = sprayed(26)
  const mist = thrown.filter((particle) => particle.kind === particleKind.mist)
  const drops = thrown.filter((particle) => particle.kind === particleKind.drop)
  expect(mist.length).toBeGreaterThan(40)
  expect(drops.length).toBeGreaterThan(40)
  for (const particle of thrown) {
    expect(particle.back).toBeGreaterThan(-0.1)
    expect(particle.back).toBeLessThan(0.45)
    expect(Math.abs(particle.out)).toBeLessThan(0.25)
    expect(particle.up).toBeGreaterThan(0)
    expect(particle.up).toBeLessThan(0.4)
  }
  const front = mist.filter((particle) => particle.front).length
  expect(front).toBeGreaterThan(0)
  expect(front).toBeLessThan((mist.length - front) * 0.7)
})

test('droplets fly only at speed and standing water throws more of everything', () => {
  const slow = sprayed(effectsLayout.dropStart - 1)
  expect(slow.some((particle) => particle.kind === particleKind.mist)).toBe(true)
  expect(slow.some((particle) => particle.kind === particleKind.drop)).toBe(false)
  expect(sprayed(effectsLayout.sprayStart - 1)).toHaveLength(0)
  expect(sprayed(26, 1).length).toBeGreaterThan(sprayed(26).length * 1.3)
})

test('beams thicken in fog and rain', () => {
  const clear = beamHaze(0.0018, false, true)
  expect(beamHaze(0.008, false, true)).toBeGreaterThan(clear)
  expect(beamHaze(0.0032, true, true)).toBeGreaterThan(clear)
  expect(beamHaze(0.008, true, true)).toBeLessThanOrEqual(1)
})

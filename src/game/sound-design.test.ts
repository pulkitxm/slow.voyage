import { describe, expect, it, test } from 'bun:test'
import {
  boostSound,
  boostVoice,
  brakeSquealLevel,
  cryVoice,
  doppler,
  earshot,
  echoPitch,
  freshTyreSignals,
  gravelGrains,
  gravelLevel,
  gravelRate,
  hornVoices,
  impactVoice,
  listening,
  looseGround,
  passing,
  roadLevel,
  scrapeLevel,
  scrubLevel,
  skidLevel,
  squealLevel,
  squealPitch,
  squealRoughness,
  type TyreWheel,
  thumpStrength,
  tirePitch,
  tyreSignals,
  wadeLevel,
  wetLevel,
  windLayers,
  windLevel,
} from './sound-design'

describe('tire and road sounds', () => {
  it('squeals only past normal cornering slip and while moving on tarmac', () => {
    expect(squealLevel(0.05, 25, false)).toBe(0)
    expect(squealLevel(0.3, 25, false)).toBeGreaterThan(0.3)
    expect(squealLevel(0.6, 25, false)).toBeCloseTo(1, 6)
    expect(squealLevel(0.6, 0, false)).toBe(0)
    expect(squealLevel(0.6, 25, true)).toBe(0)
  })

  it('increases squeal steadily with slip', () => {
    let previous = 0
    for (let slip = 0; slip <= 1; slip += 0.02) {
      const level = squealLevel(slip, 20, false)
      expect(level).toBeGreaterThanOrEqual(previous)
      previous = level
    }
  })

  it('pitches tire squeal by vehicle', () => {
    expect(tirePitch.motorcycle).toBeGreaterThan(tirePitch.touring)
    expect(tirePitch.bus).toBeLessThan(tirePitch.touring)
  })

  it('swaps road hum for gravel crunch off the tarmac, softer in sand', () => {
    expect(roadLevel(30, false)).toBeGreaterThan(0)
    expect(roadLevel(30, true)).toBe(0)
    expect(gravelLevel(20, false, false, 0)).toBe(0)
    expect(gravelLevel(20, true, false, 0)).toBeGreaterThan(gravelLevel(20, true, true, 0))
    expect(gravelLevel(20, true, false, 0.5)).toBeGreaterThan(gravelLevel(20, true, false, 0))
    expect(gravelLevel(0, true, false, 0.5)).toBe(0)
  })

  it('builds wind with speed and stays silent at rest', () => {
    expect(windLevel(0)).toBe(0)
    expect(windLevel(40)).toBeGreaterThan(windLevel(20) * 3)
  })

  it('squeals the brakes only near a stop under real pedal', () => {
    expect(brakeSquealLevel(2.5, 1)).toBeCloseTo(1, 6)
    expect(brakeSquealLevel(2.5, 0.1)).toBe(0)
    expect(brakeSquealLevel(20, 1)).toBe(0)
    expect(brakeSquealLevel(0, 1)).toBe(0)
  })

  it('scrapes metal loudest and never scrapes water', () => {
    expect(scrapeLevel('rail', 15)).toBeCloseTo(1, 6)
    expect(scrapeLevel('trunk', 15)).toBeLessThan(scrapeLevel('rail', 15))
    expect(scrapeLevel('water', 15)).toBe(0)
    expect(scrapeLevel('rail', 0)).toBe(0)
  })

  it('splashes only when moving through water', () => {
    expect(wadeLevel(0, 10)).toBe(0)
    expect(wadeLevel(0.3, 0)).toBe(0)
    expect(wadeLevel(0.3, 10)).toBeGreaterThan(0.5)
  })
})

describe('impact voices', () => {
  it('rings a metal rail with inharmonic partials', () => {
    const voice = impactVoice('rail', 0.6, 'touring')
    expect(voice.partials.length).toBeGreaterThanOrEqual(3)
    const ratios = voice.partials.map((p) => p.frequency / (voice.partials[0]?.frequency ?? 1))
    for (const ratio of ratios.slice(1))
      expect(Math.abs(ratio - Math.round(ratio))).toBeGreaterThan(0.05)
  })

  it('knocks a tree with a short woody thud and splashes water without ringing', () => {
    const trunk = impactVoice('trunk', 0.6, 'touring')
    const rail = impactVoice('rail', 0.6, 'touring')
    expect(trunk.thump).toBeGreaterThan(rail.thump)
    expect(Math.max(...trunk.partials.map((p) => p.decay))).toBeLessThan(
      Math.min(...rail.partials.map((p) => p.decay)),
    )
    const water = impactVoice('water', 0.6, 'touring')
    expect(water.partials).toHaveLength(0)
    expect(water.noiseDecay).toBeGreaterThan(rail.noiseDecay)
    expect(water.crunch).toBe(0)
  })

  it('hits harder and crunches only in strong collisions', () => {
    const tap = impactVoice('rail', 0.1, 'touring')
    const crash = impactVoice('rail', 1, 'touring')
    expect(crash.thump).toBeGreaterThan(tap.thump * 2)
    expect(tap.crunch).toBe(0)
    expect(crash.crunch).toBeGreaterThan(0.5)
  })

  it('sounds deeper for the heavy bus and lighter for the motorcycle', () => {
    const bus = impactVoice('trunk', 0.7, 'bus')
    const car = impactVoice('trunk', 0.7, 'touring')
    const bike = impactVoice('trunk', 0.7, 'motorcycle')
    expect(bus.thumpPitch).toBeLessThan(car.thumpPitch)
    expect(bike.thumpPitch).toBeGreaterThan(car.thumpPitch)
    expect(bus.thump).toBeGreaterThan(bike.thump)
  })
})

test('the boost voice swells while held and dies away as the tank empties', () => {
  const start = boostVoice(0, 1)
  const held = boostVoice(boostSound.rise, 1)
  const spent = boostVoice(boostSound.rise, 0)
  expect(held.hiss).toBeGreaterThan(start.hiss)
  expect(held.pitch).toBeGreaterThan(start.pitch * 2)
  expect(held.band).toBeCloseTo(boostSound.band[1], 6)
  expect(boostVoice(boostSound.rise * 4, 1)).toEqual(held)
  expect(spent.hiss).toBe(0)
  expect(spent.whine).toBe(0)
})

test('screams are higher and longer than shouts and fade with distance', () => {
  for (const voice of ['man', 'woman'] as const) {
    const scream = cryVoice(voice, true, 0.5)
    const shout = cryVoice(voice, false, 0.5)
    expect(scream.pitch).toBeGreaterThan(shout.pitch * 1.3)
    expect(scream.length).toBeGreaterThan(shout.length * 1.8)
    expect(scream.peak).toBeGreaterThan(shout.peak)
  }
  for (const scream of [true, false]) {
    const man = cryVoice('man', scream, 1)
    const woman = cryVoice('woman', scream, 0)
    expect(woman.pitch).toBeGreaterThan(man.pitch * 1.4)
    expect(woman.formants[1]?.frequency ?? 0).toBeGreaterThan(man.formants[1]?.frequency ?? 0)
    expect(man.rasp).toBeGreaterThan(woman.rasp)
  }
  expect(earshot(0)).toBe(1)
  expect(earshot(16)).toBeCloseTo(0.5, 6)
  expect(earshot(80)).toBeLessThan(0.05)
})

describe('tyres on tarmac and gravel', () => {
  it('scrubs before it squeals and drops in pitch as the slide deepens', () => {
    expect(scrubLevel(0.08, 25, false)).toBeGreaterThan(0)
    expect(squealLevel(0.08, 25, false)).toBe(0)
    expect(scrubLevel(0.02, 25, false)).toBe(0)
    expect(scrubLevel(0.3, 25, true)).toBe(0)
    expect(scrubLevel(0.3, 0, false)).toBe(0)
    expect(squealPitch('touring', 1, 25)).toBeLessThan(squealPitch('touring', 0.1, 25))
    expect(squealPitch('touring', 0.5, 40)).toBeGreaterThan(squealPitch('touring', 0.5, 8))
    expect(squealPitch('bus', 0.5, 20)).toBeLessThan(squealPitch('motorcycle', 0.5, 20))
  })

  it('throws more stones the faster the car rolls on gravel, and none on tarmac or sand', () => {
    expect(gravelRate(20, false, false)).toBe(0)
    expect(gravelRate(20, true, true)).toBe(0)
    expect(gravelRate(0, true, false)).toBe(0)
    expect(gravelRate(5, true, false)).toBeGreaterThan(gravelGrains.slowest)
    expect(gravelRate(25, true, false)).toBeCloseTo(gravelGrains.fastest, 6)
    expect(gravelRate(25, true, false)).toBeGreaterThan(gravelRate(8, true, false) * 2)
  })
})

describe('wind', () => {
  it('adds a whistle and buffeting only at speed and sways with gusts', () => {
    const town = windLayers(12, 0)
    const fast = windLayers(45, 0)
    expect(town.whistle).toBe(0)
    expect(town.buffet).toBe(0)
    expect(fast.whistle).toBeGreaterThan(0.3)
    expect(fast.buffet).toBeGreaterThan(0.5)
    expect(fast.rush).toBeGreaterThan(town.rush * 8)
    expect(fast.band).toBeGreaterThan(town.band)
    expect(fast.whistlePitch).toBeGreaterThan(town.whistlePitch)
    expect(windLayers(40, 1).rush).toBeGreaterThan(windLayers(40, -1).rush * 1.5)
    expect(windLayers(0, 1).rush).toBe(0)
  })
})

describe('crash body and debris', () => {
  it('adds a deep boom to every strike and scatters debris only in hard ones', () => {
    const tap = impactVoice('rail', 0.2, 'touring')
    const crash = impactVoice('rail', 1, 'touring')
    expect(tap.debris).toBe(0)
    expect(crash.debris).toBeGreaterThanOrEqual(5)
    expect(crash.boom).toBeGreaterThan(tap.boom * 2)
    expect(impactVoice('trunk', 1, 'touring').debris).toBeGreaterThan(0)
    expect(impactVoice('water', 1, 'touring').debris).toBe(0)
    expect(impactVoice('rock', 1, 'bus').boom).toBeGreaterThan(
      impactVoice('rock', 1, 'motorcycle').boom,
    )
  })
})

describe('voices', () => {
  it('carry breath and an unsteady pitch, with a softer onset on screams', () => {
    for (const voice of ['man', 'woman'] as const) {
      const scream = cryVoice(voice, true, 0.5)
      const shout = cryVoice(voice, false, 0.5)
      expect(scream.breath).toBeGreaterThan(0)
      expect(shout.breath).toBeGreaterThan(scream.breath)
      expect(scream.jitter).toBeGreaterThan(shout.jitter)
      expect(scream.attack).toBeGreaterThan(shout.attack)
    }
  })
})

describe('tyre signals', () => {
  const wheel = (changes: Partial<TyreWheel>): TyreWheel => ({
    localX: 0,
    contact: true,
    onRoad: true,
    sand: false,
    locked: false,
    slip: 0,
    puddle: 0,
    rollingSpeed: 20,
    lateralSpeed: 0,
    ...changes,
  })

  it('hears each side of the car and tells sliding from spinning and locking', () => {
    const signals = tyreSignals(
      [
        wheel({ localX: -0.7, slip: 0.4, lateralSpeed: 8 }),
        wheel({ localX: 0.7, slip: 0.1, lateralSpeed: 2 }),
        wheel({ localX: -0.7, slip: 0.5 }),
        wheel({ localX: 0.7, slip: 0.9, locked: true }),
      ],
      freshTyreSignals(),
    )
    expect(signals.left).toBeCloseTo(0.5, 6)
    expect(signals.right).toBeCloseTo(0.1, 6)
    expect(signals.spin).toBeCloseTo(0.5, 6)
    expect(signals.locked).toBeCloseTo(0.9, 6)
    expect(signals.tarmac).toBeCloseTo(1, 6)
  })

  it('shares the ground between tarmac, loose ground and sand and ignores airborne wheels', () => {
    const signals = tyreSignals(
      [
        wheel({ puddle: 1 }),
        wheel({ onRoad: false, slip: 1 }),
        wheel({ onRoad: false, sand: true }),
        wheel({ contact: false, slip: 1 }),
      ],
      freshTyreSignals(),
    )
    expect(signals.tarmac).toBeCloseTo(0.25, 6)
    expect(signals.loose).toBeCloseTo(0.5, 6)
    expect(signals.sand).toBeCloseTo(0.25, 6)
    expect(signals.puddle).toBeCloseTo(0.25, 6)
    expect(signals.left).toBe(0)
    expect(tyreSignals([wheel({ localX: 0, slip: 0.3 })], signals).right).toBeCloseTo(0.3, 6)
  })

  it('roughens a squeal as the slide deepens or the wheels spin', () => {
    expect(squealRoughness(0.6, 0)).toBeGreaterThan(squealRoughness(0.2, 0))
    expect(squealRoughness(0.2, 0.4)).toBeGreaterThan(squealRoughness(0.2, 0))
    expect(squealRoughness(1, 1)).toBeLessThanOrEqual(0.85)
  })

  it('skids only with locked wheels that are still travelling', () => {
    expect(skidLevel(0, 20)).toBe(0)
    expect(skidLevel(0.8, 0)).toBe(0)
    expect(skidLevel(0.8, 20)).toBeCloseTo(1, 6)
  })

  it('wets the road in rain and deeper in puddles, and rides softly on grass and snow', () => {
    expect(wetLevel('clear', 0)).toBe(0)
    expect(wetLevel('rain', 0)).toBeGreaterThan(0.3)
    expect(wetLevel('rain', 1)).toBeGreaterThan(wetLevel('rain', 0))
    expect(wetLevel('storm', 1)).toBeLessThanOrEqual(1)
    expect(looseGround('canyon', 'summer', false)).toEqual({ gravel: 1, grass: 0 })
    expect(looseGround('highlands', 'summer', true).grass).toBeGreaterThan(0.5)
    expect(looseGround('highlands', 'winter', true).gravel).toBeLessThan(
      looseGround('highlands', 'summer', true).gravel,
    )
  })

  it('thumps for a sharp jolt or a landing but not for a gentle ripple', () => {
    expect(thumpStrength(1, false)).toBe(0)
    expect(thumpStrength(10, false)).toBeGreaterThan(0.3)
    expect(thumpStrength(-30, false)).toBe(1)
    expect(thumpStrength(0, true)).toBeGreaterThan(0.3)
  })
})

describe('listening position and passing sounds', () => {
  it('hears mostly exhaust from behind and intake through a muffling cabin on the bonnet', () => {
    const chase = listening('chase', 'touring')
    const bonnet = listening('bonnet', 'touring')
    expect(chase.exhaust).toBeGreaterThan(chase.bay * 2)
    expect(bonnet.bay).toBeGreaterThan(bonnet.exhaust)
    expect(bonnet.muffle).toBeLessThan(4000)
    expect(chase.muffle).toBeGreaterThanOrEqual(20000)
    expect(bonnet.cabin).toBeGreaterThan(chase.cabin)
    expect(listening('bonnet', 'motorcycle').muffle).toBeGreaterThanOrEqual(20000)
  })

  it('raises the pitch of what approaches and lowers what recedes', () => {
    expect(doppler(0)).toBe(1)
    expect(doppler(34.3)).toBeCloseTo(1 / 0.9, 6)
    expect(doppler(-34.3)).toBeCloseTo(1 / 1.1, 6)
    expect(echoPitch(0)).toBe(1)
    expect(echoPitch(30)).toBeGreaterThan(doppler(30))
    const ahead = passing(40, 3, 30)
    const behind = passing(40, 3, 30, 2.5)
    expect(ahead.pitch).toBeGreaterThan(1.05)
    expect(behind.pitch).toBeLessThan(0.95)
    expect(passing(4, -6, 30).pan).toBeLessThan(-0.5)
    expect(passing(4, 6, 30).pan).toBeGreaterThan(0.5)
    expect(passing(90, 0, 0).brightness).toBeLessThan(passing(5, 0, 0).brightness)
    expect(passing(0, 0, 30).distance).toBe(1)
  })

  it('gives the coach the deepest horn', () => {
    for (const [vehicle, pitches] of Object.entries(hornVoices))
      if (vehicle !== 'bus') expect(pitches[0]).toBeGreaterThan(hornVoices.bus[0])
  })
})

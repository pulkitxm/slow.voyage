import { describe, expect, it, test } from 'bun:test'
import { engineProfiles } from './powertrain'
import {
  blowOff,
  boostSound,
  boostVoice,
  brakeSquealLevel,
  cryVoice,
  earshot,
  engineSpectrum,
  engineTone,
  engineVoices,
  gravelGrains,
  gravelLevel,
  gravelRate,
  impactVoice,
  liftOffPop,
  roadLevel,
  scrapeLevel,
  scrubLevel,
  spoolTurbo,
  squealLevel,
  squealPitch,
  tirePitch,
  turboSpool,
  turboVoice,
  wadeLevel,
  windLayers,
  windLevel,
} from './sound-design'
import type { Vehicle } from './world'

const vehicles = Object.keys(engineVoices) as Vehicle[]

function dominantHarmonic(vehicle: Vehicle) {
  const { real, imag } = engineSpectrum(engineVoices[vehicle])
  let best = 0
  let index = 0
  for (let n = 1; n < real.length; n++) {
    const magnitude = Math.hypot(real[n] ?? 0, imag[n] ?? 0)
    if (magnitude > best) {
      best = magnitude
      index = n
    }
  }
  return index
}

describe('engine voices', () => {
  it.each(vehicles)('%s fires loudest at its cylinder order', (vehicle) => {
    expect(dominantHarmonic(vehicle)).toBe(engineVoices[vehicle].cylinders)
  })

  it('gives every vehicle a distinct timbre', () => {
    const signatures = new Set(
      vehicles.map((vehicle) => {
        const voice = engineVoices[vehicle]
        return `${voice.cylinders}:${voice.rolloff}:${voice.unevenness}:${voice.brightness}`
      }),
    )
    expect(signatures.size).toBe(vehicles.length)
  })

  it('keeps the spectrum free of a constant offset', () => {
    for (const vehicle of vehicles) {
      const { real, imag } = engineSpectrum(engineVoices[vehicle])
      expect(real[0]).toBe(0)
      expect(imag[0]).toBe(0)
    }
  })

  it('makes the roadster burble more than the smooth tourer', () => {
    expect(engineVoices.roadster.unevenness).toBeGreaterThan(engineVoices.touring.unevenness * 3)
  })

  it('only the diesel bus clatters and whistles loudly', () => {
    expect(engineVoices.bus.clatter).toBeGreaterThan(0)
    for (const vehicle of vehicles.filter((v) => v !== 'bus')) {
      expect(engineVoices[vehicle].clatter).toBe(0)
      expect(engineVoices[vehicle].turbo).toBeLessThan(engineVoices.bus.turbo)
    }
  })
})

describe('engine tone', () => {
  it.each(vehicles)('%s fires at the true combustion rate', (vehicle) => {
    const voice = engineVoices[vehicle]
    const tone = engineTone(voice, engineProfiles[vehicle], 3000, 0.5)
    expect(tone.firing).toBeCloseTo((3000 / 60) * (voice.cylinders / 2), 6)
    expect(tone.cycle * voice.cylinders).toBeCloseTo(tone.firing, 6)
  })

  it.each(vehicles)('%s grows louder and brighter with throttle', (vehicle) => {
    const voice = engineVoices[vehicle]
    const profile = engineProfiles[vehicle]
    const rpm = (profile.idle + profile.redline) / 2
    const coasting = engineTone(voice, profile, rpm, 0)
    const pulling = engineTone(voice, profile, rpm, 1)
    expect(pulling.gain).toBeGreaterThan(coasting.gain)
    expect(pulling.cutoff).toBeGreaterThan(coasting.cutoff)
    expect(pulling.grit).toBeGreaterThanOrEqual(coasting.grit)
  })

  it.each(vehicles)('%s rises in pitch across the rev range', (vehicle) => {
    const voice = engineVoices[vehicle]
    const profile = engineProfiles[vehicle]
    let previous = 0
    for (let rpm = profile.idle; rpm <= profile.redline; rpm += 100) {
      const tone = engineTone(voice, profile, rpm, 0.5)
      expect(tone.firing).toBeGreaterThan(previous)
      expect(tone.cutoff).toBeLessThanOrEqual(12000)
      expect(tone.gain).toBeLessThanOrEqual(voice.volume)
      previous = tone.firing
    }
  })

  it('screams higher on the motorcycle than the bus can ever reach', () => {
    const bike = engineTone(engineVoices.motorcycle, engineProfiles.motorcycle, 11000, 1)
    const bus = engineTone(engineVoices.bus, engineProfiles.bus, engineProfiles.bus.redline, 1)
    expect(bike.firing).toBeGreaterThan(bus.firing * 2)
  })

  it('spools the bus turbo with load and revs', () => {
    const profile = engineProfiles.bus
    const idle = engineTone(engineVoices.bus, profile, profile.idle, 0)
    const boosting = engineTone(engineVoices.bus, profile, profile.redline, 1)
    expect(idle.turbo).toBe(0)
    expect(boosting.turbo).toBeGreaterThan(0.2)
    expect(boosting.turboPitch).toBeGreaterThan(idle.turboPitch)
  })
})

describe('lift-off pops', () => {
  it('crackles when lifting off sharply at high revs on sporty engines', () => {
    expect(liftOffPop(engineVoices.roadster, 0.85, 1, 0)).toBeGreaterThan(0)
    expect(liftOffPop(engineVoices.motorcycle, 0.85, 1, 0)).toBeGreaterThan(0)
  })

  it('stays quiet for gentle lifts, low revs, or calm engines', () => {
    expect(liftOffPop(engineVoices.roadster, 0.85, 0.4, 0.2)).toBe(0)
    expect(liftOffPop(engineVoices.roadster, 0.3, 1, 0)).toBe(0)
    expect(liftOffPop(engineVoices.touring, 0.9, 1, 0)).toBe(0)
    expect(liftOffPop(engineVoices.bus, 0.9, 1, 0)).toBe(0)
  })
})

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

describe('engine breathing and load', () => {
  it.each(vehicles)('%s draws induction noise only under load and louder with revs', (vehicle) => {
    const voice = engineVoices[vehicle]
    const profile = engineProfiles[vehicle]
    const middle = (profile.idle + profile.redline) / 2
    expect(engineTone(voice, profile, middle, 0).intake).toBe(0)
    const pulling = engineTone(voice, profile, middle, 1)
    expect(pulling.intake).toBeGreaterThan(0.2)
    expect(engineTone(voice, profile, profile.redline, 1).intake).toBeGreaterThan(pulling.intake)
    expect(pulling.intakeBand).toBeGreaterThanOrEqual(260)
    expect(pulling.intakeBand).toBeLessThanOrEqual(2800)
  })

  it.each(vehicles)('%s burbles on the overrun and idles unevenly', (vehicle) => {
    const voice = engineVoices[vehicle]
    const profile = engineProfiles[vehicle]
    const high = profile.idle + (profile.redline - profile.idle) * 0.8
    expect(engineTone(voice, profile, high, 0).overrun).toBeGreaterThan(
      engineTone(voice, profile, high, 1).overrun,
    )
    expect(engineTone(voice, profile, profile.idle, 0).overrun).toBe(0)
    expect(engineTone(voice, profile, profile.idle, 0).flutter).toBeGreaterThan(
      engineTone(voice, profile, profile.redline, 1).flutter * 2,
    )
    expect(engineTone(voice, profile, high, 1).bodyGain).toBeGreaterThan(
      engineTone(voice, profile, high, 0).bodyGain,
    )
    expect(voice.body[1]).toBeGreaterThan(voice.body[0] * 2)
  })

  it('gives every engine its own body resonances', () => {
    expect(new Set(vehicles.map((vehicle) => engineVoices[vehicle].body.join('/'))).size).toBe(
      vehicles.length,
    )
  })
})

describe('turbocharger', () => {
  it('spools up with lag under load and bleeds off faster when lifted', () => {
    let spool = 0
    for (let step = 0; step < 12; step++) spool = spoolTurbo(spool, 1, 0.8, 1 / 60)
    expect(spool).toBeGreaterThan(0.2)
    expect(spool).toBeLessThan(0.5)
    for (let step = 0; step < 240; step++) spool = spoolTurbo(spool, 1, 0.8, 1 / 60)
    expect(spool).toBeGreaterThan(0.97)
    const full = spool
    for (let step = 0; step < 12; step++) spool = spoolTurbo(spool, 0, 0.8, 1 / 60)
    expect(spool).toBeLessThan(full * 0.5)
    expect(turboSpool.fall).toBeLessThan(turboSpool.rise)
    expect(spoolTurbo(0, 1, 0, 1)).toBe(0)
  })

  it('whistles higher and louder as pressure builds', () => {
    const voice = engineVoices.hatchback
    const low = turboVoice(voice, 0.2)
    const high = turboVoice(voice, 1)
    expect(high.pitch).toBeGreaterThan(low.pitch * 2)
    expect(high.whistle).toBeGreaterThan(low.whistle * 10)
    expect(turboVoice(voice, 0).whistle).toBe(0)
    expect(turboVoice(engineVoices.supercar, 1).whistle).toBe(0)
  })

  it('vents through the blow-off valve only when a spooled turbo engine lifts', () => {
    expect(blowOff(engineVoices.hatchback, 0.9, 1, 0)).toBeGreaterThan(0.5)
    expect(blowOff(engineVoices.bus, 0.9, 1, 0)).toBeGreaterThan(0)
    expect(blowOff(engineVoices.hatchback, 0.2, 1, 0)).toBe(0)
    expect(blowOff(engineVoices.hatchback, 0.9, 0.6, 0.4)).toBe(0)
    expect(blowOff(engineVoices.supercar, 1, 1, 0)).toBe(0)
    expect(blowOff(engineVoices.roadster, 1, 1, 0)).toBe(0)
  })
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

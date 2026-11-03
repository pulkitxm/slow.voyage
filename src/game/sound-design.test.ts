import { describe, expect, it } from 'bun:test'
import { engineProfiles } from './powertrain'
import {
  brakeSquealLevel,
  engineSpectrum,
  engineTone,
  engineVoices,
  gravelLevel,
  impactVoice,
  liftOffPop,
  roadLevel,
  scrapeLevel,
  squealLevel,
  tirePitch,
  wadeLevel,
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

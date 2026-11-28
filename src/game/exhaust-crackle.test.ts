import { describe, expect, it } from 'bun:test'
import {
  EngineVoice,
  engineSoundFor,
  engineVoiceIndex,
  engineVoices,
  supercarSounds,
} from './engine-sound'
import { type CrackleInput, ExhaustCrackle } from './exhaust-crackle'
import { engineProfileFor, engineProfiles, supercarProfiles } from './powertrain'
import { supercarModels } from './supercars'
import { defaults } from './world'

function lift(sport: boolean, pops = 0.9, seed = 7) {
  const crackle = new ExhaustCrackle(seed)
  const base: CrackleInput = { revs: 0.85, throttle: 1, load: 1, shifts: 0, pops, sport }
  let fired = 0
  let loudest = 0
  for (let step = 0; step < 180; step++) crackle.step(1 / 60, base)
  for (let step = 0; step < 150; step++) {
    const strength = crackle.step(1 / 60, {
      ...base,
      throttle: 0,
      load: 0,
      revs: 0.8 - step * 0.002,
    })
    if (strength > 0) fired++
    loudest = Math.max(loudest, strength)
  }
  return { fired, loudest }
}

describe('exhaust crackle', () => {
  it('fires a run of pops when lifting off from high revs', () => {
    const { fired, loudest } = lift(true)
    expect(fired).toBeGreaterThan(6)
    expect(loudest).toBeGreaterThan(0.4)
    expect(loudest).toBeLessThanOrEqual(1)
  })
  it('crackles more with the sport exhaust than the stock one', () => {
    let sport = 0
    let stock = 0
    for (let seed = 1; seed <= 8; seed++) {
      sport += lift(true, 0.9, seed).fired
      stock += lift(false, 0.9, seed).fired
    }
    expect(sport).toBeGreaterThan(stock * 1.5)
  })
  it('stays silent for engines without afterfire and at low revs', () => {
    expect(lift(true, 0).fired).toBe(0)
    const crackle = new ExhaustCrackle()
    let fired = 0
    for (let step = 0; step < 300; step++)
      if (
        crackle.step(1 / 60, {
          revs: 0.1,
          throttle: step < 150 ? 1 : 0,
          load: 0.3,
          shifts: 0,
          pops: 0.9,
          sport: true,
        }) > 0
      )
        fired++
    expect(fired).toBe(0)
  })
  it('barks on a loaded upshift', () => {
    const crackle = new ExhaustCrackle()
    const input: CrackleInput = {
      revs: 0.9,
      throttle: 1,
      load: 1,
      shifts: 0,
      pops: 0.9,
      sport: true,
    }
    crackle.step(1 / 60, input)
    expect(crackle.step(1 / 60, { ...input, shifts: 1 })).toBeGreaterThan(0.3)
  })
})

describe('supercar models', () => {
  it('gives every model its own engine voice and profile', () => {
    const voices = supercarModels.map((model) =>
      engineSoundFor({ vehicle: 'supercar', supercarModel: model }),
    )
    expect(new Set(voices.map((voice) => voice.layout)).size).toBe(supercarModels.length)
    const indices = supercarModels.map((model) =>
      engineVoiceIndex({ vehicle: 'supercar', supercarModel: model }),
    )
    expect(new Set(indices).size).toBe(supercarModels.length)
    for (const index of indices) expect(engineVoices[index]).toBeDefined()
    expect(engineProfileFor({ vehicle: 'supercar', supercarModel: 'classic' })).toBe(
      engineProfiles.supercar,
    )
    expect(engineProfileFor({ vehicle: 'touring', supercarModel: 'track' })).toBe(
      engineProfiles.touring,
    )
    expect(supercarProfiles.track.redline).toBeGreaterThan(supercarProfiles.grand.redline)
    expect(engineVoiceIndex(defaults)).toBe(0)
  })
  it('renders an audible bang when a pop is triggered', () => {
    const voice = new EngineVoice(48000, 3)
    voice.configure(supercarSounds.grand)
    voice.rpm = 4000
    voice.idle = 850
    voice.redline = 7200
    const size = 128
    const left = new Float32Array(size)
    const right = new Float32Array(size)
    const bay = new Float32Array(size)
    const turbo = new Float32Array(size)
    const loudest = () => {
      let peak = 0
      for (let block = 0; block < 12; block++) {
        voice.render(left, right, bay, turbo, size)
        for (const sample of left) peak = Math.max(peak, Math.abs(sample))
      }
      return peak
    }
    loudest()
    const quiet = loudest()
    voice.pops = 1
    voice.popLevel = 1
    const bang = loudest()
    expect(Number.isFinite(bang)).toBe(true)
    expect(bang).toBeGreaterThan(quiet * 1.5)
  })
})

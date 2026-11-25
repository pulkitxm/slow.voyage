import { describe, expect, it } from 'bun:test'
import {
  channelIndex,
  freshParams,
  paramIndex,
  type SoundChannel,
  type SoundParam,
  SoundSynth,
  soundChannels,
  soundParams,
} from './sound-synth'

const rate = 48000

function render(values: Partial<Record<SoundParam, number>>, seconds = 1.5, later = values) {
  const synth = new SoundSynth(rate, 1)
  const frames = Math.round(seconds * rate)
  const out = soundChannels.map(() => new Float32Array(frames))
  const block = soundChannels.map(() => new Float32Array(128))
  for (let at = 0; at + 128 <= frames; at += 128) {
    const now = at < frames / 2 ? values : later
    for (const [name, value] of Object.entries(now))
      synth.params[paramIndex[name as SoundParam]] = value
    synth.render(block, 128)
    for (const [index, data] of out.entries()) data.set(block[index] as Float32Array, at)
  }
  return (channel: SoundChannel) => out[channelIndex[channel]] as Float32Array
}

function loudness(signal: Float32Array, from = 0.3, to = Number.POSITIVE_INFINITY) {
  let sum = 0
  let count = 0
  for (let i = Math.round(from * rate); i < Math.min(signal.length, to * rate); i++) {
    sum += (signal[i] as number) ** 2
    count++
  }
  return Math.sqrt(sum / Math.max(1, count))
}

function line(signal: Float32Array, frequency: number) {
  let real = 0
  let imaginary = 0
  const from = Math.round(0.3 * rate)
  for (let i = from; i < signal.length; i++) {
    const angle = (2 * Math.PI * frequency * i) / rate
    real += (signal[i] as number) * Math.cos(angle)
    imaginary += (signal[i] as number) * Math.sin(angle)
  }
  return Math.hypot(real, imaginary) / (signal.length - from)
}

function band(signal: Float32Array, centre: number) {
  let sum = 0
  for (let offset = -0.12; offset <= 0.121; offset += 0.02)
    sum += line(signal, centre * (1 + offset)) ** 2
  return Math.sqrt(sum)
}

describe('synth layout', () => {
  it('names every parameter and channel once and starts from sane defaults', () => {
    expect(new Set(soundParams).size).toBe(soundParams.length)
    expect(new Set(soundChannels).size).toBe(soundChannels.length)
    const params = freshParams()
    expect(params[paramIndex.rpm]).toBeGreaterThan(0)
    expect(params[paramIndex.redline]).toBeGreaterThan(params[paramIndex.idle] as number)
    expect(params[paramIndex.roll]).toBe(0)
  })

  it('keeps the road, the air and the surroundings silent until they are asked for', () => {
    const heard = render({})
    for (const channel of [
      'tyresLeft',
      'tyresRight',
      'debris',
      'windLeft',
      'windRight',
      'cabin',
      'ambienceLeft',
      'ambienceRight',
      'turbo',
    ] as const)
      expect(loudness(heard(channel))).toBeLessThan(1e-6)
    expect(loudness(heard('exhaustLeft'))).toBeGreaterThan(0.001)
  })

  it('renders long buffers in one call the same way as short blocks', () => {
    const synth = new SoundSynth(rate, 1)
    const long = soundChannels.map(() => new Float32Array(1024))
    synth.render(long, 1024)
    const other = new SoundSynth(rate, 1)
    const short = soundChannels.map(() => new Float32Array(128))
    for (let at = 0; at < 1024; at += 128) {
      other.render(short, 128)
      for (const [index, data] of short.entries())
        expect(Array.from(data)).toEqual(
          Array.from((long[index] as Float32Array).subarray(at, at + 128)),
        )
    }
  })
})

describe('tyres and road', () => {
  it('rolls louder and brighter with speed and hisses in the wet', () => {
    const slow = render({ speed: 10, roll: 0.02 })('tyresLeft')
    const fast = render({ speed: 40, roll: 0.16 })('tyresLeft')
    expect(loudness(fast)).toBeGreaterThan(loudness(slow) * 4)
    expect(band(fast, 1200) / loudness(fast)).toBeGreaterThan(band(slow, 1200) / loudness(slow))
    const dry = render({ speed: 30, roll: 0.1 })('tyresLeft')
    const wet = render({ speed: 30, roll: 0.1, wet: 0.15 })('tyresLeft')
    expect(band(wet, 6000)).toBeGreaterThan(band(dry, 6000) * 2.5)
  })

  it('squeals at the asked pitch, on the side that slides', () => {
    const heard = render({ speed: 25, squealLeft: 0.1, squealPitch: 1000, rough: 0.1 }, 2)
    const left = heard('tyresLeft')
    expect(loudness(left)).toBeGreaterThan(0.02)
    expect(loudness(heard('tyresRight'))).toBeLessThan(loudness(left) * 0.05)
    expect(band(left, 1000)).toBeGreaterThan(band(left, 700) * 4)
    expect(band(left, 1000)).toBeGreaterThan(band(left, 1400) * 2)
    const low = render({ speed: 25, squealLeft: 0.1, squealPitch: 800, rough: 0.1 }, 2)('tyresLeft')
    expect(band(low, 800)).toBeGreaterThan(band(low, 1000) * 2)
  })

  it('skids lower and rougher than it squeals', () => {
    const skid = render({ speed: 20, skid: 0.1, squealPitch: 1000 }, 2)('tyresLeft')
    expect(loudness(skid)).toBeGreaterThan(0.01)
    expect(band(skid, 580)).toBeGreaterThan(band(skid, 1000))
  })

  it('throws stones only when gravel grains are asked for', () => {
    expect(loudness(render({ speed: 20, gravel: 0.2 })('debris'))).toBeLessThan(1e-6)
    expect(loudness(render({ speed: 20, gravel: 0.2, grains: 40 })('debris'))).toBeGreaterThan(
      0.003,
    )
    expect(loudness(render({ speed: 20, gravel: 0.2 })('tyresLeft'))).toBeGreaterThan(0.01)
    expect(loudness(render({ speed: 20, grass: 0.14 })('tyresRight'))).toBeGreaterThan(0.005)
  })

  it('ticks over road joints at a rate set by speed and their spacing', () => {
    const onsets = (speed: number) => {
      const signal = render({ speed, joint: 9, jointLevel: 0.5, wheelbase: 2.6 }, 4)('debris')
      let count = 0
      let quiet = 0
      for (let i = 0; i < signal.length; i++) {
        if (Math.abs(signal[i] as number) > 0.004) {
          if (quiet > rate * 0.04) count++
          quiet = 0
        } else quiet++
      }
      return count
    }
    expect(onsets(9)).toBeGreaterThanOrEqual(6)
    expect(onsets(9)).toBeLessThanOrEqual(9)
    expect(onsets(27)).toBeGreaterThan(onsets(9) * 2)
    expect(loudness(render({ speed: 20, joint: 0, jointLevel: 0.5 })('debris'))).toBeLessThan(1e-6)
  })

  it('thumps once for each counted bump', () => {
    const still = render({ bumps: 3, bumpStrength: 0.6 }, 1)('debris')
    expect(loudness(still)).toBeLessThan(1e-6)
    const bumped = render({ bumps: 3, bumpStrength: 0.6 }, 1, { bumps: 4, bumpStrength: 0.6 })(
      'debris',
    )
    expect(loudness(bumped, 0.5, 0.6)).toBeGreaterThan(0.005)
    expect(loudness(bumped, 0.9)).toBeLessThan(loudness(bumped, 0.5, 0.6) * 0.1)
  })

  it('rings a rail brighter than it grinds on rock', () => {
    const rail = render({ speed: 15, scrape: 0.28, metal: 1 })('debris')
    const rock = render({ speed: 15, scrape: 0.28, metal: 0 })('debris')
    expect(band(rail, 1820) / loudness(rail)).toBeGreaterThan(band(rock, 1820) / loudness(rock))
    expect(loudness(rail)).toBeGreaterThan(0.01)
  })
})

describe('wind, rain and surroundings', () => {
  it('blows on both sides with different turbulence', () => {
    const heard = render({ speed: 40, rush: 0.15, band: 1600 }, 2)
    const left = heard('windLeft')
    const right = heard('windRight')
    expect(loudness(left)).toBeGreaterThan(0.02)
    let apart = 0
    for (let i = 0; i < left.length; i++)
      apart += Math.abs((left[i] as number) - (right[i] as number))
    expect(apart / left.length).toBeGreaterThan(loudness(left) * 0.5)
  })

  it('gusts instead of holding a constant level', () => {
    const wind = render({ speed: 40, rush: 0.15, band: 1600 }, 12)('windLeft')
    const windows: number[] = []
    for (let at = 1; at + 0.5 <= 12; at += 0.5) windows.push(loudness(wind, at, at + 0.5))
    expect(Math.max(...windows) / Math.min(...windows)).toBeGreaterThan(1.15)
  })

  it('rains on the bodywork and outside, harder at speed', () => {
    const parked = render({ rain: 0.07 }, 3)
    const driving = render({ rain: 0.07, speed: 40 }, 3)
    expect(loudness(parked('ambienceLeft'))).toBeGreaterThan(0.005)
    expect(loudness(parked('cabin'))).toBeGreaterThan(0.0005)
    expect(loudness(driving('cabin'))).toBeGreaterThan(loudness(parked('cabin')) * 1.4)
  })

  it('sings, chirps and rushes only when the surroundings call for it', () => {
    expect(loudness(render({ birds: 0.5 }, 12)('ambienceLeft'))).toBeGreaterThan(0.0005)
    expect(loudness(render({ birds: 0.5, rain: 0.07 }, 6)('ambienceLeft'))).toBeGreaterThan(0)
    const insects = render({ insects: 0.5 }, 3)('ambienceRight')
    expect(band(insects, 4820)).toBeGreaterThan(band(insects, 2000) * 5)
    const left = render({ falls: 0.15, fallsPan: -1 }, 2)
    expect(loudness(left('ambienceLeft'))).toBeGreaterThan(loudness(left('ambienceRight')) * 5)
    expect(loudness(render({ surf: 0.1 }, 12)('ambienceLeft'))).toBeGreaterThan(0.002)
    expect(loudness(render({ water: 0.06 }, 3)('ambienceLeft'))).toBeGreaterThan(0.001)
  })
})

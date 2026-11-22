import type { ObstacleMaterial } from './collision'
import { smoothStep } from './field'
import type { EngineProfile } from './powertrain'
import { clamp, type Vehicle } from './world'

export interface EngineVoice {
  cylinders: number
  rolloff: number
  unevenness: number
  brightness: number
  resonance: number
  grit: number
  rumble: number
  clatter: number
  turbo: number
  pops: number
  volume: number
  intake: number
  body: readonly [number, number]
}

export const engineVoices: Record<Vehicle, EngineVoice> = {
  touring: {
    cylinders: 6,
    rolloff: 1.35,
    unevenness: 0.06,
    brightness: 4.5,
    resonance: 1.2,
    grit: 0.12,
    rumble: 0.35,
    clatter: 0,
    turbo: 0.12,
    pops: 0,
    volume: 0.85,
    intake: 0.5,
    body: [140, 620],
  },
  roadster: {
    cylinders: 8,
    rolloff: 1,
    unevenness: 0.4,
    brightness: 5.5,
    resonance: 3,
    grit: 0.45,
    rumble: 0.65,
    clatter: 0,
    turbo: 0,
    pops: 0.7,
    volume: 1,
    intake: 0.8,
    body: [110, 480],
  },
  motorcycle: {
    cylinders: 4,
    rolloff: 0.75,
    unevenness: 0.12,
    brightness: 8,
    resonance: 4.5,
    grit: 0.6,
    rumble: 0.2,
    clatter: 0,
    turbo: 0,
    pops: 0.35,
    volume: 0.8,
    intake: 0.9,
    body: [210, 1150],
  },
  bus: {
    cylinders: 6,
    rolloff: 1.35,
    unevenness: 0.18,
    brightness: 4.2,
    resonance: 1.4,
    grit: 0.35,
    rumble: 0.55,
    clatter: 0.55,
    turbo: 0.3,
    pops: 0,
    volume: 1,
    intake: 0.45,
    body: [85, 360],
  },
  pickup: {
    cylinders: 8,
    rolloff: 1.25,
    unevenness: 0.3,
    brightness: 3.8,
    resonance: 1.8,
    grit: 0.4,
    rumble: 0.8,
    clatter: 0,
    turbo: 0.2,
    pops: 0,
    volume: 1,
    intake: 0.7,
    body: [95, 420],
  },
  hatchback: {
    cylinders: 4,
    rolloff: 1.2,
    unevenness: 0.1,
    brightness: 5,
    resonance: 1.6,
    grit: 0.2,
    rumble: 0.25,
    clatter: 0,
    turbo: 0.26,
    pops: 0,
    volume: 0.8,
    intake: 0.55,
    body: [165, 760],
  },
  supercar: {
    cylinders: 12,
    rolloff: 0.8,
    unevenness: 0.08,
    brightness: 7.5,
    resonance: 4,
    grit: 0.5,
    rumble: 0.45,
    clatter: 0,
    turbo: 0,
    pops: 0.6,
    volume: 1,
    intake: 1,
    body: [150, 980],
  },
}

export function engineSpectrum(voice: EngineVoice) {
  const count = Math.min(80, voice.cylinders * 10)
  const real = new Float32Array(count + 1)
  const imag = new Float32Array(count + 1)
  const half = voice.cylinders / 2
  for (let n = 1; n <= count; n++) {
    const order = n / voice.cylinders
    const decay = 1 / Math.max(order, 0.5) ** voice.rolloff
    const weight =
      n % voice.cylinders === 0 ? 1 : n % half === 0 ? voice.unevenness : voice.unevenness * 0.3
    const phase = (n * 2.399963) % (Math.PI * 2)
    real[n] = weight * decay * Math.cos(phase)
    imag[n] = weight * decay * Math.sin(phase)
  }
  return { real, imag }
}

export function engineTone(voice: EngineVoice, profile: EngineProfile, rpm: number, load: number) {
  const revs = clamp((rpm - profile.idle) / (profile.redline - profile.idle), 0, 1)
  const effort = clamp(load, 0, 1)
  const cycle = rpm / 120
  const firing = cycle * voice.cylinders
  return {
    cycle,
    firing,
    cutoff: Math.min(12000, firing * voice.brightness * (0.55 + 0.9 * effort) + 120),
    gain: voice.volume * (0.35 + 0.65 * effort) * (0.6 + 0.4 * revs),
    grit: voice.grit * effort * (0.3 + 0.7 * revs),
    rumble: voice.rumble * (1 - 0.5 * revs),
    clatter: voice.clatter * (0.4 + 0.6 * effort) * (1 - 0.4 * revs),
    turbo: voice.turbo * effort * revs * revs,
    turboPitch: 1800 + 4200 * revs,
    intake: voice.intake * effort ** 1.5 * (0.25 + 0.75 * revs),
    intakeBand: clamp(firing * 2.6, 260, 2800),
    flutter: (0.004 + voice.unevenness * 0.03) * (1 - 0.7 * revs) * (1 - 0.5 * effort),
    overrun: voice.rumble * (1 - effort) ** 2 * smoothStep(clamp((revs - 0.25) / 0.4, 0, 1)),
    bodyGain: 3 + 5 * effort,
  }
}

export const turboSpool = { rise: 0.55, fall: 0.22, whistle: [2400, 9200], blowOff: 0.45 } as const

export function spoolTurbo(spool: number, load: number, revs: number, dt: number) {
  const target = clamp(load, 0, 1) * smoothStep(clamp(revs / 0.7, 0, 1))
  const time = target > spool ? turboSpool.rise : turboSpool.fall
  return spool + (target - spool) * (1 - Math.exp(-dt / time))
}

export function turboVoice(voice: EngineVoice, spool: number) {
  const pressure = clamp(spool, 0, 1)
  return {
    pitch: turboSpool.whistle[0] + (turboSpool.whistle[1] - turboSpool.whistle[0]) * pressure,
    whistle: voice.turbo * pressure * pressure,
    hiss: voice.turbo * pressure ** 3 * 0.6,
  }
}

export function blowOff(voice: EngineVoice, spool: number, previousLoad: number, load: number) {
  if (voice.turbo < 0.1 || spool < turboSpool.blowOff || previousLoad - load < 0.5) return 0
  return clamp(voice.turbo * 3, 0, 1) * clamp((spool - turboSpool.blowOff) / 0.4, 0.3, 1)
}

export function liftOffPop(voice: EngineVoice, revs: number, previousLoad: number, load: number) {
  if (!voice.pops || revs < 0.45) return 0
  const lift = previousLoad - load
  return lift > 0.5 ? voice.pops * clamp((revs - 0.45) / 0.4, 0, 1) : 0
}

export const tireSound = { squealStart: 0.1, squealFull: 0.45, rollingSpeed: 6 }

export const tirePitch: Record<Vehicle, number> = {
  touring: 980,
  roadster: 1060,
  motorcycle: 1380,
  bus: 700,
  pickup: 840,
  hatchback: 1100,
  supercar: 1000,
}

export function squealLevel(slip: number, speed: number, offroad: boolean) {
  if (offroad) return 0
  const amount = smoothStep(
    clamp((slip - tireSound.squealStart) / (tireSound.squealFull - tireSound.squealStart), 0, 1),
  )
  return amount * clamp(Math.abs(speed) / tireSound.rollingSpeed, 0, 1)
}

export const tireScrub = { start: 0.03, full: 0.16 }

export function scrubLevel(slip: number, speed: number, offroad: boolean) {
  if (offroad) return 0
  const amount = smoothStep(
    clamp((slip - tireScrub.start) / (tireScrub.full - tireScrub.start), 0, 1),
  )
  return amount * clamp(Math.abs(speed) / 12, 0, 1)
}

export function squealPitch(vehicle: Vehicle, squeal: number, speed: number) {
  return (
    tirePitch[vehicle] * (1.08 - 0.2 * clamp(squeal, 0, 1)) * (0.9 + clamp(speed / 40, 0, 1) * 0.2)
  )
}

export function gravelLevel(speed: number, offroad: boolean, sand: boolean, slip: number) {
  if (!offroad) return 0
  const rolling = clamp(Math.abs(speed) / 20, 0, 1)
  return (sand ? 0.6 : 1) * (rolling * 0.8 + clamp(slip, 0, 1) * 0.5 * rolling)
}

export const gravelGrains = { slowest: 5, fastest: 46, bands: [700, 4200] } as const

export function gravelRate(speed: number, offroad: boolean, sand: boolean) {
  if (!offroad || sand) return 0
  const rolling = clamp(Math.abs(speed) / 25, 0, 1)
  if (rolling < 0.02) return 0
  return gravelGrains.slowest + (gravelGrains.fastest - gravelGrains.slowest) * rolling
}

export function roadLevel(speed: number, offroad: boolean) {
  return offroad ? 0 : clamp(Math.abs(speed) / 40, 0, 1) ** 1.5
}

export function windLevel(speed: number) {
  return clamp(Math.abs(speed) / 50, 0, 1.2) ** 2
}

export const windVoice = { whistleFrom: 24, whistleSpan: 22, buffetFrom: 30, buffetSpan: 20 }

export function windLayers(speed: number, gust: number) {
  const v = Math.abs(speed)
  const sway = 1 + 0.35 * clamp(gust, -1, 1)
  return {
    rush: windLevel(v) * sway,
    band: 260 + v * 34,
    whistle:
      smoothStep(clamp((v - windVoice.whistleFrom) / windVoice.whistleSpan, 0, 1)) * 0.5 * sway,
    whistlePitch: 1900 + v * 38,
    buffet: smoothStep(clamp((v - windVoice.buffetFrom) / windVoice.buffetSpan, 0, 1)),
  }
}

export function brakeSquealLevel(speed: number, brake: number) {
  const v = Math.abs(speed)
  if (brake < 0.25 || v < 0.4) return 0
  return clamp((brake - 0.25) / 0.5, 0, 1) * clamp(1 - Math.abs(v - 2.5) / 2.5, 0, 1)
}

export interface ImpactPartial {
  frequency: number
  decay: number
  gain: number
}

export interface ImpactVoice {
  partials: ImpactPartial[]
  noiseBand: number
  noiseDecay: number
  noiseGain: number
  thump: number
  thumpPitch: number
  crunch: number
  boom: number
  debris: number
}

const vehicleWeight: Record<Vehicle, number> = {
  touring: 1,
  roadster: 0.95,
  motorcycle: 0.6,
  bus: 1.7,
  pickup: 1.3,
  hatchback: 0.85,
  supercar: 1,
}

export function impactVoice(material: ObstacleMaterial, strength: number, vehicle: Vehicle) {
  const force = clamp(strength, 0, 1)
  const weight = vehicleWeight[vehicle]
  const pitch = 1 / Math.sqrt(weight)
  const crunch = smoothStep(clamp((force - 0.35) / 0.5, 0, 1)) * Math.min(weight, 1.2)
  const voices: Record<ObstacleMaterial, ImpactVoice> = {
    rail: {
      partials: [
        { frequency: 182, decay: 0.9, gain: 0.5 },
        { frequency: 441, decay: 0.7, gain: 0.35 },
        { frequency: 817, decay: 0.45, gain: 0.25 },
        { frequency: 1293, decay: 0.3, gain: 0.15 },
      ],
      noiseBand: 2400,
      noiseDecay: 0.12,
      noiseGain: 0.6,
      thump: 0.6,
      thumpPitch: 70 * pitch,
      crunch,
      boom: 0,
      debris: 0,
    },
    trunk: {
      partials: [
        { frequency: 118, decay: 0.18, gain: 0.45 },
        { frequency: 263, decay: 0.12, gain: 0.25 },
      ],
      noiseBand: 520,
      noiseDecay: 0.09,
      noiseGain: 0.7,
      thump: 1,
      thumpPitch: 58 * pitch,
      crunch,
      boom: 0,
      debris: 0,
    },
    rock: {
      partials: [{ frequency: 96, decay: 0.1, gain: 0.4 }],
      noiseBand: 1500,
      noiseDecay: 0.14,
      noiseGain: 0.85,
      thump: 0.9,
      thumpPitch: 50 * pitch,
      crunch,
      boom: 0,
      debris: 0,
    },
    water: {
      partials: [],
      noiseBand: 900,
      noiseDecay: 0.6,
      noiseGain: 1,
      thump: 0.35,
      thumpPitch: 44 * pitch,
      crunch: 0,
      boom: 0,
      debris: 0,
    },
  }
  const voice = voices[material]
  const level = (0.25 + 0.75 * force) * Math.min(weight, 1.3)
  const hard = material !== 'water' ? smoothStep(clamp((force - 0.5) / 0.4, 0, 1)) : 0
  return {
    ...voice,
    boom: (material === 'water' ? 0.3 : 0.5 + 0.5 * force) * level,
    debris: Math.round(hard * (material === 'rail' ? 7 : 5)),
    partials: voice.partials.map((partial) => ({
      ...partial,
      frequency: partial.frequency * pitch,
      gain: partial.gain * level,
    })),
    noiseGain: voice.noiseGain * level,
    thump: voice.thump * level,
  }
}

export function scrapeLevel(material: ObstacleMaterial, scrapeSpeed: number) {
  const speed = clamp(Math.abs(scrapeSpeed) / 15, 0, 1)
  if (material === 'water') return 0
  return material === 'rail' ? speed : material === 'rock' ? speed * 0.3 : speed * 0.5
}

export function wadeLevel(depth: number, speed: number) {
  if (depth <= 0) return 0
  return clamp(depth / 0.4, 0, 1) * clamp(Math.abs(speed) / 6, 0, 1)
}

export const boostSound = { rise: 3.2, pitch: [620, 1750], band: [900, 2600] } as const

export function boostVoice(held: number, tank: number) {
  const build = clamp(held / boostSound.rise, 0, 1)
  const swell = build * (2 - build)
  const fading = clamp(tank / 0.12, 0, 1)
  return {
    hiss: (0.45 + 0.55 * swell) * fading,
    band: boostSound.band[0] + (boostSound.band[1] - boostSound.band[0]) * swell,
    whine: (0.25 + 0.75 * swell) * fading,
    pitch: boostSound.pitch[0] + (boostSound.pitch[1] - boostSound.pitch[0]) * swell,
  }
}

export type CryVoice = 'man' | 'woman'

export const cryVoices = {
  man: {
    pitch: 172,
    spread: 0.22,
    scream: 1.75,
    waver: 5.2,
    rasp: 0.5,
    shout: [
      { frequency: 610, q: 5, gain: 1 },
      { frequency: 1250, q: 6, gain: 0.6 },
      { frequency: 2450, q: 8, gain: 0.3 },
    ],
    cry: [
      { frequency: 780, q: 4, gain: 1 },
      { frequency: 1220, q: 6, gain: 0.75 },
      { frequency: 2550, q: 8, gain: 0.35 },
    ],
  },
  woman: {
    pitch: 318,
    spread: 0.2,
    scream: 1.95,
    waver: 6.8,
    rasp: 0.18,
    shout: [
      { frequency: 760, q: 5, gain: 1 },
      { frequency: 1720, q: 6, gain: 0.6 },
      { frequency: 2950, q: 8, gain: 0.35 },
    ],
    cry: [
      { frequency: 1020, q: 4, gain: 1 },
      { frequency: 1580, q: 6, gain: 0.7 },
      { frequency: 3250, q: 8, gain: 0.45 },
    ],
  },
} as const

export function cryVoice(voice: CryVoice, scream: boolean, variation: number) {
  const tone = cryVoices[voice]
  const vary = clamp(variation, 0, 1)
  const base = tone.pitch * (1 - tone.spread / 2 + tone.spread * vary)
  return scream
    ? {
        pitch: base * tone.scream,
        leap: 1.35,
        fall: 1.02,
        length: 0.75 + 0.35 * vary,
        peak: 1,
        waver: tone.waver,
        rasp: tone.rasp,
        formants: tone.cry,
        breath: 0.1,
        jitter: 0.018,
        attack: 0.05,
      }
    : {
        pitch: base,
        leap: 1.28,
        fall: 0.8,
        length: 0.3 + 0.12 * vary,
        peak: 0.7,
        waver: tone.waver,
        rasp: tone.rasp * 0.7,
        formants: tone.shout,
        breath: 0.16,
        jitter: 0.012,
        attack: 0.025,
      }
}

export function earshot(distance: number) {
  const reach = Math.max(0, distance) / 16
  return 1 / (1 + reach * reach)
}

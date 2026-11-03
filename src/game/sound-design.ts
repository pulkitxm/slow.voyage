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
    turbo: 0.02,
    pops: 0,
    volume: 0.85,
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
  }
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
}

export function squealLevel(slip: number, speed: number, offroad: boolean) {
  if (offroad) return 0
  const amount = smoothStep(
    clamp((slip - tireSound.squealStart) / (tireSound.squealFull - tireSound.squealStart), 0, 1),
  )
  return amount * clamp(Math.abs(speed) / tireSound.rollingSpeed, 0, 1)
}

export function gravelLevel(speed: number, offroad: boolean, sand: boolean, slip: number) {
  if (!offroad) return 0
  const rolling = clamp(Math.abs(speed) / 20, 0, 1)
  return (sand ? 0.6 : 1) * (rolling * 0.8 + clamp(slip, 0, 1) * 0.5 * rolling)
}

export function roadLevel(speed: number, offroad: boolean) {
  return offroad ? 0 : clamp(Math.abs(speed) / 40, 0, 1) ** 1.5
}

export function windLevel(speed: number) {
  return clamp(Math.abs(speed) / 50, 0, 1.2) ** 2
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
}

const vehicleWeight: Record<Vehicle, number> = {
  touring: 1,
  roadster: 0.95,
  motorcycle: 0.6,
  bus: 1.7,
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
    },
    edge: {
      partials: [],
      noiseBand: 260,
      noiseDecay: 0.2,
      noiseGain: 0.5,
      thump: 0.9,
      thumpPitch: 48 * pitch,
      crunch: crunch * 0.5,
    },
    water: {
      partials: [],
      noiseBand: 900,
      noiseDecay: 0.6,
      noiseGain: 1,
      thump: 0.35,
      thumpPitch: 44 * pitch,
      crunch: 0,
    },
  }
  const voice = voices[material]
  const level = (0.25 + 0.75 * force) * Math.min(weight, 1.3)
  return {
    ...voice,
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
  return material === 'rail' ? speed : speed * 0.5
}

export function wadeLevel(depth: number, speed: number) {
  if (depth <= 0) return 0
  return clamp(depth / 0.4, 0, 1) * clamp(Math.abs(speed) / 6, 0, 1)
}

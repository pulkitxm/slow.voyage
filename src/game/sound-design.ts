import type { ObstacleMaterial } from './collision'
import { smoothStep } from './field'
import type { Landscape } from './landscapes'
import type { RoadWear } from './road-condition'
import { clamp, type Season, type Vehicle, type Weather } from './world'

export const mixLevels = {
  master: 1.6,
  engine: 0.25,
  road: 0.16,
  gravel: 0.22,
  rumble: 0.3,
  wind: 0.12,
  breeze: 0.084,
  horn: 0.16,
  thunder: 0.5,
  squeal: 0.11,
  brakeSqueal: 0.03,
  scrape: 0.28,
  wade: 0.35,
  rain: 0.07,
  impact: 0.55,
  boost: 0.2,
  boostWhine: 0.045,
  voice: 0.34,
  intake: 0.5,
  turbo: 0.09,
  scrub: 0.1,
  grains: 0.16,
  whistle: 0.03,
  buffet: 0.1,
  echo: 0.2,
  grass: 0.14,
  skid: 0.12,
  joints: 0.5,
  thump: 0.6,
  ambience: 0.5,
  drumming: 0.6,
}

export const cameraMix = {
  chase: { exhaust: 1, bay: 0.3, turbo: 0.55, cabin: 0.25, outside: 1, muffle: 20000 },
  cinematic: { exhaust: 1, bay: 0.25, turbo: 0.5, cabin: 0.15, outside: 1, muffle: 20000 },
  bonnet: { exhaust: 0.5, bay: 1, turbo: 1, cabin: 1, outside: 0.7, muffle: 2600 },
  saddle: { exhaust: 0.75, bay: 0.9, turbo: 1, cabin: 0, outside: 1, muffle: 20000 },
} as const

export function listening(camera: 'chase' | 'bonnet' | 'cinematic', vehicle: Vehicle) {
  if (camera !== 'bonnet') return cameraMix[camera]
  return vehicle === 'motorcycle' ? cameraMix.saddle : cameraMix.bonnet
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
  return clamp(Math.abs(speed) / 50, 0, 1) ** 2
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

export const vehicleWeight: Record<Vehicle, number> = {
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

export interface TyreWheel {
  localX: number
  contact: boolean
  onRoad: boolean
  sand: boolean
  locked: boolean
  slip: number
  puddle: number
  rollingSpeed: number
  lateralSpeed: number
}

export interface TyreSignals {
  left: number
  right: number
  spin: number
  locked: number
  tarmac: number
  loose: number
  sand: number
  puddle: number
}

export function freshTyreSignals(): TyreSignals {
  return { left: 0, right: 0, spin: 0, locked: 0, tarmac: 1, loose: 0, sand: 0, puddle: 0 }
}

export function tyreSignals(wheels: readonly TyreWheel[], out: TyreSignals) {
  out.left = out.right = out.spin = out.locked = out.tarmac = out.loose = out.sand = out.puddle = 0
  if (!wheels.length) return out
  const share = 1 / wheels.length
  for (const wheel of wheels) {
    if (!wheel.contact) continue
    if (!wheel.onRoad) {
      out.loose += share
      if (wheel.sand) out.sand += share
      continue
    }
    out.tarmac += share
    out.puddle += wheel.puddle * share
    const sideways = Math.abs(wheel.lateralSpeed) / Math.max(1, Math.abs(wheel.rollingSpeed))
    const lengthwise = Math.max(0, wheel.slip - sideways)
    if (wheel.locked) out.locked = Math.max(out.locked, wheel.slip)
    else {
      out.spin = Math.max(out.spin, lengthwise)
      if (wheel.localX <= 0) out.left = Math.max(out.left, wheel.slip)
      if (wheel.localX >= 0) out.right = Math.max(out.right, wheel.slip)
    }
  }
  return out
}

export function squealRoughness(slip: number, spin: number) {
  const deep = smoothStep(clamp((slip - 0.3) / 0.5, 0, 1))
  return clamp(0.12 + 0.45 * deep + 0.5 * clamp(spin / 0.4, 0, 1), 0, 0.85)
}

export function skidLevel(locked: number, speed: number) {
  return smoothStep(clamp(locked / 0.5, 0, 1)) * clamp(Math.abs(speed) / 5, 0, 1)
}

export function wetLevel(weather: Weather, puddle: number) {
  const film = weather === 'storm' ? 0.75 : weather === 'rain' ? 0.5 : 0
  return clamp(film + 0.6 * clamp(puddle, 0, 1), 0, 1)
}

export function rainLevel(weather: Weather) {
  return weather === 'storm' ? 1 : weather === 'rain' ? 0.6 : 0
}

export function looseGround(landscape: Landscape, season: Season, grassy: boolean) {
  if (season === 'winter' && landscape !== 'desert' && landscape !== 'canyon')
    return { gravel: 0.2, grass: 0.8 }
  return grassy ? { gravel: 0.3, grass: 0.7 } : { gravel: 1, grass: 0 }
}

export function grassLevel(speed: number, slip: number) {
  const rolling = clamp(Math.abs(speed) / 22, 0, 1)
  return rolling ** 0.8 * (0.75 + 0.5 * clamp(slip, 0, 1))
}

export const roadJoints = {
  spacing: 9,
  level: { fresh: 0.2, worn: 0.6, broken: 1 } satisfies Record<RoadWear, number>,
}

export const suspensionThump = { quiet: 3.5, loud: 16, rest: 0.09 }

export function thumpStrength(rate: number, landing: boolean) {
  const { quiet, loud } = suspensionThump
  const jolt = clamp((Math.abs(rate) - quiet) / (loud - quiet), 0, 1)
  return landing ? Math.max(0.35, jolt) : jolt
}

export const soundSpeed = 343

export function doppler(closing: number) {
  return soundSpeed / (soundSpeed - clamp(closing, -120, 120))
}

export function echoPitch(speed: number) {
  const pace = clamp(Math.abs(speed), 0, 120)
  return (soundSpeed + pace) / (soundSpeed - pace)
}

export function passing(ahead: number, aside: number, speed: number, later = 0) {
  const along = ahead - speed * later
  const distance = Math.max(1, Math.hypot(along, aside))
  return {
    distance,
    pitch: doppler((speed * along) / distance),
    pan: clamp(aside / (Math.abs(along) + 4), -1, 1),
    brightness: clamp(22000 / (1 + distance / 18), 1800, 20000),
  }
}

export const hornVoices: Record<Vehicle, readonly [number, number]> = {
  touring: [415, 494],
  roadster: [440, 554],
  hatchback: [466, 587],
  supercar: [392, 494],
  pickup: [349, 440],
  motorcycle: [523, 523 * 1.19],
  bus: [277, 349],
}

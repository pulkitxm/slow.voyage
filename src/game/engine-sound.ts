import { Biquad, Blocker, Drift, glide, limit, Noise, Pipe, Ringer } from './dsp'
import type { Vehicle } from './world'

export interface EngineSound {
  layout: string
  cylinders: number
  firing: readonly number[]
  banks: readonly number[]
  pulse: readonly [relaxed: number, loaded: number]
  duration: number
  imbalance: number
  roughness: number
  lope: number
  header: readonly [number, number]
  tail: readonly [number, number]
  reflection: readonly [header: number, tail: number]
  damping: number
  body: readonly (readonly [frequency: number, q: number, decibels: number])[]
  muffler: readonly [closed: number, open: number]
  rasp: number
  flow: number
  crossover: number
  intake: { runner: number; throat: number; level: number; hiss: number }
  valvetrain: number
  clatter: number
  whine: number
  rumble: number
  turbo: { level: number; whistle: readonly [number, number]; flutter: number } | null
  pops: number
  volume: number
}

const even = (cylinders: number) =>
  Array.from({ length: cylinders }, (_, index) => (720 / cylinders) * index)

export const engineSounds: Record<Vehicle, EngineSound> = {
  touring: {
    layout: 'cross-plane V8',
    cylinders: 8,
    firing: even(8),
    banks: [0, 1, 1, 0, 1, 0, 0, 1],
    pulse: [0.006, 0.003],
    duration: 0.11,
    imbalance: 0.22,
    roughness: 0.1,
    lope: 0.04,
    header: [168, 181],
    tail: [43, 46],
    reflection: [0.36, 0.4],
    damping: 2600,
    body: [
      [128, 2.2, 5],
      [540, 2.4, 3],
      [1750, 1.6, -3],
    ],
    muffler: [1300, 4200],
    rasp: 0.9,
    flow: 0.3,
    crossover: 0.6,
    intake: { runner: 310, throat: 520, level: 0.5, hiss: 0.35 },
    valvetrain: 0.25,
    clatter: 0,
    whine: 0.25,
    rumble: 0.5,
    turbo: null,
    pops: 0.12,
    volume: 2.0,
  },
  roadster: {
    layout: 'straight-six',
    cylinders: 6,
    firing: even(6),
    banks: [0, 1, 0, 1, 0, 1],
    pulse: [0.0052, 0.0026],
    duration: 0.1,
    imbalance: 0.22,
    roughness: 0.12,
    lope: 0.03,
    header: [236, 244],
    tail: [61, 63],
    reflection: [0.42, 0.4],
    damping: 4200,
    body: [
      [185, 2.6, 4],
      [690, 3, 5],
      [2300, 2, 3],
    ],
    muffler: [1700, 6500],
    rasp: 1.7,
    flow: 0.45,
    crossover: 0.75,
    intake: { runner: 420, throat: 760, level: 0.85, hiss: 0.5 },
    valvetrain: 0.4,
    clatter: 0,
    whine: 0.35,
    rumble: 0.35,
    turbo: null,
    pops: 0.75,
    volume: 1.75,
  },
  hatchback: {
    layout: 'turbocharged inline-four',
    cylinders: 4,
    firing: even(4),
    banks: [0, 0, 0, 0],
    pulse: [0.0058, 0.0032],
    duration: 0.11,
    imbalance: 0.25,
    roughness: 0.1,
    lope: 0.02,
    header: [205, 205],
    tail: [57, 57],
    reflection: [0.36, 0.4],
    damping: 2800,
    body: [
      [172, 2.4, 4],
      [760, 2.2, 3],
      [1500, 1.5, -2],
    ],
    muffler: [1200, 3800],
    rasp: 0.8,
    flow: 0.3,
    crossover: 1,
    intake: { runner: 380, throat: 640, level: 0.55, hiss: 0.55 },
    valvetrain: 0.45,
    clatter: 0,
    whine: 0.3,
    rumble: 0.3,
    turbo: { level: 0.55, whistle: [2300, 8600], flutter: 1 },
    pops: 0.25,
    volume: 1.15,
  },
  supercar: {
    layout: 'V12',
    cylinders: 12,
    firing: even(12),
    banks: [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    pulse: [0.0044, 0.0019],
    duration: 0.085,
    imbalance: 0.2,
    roughness: 0.07,
    lope: 0.01,
    header: [318, 336],
    tail: [82, 88],
    reflection: [0.45, 0.4],
    damping: 6500,
    body: [
      [240, 2.4, 3],
      [980, 3.2, 6],
      [3100, 2.2, 5],
    ],
    muffler: [2200, 9500],
    rasp: 2.2,
    flow: 0.5,
    crossover: 0.45,
    intake: { runner: 560, throat: 1150, level: 0.5, hiss: 0.55 },
    valvetrain: 0.5,
    clatter: 0,
    whine: 0.5,
    rumble: 0.3,
    turbo: null,
    pops: 0.7,
    volume: 2.5,
  },
  pickup: {
    layout: 'pushrod V8',
    cylinders: 8,
    firing: even(8),
    banks: [0, 1, 1, 0, 1, 0, 0, 1],
    pulse: [0.0078, 0.0044],
    duration: 0.13,
    imbalance: 0.3,
    roughness: 0.18,
    lope: 0.14,
    header: [118, 139],
    tail: [31, 37],
    reflection: [0.42, 0.45],
    damping: 2100,
    body: [
      [92, 2, 6],
      [410, 2.2, 4],
      [1300, 1.4, -2],
    ],
    muffler: [1000, 3200],
    rasp: 1.3,
    flow: 0.4,
    crossover: 0.15,
    intake: { runner: 240, throat: 430, level: 0.7, hiss: 0.4 },
    valvetrain: 0.5,
    clatter: 0,
    whine: 0.4,
    rumble: 0.8,
    turbo: null,
    pops: 0.2,
    volume: 1.5,
  },
  motorcycle: {
    layout: 'parallel twin with a 270 degree crank',
    cylinders: 2,
    firing: [0, 270],
    banks: [0, 0],
    pulse: [0.0046, 0.0021],
    duration: 0.1,
    imbalance: 0.15,
    roughness: 0.12,
    lope: 0.05,
    header: [290, 290],
    tail: [104, 104],
    reflection: [0.45, 0.4],
    damping: 6000,
    body: [
      [215, 2.4, 4],
      [1150, 3, 6],
      [2900, 2, 4],
    ],
    muffler: [2000, 8500],
    rasp: 2,
    flow: 0.5,
    crossover: 1,
    intake: { runner: 520, throat: 980, level: 0.9, hiss: 0.5 },
    valvetrain: 0.6,
    clatter: 0,
    whine: 0.55,
    rumble: 0.2,
    turbo: null,
    pops: 0.4,
    volume: 1.6,
  },
  bus: {
    layout: 'turbo-diesel inline-six',
    cylinders: 6,
    firing: even(6),
    banks: [0, 0, 0, 0, 0, 0],
    pulse: [0.0074, 0.0052],
    duration: 0.14,
    imbalance: 0.2,
    roughness: 0.1,
    lope: 0.02,
    header: [104, 104],
    tail: [27, 27],
    reflection: [0.36, 0.26],
    damping: 1700,
    body: [
      [84, 1.4, 3],
      [355, 2, 4],
      [1100, 1.4, -3],
    ],
    muffler: [800, 2300],
    rasp: 0.7,
    flow: 0.4,
    crossover: 1,
    intake: { runner: 190, throat: 350, level: 0.45, hiss: 0.6 },
    valvetrain: 0.5,
    clatter: 1,
    whine: 0.6,
    rumble: 0.9,
    turbo: { level: 0.7, whistle: [1900, 7200], flutter: 0 },
    pops: 0,
    volume: 1.25,
  },
}

export const soundVehicles = [
  'touring',
  'roadster',
  'hatchback',
  'supercar',
  'pickup',
  'motorcycle',
  'bus',
] as const satisfies readonly Vehicle[]

export function firingFrequency(sound: EngineSound, rpm: number) {
  return (rpm / 60) * (sound.cylinders / 2)
}

export const turboSpool = { rise: 0.55, fall: 0.22, blowOff: 0.45, lift: 0.5 } as const

export function spoolTurbo(spool: number, load: number, revs: number, dt: number) {
  const reach = limit(revs / 0.7, 0, 1)
  const target = limit(load, 0, 1) * reach * reach * (3 - 2 * reach)
  const time = target > spool ? turboSpool.rise : turboSpool.fall
  return spool + (target - spool) * (1 - Math.exp(-dt / time))
}

export const overrun = { revs: 0.3, load: 0.08, burst: 0.4, warmUp: 1.2, coolDown: 2.6 } as const

export function afterfire(sound: EngineSound, heat: number, revs: number, bursting: boolean) {
  if (!sound.pops || revs < overrun.revs) return 0
  const reach = limit((revs - overrun.revs) / 0.4, 0, 1)
  return limit(sound.pops * reach * (0.1 * heat + (bursting ? 0.5 : 0)), 0, 0.9)
}

const most = 12

class Collector {
  header: Pipe
  tail: Pipe
  body: [Biquad, Biquad, Biquad]
  muffler: Biquad
  blocker: Blocker
  constructor(rate: number) {
    this.header = new Pipe(rate, 0.012)
    this.tail = new Pipe(rate, 0.03)
    this.body = [new Biquad(rate), new Biquad(rate), new Biquad(rate)]
    this.muffler = new Biquad(rate)
    this.blocker = new Blocker(rate)
  }
}

export class EngineVoice {
  rpm = 800
  idle = 800
  redline = 6500
  load = 0
  throttle = 0
  cutting = 0
  speed = 0
  shifts = 0
  clunk = 0
  steady = false
  spool = 0
  heat = 0
  private sound: EngineSound = engineSounds.touring
  private noise: Noise
  private phase = 0
  private turning = 800
  private effort = 0
  private opening = 0
  private offsets = new Float32Array(most)
  private weights = new Float32Array(most)
  private spans = new Float32Array(most)
  private bank = new Uint8Array(most)
  private last = new Float32Array(most)
  private strength = new Float32Array(most)
  private narrow = new Float32Array(most)
  private collectors: [Collector, Collector]
  private runner: Pipe
  private throat: Biquad
  private plenum: Biquad
  private bayBlocker: Blocker
  private tickBand: Biquad
  private clatterBand: Biquad
  private knockBand: Biquad
  private rumbleBand: Biquad
  private hissBand: Biquad
  private ventBand: Biquad
  private turboBlocker: Blocker
  private shifter: Ringer
  private wander: Drift
  private tick = 0
  private knock = 0
  private pop = 0
  private popMuffle = 0
  private shade = 0
  private whinePhase = 0
  private whistlePhase = 0
  private whistlePitch = 2000
  private vent = 0
  private ventAge = 1
  private flutterPhase = 0
  private held = 0
  private burst = 0
  private wasCutting = false
  private seenShifts = -1
  private twin = false
  constructor(
    private rate: number,
    seed = 1,
  ) {
    this.noise = new Noise(seed * 7919 + 13)
    this.collectors = [new Collector(rate), new Collector(rate)]
    this.runner = new Pipe(rate, 0.012)
    this.throat = new Biquad(rate)
    this.plenum = new Biquad(rate)
    this.bayBlocker = new Blocker(rate)
    this.tickBand = new Biquad(rate).bandpass(3800, 1.4)
    this.clatterBand = new Biquad(rate).bandpass(1900, 1.1)
    this.knockBand = new Biquad(rate).bandpass(3300, 1.6)
    this.rumbleBand = new Biquad(rate).lowpass(160, 0.7)
    this.hissBand = new Biquad(rate).bandpass(3000, 9)
    this.ventBand = new Biquad(rate).bandpass(3000, 1.2)
    this.turboBlocker = new Blocker(rate, 200)
    this.shifter = new Ringer(rate)
    this.wander = new Drift(this.noise, 1.3, rate / 128)
    this.configure(engineSounds.touring)
  }
  configure(sound: EngineSound) {
    this.sound = sound
    const character = new Noise(sound.cylinders * 977 + Math.round(sound.header[0]))
    for (let index = 0; index < sound.cylinders; index++) {
      const late = (sound.firing[index] ?? 0) / 720 + 0.012 * sound.imbalance * character.next()
      this.offsets[index] = late - Math.floor(late)
      this.weights[index] = 1 + sound.imbalance * character.next()
      this.spans[index] = 1 + 0.6 * sound.imbalance * character.next()
      this.bank[index] = sound.banks[index] ?? 0
      this.last[index] = 1
      this.strength[index] = 0
      this.narrow[index] = 50
    }
    this.twin = sound.banks.some((bank) => bank === 1)
    for (let side = 0; side < 2; side++) {
      const collector = this.collectors[side as 0 | 1]
      collector.header.tune(sound.header[side as 0 | 1], sound.damping).clear()
      collector.tail.tune(sound.tail[side as 0 | 1], sound.damping * 0.5).clear()
      for (const filter of collector.body) filter.clear()
      collector.muffler.clear()
    }
    this.runner.tune(sound.intake.runner, 3500).clear()
    this.throat.bandpass(sound.intake.throat, 1.8).clear()
    this.plenum.lowpass(sound.intake.throat * 3.2, 0.8).clear()
    this.spool = this.heat = this.vent = this.pop = this.burst = 0
    this.seenShifts = -1
  }
  render(
    left: Float32Array,
    right: Float32Array,
    bay: Float32Array,
    turbo: Float32Array,
    count: number,
  ) {
    const sound = this.sound
    const rate = this.rate
    const noise = this.noise
    const dt = count / rate
    const span = Math.max(1, this.redline - this.idle)
    const revs = limit((this.rpm - this.idle) / span, 0, 1)
    const drive = this.cutting > 0.5 ? 0 : limit(this.load, 0, 1)
    const pedal = limit(this.throttle, 0, 1)

    this.held =
      pedal > this.held ? pedal : this.held + (pedal - this.held) * (1 - Math.exp(-dt / 0.1))
    const lifted = this.held - pedal > turboSpool.lift && this.burst <= 0
    if (lifted) {
      this.burst = overrun.burst
      this.held = pedal
    }
    this.burst = Math.max(0, this.burst - dt)
    const stoked = limit(this.load, 0, 1) * revs
    this.heat +=
      (stoked - this.heat) *
      (1 - Math.exp(-dt / (stoked > this.heat ? overrun.warmUp : overrun.coolDown)))
    if (this.wasCutting && this.cutting < 0.5) this.heat = Math.min(1, this.heat + 0.15)
    this.wasCutting = this.cutting > 0.5
    const coasting = drive < overrun.load
    const popChance = coasting ? afterfire(sound, this.heat, revs, this.burst > 0) : 0

    const boosted = sound.turbo
    if (boosted) {
      this.spool = spoolTurbo(this.spool, drive, revs, dt)
      if (lifted && this.spool > turboSpool.blowOff) {
        this.vent = limit((this.spool - turboSpool.blowOff) / 0.4, 0.3, 1)
        this.ventAge = 0
        this.flutterPhase = 0
        this.spool *= 0.3
      }
    } else this.spool = 0
    this.ventAge += dt
    this.vent *= Math.exp(-dt / (boosted?.flutter ? 0.11 : 0.2))
    if (this.vent > 0.001) this.ventBand.bandpass(1300 + 2700 * Math.exp(-this.ventAge * 5), 1.1)
    const flutterStep = boosted?.flutter ? (30 - 40 * Math.min(0.3, this.ventAge)) / rate : 0
    const pressure = limit(this.spool, 0, 1)
    const whistleTarget = boosted
      ? boosted.whistle[0] + (boosted.whistle[1] - boosted.whistle[0]) * pressure ** 0.8
      : 2000
    const whistleLevel = boosted ? boosted.level * pressure * pressure * 0.05 : 0
    const hissLevel = boosted ? boosted.level * pressure ** 3 * 0.25 : 0
    if (boosted) this.hissBand.bandpass(this.whistlePitch, 9)

    if (this.seenShifts < 0) this.seenShifts = this.shifts
    if (this.shifts !== this.seenShifts) {
      this.seenShifts = this.shifts
      this.shifter.strike(128 + 40 * noise.unit(), 0.03, 0.5 * this.clunk)
      this.tick = Math.max(this.tick, this.clunk)
      if (sound.pops && revs > 0.6 && pedal > 0.5) {
        this.burst = overrun.burst * 0.6
        this.heat = Math.min(1, this.heat + 0.2)
      }
    }

    const idling = limit(1 - revs * 9, 0, 1) * (1 - drive)
    const hunt = this.steady ? 0 : this.wander.next() * 0.005 * idling
    const target = Math.max(60, this.rpm) * (1 + hunt)
    const burble = coasting && revs > 0.2 ? 1 : 0
    const rough = this.steady ? 0 : sound.roughness * (0.35 + 0.65 * idling) + 0.3 * burble
    const lope = this.steady ? 0 : sound.lope * idling + (0.06 + 0.16 * sound.pops) * burble
    const eased = this.effort
    const pulseSeconds = sound.pulse[0] + (sound.pulse[1] - sound.pulse[0]) * eased
    const inverseWidth = 1 / limit((pulseSeconds * target) / 120, 0.02, sound.duration)
    const pumping = this.cutting > 0.5 ? 0.06 : 0.34 - 0.22 * limit(revs * 4, 0, 1)
    const breathing = 0.75 + 0.25 * revs
    const rasp = sound.rasp * (0.4 + 0.6 * revs) * 1.3
    const bodyLift = 0.35 + 0.65 * eased
    const muffler = sound.muffler[0] + (sound.muffler[1] - sound.muffler[0]) * eased ** 0.8
    for (let side = 0; side < 2; side++) {
      const collector = this.collectors[side as 0 | 1]
      const skew = side ? 1.06 : 1
      for (let index = 0; index < 3; index++) {
        const shape = sound.body[index]
        if (!shape) continue
        const decibels = shape[2]
        collector.body[index as 0 | 1 | 2].peak(
          shape[0] * skew,
          shape[1],
          decibels * (decibels > 0 ? bodyLift : 1),
        )
      }
      collector.muffler.lowpass(muffler * (0.8 + 0.4 * revs), 0.75)
    }
    const reflectHeader = sound.reflection[0]
    const reflectTail = sound.reflection[1]
    const cross = this.twin ? sound.crossover : 1
    const blend = sound.volume / (1 + cross)
    const bang = 0.3 * sound.volume
    const bayLevel = 2.4 * sound.volume
    const intakeLevel = sound.intake.level * (0.25 + 0.75 * revs) * 0.5
    const intakeHiss = sound.intake.hiss
    const tickLevel = sound.valvetrain * (0.2 + 0.8 * revs) * 0.25
    const clatterLevel = sound.clatter * (0.55 + 0.45 * eased) * (1 - 0.45 * revs) * 0.6
    const rumbleLevel = sound.rumble * (0.5 + 0.5 * eased) * 0.5
    const whineStep = (Math.abs(this.speed) * 19) / rate
    const whineLevel =
      sound.whine * 0.012 * (0.2 + 0.8 * eased) * limit(Math.abs(this.speed) / 10, 0, 1)
    const tickFade = Math.exp(-1 / (0.0012 * rate))
    const knockFade = Math.exp(-1 / (0.0022 * rate))
    const popFade = Math.exp(-1 / (0.004 * rate))
    const follow = glide(0.03, rate)
    const press = glide(0.007, rate)
    const breathe = glide(0.03, rate)
    const tune = glide(0.02, rate)
    const cylinders = sound.cylinders
    const offsets = this.offsets
    const weights = this.weights
    const spans = this.spans
    const bank = this.bank
    const last = this.last
    const strength = this.strength
    const narrow = this.narrow
    const first = this.collectors[0]
    const second = this.collectors[1]
    const twin = this.twin
    let phase = this.phase
    let turning = this.turning
    let effort = this.effort
    let opening = this.opening
    let tick = this.tick
    let knock = this.knock
    let pop = this.pop
    let shade = this.shade
    let popMuffle = this.popMuffle
    let whinePhase = this.whinePhase
    let whistlePhase = this.whistlePhase
    let whistlePitch = this.whistlePitch
    let flutterPhase = this.flutterPhase
    const vent = this.vent

    for (let i = 0; i < count; i++) {
      turning += (target - turning) * follow
      effort += (drive - effort) * press
      opening += (pedal - opening) * breathe
      phase += turning / (120 * rate)
      if (phase >= 1) phase -= 1
      const sharp = 0.25 + 0.75 * effort
      let one = 0
      let two = 0
      let gulp = 0
      for (let c = 0; c < cylinders; c++) {
        let p = phase - (offsets[c] as number)
        if (p < 0) p += 1
        if (p < (last[c] as number)) {
          const weight = weights[c] as number
          let power = (pumping + (1 - pumping) * effort ** 0.75) * breathing * weight
          power *= 1 + rough * noise.next()
          if (lope > 0 && noise.unit() < lope) power *= 0.3
          narrow[c] = inverseWidth * (spans[c] as number)
          if (popChance > 0 && noise.unit() < popChance) {
            const bang = 0.35 + 0.65 * noise.unit()
            power += bang * (this.burst > 0 ? 0.9 : 0.45)
            pop += bang * (this.burst > 0 ? 1 : 0.5)
            narrow[c] = inverseWidth * 2.2
          }
          strength[c] = power
          tick = Math.max(tick, 0.45 + 0.55 * noise.unit())
          knock = Math.max(knock, (0.6 + 0.4 * noise.unit()) * weight)
        }
        last[c] = p
        const x = p * (narrow[c] as number)
        if (x < 1) {
          const rest = 1 - x
          const soft = x * rest * rest * 6.75
          const hard = rest * rest * rest * (x < 0.08 ? x * 16 : 1.28)
          const pulse = (strength[c] as number) * (soft + (hard - soft) * sharp)
          if (bank[c]) two += pulse
          else one += pulse
        }
        let q = p - 0.5
        if (q < 0) q += 1
        if (q < 0.25) gulp += q * (0.25 - q) * 64 * (weights[c] as number)
      }
      const flow = sound.flow * (0.5 + 0.5 * effort)
      const bite = 0.6 + rasp * effort
      const settle = 1 / (0.6 + 0.4 * bite)
      const white = noise.next()
      shade += (white - shade) * 0.35
      const airy = white - shade
      popMuffle += (white * pop - popMuffle) * 0.3
      pop *= popFade
      const crack = popMuffle * 1.6

      let a = one * (1 + flow * airy * 2.4) + crack
      a = first.header.run(a, reflectHeader)
      a = first.tail.run(a, reflectTail)
      a = (Math.tanh(a * bite - 0.1) + 0.099668) * settle
      a = first.body[0].run(a)
      a = first.body[1].run(a)
      a = first.body[2].run(a)
      a = first.blocker.run(first.muffler.run(a))
      let b = a
      if (twin) {
        b = two * (1 - flow * airy * 2.4) + crack
        b = second.header.run(b, reflectHeader)
        b = second.tail.run(b, reflectTail)
        b = (Math.tanh(b * bite - 0.1) + 0.099668) * settle
        b = second.body[0].run(b)
        b = second.body[1].run(b)
        b = second.body[2].run(b)
        b = second.blocker.run(second.muffler.run(b))
      }
      left[i] = (a + cross * b) * blend + crack * bang
      right[i] = (b + cross * a) * blend + crack * bang

      const draw = opening * Math.sqrt(opening)
      const breath =
        -gulp * draw * (1 + intakeHiss * white * 1.5) + white * draw * intakeHiss * 0.12
      const induction = this.plenum.run(this.runner.run(breath, 0.55))
      const roar = (induction * 0.5 + this.throat.run(induction) * 1.4) * intakeLevel
      tick *= tickFade
      knock *= knockFade
      const ticking = this.tickBand.run(white * tick) * tickLevel
      const rattle =
        clatterLevel > 0
          ? (this.clatterBand.run(white * knock) + this.knockBand.run(airy * knock) * 0.7) *
            clatterLevel
          : 0
      const block = this.rumbleBand.run(one + two) * rumbleLevel
      whinePhase += whineStep
      if (whinePhase >= 1) whinePhase -= 1
      const whine =
        whineLevel > 0
          ? (Math.sin(whinePhase * 6.2831853) + 0.35 * Math.sin(whinePhase * 12.5663706)) *
            whineLevel
          : 0
      bay[i] =
        this.bayBlocker.run(roar + ticking + rattle + block * 0.4 + whine + this.shifter.run()) *
        bayLevel

      if (boosted) {
        whistlePitch += (whistleTarget - whistlePitch) * tune
        whistlePhase += whistlePitch / rate
        if (whistlePhase >= 1) whistlePhase -= 1
        let out =
          Math.sin(whistlePhase * 6.2831853 + airy * 0.6) * whistleLevel +
          this.hissBand.run(white) * hissLevel
        if (vent > 0.001) {
          flutterPhase += flutterStep
          if (flutterPhase >= 1) flutterPhase -= 1
          const chop = flutterStep > 0 ? (flutterPhase < 0.45 ? 1 : 0.12) : 1
          out += this.ventBand.run(white) * vent * chop * boosted.level * 2.2
        }
        turbo[i] = this.turboBlocker.run(out) * 1.5
      } else turbo[i] = 0
    }
    this.phase = phase
    this.turning = turning
    this.effort = effort
    this.opening = opening
    this.tick = tick
    this.knock = knock
    this.pop = pop
    this.shade = shade
    this.popMuffle = popMuffle
    this.whinePhase = whinePhase
    this.whistlePhase = whistlePhase
    this.whistlePitch = whistlePitch
    this.flutterPhase = flutterPhase
  }
}

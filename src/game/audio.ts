import type { ObstacleMaterial } from './collision'
import type { CarPhysics, Input } from './physics'
import { engineProfiles } from './powertrain'
import {
  boostVoice,
  brakeSquealLevel,
  type CryVoice,
  cryVoice,
  earshot,
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
import { clamp, type Settings, type Vehicle } from './world'

const hornPitches = [415, 494]

export const mixLevels = {
  master: 1.6,
  engine: 0.32,
  road: 0.16,
  gravel: 0.22,
  rumble: 0.3,
  wind: 0.24,
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
}

interface NoiseLoop {
  gain: GainNode
  filter: BiquadFilterNode
}

interface EngineChain {
  oscillator: OscillatorNode
  sub: OscillatorNode
  filter: BiquadFilterNode
  gain: GainNode
  grit: GainNode
  rumble: GainNode
  clatterPulse: OscillatorNode
  clatter: GainNode
  turbo: OscillatorNode
  turboGain: GainNode
}

interface Loops {
  road: NoiseLoop
  gravel: NoiseLoop
  rumble: NoiseLoop
  wind: NoiseLoop
  scrape: NoiseLoop
  wade: NoiseLoop
  rain: NoiseLoop
  squealTone: OscillatorNode
  squealNoise: NoiseLoop
  squeal: GainNode
  brakeTone: OscillatorNode
  brake: GainNode
  boost: NoiseLoop
  boostTone: OscillatorNode
  boostWhine: GainNode
}

function saturation(amount: number) {
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  return curve
}

export class DriveAudio {
  private context?: AudioContext
  private master?: GainNode
  private cabin?: BiquadFilterNode
  private mix?: GainNode
  private noise?: AudioBuffer
  private engine?: EngineChain
  private loops?: Loops
  private vehicle?: Vehicle
  private hits = -1
  private lastHitAt = 0
  private lastThrottle = 0
  private brakeHeld = 0
  private boostHeld = 0
  private shifts = -1
  private lastLimitAt = 0
  private hornGain?: GainNode
  hornHeld = false

  start(volume: number) {
    if (this.context) {
      void this.context.resume()
      return
    }
    const context = new AudioContext()
    this.context = context
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this.noise = buffer
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.knee.value = 10
    compressor.ratio.value = 4
    compressor.attack.value = 0.004
    compressor.release.value = 0.2
    compressor.connect(context.destination)
    this.master = context.createGain()
    this.master.gain.value = volume * mixLevels.master
    this.master.connect(compressor)
    this.cabin = context.createBiquadFilter()
    this.cabin.type = 'lowpass'
    this.cabin.frequency.value = 20000
    this.cabin.connect(this.master)
    this.mix = context.createGain()
    this.mix.connect(this.cabin)
    this.engine = this.createEngine(context, this.mix)
    this.loops = this.createLoops(context, this.mix)
    this.hornGain = this.createHorn(context, this.master)
  }

  thunder(delay: number) {
    const { context } = this
    if (!context) return
    const t = context.currentTime + delay
    this.burst(t, 140, 0.7, mixLevels.thunder, 0.5, 'lowpass')
    this.burst(t + 0.3, 90, 0.6, mixLevels.thunder * 0.7, 0.9, 'lowpass')
  }

  cry(voice: CryVoice, scream: boolean, distance: number, delay = 0) {
    const { context, mix } = this
    if (!context || !mix) return
    const shape = cryVoice(voice, scream, Math.random())
    const level = mixLevels.voice * earshot(distance) * shape.peak
    if (level < 0.004) return
    const t = context.currentTime + delay
    const source = context.createOscillator()
    source.type = 'sawtooth'
    source.frequency.setValueAtTime(shape.pitch * 0.82, t)
    source.frequency.linearRampToValueAtTime(shape.pitch * shape.leap, t + shape.length * 0.22)
    source.frequency.linearRampToValueAtTime(shape.pitch * shape.fall, t + shape.length)
    const waver = context.createOscillator()
    waver.frequency.value = 6.3
    const depth = context.createGain()
    depth.gain.value = shape.pitch * 0.035
    waver.connect(depth).connect(source.frequency)
    const output = context.createGain()
    output.gain.setValueAtTime(0, t)
    output.gain.linearRampToValueAtTime(level, t + 0.035)
    output.gain.setValueAtTime(level, t + shape.length * 0.6)
    output.gain.linearRampToValueAtTime(0, t + shape.length)
    output.connect(mix)
    for (const formant of shape.formants) {
      const band = context.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = formant.frequency
      band.Q.value = formant.q
      const share = context.createGain()
      share.gain.value = formant.gain * 2.4
      source.connect(band).connect(share).connect(output)
    }
    source.start(t)
    waver.start(t)
    source.stop(t + shape.length + 0.05)
    waver.stop(t + shape.length + 0.05)
    this.burst(t, 2400, 0.7, level * 0.3, shape.length * 0.3)
  }

  thud(distance: number, heavy: number) {
    const { context } = this
    if (!context) return
    const t = context.currentTime
    const level = mixLevels.impact * earshot(distance) * (0.5 + 0.5 * heavy)
    this.tone(t, 150, 58, level, 0.09)
    this.burst(t, 420, 0.8, level * 0.8, 0.06, 'lowpass')
    this.burst(t + 0.015, 1900, 0.9, level * 0.3, 0.035)
  }

  private createHorn(context: AudioContext, output: AudioNode) {
    const gain = context.createGain()
    gain.gain.value = 0
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 2400
    filter.connect(gain)
    gain.connect(output)
    for (const pitch of hornPitches) {
      const voice = context.createOscillator()
      voice.type = 'sawtooth'
      voice.frequency.value = pitch
      voice.connect(filter)
      voice.start()
    }
    return gain
  }

  update(car: CarPhysics, input: Input, settings: Settings, paused: boolean, dt: number) {
    const { context, engine, loops, master, cabin } = this
    if (!context || !engine || !loops || !master || !cabin) return
    const t = context.currentTime
    master.gain.setTargetAtTime(paused ? 0 : settings.volume * mixLevels.master, t, 0.15)
    if (this.vehicle !== settings.vehicle) this.configure(settings.vehicle)
    const vehicle = settings.vehicle
    const voice = engineVoices[vehicle]
    const profile = engineProfiles[vehicle]
    const { rpm, load } = car.gearbox
    const tone = engineTone(voice, profile, rpm, load)
    engine.oscillator.frequency.setTargetAtTime(tone.cycle, t, 0.03)
    engine.sub.frequency.setTargetAtTime(tone.firing / 2, t, 0.03)
    engine.filter.frequency.setTargetAtTime(tone.cutoff, t, 0.05)
    engine.gain.gain.setTargetAtTime(tone.gain * mixLevels.engine, t, 0.05)
    engine.grit.gain.setTargetAtTime(tone.grit, t, 0.05)
    engine.rumble.gain.setTargetAtTime(tone.rumble * 0.6, t, 0.08)
    engine.clatterPulse.frequency.setTargetAtTime(tone.firing, t, 0.03)
    engine.clatter.gain.setTargetAtTime(tone.clatter, t, 0.08)
    engine.turbo.frequency.setTargetAtTime(tone.turboPitch, t, 0.2)
    engine.turboGain.gain.setTargetAtTime(tone.turbo * 0.05, t, 0.15)

    const speed = Math.abs(car.speed)
    const set = (node: GainNode, value: number, smoothing = 0.08) =>
      node.gain.setTargetAtTime(value, t, smoothing)
    set(loops.road.gain, roadLevel(speed, car.offroad) * mixLevels.road, 0.12)
    loops.road.filter.frequency.setTargetAtTime(240 + speed * 14, t, 0.2)
    const gravel = gravelLevel(speed, car.offroad, car.sand, car.slip)
    set(loops.gravel.gain, gravel * mixLevels.gravel * (0.55 + Math.random() * 0.9), 0.025)
    set(loops.rumble.gain, gravel * mixLevels.rumble, 0.1)
    const surge = car.boosting ? 1 : 0
    const boosted = surge && !paused
    if (boosted && !this.boostHeld) {
      this.burst(t, 1500, 0.7, mixLevels.boost * 1.5, 0.16)
      this.burst(t + 0.02, 4200, 0.6, mixLevels.boost * 0.7, 0.09, 'highpass')
      this.tone(t, 120, 52, mixLevels.boost * 1.6, 0.14)
    }
    if (!boosted && this.boostHeld > 0.25) {
      this.burst(t, 3400, 0.5, mixLevels.boost * 1.1, 0.2, 'highpass')
      this.tone(t, 420, 140, mixLevels.boostWhine * 2.2, 0.16)
    }
    this.boostHeld = boosted ? this.boostHeld + dt : 0
    const jet = boostVoice(this.boostHeld, car.nitro.level)
    set(loops.boost.gain, boosted ? jet.hiss * mixLevels.boost : 0, boosted ? 0.07 : 0.12)
    loops.boost.filter.frequency.setTargetAtTime(jet.band, t, 0.2)
    set(loops.boostWhine, boosted ? jet.whine * mixLevels.boostWhine : 0, boosted ? 0.1 : 0.08)
    loops.boostTone.frequency.setTargetAtTime(boosted ? jet.pitch : 150, t, 0.25)
    set(loops.wind.gain, windLevel(speed) * mixLevels.wind * (1 + surge * 1.6), 0.25)
    loops.wind.filter.frequency.setTargetAtTime(280 + speed * 30 + surge * 900, t, 0.3)
    this.hornGain?.gain.setTargetAtTime(this.hornHeld && !paused ? mixLevels.horn : 0, t, 0.02)
    const squeal = squealLevel(car.slip, speed, car.offroad)
    set(loops.squeal, squeal * mixLevels.squeal, 0.06)
    loops.squealTone.frequency.setTargetAtTime(tirePitch[vehicle] * (0.92 + 0.16 * squeal), t, 0.1)
    const brakeSqueal = brakeSquealLevel(speed, input.brake)
    set(loops.brake, brakeSqueal * mixLevels.brakeSqueal * (vehicle === 'bus' ? 1.8 : 1), 0.1)
    set(loops.scrape.gain, scrapeLevel(car.scrapeMaterial, car.scrape) * mixLevels.scrape, 0.04)
    loops.scrape.filter.frequency.setTargetAtTime(
      car.scrapeMaterial === 'rail' ? 1700 + speed * 40 : 600 + speed * 10,
      t,
      0.1,
    )
    set(
      loops.wade.gain,
      wadeLevel(car.wading, speed) * mixLevels.wade * (0.7 + Math.random() * 0.6),
      0.05,
    )
    set(
      loops.rain.gain,
      settings.weather === 'storm'
        ? mixLevels.rain * 1.7
        : settings.weather === 'rain'
          ? mixLevels.rain
          : 0,
      1,
    )
    const enclosed = settings.camera === 'bonnet' && vehicle !== 'motorcycle'
    cabin.frequency.setTargetAtTime(enclosed ? 4800 : 20000, t, 0.3)

    if (this.hits < 0) this.hits = car.hits
    if (car.hits !== this.hits) {
      this.hits = car.hits
      if (!paused && t - this.lastHitAt > 0.08) {
        this.lastHitAt = t
        this.impact(car.hitMaterial, car.hitStrength, vehicle)
      }
    }
    const revs = clamp((rpm - profile.idle) / (profile.redline - profile.idle), 0, 1)
    const box = car.gearbox
    if (this.shifts < 0) this.shifts = box.shifts
    if (box.shifts !== this.shifts) {
      this.shifts = box.shifts
      if (box.manual && !paused) {
        this.tone(t, 150, 70, mixLevels.engine * 0.5, 0.035)
        this.burst(t, 1900, 1.4, mixLevels.engine * 0.35, 0.02)
        if (revs > 0.7 && input.throttle > 0.5) this.pops(0.35 + revs * 0.4)
      }
    }
    if (box.limited && !paused && t - this.lastLimitAt > 0.11) {
      this.lastLimitAt = t
      this.burst(t, 1100 + Math.random() * 500, 1.3, mixLevels.engine * 0.5, 0.014)
    }
    const pop = liftOffPop(voice, revs, this.lastThrottle, input.throttle)
    if (pop > 0 && !paused) this.pops(pop)
    this.lastThrottle = input.throttle
    if (vehicle === 'bus') {
      if (input.brake > 0.3 && speed > 0.5) this.brakeHeld += dt
      else if (input.brake < 0.05) {
        if (this.brakeHeld > 0.4 && !paused) this.airBrake()
        this.brakeHeld = 0
      }
    }
  }

  dispose() {
    void this.context?.close()
  }

  private configure(vehicle: Vehicle) {
    const { context, engine } = this
    if (!context || !engine) return
    this.vehicle = vehicle
    const voice = engineVoices[vehicle]
    const { real, imag } = engineSpectrum(voice)
    engine.oscillator.setPeriodicWave(context.createPeriodicWave(real, imag))
    engine.filter.Q.value = voice.resonance
    this.brakeHeld = 0
  }

  private noiseSource(context: AudioContext) {
    const source = context.createBufferSource()
    source.buffer = this.noise ?? null
    source.loop = true
    source.start(0, Math.random() * 2)
    return source
  }

  private noiseLoop(
    context: AudioContext,
    output: AudioNode,
    type: BiquadFilterType,
    frequency: number,
    q = 1,
  ): NoiseLoop {
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = context.createGain()
    gain.gain.value = 0
    this.noiseSource(context).connect(filter).connect(gain).connect(output)
    return { gain, filter }
  }

  private createEngine(context: AudioContext, output: AudioNode): EngineChain {
    const gain = context.createGain()
    gain.gain.value = 0
    gain.connect(output)
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.connect(gain)
    const oscillator = context.createOscillator()
    oscillator.frequency.value = 7
    oscillator.connect(filter)
    const shaper = context.createWaveShaper()
    shaper.curve = saturation(4)
    shaper.oversample = '2x'
    const grit = context.createGain()
    grit.gain.value = 0
    oscillator.connect(shaper).connect(grit).connect(filter)
    oscillator.start()
    const sub = context.createOscillator()
    sub.type = 'sine'
    const rumble = context.createGain()
    rumble.gain.value = 0
    sub.connect(rumble).connect(gain)
    sub.start()
    const clatterPulse = context.createOscillator()
    clatterPulse.type = 'square'
    const rectifier = context.createWaveShaper()
    rectifier.curve = new Float32Array([0, 0, 1])
    const clatter = context.createGain()
    clatter.gain.value = 0
    const clatterBody = context.createGain()
    clatterBody.gain.value = 0
    const clatterBand = context.createBiquadFilter()
    clatterBand.type = 'bandpass'
    clatterBand.frequency.value = 2600
    clatterBand.Q.value = 1.4
    clatterPulse.connect(rectifier).connect(clatter).connect(clatterBody.gain)
    this.noiseSource(context).connect(clatterBand).connect(clatterBody).connect(gain)
    clatterPulse.start()
    const turbo = context.createOscillator()
    turbo.type = 'sine'
    const turboGain = context.createGain()
    turboGain.gain.value = 0
    turbo.connect(turboGain).connect(output)
    turbo.start()
    return {
      oscillator,
      sub,
      filter,
      gain,
      grit,
      rumble,
      clatterPulse,
      clatter,
      turbo,
      turboGain,
    }
  }

  private createLoops(context: AudioContext, output: AudioNode): Loops {
    const squeal = context.createGain()
    squeal.gain.value = 0
    squeal.connect(output)
    const squealTone = context.createOscillator()
    squealTone.type = 'triangle'
    const wobble = context.createOscillator()
    wobble.frequency.value = 9
    const wobbleDepth = context.createGain()
    wobbleDepth.gain.value = 40
    wobble.connect(wobbleDepth).connect(squealTone.frequency)
    const squealToneGain = context.createGain()
    squealToneGain.gain.value = 0.5
    squealTone.connect(squealToneGain).connect(squeal)
    squealTone.start()
    wobble.start()
    const squealNoise = this.noiseLoop(context, squeal, 'bandpass', 1150, 9)
    squealNoise.gain.gain.value = 1.4
    const brake = context.createGain()
    brake.gain.value = 0
    brake.connect(output)
    const brakeTone = context.createOscillator()
    brakeTone.type = 'sine'
    brakeTone.frequency.value = 3150
    brakeTone.connect(brake)
    brakeTone.start()
    const rain = this.noiseLoop(context, output, 'highpass', 1400, 0.5)
    const rainTop = context.createBiquadFilter()
    rainTop.type = 'lowpass'
    rainTop.frequency.value = 7500
    rain.filter.disconnect()
    rain.filter.connect(rainTop).connect(rain.gain)
    const boost = this.noiseLoop(context, output, 'bandpass', 1200, 0.9)
    const boostWhine = context.createGain()
    boostWhine.gain.value = 0
    const boostFilter = context.createBiquadFilter()
    boostFilter.type = 'lowpass'
    boostFilter.frequency.value = 1800
    const boostTone = context.createOscillator()
    boostTone.type = 'sawtooth'
    boostTone.frequency.value = 150
    boostTone.connect(boostFilter).connect(boostWhine).connect(output)
    boostTone.start()
    return {
      boost,
      boostTone,
      boostWhine,
      road: this.noiseLoop(context, output, 'lowpass', 300, 0.7),
      gravel: this.noiseLoop(context, output, 'bandpass', 1700, 0.9),
      rumble: this.noiseLoop(context, output, 'lowpass', 140, 1),
      wind: this.noiseLoop(context, output, 'lowpass', 400, 0.6),
      scrape: this.noiseLoop(context, output, 'bandpass', 1800, 2.2),
      wade: this.noiseLoop(context, output, 'lowpass', 700, 1.2),
      rain,
      squealTone,
      squealNoise,
      squeal,
      brakeTone,
      brake,
    }
  }

  private burst(
    t: number,
    band: number,
    q: number,
    peak: number,
    decay: number,
    type: BiquadFilterType = 'bandpass',
  ) {
    const { context, mix } = this
    if (!context || !mix || !this.noise) return
    const source = context.createBufferSource()
    source.buffer = this.noise
    source.loop = true
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.value = band
    filter.Q.value = q
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.004)
    gain.gain.setTargetAtTime(0, t + 0.004, decay)
    source.connect(filter).connect(gain).connect(mix)
    source.start(t, Math.random() * 1.5)
    source.stop(t + decay * 7 + 0.05)
  }

  private tone(t: number, from: number, to: number, peak: number, decay: number) {
    const { context, mix } = this
    if (!context || !mix) return
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(from, t)
    oscillator.frequency.exponentialRampToValueAtTime(to, t + Math.min(0.15, decay))
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.003)
    gain.gain.setTargetAtTime(0, t + 0.003, decay)
    oscillator.connect(gain).connect(mix)
    oscillator.start(t)
    oscillator.stop(t + decay * 7 + 0.05)
  }

  private impact(material: ObstacleMaterial, strength: number, vehicle: Vehicle) {
    const context = this.context
    if (!context) return
    const t = context.currentTime
    const voice = impactVoice(material, strength, vehicle)
    const level = mixLevels.impact
    this.tone(t, voice.thumpPitch * 2, voice.thumpPitch, voice.thump * level, 0.09)
    for (const partial of voice.partials)
      this.tone(
        t,
        partial.frequency * 1.02,
        partial.frequency,
        partial.gain * level * 0.6,
        partial.decay / 3,
      )
    this.burst(t, voice.noiseBand, 1.1, voice.noiseGain * level, voice.noiseDecay / 3)
    if (voice.crunch > 0) {
      this.burst(t + 0.01, 1400, 0.6, voice.crunch * level * 0.7, 0.07)
      this.burst(t + 0.05, 3200, 0.8, voice.crunch * level * 0.35, 0.05)
    }
    if (material === 'trunk')
      this.burst(t + 0.03, 5200, 0.5, voice.noiseGain * level * 0.25, 0.18, 'highpass')
  }

  private pops(level: number) {
    const context = this.context
    if (!context) return
    const t = context.currentTime
    const count = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i++) {
      const at = t + 0.05 + i * (0.05 + Math.random() * 0.09)
      this.burst(at, 900 + Math.random() * 700, 1.2, level * 0.22 * (1 - i * 0.15), 0.012)
    }
  }

  private airBrake() {
    const context = this.context
    if (!context) return
    this.burst(context.currentTime, 2600, 0.4, 0.12, 0.22, 'highpass')
  }
}

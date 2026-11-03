import type { ObstacleMaterial } from './collision'
import type { CarPhysics, Input } from './physics'
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
import { clamp, type Settings, type Vehicle } from './world'

export const mixLevels = {
  master: 1.6,
  engine: 0.32,
  road: 0.16,
  gravel: 0.22,
  rumble: 0.3,
  wind: 0.24,
  squeal: 0.11,
  brakeSqueal: 0.03,
  scrape: 0.28,
  wade: 0.35,
  rain: 0.07,
  impact: 0.55,
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
    set(loops.wind.gain, windLevel(speed) * mixLevels.wind, 0.25)
    loops.wind.filter.frequency.setTargetAtTime(280 + speed * 30, t, 0.3)
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
    set(loops.rain.gain, settings.weather === 'rain' ? mixLevels.rain : 0, 1)
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
    return {
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

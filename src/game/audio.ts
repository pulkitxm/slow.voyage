import type { ObstacleMaterial } from './collision'
import type { CarPhysics, Input } from './physics'
import {
  boostVoice,
  type CryVoice,
  cryVoice,
  earshot,
  echoPitch,
  hornVoices,
  impactVoice,
  listening,
  mixLevels,
  passing,
} from './sound-design'
import { SoundFrame } from './sound-frame'
import {
  channelIndex,
  paramIndex,
  SoundSynth,
  soundChannels,
  soundParams,
  synthName,
} from './sound-synth'
import workletUrl from './sound-worklet.ts?worker&url'
import {
  ambienceLevels,
  echoDelay,
  freshAmbience,
  freshSurroundings,
  impulseResponse,
  type Space,
  spaceMix,
  spaces,
  surveySurroundings,
} from './soundscape'
import { clamp, type Settings, type Vehicle } from './world'

export const masterBus = {
  glue: { threshold: -16, knee: 12, ratio: 3, attack: 0.008, release: 0.25 },
  limit: { threshold: -7, knee: 0, ratio: 20, attack: 0.001, release: 0.06 },
  trim: 0.63,
  ceiling: 0.84,
  knee: 0.6,
  survey: 0.25,
  rest: 1.5,
  faint: 0.02,
  fallback: 1024,
}

export interface Passer {
  ahead: number
  aside: number
}

interface NoiseLoop {
  gain: GainNode
  filter: BiquadFilterNode
}

interface Boost {
  hiss: NoiseLoop
  tone: OscillatorNode
  whine: GainNode
}

interface Horn {
  gain: GainNode
  voices: OscillatorNode[]
  echoVoices: OscillatorNode[]
  echoGain: GainNode
  echoDelay: DelayNode
}

interface Rig {
  context: BaseAudioContext
  master: GainNode
  mix: GainNode
  outside: GainNode
  cabin: BiquadFilterNode
  echo: GainNode
  wet: Record<Space, GainNode>
  exhaust: GainNode
  bay: GainNode
  turbo: GainNode
  body: GainNode
  noise: AudioBuffer
  boost: Boost
  horn: Horn
}

function ceilingCurve() {
  const { ceiling, knee } = masterBus
  const curve = new Float32Array(2049)
  const room = ceiling - knee
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    const size = Math.abs(x)
    const shaped = size <= knee ? size : knee + room * Math.tanh((size - knee) / room)
    curve[i] = Math.sign(x) * shaped
  }
  return curve
}

function cents(ratio: number) {
  return 1200 * Math.log2(ratio)
}

export class DriveAudio {
  private rig?: Rig
  private frame = new SoundFrame()
  private sent = new Float32Array(soundParams.length).fill(Number.NaN)
  private targets: AudioParam[] = []
  private synth?: SoundSynth
  private around = freshSurroundings()
  private ambience = freshAmbience()
  private spaceLevels: Record<Space, number> = { open: 0.6, cut: 0, forest: 0 }
  private surveyed = Number.POSITIVE_INFINITY
  private vehicle?: Vehicle
  private hits = -1
  private lastHitAt = 0
  private brakeHeld = 0
  private boostHeld = 0
  private silence = 0
  private resting = false
  ready: Promise<void> = Promise.resolve()
  worklet = false
  hornHeld = false

  start(volume: number, context: BaseAudioContext = new AudioContext()) {
    if (this.rig) {
      this.resting = false
      this.silence = 0
      if (this.rig.context instanceof AudioContext) void this.rig.context.resume()
      return
    }
    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const clip = context.createWaveShaper()
    clip.curve = ceilingCurve()
    clip.connect(context.destination)
    const limiter = context.createDynamicsCompressor()
    const glue = context.createDynamicsCompressor()
    for (const [node, shape] of [
      [glue, masterBus.glue],
      [limiter, masterBus.limit],
    ] as const) {
      node.threshold.value = shape.threshold
      node.knee.value = shape.knee
      node.ratio.value = shape.ratio
      node.attack.value = shape.attack
      node.release.value = shape.release
    }
    const trim = context.createGain()
    trim.gain.value = masterBus.trim
    glue.connect(trim).connect(limiter).connect(clip)
    const master = context.createGain()
    master.gain.value = volume * mixLevels.master
    master.connect(glue)
    const mix = context.createGain()
    mix.connect(master)
    const cabin = context.createBiquadFilter()
    cabin.type = 'lowpass'
    cabin.frequency.value = 20000
    cabin.Q.value = 0.6
    cabin.connect(mix)
    const outside = context.createGain()
    outside.connect(cabin)
    const echo = context.createGain()
    echo.gain.value = mixLevels.echo
    const wet = {} as Record<Space, GainNode>
    for (const space of spaces) {
      const [left, right] = impulseResponse(space, context.sampleRate)
      const response = context.createBuffer(2, left.length, context.sampleRate)
      response.getChannelData(0).set(left)
      response.getChannelData(1).set(right)
      const room = context.createConvolver()
      room.normalize = false
      room.buffer = response
      const level = context.createGain()
      level.gain.value = this.spaceLevels[space]
      echo.connect(level).connect(room).connect(outside)
      wet[space] = level
    }
    const level = (value: number, output: AudioNode) => {
      const gain = context.createGain()
      gain.gain.value = value
      gain.connect(output)
      return gain
    }
    const rig: Rig = {
      context,
      master,
      mix,
      outside,
      cabin,
      echo,
      wet,
      noise,
      exhaust: level(mixLevels.engine, outside),
      bay: level(0, mix),
      turbo: level(0, mix),
      body: level(0, mix),
      boost: this.createBoost(context, noise, outside),
      horn: this.createHorn(context, outside, echo),
    }
    this.rig = rig
    this.ready = this.attach(rig)
  }

  private async attach(rig: Rig) {
    const { context } = rig
    const count = soundChannels.length
    let source: AudioNode
    try {
      await context.audioWorklet.addModule(workletUrl)
      const node = new AudioWorkletNode(context, synthName, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [count],
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
      })
      this.targets = soundParams.map((name) => node.parameters.get(name) as AudioParam)
      this.worklet = true
      source = node
    } catch {
      const synth = new SoundSynth(context.sampleRate, 1)
      const node = context.createScriptProcessor(masterBus.fallback, 0, count)
      const channels: Float32Array[] = []
      node.onaudioprocess = (event) => {
        const buffer = event.outputBuffer
        for (let channel = 0; channel < count; channel++)
          channels[channel] = buffer.getChannelData(channel)
        synth.render(channels, buffer.length)
      }
      this.synth = synth
      source = node
    }
    const splitter = context.createChannelSplitter(count)
    source.connect(splitter)
    const pair = (left: number, right: number, ...outputs: AudioNode[]) => {
      const merger = context.createChannelMerger(2)
      splitter.connect(merger, left, 0)
      splitter.connect(merger, right, 1)
      for (const output of outputs) merger.connect(output)
    }
    const send = (value: number) => {
      const gain = context.createGain()
      gain.gain.value = value
      gain.connect(rig.echo)
      return gain
    }
    const at = channelIndex
    pair(at.exhaustLeft, at.exhaustRight, rig.exhaust)
    rig.exhaust.connect(send(1.4))
    pair(at.tyresLeft, at.tyresRight, rig.outside, send(0.5))
    pair(at.windLeft, at.windRight, rig.outside)
    pair(at.ambienceLeft, at.ambienceRight, rig.outside)
    splitter.connect(rig.outside, at.debris)
    splitter.connect(send(0.6), at.debris)
    splitter.connect(rig.bay, at.bay)
    splitter.connect(rig.turbo, at.turbo)
    splitter.connect(rig.body, at.cabin)
  }

  thunder(delay: number) {
    const { rig } = this
    if (!rig) return
    const t = rig.context.currentTime + delay
    this.burst(t, 140, 0.7, mixLevels.thunder, 0.5, 'lowpass')
    this.burst(t + 0.3, 90, 0.6, mixLevels.thunder * 0.7, 0.9, 'lowpass')
    this.burst(t, 2400, 0.5, mixLevels.thunder * 0.12, 0.12, 'bandpass')
  }

  cry(voice: CryVoice, scream: boolean, distance: number, delay = 0, passer?: Passer, speed = 0) {
    const { rig } = this
    if (!rig) return
    const { context } = rig
    const shape = cryVoice(voice, scream, Math.random())
    const level = mixLevels.voice * earshot(distance) * shape.peak
    if (level < 0.004) return
    const t = context.currentTime + delay
    const end = t + shape.length
    const from = passer ? passing(passer.ahead, passer.aside, speed, delay) : null
    const to = passer ? passing(passer.ahead, passer.aside, speed, delay + shape.length) : null
    const shift = from ? from.pitch : 1
    const output = context.createGain()
    output.gain.setValueAtTime(0, t)
    output.gain.linearRampToValueAtTime(level, t + shape.attack)
    output.gain.setValueAtTime(level, t + shape.length * 0.6)
    output.gain.linearRampToValueAtTime(0, end)
    const air = context.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = from ? from.brightness : 20000
    const place = context.createStereoPanner()
    place.pan.setValueAtTime(from ? from.pan : 0, t)
    if (to) place.pan.linearRampToValueAtTime(to.pan, end)
    output.connect(air).connect(place)
    place.connect(rig.outside)
    place.connect(rig.echo)
    const waver = context.createOscillator()
    waver.frequency.value = shape.waver
    const depth = context.createGain()
    depth.gain.value = shape.pitch * 0.035
    waver.connect(depth)
    const tremor = context.createOscillator()
    tremor.frequency.value = 19 + Math.random() * 9
    const shake = context.createGain()
    shake.gain.value = shape.pitch * shape.jitter
    tremor.connect(shake)
    const breath = context.createBufferSource()
    breath.buffer = rig.noise
    breath.loop = true
    const airiness = context.createGain()
    airiness.gain.value = shape.breath
    breath.connect(airiness)
    const cords = [1, 1.006].map((detune) => {
      const source = context.createOscillator()
      source.type = 'sawtooth'
      source.frequency.setValueAtTime(shape.pitch * 0.82 * detune, t)
      source.frequency.linearRampToValueAtTime(
        shape.pitch * shape.leap * detune,
        t + shape.length * 0.22,
      )
      source.frequency.linearRampToValueAtTime(shape.pitch * shape.fall * detune, end)
      if (from && to) {
        source.detune.setValueAtTime(cents(from.pitch), t)
        source.detune.linearRampToValueAtTime(cents(to.pitch), end)
      }
      depth.connect(source.frequency)
      shake.connect(source.frequency)
      source.start(t)
      source.stop(end + 0.05)
      return source
    })
    for (const formant of shape.formants) {
      const band = context.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = formant.frequency * shift
      band.Q.value = formant.q
      const share = context.createGain()
      share.gain.value = formant.gain * 1.15
      for (const source of cords) source.connect(band)
      airiness.connect(band)
      band.connect(share).connect(output)
    }
    for (const node of [waver, tremor]) {
      node.start(t)
      node.stop(end + 0.05)
    }
    breath.start(t, Math.random() * 1.5)
    breath.stop(end + 0.05)
    this.burst(
      t,
      (voice === 'man' ? 1500 : 2800) * shift,
      0.7,
      level * shape.rasp,
      shape.length * 0.5,
    )
  }

  brushed(hard: boolean) {
    const { rig } = this
    if (!rig) return
    const t = rig.context.currentTime
    if (hard) {
      this.tone(t, 420, 180, mixLevels.impact * 0.5, 0.03)
      this.burst(t, 2600, 1.2, mixLevels.impact * 0.45, 0.025)
    } else {
      this.burst(t, 3200, 0.5, mixLevels.impact * 0.5, 0.16, 'highpass')
      this.burst(t + 0.04, 900, 0.7, mixLevels.impact * 0.3, 0.1)
    }
  }

  thud(distance: number, heavy: number) {
    const { rig } = this
    if (!rig) return
    const t = rig.context.currentTime
    const level = mixLevels.impact * earshot(distance) * (0.5 + 0.5 * heavy)
    this.tone(t, 96, 38, level * 0.9, 0.14)
    this.burst(t, 150, 0.7, level * 0.7, 0.1, 'lowpass')
    this.tone(t, 150, 58, level, 0.09)
    this.burst(t, 420, 0.8, level * 0.8, 0.06, 'lowpass')
    this.burst(t + 0.015, 1900, 0.9, level * 0.3, 0.035)
  }

  update(
    car: CarPhysics,
    input: Input,
    settings: Settings,
    paused: boolean,
    dt: number,
    clock = 0,
  ) {
    const { rig } = this
    if (!rig) return
    const { context } = rig
    const t = context.currentTime
    rig.master.gain.setTargetAtTime(paused ? 0 : settings.volume * mixLevels.master, t, 0.15)
    const silent = paused || settings.volume <= 0
    this.silence = silent ? this.silence + dt : 0
    if (context instanceof AudioContext) {
      if (silent && this.silence > masterBus.rest && !this.resting) {
        this.resting = true
        void context.suspend()
      }
      if (!silent && this.resting) {
        this.resting = false
        void context.resume()
      }
    }
    const vehicle = settings.vehicle
    if (this.vehicle !== vehicle) {
      this.vehicle = vehicle
      this.brakeHeld = 0
      this.frame.reset()
      const pitches = hornVoices[vehicle]
      for (const [index, voice] of rig.horn.voices.entries())
        voice.frequency.setValueAtTime(pitches[index >> 1] ?? 440, t)
    }
    this.surveyed += dt
    if (this.surveyed >= masterBus.survey) {
      this.surveyed = 0
      surveySurroundings(car.world, car.x, car.s, car.yaw, this.around)
      ambienceLevels(settings, clock, this.around, this.ambience)
      spaceMix(this.around, this.spaceLevels)
      for (const space of spaces) {
        const send = rig.wet[space].gain
        const level = this.spaceLevels[space]
        send.cancelScheduledValues(t)
        send.setValueAtTime(send.value, t)
        send.linearRampToValueAtTime(level < masterBus.faint ? 0 : level, t + masterBus.survey)
      }
      rig.horn.echoDelay.delayTime.setTargetAtTime(echoDelay(this.around), t, 0.5)
    }
    const values = this.frame.update(car, input, settings, this.ambience, dt)
    values[paramIndex.fallsPan] = this.around.fallsPan
    if (this.synth) this.synth.params.set(values)
    else {
      const sent = this.sent
      const targets = this.targets
      for (let index = 0; index < targets.length; index++) {
        const value = values[index] as number
        if (value === sent[index]) continue
        sent[index] = value
        ;(targets[index] as AudioParam).value = value
      }
    }

    const speed = Math.abs(car.speed)
    const heard = listening(settings.camera, vehicle)
    rig.exhaust.gain.setTargetAtTime(heard.exhaust * mixLevels.engine, t, 0.2)
    rig.bay.gain.setTargetAtTime(heard.bay * mixLevels.engine * mixLevels.intake * 2, t, 0.2)
    rig.turbo.gain.setTargetAtTime(heard.turbo * mixLevels.turbo * 11, t, 0.2)
    rig.body.gain.setTargetAtTime(heard.cabin * mixLevels.drumming, t, 0.2)
    rig.outside.gain.setTargetAtTime(heard.outside, t, 0.2)
    rig.cabin.frequency.setTargetAtTime(heard.muffle, t, 0.3)

    const boosted = car.boosting && !paused
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
    const { boost, horn } = rig
    boost.hiss.gain.gain.setTargetAtTime(
      boosted ? jet.hiss * mixLevels.boost : 0,
      t,
      boosted ? 0.07 : 0.12,
    )
    boost.hiss.filter.frequency.setTargetAtTime(jet.band, t, 0.2)
    boost.whine.gain.setTargetAtTime(
      boosted ? jet.whine * mixLevels.boostWhine : 0,
      t,
      boosted ? 0.1 : 0.08,
    )
    boost.tone.frequency.setTargetAtTime(boosted ? jet.pitch : 150, t, 0.25)

    const sounding = this.hornHeld && !paused
    horn.gain.gain.setTargetAtTime(sounding ? mixLevels.horn : 0, t, 0.02)
    const returning = clamp(0.25 + 0.75 * this.around.enclosure + 0.3 * this.around.forest, 0, 1)
    horn.echoGain.gain.setTargetAtTime(sounding ? mixLevels.horn * 0.55 * returning : 0, t, 0.02)
    const shifted = echoPitch(speed)
    const pitches = hornVoices[vehicle]
    for (let index = 0; index < horn.echoVoices.length; index++)
      horn.echoVoices[index]?.frequency.setTargetAtTime(
        (pitches[index >> 1] ?? 440) * shifted,
        t,
        0.1,
      )

    if (this.hits < 0) this.hits = car.hits
    if (car.hits !== this.hits) {
      this.hits = car.hits
      if (!paused && t - this.lastHitAt > 0.08) {
        this.lastHitAt = t
        this.impact(car.hitMaterial, car.hitStrength, vehicle)
      }
    }
    if (vehicle === 'bus') {
      if (input.brake > 0.3 && speed > 0.5) this.brakeHeld += dt
      else if (input.brake < 0.05) {
        if (this.brakeHeld > 0.4 && !paused) this.airBrake()
        this.brakeHeld = 0
      }
    }
  }

  dispose() {
    const context = this.rig?.context
    if (context instanceof AudioContext) void context.close()
  }

  private createHorn(context: BaseAudioContext, output: AudioNode, echo: AudioNode): Horn {
    const shaped = (target: AudioNode) => {
      const gain = context.createGain()
      gain.gain.value = 0
      const bell = context.createBiquadFilter()
      bell.type = 'peaking'
      bell.frequency.value = 2700
      bell.Q.value = 1.4
      bell.gain.value = 7
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 3600
      filter.connect(bell).connect(gain).connect(target)
      return { gain, filter }
    }
    const voices: OscillatorNode[] = []
    const echoVoices: OscillatorNode[] = []
    const direct = shaped(output)
    direct.gain.connect(echo)
    const echoDelay = context.createDelay(0.6)
    echoDelay.delayTime.value = 0.2
    const distant = context.createBiquadFilter()
    distant.type = 'lowpass'
    distant.frequency.value = 1900
    echoDelay.connect(distant).connect(output)
    distant.connect(echo)
    const returned = shaped(echoDelay)
    for (const [list, chain] of [
      [voices, direct],
      [echoVoices, returned],
    ] as const)
      for (const [index, pitch] of hornVoices.touring.entries())
        for (const detune of [-4, 5]) {
          const voice = context.createOscillator()
          voice.type = 'sawtooth'
          voice.frequency.value = pitch
          voice.detune.value = detune + index * 3
          voice.connect(chain.filter)
          voice.start()
          list.push(voice)
        }
    return { gain: direct.gain, voices, echoVoices, echoGain: returned.gain, echoDelay }
  }

  private createBoost(context: BaseAudioContext, noise: AudioBuffer, output: AudioNode): Boost {
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1200
    filter.Q.value = 0.9
    const gain = context.createGain()
    gain.gain.value = 0
    const source = context.createBufferSource()
    source.buffer = noise
    source.loop = true
    source.connect(filter).connect(gain).connect(output)
    source.start(0, Math.random() * 2)
    const whine = context.createGain()
    whine.gain.value = 0
    const shade = context.createBiquadFilter()
    shade.type = 'lowpass'
    shade.frequency.value = 3400
    const tone = context.createOscillator()
    tone.type = 'sawtooth'
    tone.frequency.value = 150
    tone.connect(shade).connect(whine).connect(output)
    tone.start()
    return { hiss: { gain, filter }, tone, whine }
  }

  private burst(
    t: number,
    band: number,
    q: number,
    peak: number,
    decay: number,
    type: BiquadFilterType = 'bandpass',
  ) {
    const { rig } = this
    if (!rig) return
    const { context } = rig
    const source = context.createBufferSource()
    source.buffer = rig.noise
    source.loop = true
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.value = band
    filter.Q.value = q
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.004)
    gain.gain.setTargetAtTime(0, t + 0.004, decay)
    source.connect(filter).connect(gain).connect(rig.outside)
    gain.connect(rig.echo)
    source.start(t, Math.random() * 1.5)
    source.stop(t + decay * 7 + 0.05)
  }

  private tone(t: number, from: number, to: number, peak: number, decay: number) {
    const { rig } = this
    if (!rig) return
    const { context } = rig
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(from, t)
    oscillator.frequency.exponentialRampToValueAtTime(to, t + Math.min(0.15, decay))
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.003)
    gain.gain.setTargetAtTime(0, t + 0.003, decay)
    oscillator.connect(gain).connect(rig.outside)
    gain.connect(rig.echo)
    oscillator.start(t)
    oscillator.stop(t + decay * 7 + 0.05)
  }

  private impact(material: ObstacleMaterial, strength: number, vehicle: Vehicle) {
    const { rig } = this
    if (!rig) return
    const t = rig.context.currentTime
    const voice = impactVoice(material, strength, vehicle)
    const level = mixLevels.impact
    this.tone(t, voice.thumpPitch * 2, voice.thumpPitch, voice.thump * level, 0.09)
    this.tone(t, voice.thumpPitch * 1.3, voice.thumpPitch * 0.5, voice.boom * level, 0.17)
    this.burst(t, 170, 0.7, voice.boom * level * 0.8, 0.12, 'lowpass')
    for (let piece = 0; piece < voice.debris; piece++) {
      const at = t + 0.03 + Math.random() * 0.4
      const ring = 2300 + Math.random() * 4300
      const loud = level * 0.1 * (0.4 + Math.random() * 0.6)
      this.tone(at, ring, ring * 0.97, loud, 0.03)
      this.burst(at, 5200, 2, loud * 0.8, 0.012)
    }
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

  private airBrake() {
    const { rig } = this
    if (!rig) return
    this.burst(rig.context.currentTime, 2600, 0.4, 0.12, 0.22, 'highpass')
  }
}

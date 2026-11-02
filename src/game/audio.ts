import { clamp, type Settings } from './world'

export class DriveAudio {
  context?: AudioContext
  master?: GainNode
  motor?: OscillatorNode
  harmonic?: OscillatorNode
  wind?: GainNode
  motorGain?: GainNode
  start(volume: number) {
    if (this.context) {
      void this.context.resume()
      return
    }
    const context = new AudioContext()
    this.context = context
    this.master = context.createGain()
    this.master.gain.value = volume * 0.22
    this.master.connect(context.destination)
    this.motorGain = context.createGain()
    this.motorGain.gain.value = 0.1
    this.motorGain.connect(this.master)
    this.motor = context.createOscillator()
    this.motor.type = 'sine'
    this.motor.frequency.value = 42
    this.motor.connect(this.motorGain)
    this.motor.start()
    this.harmonic = context.createOscillator()
    this.harmonic.type = 'triangle'
    this.harmonic.frequency.value = 84
    const harmonicGain = context.createGain()
    harmonicGain.gain.value = 0.08
    this.harmonic.connect(harmonicGain).connect(this.master)
    this.harmonic.start()
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const noise = context.createBufferSource()
    noise.buffer = buffer
    noise.loop = true
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 380
    this.wind = context.createGain()
    this.wind.gain.value = 0.01
    noise.connect(filter).connect(this.wind).connect(this.master)
    noise.start()
  }
  update(speed: number, throttle: number, settings: Settings, paused: boolean) {
    if (!this.context) return
    const t = this.context.currentTime
    this.master?.gain.setTargetAtTime(paused ? 0 : settings.volume * 0.22, t, 0.2)
    this.motor?.frequency.setTargetAtTime(38 + Math.abs(speed) * 2.8 + throttle * 8, t, 0.15)
    this.harmonic?.frequency.setTargetAtTime(76 + Math.abs(speed) * 5.6, t, 0.15)
    this.motorGain?.gain.setTargetAtTime(0.1 + throttle * 0.15, t, 0.15)
    this.wind?.gain.setTargetAtTime(clamp(Math.abs(speed) / 85, 0.01, 0.6), t, 0.3)
  }
  dispose() {
    void this.context?.close()
  }
}

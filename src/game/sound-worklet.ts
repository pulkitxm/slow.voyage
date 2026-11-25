import { paramDefaults, SoundSynth, soundChannels, soundParams, synthName } from './sound-synth'

declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, processor: unknown): void

class DriveSynth extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return soundParams.map((name) => ({
      name,
      defaultValue: paramDefaults[name] ?? 0,
      automationRate: 'k-rate',
    }))
  }
  private synth = new SoundSynth(sampleRate, 1)
  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) {
    const channels = outputs[0]
    const first = channels?.[0]
    if (!channels || !first || channels.length < soundChannels.length) return true
    const params = this.synth.params
    for (let index = 0; index < soundParams.length; index++) {
      const values = parameters[soundParams[index] as string]
      if (values) params[index] = values[0] as number
    }
    this.synth.render(channels, first.length)
    return true
  }
}

registerProcessor(synthName, DriveSynth)

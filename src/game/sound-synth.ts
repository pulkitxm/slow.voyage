import { AirVoice } from './air-sound'
import { EngineVoice, engineSounds, engineVoices } from './engine-sound'
import { RoadVoice } from './road-sound'

export const soundParams = [
  'vehicle',
  'rpm',
  'idle',
  'redline',
  'load',
  'throttle',
  'cutting',
  'shifts',
  'clunk',
  'pops',
  'popLevel',
  'speed',
  'roll',
  'wet',
  'gravel',
  'grass',
  'grains',
  'squealLeft',
  'squealRight',
  'squealPitch',
  'rough',
  'skid',
  'scrub',
  'joint',
  'jointLevel',
  'wheelbase',
  'bumps',
  'bumpStrength',
  'heft',
  'scrape',
  'metal',
  'wade',
  'brake',
  'rush',
  'band',
  'whistle',
  'whistlePitch',
  'buffet',
  'breeze',
  'leaves',
  'rain',
  'birds',
  'insects',
  'cicadas',
  'water',
  'surf',
  'falls',
  'fallsPan',
] as const

export type SoundParam = (typeof soundParams)[number]

export const paramIndex = Object.fromEntries(
  soundParams.map((name, index) => [name, index]),
) as Record<SoundParam, number>

export const paramDefaults: Partial<Record<SoundParam, number>> = {
  rpm: 800,
  idle: 800,
  redline: 6500,
  squealPitch: 1000,
  wheelbase: 2.6,
  heft: 1,
  band: 400,
  whistlePitch: 2600,
}

export const soundChannels = [
  'exhaustLeft',
  'exhaustRight',
  'bay',
  'turbo',
  'tyresLeft',
  'tyresRight',
  'debris',
  'windLeft',
  'windRight',
  'cabin',
  'ambienceLeft',
  'ambienceRight',
] as const

export type SoundChannel = (typeof soundChannels)[number]

export const channelIndex = Object.fromEntries(
  soundChannels.map((name, index) => [name, index]),
) as Record<SoundChannel, number>

export const synthName = 'drive-synth'
export const synthBlock = 128

export function freshParams() {
  const params = new Float32Array(soundParams.length)
  for (const name of soundParams) params[paramIndex[name]] = paramDefaults[name] ?? 0
  return params
}

export class SoundSynth {
  params = freshParams()
  engine: EngineVoice
  road: RoadVoice
  air: AirVoice
  private vehicle = -1
  private scratch = soundChannels.map(() => new Float32Array(synthBlock))
  constructor(rate: number, seed = 1) {
    this.engine = new EngineVoice(rate, seed)
    this.road = new RoadVoice(rate, seed)
    this.air = new AirVoice(rate, seed)
  }
  private apply() {
    const p = this.params
    const at = paramIndex
    const vehicle = Math.round(p[at.vehicle] as number)
    if (vehicle !== this.vehicle) {
      this.vehicle = vehicle
      this.engine.configure(engineVoices[vehicle] ?? engineSounds.touring)
    }
    const engine = this.engine
    engine.rpm = p[at.rpm] as number
    engine.idle = p[at.idle] as number
    engine.redline = p[at.redline] as number
    engine.load = p[at.load] as number
    engine.throttle = p[at.throttle] as number
    engine.cutting = p[at.cutting] as number
    engine.shifts = p[at.shifts] as number
    engine.clunk = p[at.clunk] as number
    engine.pops = p[at.pops] as number
    engine.popLevel = p[at.popLevel] as number
    engine.speed = p[at.speed] as number
    const road = this.road
    road.speed = p[at.speed] as number
    road.roll = p[at.roll] as number
    road.wet = p[at.wet] as number
    road.gravel = p[at.gravel] as number
    road.grass = p[at.grass] as number
    road.grains = p[at.grains] as number
    road.squealLeft = p[at.squealLeft] as number
    road.squealRight = p[at.squealRight] as number
    road.pitch = p[at.squealPitch] as number
    road.rough = p[at.rough] as number
    road.skid = p[at.skid] as number
    road.scrub = p[at.scrub] as number
    road.joint = p[at.joint] as number
    road.jointLevel = p[at.jointLevel] as number
    road.wheelbase = p[at.wheelbase] as number
    road.bumps = p[at.bumps] as number
    road.bumpStrength = p[at.bumpStrength] as number
    road.heft = p[at.heft] as number
    road.scrape = p[at.scrape] as number
    road.metal = p[at.metal] as number
    road.wade = p[at.wade] as number
    road.brake = p[at.brake] as number
    const air = this.air
    air.speed = p[at.speed] as number
    air.rush = p[at.rush] as number
    air.band = p[at.band] as number
    air.whistle = p[at.whistle] as number
    air.whistlePitch = p[at.whistlePitch] as number
    air.buffet = p[at.buffet] as number
    air.breeze = p[at.breeze] as number
    air.leaves = p[at.leaves] as number
    air.rain = p[at.rain] as number
    air.birds = p[at.birds] as number
    air.insects = p[at.insects] as number
    air.cicadas = p[at.cicadas] as number
    air.water = p[at.water] as number
    air.surf = p[at.surf] as number
    air.falls = p[at.falls] as number
    air.fallsPan = p[at.fallsPan] as number
  }
  render(channels: readonly Float32Array[], frames: number) {
    this.apply()
    const s = this.scratch as Float32Array[]
    for (let start = 0; start < frames; start += synthBlock) {
      const count = Math.min(synthBlock, frames - start)
      this.engine.render(
        s[0] as Float32Array,
        s[1] as Float32Array,
        s[2] as Float32Array,
        s[3] as Float32Array,
        count,
      )
      this.road.render(s[4] as Float32Array, s[5] as Float32Array, s[6] as Float32Array, count)
      this.air.render(
        s[7] as Float32Array,
        s[8] as Float32Array,
        s[9] as Float32Array,
        s[10] as Float32Array,
        s[11] as Float32Array,
        count,
      )
      for (let channel = 0; channel < s.length; channel++) {
        const out = channels[channel]
        if (!out) continue
        const from = s[channel] as Float32Array
        for (let i = 0; i < count; i++) out[start + i] = from[i] as number
      }
    }
  }
}

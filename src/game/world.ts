import { roadCurve, smoothStep, terrainField } from './field'
import { roadCoordinates, roadLayout } from './road'

export type Landscape = 'highlands' | 'alpine' | 'desert'
export type Season = 'summer' | 'autumn' | 'winter'
export type Daylight = 'day' | 'sunset' | 'night'
export type Weather = 'clear' | 'overcast' | 'rain' | 'fog'
export type Vehicle = 'touring' | 'roadster' | 'motorcycle' | 'bus'
export type CameraMode = 'chase' | 'bonnet' | 'cinematic'
export type AssistanceMode = 'off' | 'full' | 'steer' | 'speed'
export type SteeringSource = 'digital' | 'analog' | 'mouse' | 'automatic'
const roadProfiles = {
  highlands: [24, 10, 3],
  alpine: [100, 28, 8],
  desert: [18, 4, 1],
} as const
export interface Settings {
  landscape: Landscape
  season: Season
  daylight: Daylight
  weather: Weather
  vehicle: Vehicle
  camera: CameraMode
  color: string
  volume: number
  quality: 'high' | 'low'
  units: 'km' | 'mi'
  grip: number
  power: number
  seed: number
  autodriveMode: Exclude<AssistanceMode, 'off'>
  cruiseSpeed: number
  onePedal: boolean
  controllerEnabled: boolean
  controllerDeadzone: number
  mouseEnabled: boolean
  mouseSensitivity: number
}
export const defaults: Settings = {
  landscape: 'highlands',
  season: 'summer',
  daylight: 'day',
  weather: 'clear',
  vehicle: 'touring',
  camera: 'chase',
  color: '#f8f8f8',
  volume: 0.25,
  quality: 'high',
  units: 'km',
  grip: 1,
  power: 1,
  seed: 42,
  autodriveMode: 'full',
  cruiseSpeed: 22,
  onePedal: false,
  controllerEnabled: true,
  controllerDeadzone: 0.12,
  mouseEnabled: false,
  mouseSensitivity: 1,
}
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export const damp = (a: number, b: number, rate: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-rate * dt))
export const angleDifference = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b))
export function random(seed: number) {
  let n = seed | 0
  return () => {
    n += 0x6d2b79f5
    let t = Math.imul(n ^ (n >>> 15), 1 | n)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export class World {
  constructor(public settings: Settings) {}
  road(s: number) {
    const seed = this.settings.seed
    const broad = roadCurve(s, 1200, seed),
      middle = roadCurve(s + 77, 450, seed + 97),
      bend = roadCurve(s + 37, 140, seed + 931)
    const x = broad.value * 200 + middle.value * 75 + bend.value * 14
    const dx = broad.derivative * 200 + middle.derivative * 75 + bend.derivative * 14
    const rise = roadCurve(s, 1350, seed + 499),
      crest = roadCurve(s + 129, 420, seed + 951)
    const [base, riseScale, crestScale] = roadProfiles[this.settings.landscape]
    const y = base + rise.value * riseScale + crest.value * crestScale
    const dy = rise.derivative * riseScale + crest.derivative * crestScale
    return { x, y, dx, dy, yaw: Math.atan2(-dx, 1) }
  }
  height(x: number, s: number) {
    const center = this.road(s)
    const offset = x - center.x
    const corridor = 1 - smoothStep(clamp((Math.abs(offset) - 8) / 12, 0, 1))
    const frame = corridor ? roadCoordinates(this, x, s) : null
    const road = frame?.road ?? center
    const level = center.y + (road.y - center.y) * corridor
    const d = offset + ((frame?.distance ?? offset) - offset) * corridor
    const distance = Math.abs(d)
    if (distance <= roadLayout.halfWidth + roadLayout.verge) return level - roadLayout.surfaceRecess
    const amplitude =
      this.settings.landscape === 'alpine' ? 2.4 : this.settings.landscape === 'desert' ? 0.45 : 1
    const hills =
      terrainField(x, s, this.settings.seed) - terrainField(center.x, s, this.settings.seed)
    const coastDirection = roadCurve(s, 2600, this.settings.seed + 1029).value
    const coastFactor =
      this.settings.landscape === 'highlands' ? clamp(0.5 + coastDirection * Math.sign(d), 0, 1) : 0
    const coast = Math.min(110, Math.max(0, distance - roadLayout.halfWidth) * 0.26) * coastFactor
    const relief = hills * amplitude - coast
    const cut = smoothStep(clamp((relief - 0.6) / 3, 0, 1))
    const blend = smoothStep(
      clamp((distance - roadLayout.halfWidth - roadLayout.verge) / (13.2 - cut * 6.5), 0, 1),
    )
    return level - roadLayout.surfaceRecess + blend * relief
  }

  guardrail(s: number, side: number) {
    const road = this.road(s)
    const drop = road.y - this.height(road.x + side * 12, s)
    const turn = angleDifference(this.road(s + 10).yaw, this.road(s - 10).yaw)
    return drop > 1.5 || (drop > 0.4 && turn * side > 0.02)
  }

  surface(x: number, s: number) {
    const { road, distance } = roadCoordinates(this, x, s)
    const onRoad = Math.abs(distance) <= roadLayout.halfWidth
    const grade = road.dy / (1 + road.dx * road.dx)
    return {
      height: onRoad ? road.y : this.height(x, s),
      onRoad,
      slopeX: onRoad ? grade * road.dx : (this.height(x + 0.2, s) - this.height(x - 0.2, s)) / 0.4,
      slopeS: onRoad ? grade : (this.height(x, s + 0.2) - this.height(x, s - 0.2)) / 0.4,
    }
  }
}

export type Landscape = 'highlands' | 'alpine' | 'desert'
export type Season = 'summer' | 'autumn' | 'winter'
export type Daylight = 'day' | 'sunset' | 'night'
export type Vehicle = 'touring' | 'roadster' | 'motorcycle' | 'bus'
export type CameraMode = 'chase' | 'bonnet' | 'cinematic'
export interface Settings {
  landscape: Landscape
  season: Season
  daylight: Daylight
  vehicle: Vehicle
  camera: CameraMode
  color: string
  volume: number
  quality: 'high' | 'low'
  units: 'km' | 'mi'
  grip: number
  power: number
  seed: number
}
export const defaults: Settings = {
  landscape: 'highlands',
  season: 'summer',
  daylight: 'day',
  vehicle: 'touring',
  camera: 'chase',
  color: '#f8f8f8',
  volume: 0.25,
  quality: 'high',
  units: 'km',
  grip: 1,
  power: 1,
  seed: 42,
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
    const phase = (this.settings.seed - 42) * 0.71
    const x =
      64 * Math.sin(s / 240 + phase) + 105 * Math.sin(s / 640 + phase) + 20 * Math.sin(s / 108)
    const y = 16 + 12 * Math.sin(s / 370 + phase) + 5 * Math.sin(s / 140)
    const dx =
      (64 / 240) * Math.cos(s / 240 + phase) +
      (105 / 640) * Math.cos(s / 640 + phase) +
      (20 / 108) * Math.cos(s / 108)
    const dy = (12 / 370) * Math.cos(s / 370 + phase) + (5 / 140) * Math.cos(s / 140)
    return { x, y, dx, dy, yaw: Math.atan2(-dx, 1) }
  }
  height(x: number, s: number) {
    const road = this.road(s)
    const d = x - road.x
    const distance = Math.abs(d)
    const blend = clamp((distance - 6) / 70, 0, 1)
    const phase = this.settings.seed * 0.13
    const amplitude =
      this.settings.landscape === 'alpine' ? 2.8 : this.settings.landscape === 'desert' ? 0.8 : 1
    const hills =
      6 +
      12 * Math.sin(x / 190 + s / 320 + phase) +
      8 * Math.cos(s / 300 - x / 200) +
      3 * Math.sin(x / 75 + s / 120)
    const mountain =
      Math.max(0, distance - 210) *
      (0.1 + 0.1 * Math.sin(s / 180)) *
      (this.settings.landscape === 'highlands' && d > 0 ? 0 : 1)
    const coastFactor =
      this.settings.landscape === 'highlands' && d > 6
        ? clamp((Math.sin(s / 1300 + this.settings.seed * 0.01) + 0.4) / 1.2, 0, 1)
        : 0
    const coast = Math.min(95, Math.max(0, d - 6) * 0.24) * coastFactor
    return road.y - 0.16 + blend * (hills * amplitude * (1 - coastFactor * 0.9) + mountain) - coast
  }

  guardrail(s: number, side: number) {
    return side > 0 ? Math.sin(s / 260) > -0.2 : Math.cos(s / 350) < -0.25
  }
}

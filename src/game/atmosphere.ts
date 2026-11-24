import * as THREE from 'three'
import { landscapeProfiles } from './landscapes'
import type { Daylight, Settings, Weather } from './world'

export const sunOffset = { x: -90, z: -80 }

export function sunDirection(height: number) {
  return new THREE.Vector3(sunOffset.x, height, sunOffset.z).normalize()
}

export type DayPhase = Exclude<Daylight, 'cycle'>

const clearSkies: Record<DayPhase, string> = {
  dawn: '#6f93c4',
  day: '#69b7ef',
  sunset: '#829bb6',
  dusk: '#2c3d66',
  night: '#122239',
}
const clearHorizons: Record<DayPhase, string> = {
  dawn: '#f6cdbb',
  day: '#e1f2ec',
  sunset: '#f0b48e',
  dusk: '#b98a8c',
  night: '#2d4258',
}
const clearClouds: Record<DayPhase, string> = {
  dawn: '#f7d9c8',
  day: '#f3f8f6',
  sunset: '#f3cfb6',
  dusk: '#8d7f93',
  night: '#35465e',
}
const lowSuns: Partial<Record<DayPhase, string>> = {
  dawn: '#ffd7b0',
  sunset: '#ffc48e',
  dusk: '#ff9c7c',
  night: '#a3bde0',
}
const dimming: Record<DayPhase, number> = { dawn: 0.12, day: 0, sunset: 0, dusk: 0.6, night: 1 }
const sunHeights: Record<DayPhase, number> = {
  dawn: 30,
  day: 110,
  sunset: 38,
  dusk: 16,
  night: 110,
}
const clearSunlight: Record<DayPhase, number> = {
  dawn: 1.7,
  day: 2.5,
  sunset: 2.3,
  dusk: 0.55,
  night: 0.5,
}
const clearGlow: Record<DayPhase, number> = {
  dawn: 1.2,
  day: 0.8,
  sunset: 1.4,
  dusk: 0.9,
  night: 0.35,
}
const waters: Record<DayPhase, [deep: string, sky: string]> = {
  dawn: ['#5a7890', '#f0cdbd'],
  day: ['#4f8098', '#d8e8ea'],
  sunset: ['#53687a', '#e8bc98'],
  dusk: ['#2a3d58', '#8f7f95'],
  night: ['#132639', '#2b3f52'],
}
const scratch = new THREE.Color()
const scratchTarget = new THREE.Color()

function mixColor(from: string, to: string, amount: number) {
  if (amount <= 0) return from
  if (amount >= 1) return to
  return `#${scratch.set(from).lerp(scratchTarget.set(to), amount).getHexString()}`
}

function phaseProfile(phase: DayPhase, weather: Weather, season: Settings['season']) {
  const night = phase === 'night'
  const storm = weather === 'storm'
  const raining = weather === 'rain' || storm
  const covered = weather !== 'clear'
  const dim = dimming[phase]
  const shaded = (color: string, dark: string) => mixColor(color, dark, dim)
  const coveredLight = storm ? 0.3 : weather === 'fog' ? 0.35 : raining ? 0.5 : 0.85
  const twilight = phase === 'dawn' ? 0.8 : phase === 'dusk' ? 0.35 : 1
  return {
    sunHeight: sunHeights[phase],
    sunGlow: night ? 0.35 : covered ? 0.15 : clearGlow[phase],
    stars: covered ? 0 : night ? 1 : phase === 'dusk' ? 0.45 : 0,
    sky: covered
      ? shaded(storm ? '#3f4f5a' : raining ? '#596e7b' : '#8c9da6', clearSkies.night)
      : clearSkies[phase],
    horizon: covered
      ? shaded(
          weather === 'fog' ? '#c3cecb' : storm ? '#5f6e76' : raining ? '#7b8d95' : '#c4cfce',
          clearHorizons.night,
        )
      : clearHorizons[phase],
    cloudColor: covered
      ? shaded(storm ? '#7c8b92' : raining ? '#9dafb4' : '#d0d9d7', clearClouds.night)
      : clearClouds[phase],
    sun: lowSuns[phase] ?? (covered ? '#d8e3e9' : '#fff3db'),
    sunlight: night ? 0.5 : covered ? coveredLight * twilight : clearSunlight[phase],
    ambient: night
      ? 0.8
      : (covered ? 2.2 : 2.6) * (phase === 'dawn' ? 0.86 : phase === 'dusk' ? 0.5 : 1),
    exposure: night ? 0.86 : storm ? 0.9 : raining ? 0.94 : phase === 'dusk' ? 0.92 : 1.02,
    fog: Math.max(
      night ? 0.0018 : phase === 'dawn' ? 0.0013 : phase === 'dusk' ? 0.0012 : 0.0009,
      weather === 'fog' ? 0.008 : storm ? 0.004 : raining ? 0.0032 : covered ? 0.0018 : 0,
    ),
    clouds: night ? (covered ? 0.8 : 0.05) : covered ? 1 : phase === 'dusk' ? 0.4 : 0.5,
    wet: raining && season !== 'winter',
    snow: raining && season === 'winter',
    downpour: storm ? 1 : 0,
    night: dim > 0.5 ? 1 : 0,
    water: raining ? mixColor(waters[phase][0], '#27333a', 0.55) : waters[phase][0],
    waterSky: raining
      ? mixColor(waters[phase][1], storm ? '#4c5a62' : '#66767e', 0.8)
      : waters[phase][1],
    frozenWater: night ? '#4e647c' : shaded('#b7c8cd', '#4e647c'),
  }
}

export type AtmosphereProfile = ReturnType<typeof phaseProfile>

export const dayCycle = {
  seconds: 720,
  start: 0.2,
  stages: [
    [0, 'dawn'],
    [0.04, 'dawn'],
    [0.14, 'day'],
    [0.46, 'day'],
    [0.56, 'sunset'],
    [0.6, 'sunset'],
    [0.66, 'dusk'],
    [0.72, 'night'],
    [0.94, 'night'],
    [1, 'dawn'],
  ] as const,
}

export function cycleStage(clock: number) {
  const fraction = (((clock / dayCycle.seconds + dayCycle.start) % 1) + 1) % 1
  for (let index = 1; index < dayCycle.stages.length; index++) {
    const previous = dayCycle.stages[index - 1]
    const next = dayCycle.stages[index]
    if (!previous || !next || fraction > next[0]) continue
    const span = next[0] - previous[0]
    return {
      from: previous[1],
      to: next[1],
      blend: previous[1] === next[1] || span <= 0 ? 0 : (fraction - previous[0]) / span,
    }
  }
  return { from: 'dawn' as DayPhase, to: 'dawn' as DayPhase, blend: 0 }
}

function mixProfiles(from: AtmosphereProfile, to: AtmosphereProfile, amount: number) {
  const eased = amount * amount * (3 - 2 * amount)
  const mixed = { ...from }
  for (const key of Object.keys(from) as (keyof AtmosphereProfile)[]) {
    const a = from[key]
    const b = to[key]
    if (typeof a === 'number' && typeof b === 'number')
      Object.assign(mixed, { [key]: a + (b - a) * eased })
    else if (typeof a === 'string' && typeof b === 'string')
      Object.assign(mixed, { [key]: mixColor(a, b, eased) })
  }
  return mixed
}

export function atmosphereProfile(
  settings: Pick<Settings, 'daylight' | 'weather' | 'season'>,
  clock = 0,
): AtmosphereProfile {
  if (settings.daylight !== 'cycle')
    return phaseProfile(settings.daylight, settings.weather, settings.season)
  const stage = cycleStage(clock)
  const from = phaseProfile(stage.from, settings.weather, settings.season)
  return stage.blend
    ? mixProfiles(from, phaseProfile(stage.to, settings.weather, settings.season), stage.blend)
    : from
}

export const reflectionSize = { full: 256, coarse: 64 }

export function reflectionLevel(ambient: number, built: number) {
  return built > 0 ? Math.min(8, Math.max(0.05, ambient / built)) : 1
}

export class Atmosphere {
  generator: THREE.PMREMGenerator
  reflection: THREE.WebGLRenderTarget | null = null
  key = ''
  width: number
  level = 1
  private built = 0
  constructor(
    renderer: THREE.WebGLRenderer,
    private coarse = false,
  ) {
    this.generator = new THREE.PMREMGenerator(renderer)
    this.width = coarse ? reflectionSize.coarse : reflectionSize.full
  }
  setAppearance(settings: Settings, profile: AtmosphereProfile) {
    const groundColor =
      settings.season === 'winter'
        ? '#c8d1cc'
        : (landscapeProfiles[settings.landscape].reflection ?? '#556c3c')
    const key = `${profile.sky}/${profile.horizon}/${profile.sun}/${profile.sunlight}/${profile.ambient}/${groundColor}/${profile.sunHeight}`
    if (key === this.key && this.reflection) return this.reflection.texture
    if (this.coarse && this.reflection) {
      this.level = reflectionLevel(profile.ambient, this.built)
      return this.reflection.texture
    }
    this.built = profile.ambient
    this.level = 1
    const sky = new THREE.Color(profile.sky)
    const horizon = new THREE.Color(profile.horizon)
    const ground = new THREE.Color(groundColor)
    const sun = new THREE.Color(profile.sun)
    const direction = sunDirection(profile.sunHeight)
    const color = new THREE.Color()
    const { width } = this
    const tall = width / 2
    const pixels = new Float32Array(width * tall * 4)
    for (let row = 0; row < tall; row++) {
      const elevation = (row / (tall - 1) - 0.5) * Math.PI
      const height = Math.sin(elevation)
      for (let column = 0; column < width; column++) {
        const angle = (column / (width - 1) - 0.5) * Math.PI * 2
        if (height >= 0) color.copy(horizon).lerp(sky, Math.sqrt(height))
        else color.copy(horizon).lerp(ground, Math.min(1, -height * 5))
        const facing = Math.max(
          0,
          Math.cos(elevation) * Math.cos(angle) * direction.x +
            height * direction.y +
            Math.cos(elevation) * Math.sin(angle) * direction.z,
        )
        const sunGlow = height > 0 ? facing ** 256 * profile.sunlight * 8 : 0
        const radiance = profile.ambient * (height > 0 ? 1.1 : 0.45)
        const index = (row * width + column) * 4
        pixels[index] = color.r * radiance + sun.r * sunGlow
        pixels[index + 1] = color.g * radiance + sun.g * sunGlow
        pixels[index + 2] = color.b * radiance + sun.b * sunGlow
        pixels[index + 3] = 1
      }
    }
    const texture = new THREE.DataTexture(pixels, width, tall, THREE.RGBAFormat, THREE.FloatType)
    texture.mapping = THREE.EquirectangularReflectionMapping
    texture.needsUpdate = true
    const reflection = this.generator.fromEquirectangular(texture)
    texture.dispose()
    this.reflection?.dispose()
    this.reflection = reflection
    this.key = key
    return reflection.texture
  }
  dispose() {
    this.reflection?.dispose()
    this.generator.dispose()
  }
}

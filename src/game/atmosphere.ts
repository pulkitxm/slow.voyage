import * as THREE from 'three'
import type { Settings } from './world'

export const sunOffset = { x: -90, z: -80 }

export function sunDirection(height: number) {
  return new THREE.Vector3(sunOffset.x, height, sunOffset.z).normalize()
}

export function atmosphereProfile(settings: Settings) {
  const night = settings.daylight === 'night'
  const sunset = settings.daylight === 'sunset'
  const weather = settings.weather
  const covered = weather !== 'clear'
  return {
    sunHeight: sunset ? 38 : 110,
    sunGlow: night ? 0.35 : covered ? 0.15 : sunset ? 1.4 : 0.8,
    stars: night && !covered ? 1 : 0,
    sky: night
      ? '#122239'
      : covered
        ? weather === 'rain'
          ? '#596e7b'
          : '#8c9da6'
        : sunset
          ? '#829bb6'
          : '#69b7ef',
    horizon: night
      ? '#2d4258'
      : weather === 'fog'
        ? '#c3cecb'
        : weather === 'rain'
          ? '#9dafb4'
          : covered
            ? '#c4cfce'
            : sunset
              ? '#f0b48e'
              : '#e1f2ec',
    cloudColor: night
      ? '#35465e'
      : covered
        ? weather === 'rain'
          ? '#9dafb4'
          : '#d0d9d7'
        : sunset
          ? '#f3cfb6'
          : '#f3f8f6',
    sun: night ? '#a3bde0' : sunset ? '#ffc48e' : covered ? '#d8e3e9' : '#fff3db',
    sunlight: night
      ? 0.5
      : weather === 'fog'
        ? 0.35
        : weather === 'rain'
          ? 0.5
          : covered
            ? 0.85
            : sunset
              ? 2.6
              : 2.9,
    ambient: night ? 0.8 : covered ? 1.6 : 1.3,
    exposure: night ? 0.86 : weather === 'rain' ? 0.94 : 1.02,
    fog: Math.max(
      night ? 0.0018 : 0.0009,
      weather === 'fog' ? 0.008 : weather === 'rain' ? 0.0032 : covered ? 0.0018 : 0,
    ),
    clouds: night ? (covered ? 0.8 : 0.05) : covered ? 1 : 0.5,
    wet: weather === 'rain' && settings.season !== 'winter',
    snow: weather === 'rain' && settings.season === 'winter',
  }
}

export class Atmosphere {
  generator: THREE.PMREMGenerator
  reflection: THREE.WebGLRenderTarget | null = null
  key = ''
  constructor(renderer: THREE.WebGLRenderer) {
    this.generator = new THREE.PMREMGenerator(renderer)
  }
  setAppearance(settings: Settings) {
    const groundColor =
      settings.season === 'winter'
        ? '#c8d1cc'
        : settings.landscape === 'desert'
          ? '#8d7554'
          : '#556c3c'
    const profile = atmosphereProfile(settings)
    const key = `${profile.sky}/${profile.horizon}/${profile.sun}/${profile.sunlight}/${profile.ambient}/${groundColor}/${settings.daylight === 'sunset'}`
    if (key === this.key && this.reflection) return this.reflection.texture
    const sky = new THREE.Color(profile.sky)
    const horizon = new THREE.Color(profile.horizon)
    const ground = new THREE.Color(groundColor)
    const sun = new THREE.Color(profile.sun)
    const direction = sunDirection(profile.sunHeight)
    const color = new THREE.Color()
    const pixels = new Float32Array(256 * 128 * 4)
    for (let row = 0; row < 128; row++) {
      const elevation = (row / 127 - 0.5) * Math.PI
      const height = Math.sin(elevation)
      for (let column = 0; column < 256; column++) {
        const angle = (column / 255 - 0.5) * Math.PI * 2
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
        const index = (row * 256 + column) * 4
        pixels[index] = color.r * radiance + sun.r * sunGlow
        pixels[index + 1] = color.g * radiance + sun.g * sunGlow
        pixels[index + 2] = color.b * radiance + sun.b * sunGlow
        pixels[index + 3] = 1
      }
    }
    const texture = new THREE.DataTexture(pixels, 256, 128, THREE.RGBAFormat, THREE.FloatType)
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

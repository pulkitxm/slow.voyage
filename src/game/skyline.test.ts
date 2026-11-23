import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { lensGlow } from './coachwork'
import {
  cloudCover,
  glassFace,
  paintFloor,
  reflectSkyline,
  skyline,
  skylineDetail,
} from './skyline'

function compiled(material: THREE.MeshStandardMaterial) {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  }
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    {} as THREE.WebGLRenderer,
  )
  return shader
}

test('bodywork reflects clouds and a ragged skyline instead of a plain gradient', () => {
  const paint = new THREE.MeshPhysicalMaterial()
  reflectSkyline(paint)
  const shader = compiled(paint)
  expect(shader.fragmentShader).toContain('float skylineNoise(vec2 p)')
  expect(shader.fragmentShader).toContain('skylineCloud, skylineCover')
  expect(shader.fragmentShader).toContain('float skylineHills')
  expect(shader.uniforms.skylineClouds).toBe(skyline.clouds)
  expect(shader.uniforms.skylineCloud).toBe(skyline.cloud)
  expect(shader.uniforms.skylineFloor?.value).toBe(paintFloor)
  expect(paint.customProgramCacheKey()).toContain('skyline-detailed')
})

test('cloud cover follows the weather: clear sky shows few, overcast shows all', () => {
  const billows = Array.from({ length: 101 }, (_, index) => index / 100)
  const share = (clouds: number) =>
    billows.reduce((sum, billow) => sum + cloudCover(clouds, billow), 0) / billows.length
  expect(share(0.05)).toBeLessThan(0.08)
  expect(share(0.5)).toBeGreaterThan(0.25)
  expect(share(0.5)).toBeLessThan(0.6)
  expect(share(1)).toBeGreaterThan(0.7)
  expect(cloudCover(0.5, 0)).toBe(0)
  expect(cloudCover(0.5, 1)).toBe(1)
  expect(skylineDetail.relief).toBeGreaterThan(skylineDetail.ridge)
})

test('glass reflects the sky far more readily than paint and is dressed only once', () => {
  expect(glassFace.floor).toBeGreaterThan(paintFloor * 4)
  expect(glassFace.solid).toBeGreaterThan(paintFloor * 2)
  expect(glassFace.solid).toBeLessThan(glassFace.floor)
  const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 })
  reflectSkyline(glass, 2, glassFace.floor)
  const first = glass.onBeforeCompile
  reflectSkyline(glass, 9, 0.9)
  expect(glass.onBeforeCompile).toBe(first)
  const shader = compiled(glass)
  expect(shader.uniforms.skylineGain?.value).toBe(2)
  expect(shader.uniforms.skylineFloor?.value).toBe(glassFace.floor)
  expect(shader.fragmentShader.match(/uniform vec3 skylineHorizon;/g)).toHaveLength(1)
})

test('lamp lenses keep a faint glow by day so they read as lit glass', () => {
  expect(lensGlow.tail).toBeGreaterThan(0.2)
  expect(lensGlow.tail).toBeLessThan(0.9)
  expect(lensGlow.head).toBeGreaterThan(0.1)
  expect(lensGlow.head).toBeLessThan(lensGlow.tail)
})

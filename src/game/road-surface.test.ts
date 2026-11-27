import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { roadLayout } from './road'
import { asphaltLook, markingLook, markingWear, RoadSurface, roadWearLook } from './road-surface'

function compiled(material: THREE.MeshStandardMaterial) {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  return shader
}

function surface(software: boolean) {
  const flat = new THREE.Texture()
  return new RoadSurface(
    flat,
    software ? null : { albedo: flat, normal: flat },
    { value: null },
    { value: 0 },
    software,
  )
}

test('asphalt is dark, aged in sections and carries wheel tracks, oil, seals and a crumbling edge', () => {
  const road = surface(false)
  const source = compiled(road.material).fragmentShader
  const lit = new THREE.Color('#cbc9c4')
  const albedo = lit.g * 0.25 * asphaltLook.albedo
  expect(albedo).toBeGreaterThan(0.05)
  expect(albedo).toBeLessThan(0.13)
  for (const part of [
    'float roadSectionTone',
    'float roadPolish',
    'float roadOil',
    'float roadSeal',
    'float roadCrumble',
    'float roadCells(vec2 p)',
    'float roadLine(float offset, float width)',
  ])
    expect(source).toContain(part)
  expect(asphaltLook.trackOffset).toBeLessThan(roadLayout.halfWidth / 2)
  expect(asphaltLook.crumble).toBeGreaterThan(roadLayout.edgeInset + roadLayout.edgeWidth)
  expect(source).toContain('roughnessFactor = mix(roughnessFactor, 1.0, roadCrumble)')
  expect(road.material.customProgramCacheKey()).toContain('full')
  road.dispose()
})

test('software rendering keeps the aged asphalt without the cellular cracks or rain rings', () => {
  const road = surface(true)
  const source = compiled(road.material).fragmentShader
  expect(source).not.toContain('float roadCells(vec2 p)')
  expect(source).not.toContain('float roadRipple(')
  expect(source).toContain('float roadCrackField')
  expect(source).toContain('float roadOil')
  expect(road.material.customProgramCacheKey()).toContain('plain')
  road.dispose()
})

test('markings are off white, chip with wear and follow the road condition', () => {
  const road = surface(false)
  const paint = new THREE.Color(markingLook.color)
  expect(paint.g).toBeGreaterThan(0.4)
  expect(paint.g).toBeLessThan(0.65)
  expect(markingWear.fresh).toBeLessThan(markingWear.worn)
  expect(markingWear.worn).toBeLessThan(markingWear.broken)
  const shader = compiled(road.marking.material)
  expect(shader.fragmentShader).toContain('if (markCover < markLoss * markNear) discard;')
  expect(shader.uniforms.markWear).toBe(road.marking.wear)
  const sky = new THREE.Color()
  for (const wear of ['fresh', 'worn', 'broken'] as const) {
    road.setCondition(wear, 2, false, '#807350', sky, '#a9a99b')
    expect(road.marking.wear.value).toBe(markingWear[wear])
    expect(road.uniforms.roadWear.value.toArray()).toEqual(roadWearLook[wear])
  }
  expect(road.uniforms.roadGravelColor.value.getHexString()).toBe('a9a99b')
  road.dispose()
})

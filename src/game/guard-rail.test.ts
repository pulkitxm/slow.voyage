import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { guardRailMaterial, guardRails, railLook, railProfile } from './guard-rail'
import { guardrailAt, roadLayout } from './road'
import { defaults, World } from './world'

test('the rail is a W beam with two crests facing the road and a recessed valley', () => {
  for (let index = 1; index < railProfile.length; index++)
    expect(railProfile[index]?.[0]).toBeGreaterThan(railProfile[index - 1]?.[0] ?? 0)
  const crests = railProfile.filter(([, offset]) => offset === 0)
  expect(crests).toHaveLength(2)
  const [lower, upper] = crests
  if (!lower || !upper) throw new Error('Rail crests are missing')
  const valley = railProfile.filter(([height]) => height > lower[0] && height < upper[0])
  expect(Math.max(...valley.map(([, offset]) => offset))).toBeGreaterThan(0.05)
  expect(railProfile[0]?.[1]).toBeGreaterThan(0.05)
  expect(railProfile.at(-1)?.[1]).toBeGreaterThan(0.05)
  expect((railProfile.at(-1)?.[0] ?? 0) - (railProfile[0]?.[0] ?? 0)).toBeCloseTo(0.35, 1)
})

test('rails are built only along guarded stretches, shaded in their recesses and stood on posts', () => {
  const world = new World({ ...defaults, landscape: 'alpine', seed: 3 })
  let guarded = 0
  let built = 0
  for (let start = 0; start < 6000; start += 120) {
    let segments = 0
    for (const side of [-1, 1])
      for (let s = start; s < start + 120; s += roadLayout.railSegmentLength)
        if (guardrailAt(world, s, side)) segments++
    const parts = guardRails(world, start, 120)
    guarded += segments
    built += parts.length
    if (!segments) expect(parts).toHaveLength(0)
    else expect(parts.length).toBeGreaterThanOrEqual(segments * 2)
    for (const part of parts) {
      const position = part.getAttribute('position')
      const color = part.getAttribute('color')
      expect(color.count).toBe(position.count)
      expect(part.getAttribute('normal').count).toBe(position.count)
      expect(part.getAttribute('uv')).toBeUndefined()
      let darkest = 1
      let brightest = 0
      for (let index = 0; index < color.count; index++) {
        darkest = Math.min(darkest, color.getX(index))
        brightest = Math.max(brightest, color.getX(index))
        expect(Number.isFinite(position.getX(index) + position.getY(index))).toBe(true)
      }
      expect(darkest).toBeGreaterThanOrEqual(1 - railLook.recessShade - 1e-6)
      expect(brightest).toBeLessThanOrEqual(1)
      part.dispose()
    }
  }
  expect(guarded).toBeGreaterThan(20)
  expect(built).toBeGreaterThanOrEqual(guarded * 2)
})

test('the rail material is weathered galvanised steel that mirrors its surroundings', () => {
  const material = guardRailMaterial({ value: null })
  expect(material.metalness).toBeGreaterThan(0.7)
  expect(material.roughness).toBeGreaterThan(0.3)
  expect(material.roughness).toBeLessThan(0.65)
  expect(material.vertexColors).toBe(true)
  expect(railLook.reflection).toBeGreaterThan(0.5)
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  for (const part of ['float railSpangle', 'float railGrime', 'float railRust'])
    expect(shader.fragmentShader).toContain(part)
  expect(shader.fragmentShader).toContain('metalnessFactor *= (1.0 - railGrime')
  expect(shader.vertexShader).toContain('railPosition = (modelMatrix * vec4(position, 1.0)).xyz;')
  expect(material.customProgramCacheKey()).toBe('galvanised-rail-spangle-grime')
  material.dispose()
})

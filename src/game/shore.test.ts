import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { MeadowMaterial, rockFacing, rockShares, verge, vergeStart } from './ground'
import { defaults } from './world'

test('the meadow shader wears bare earth into the grass, darkens a wet shore band and draws a foam line', () => {
  Reflect.set(globalThis, 'document', {
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }),
  })
  const material = new MeadowMaterial(new THREE.Texture(), defaults, false)
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  expect(shader.fragmentShader).toContain('float shoreWet')
  expect(shader.fragmentShader).toContain(
    'fieldSoil * sampledDiffuseColor.rgb * 0.55, shoreWet * 0.7',
  )
  expect(shader.fragmentShader).toMatch(/float foamWidth = min\(0\.035, max\(fwidth\(fieldHeight\)/)
  expect(shader.fragmentShader).toContain('float fieldBare')
  expect(shader.fragmentShader).toContain(
    'fieldSoil * sampledDiffuseColor.rgb * 1.15, fieldBare * 0.72',
  )
  expect(shader.fragmentShader.indexOf('float fieldBare')).toBeLessThan(
    shader.fragmentShader.indexOf('float rockBlend'),
  )
  expect(material.customProgramCacheKey()).toBe(
    'triplanar-rock-road-cuts-varied-shore-worn-crisp-verge',
  )
  Reflect.deleteProperty(globalThis, 'document')
})

test('rock on a bank is drawn from one facing instead of two smeared together', () => {
  const [side, top, along] = rockShares(0.6, 0.75, 0.2)
  expect(top).toBeGreaterThan(0.9)
  expect((side ?? 0) + (along ?? 0)).toBeLessThan(0.1)
  const steep = rockShares(0.85, 0.5, 0.15)
  expect(steep[0]).toBeGreaterThan(0.97)
  const shares = rockShares(0.3, -0.4, 0.2)
  expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 9)
  expect(rockShares(1, 1, 0)[0]).toBeCloseTo(0.5, 9)
  expect(rockFacing.sharpness).toBeGreaterThanOrEqual(10)
  Reflect.set(globalThis, 'document', {
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }),
  })
  const material = new MeadowMaterial(new THREE.Texture(), defaults, false)
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  expect(shader.fragmentShader).toContain(
    `pow(abs(normalize(fieldNormal)), vec3(${rockFacing.sharpness.toFixed(1)}))`,
  )
  Reflect.deleteProperty(globalThis, 'document')
})

test('the software ground skips its bump and close detail lookups without changing the rest', () => {
  Reflect.set(globalThis, 'document', {
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }),
  })
  const compile = (software: boolean) => {
    const material = new MeadowMaterial(new THREE.Texture(), defaults, software)
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as unknown as THREE.WebGLProgramParametersWithUniforms
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
    return { material, shader }
  }
  const plain = compile(true)
  const full = compile(false)
  expect(plain.material.bumpMap).toBe(null)
  expect(full.material.bumpMap).not.toBe(null)
  expect(plain.material.defines?.FIELD_PLAIN).toBe('')
  expect(full.material.defines?.FIELD_PLAIN).toBeUndefined()
  expect(plain.shader.fragmentShader).toBe(full.shader.fragmentShader)
  expect(plain.shader.fragmentShader).toMatch(/#ifndef FIELD_PLAIN\nfloat fieldGrain/)
  expect(plain.shader.fragmentShader).toMatch(/#ifdef USE_BUMPMAP\nnormal = perturbNormalArb/)
  Reflect.deleteProperty(globalThis, 'document')
})

test('the grass line beside the road wanders instead of running ruler straight', () => {
  const starts = Array.from({ length: 400 }, (_, index) => vergeStart(index * 0.5))
  expect(Math.min(...starts)).toBeGreaterThanOrEqual(0)
  expect(Math.max(...starts)).toBeLessThanOrEqual(verge.wander)
  expect(Math.max(...starts) - Math.min(...starts)).toBeGreaterThan(verge.wander * 0.9)
  let steepest = 0
  for (let index = 1; index < starts.length; index++)
    steepest = Math.max(steepest, Math.abs((starts[index] ?? 0) - (starts[index - 1] ?? 0)))
  expect(steepest).toBeLessThan(0.4)
  Reflect.set(globalThis, 'document', {
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }),
  })
  const material = new MeadowMaterial(new THREE.Texture(), defaults, false)
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  expect(shader.fragmentShader).toContain('float gravelRag')
  expect(shader.fragmentShader).toContain('float gravelGrain')
  expect(shader.fragmentShader).toContain('mix(diffuseColor.rgb, gravelTone, gravelBlend)')
  Reflect.deleteProperty(globalThis, 'document')
})

import { expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  GroundWriter,
  groundBreakup,
  MeadowMaterial,
  rockFacing,
  rockShares,
  verge,
  vergeReach,
  vergeStart,
} from './ground'
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
  expect(shader.fragmentShader).toMatch(/float foamWidth = min\(0\.035, max\(fieldHeightWidth/)
  expect(
    shader.fragmentShader.indexOf('float fieldHeightWidth = fwidth(fieldHeight)'),
  ).toBeLessThan(shader.fragmentShader.indexOf('if (fieldHeight < 1.4)'))
  expect(shader.fragmentShader).toContain('float fieldBare')
  expect(shader.fragmentShader).toContain(
    'fieldSoil * sampledDiffuseColor.rgb * 1.15, fieldBare * 0.72',
  )
  expect(shader.fragmentShader.indexOf('float fieldBare')).toBeLessThan(
    shader.fragmentShader.indexOf('float rockBlend'),
  )
  expect(material.customProgramCacheKey()).toBe(
    'triplanar-rock-road-cuts-varied-shore-drift-patched-scree-stony-gravel-verge-far-rock-rippled-sand',
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
  expect(plain.shader.fragmentShader).toMatch(
    /#ifndef FIELD_PLAIN\nif \(fieldClose > 0\.0\) \{\n {2}float fieldGrain/,
  )
  expect(plain.shader.fragmentShader).toMatch(/#ifdef USE_BUMPMAP\nnormal = perturbNormalArb/)
  Reflect.deleteProperty(globalThis, 'document')
})

test('rock, bank, gravel and shore lookups run only where they can show', () => {
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
  const source = shader.fragmentShader
  const inside = (gate: string, lookup: string) => {
    const from = source.indexOf(gate)
    expect(from).toBeGreaterThan(-1)
    const at = source.indexOf(lookup, from)
    expect(at).toBeGreaterThan(from)
    expect(source.indexOf('\n}', from)).toBeGreaterThan(at)
    expect(source.indexOf(lookup)).toBe(at)
  }
  inside('if (cutFace > 0.0) {', 'bankPatch = fieldVariationAt')
  inside('if (rockBlend > 0.0) {', 'rockMapAt(fieldRockColorMap, rockUvX)')
  inside('if (rockBlend > 0.0) {\n  vec3 rockNormalX', 'rockMapAt(fieldRockMap, rockUvX)')
  inside('if (fieldHeight < 1.4) {', 'float foamWidth')
  const gate = /if \(fieldRoadDistance < ([\d.]+)\) \{/.exec(source)
  expect(Number(gate?.[1])).toBeGreaterThanOrEqual(0.85 + 0.175 + verge.rag / 2)
  expect(Number(gate?.[1])).toBeCloseTo(vergeReach, 2)
  expect(vergeReach).toBeGreaterThanOrEqual(verge.width + verge.wander + verge.apron)
  inside(gate?.[0] ?? 'missing', 'float gravelBlend')
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

test('the gravel shoulder ends where the roadside grass begins and is stony rather than painted', () => {
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
  const source = shader.fragmentShader
  expect(source).toContain(
    `float gravelWidth = ${verge.width.toFixed(2)} + ${verge.wander.toFixed(2)} * (0.5 + 0.5 * sin(gravelAlong * 0.9 + sin(gravelAlong * 0.23) * 2.0))`,
  )
  expect(source).toContain('float gravelPebble = stoneAt(')
  expect(source).toContain('float gravelApron')
  expect(verge.tone).toBeLessThan(0.85)
  expect(source.indexOf('float gravelApron')).toBeLessThan(
    source.indexOf('mix(diffuseColor.rgb, gravelTone, gravelBlend)'),
  )
  Reflect.deleteProperty(globalThis, 'document')
})

test('fields break into scrub, straw, terraces and scree, and rock stops tiling far away', () => {
  Reflect.set(globalThis, 'document', {
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }),
  })
  const shaders = [false, true].map((software) => {
    const material = new MeadowMaterial(new THREE.Texture(), defaults, software)
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as unknown as THREE.WebGLProgramParametersWithUniforms
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
    return { material, shader }
  })
  const [full, plain] = shaders
  if (!full || !plain) throw new Error('Meadow shaders are missing')
  const source = full.shader.fragmentShader
  for (const part of ['float fieldScrub', 'float fieldStraw', 'float fieldTerrace', 'fieldScree ='])
    expect(source).toContain(part)
  expect(source.indexOf('#ifndef FIELD_PLAIN\nfloat fieldPatch')).toBeGreaterThan(-1)
  expect(source).toContain(`uv * ${rockFacing.farScale.toFixed(2)}`)
  expect(rockFacing.farScale).toBeLessThan(0.5)
  expect(plain.material.defines).toHaveProperty('FIELD_PLAIN')
  expect(full.shader.uniforms.fieldBreakup?.value).toBe(1)
  const winter = new MeadowMaterial(new THREE.Texture(), { ...defaults, season: 'winter' }, false)
  expect(winter.fieldUniforms.fieldBreakup.value).toBe(groundBreakup.winter)
  expect(winter.fieldUniforms.fieldScrubTint.value.toArray()).toEqual([...groundBreakup.frost])
  for (const tint of [groundBreakup.scrub, groundBreakup.pavement])
    for (const channel of tint) {
      expect(channel).toBeGreaterThan(0.45)
      expect(channel).toBeLessThan(1)
    }
  Reflect.deleteProperty(globalThis, 'document')
})

test('ground normals are measured across the span of the mesh they shade', () => {
  const ripple = {
    settings: { ...defaults, landscape: 'desert' as const },
    height: (x: number) => Math.sin(x * 9) * 0.05,
  }
  const road = { x: 0, y: 0, dx: 0, dy: 0, yaw: 0 }
  const tilt = (span: number) => {
    const writer = new GroundWriter(
      ripple as never,
      new THREE.Color('#808080'),
      new THREE.Color('#808080'),
    )
    writer.span = span
    writer.vertex((Math.PI * 114) / 9, 0, road, 40)
    const normal = writer.geometry([]).getAttribute('normal')
    return Math.abs(normal.getX(0))
  }
  expect(tilt(0.2)).toBeGreaterThan(0.2)
  expect(tilt(8)).toBeLessThan(0.02)
})

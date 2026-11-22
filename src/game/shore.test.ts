import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { MeadowMaterial } from './ground'
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
  expect(material.customProgramCacheKey()).toBe('triplanar-rock-road-cuts-varied-shore-worn')
  Reflect.deleteProperty(globalThis, 'document')
})

import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { atmosphereProfile } from './atmosphere'
import { Water } from './water'
import { defaults } from './world'

test('the water plane is finely divided so its depth never loses to the lake bed', () => {
  const water = new Water(new THREE.Scene())
  const { widthSegments, heightSegments, width } = water.mesh.geometry.parameters
  expect(width / widthSegments).toBeLessThanOrEqual(120)
  expect(width / heightSegments).toBeLessThanOrEqual(120)
  water.dispose()
})

test('the water reflects a sky gradient from horizon to zenith', () => {
  const water = new Water(new THREE.Scene())
  const profile = atmosphereProfile({ ...defaults, daylight: 'sunset' })
  water.setAppearance(false, profile)
  const uniforms = water.mesh.material.uniforms
  expect(uniforms.horizonColor?.value.getHex()).toBe(new THREE.Color(profile.horizon).getHex())
  expect(uniforms.zenithColor?.value.getHex()).toBe(new THREE.Color(profile.sky).getHex())
  water.dispose()
})

test('ripples come from noise octaves rather than straight bands and mark the surface as a mirror', () => {
  const water = new Water(new THREE.Scene())
  const shader = water.mesh.material.fragmentShader
  expect(shader).not.toContain('p.y * 0.22')
  expect(shader.match(/rippleOctave\(p,/g)?.length).toBe(4)
  expect(shader).toContain('vec4(color, 1.0 + mirror)')
  water.dispose()
})

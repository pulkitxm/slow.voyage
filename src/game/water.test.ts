import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { atmosphereProfile } from './atmosphere'
import {
  bedDepth,
  bedTone,
  ShoreDepth,
  shoreMap,
  skylineShare,
  Water,
  waterBody,
  waterOptics,
  waterSheen,
} from './water'
import { defaults, fordDepth } from './world'

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
  expect(shader.match(/rippleOctave\([pq],/g)?.length).toBe(5)
  expect(shader).toContain('float gust = ')
  expect(shader).toContain('vec4(color, 1.0 + mirror)')
  water.dispose()
})

test('water far away mirrors sky above the horizon and keeps some of its own colour', () => {
  expect(skylineShare(0)).toBeGreaterThan(0.35)
  expect(skylineShare(0)).toBeLessThan(0.7)
  expect(skylineShare(0.5)).toBe(1)
  expect(skylineShare(0.1)).toBeGreaterThan(skylineShare(0))
  expect(waterSheen(0)).toBe(waterOptics.sheen)
  expect(waterOptics.sheen).toBeLessThan(0.8)
  expect(waterSheen(1)).toBeCloseTo(0.02, 9)
  expect(waterSheen(0.6)).toBeCloseTo(0.02 + 0.98 * 0.4 ** 5, 9)
  const water = new Water(new THREE.Scene())
  const shader = water.mesh.material.fragmentShader
  expect(shader).toContain(`bounce.y + ${waterOptics.waveLift.toFixed(2)}`)
  expect(shader).toContain(
    `min(${waterOptics.sheen.toFixed(2)}, 0.02 + 0.98 * pow(1.0 - facing, 5.0))`,
  )
  water.dispose()
})

test('the lake bed reads as deeper the closer the shelf gets to its floor', () => {
  expect(bedDepth(0)).toBeCloseTo(0, 9)
  expect(bedDepth(0.5)).toBe(-0.5)
  expect(bedDepth(40)).toBe(-shoreMap.land)
  expect(bedDepth(fordDepth)).toBe(shoreMap.deepest)
  expect(bedDepth(fordDepth - 1)).toBe(shoreMap.deepest)
  let last = 0
  for (let height = -0.02; height > fordDepth; height -= 0.02) {
    const depth = bedDepth(height)
    expect(depth).toBeGreaterThan(last)
    expect(depth).toBeLessThanOrEqual(shoreMap.deepest)
    last = depth
  }
  expect(bedDepth(fordDepth / 2)).toBeGreaterThan(1)
})

test('the shore depth map follows the car and matches the bed wherever it has scrolled', () => {
  let calls = 0
  const height = (x: number, s: number) => {
    calls++
    return Math.sin(x * 0.01) * 0.25 + Math.cos(s * 0.013) * 0.2
  }
  const shore = new ShoreDepth(height)
  const step = (shoreMap.deepest + shoreMap.land) / 255
  const check = (x: number, s: number) => {
    const column = Math.floor(x / shoreMap.cell) + 0.5
    const row = Math.floor(s / shoreMap.cell) + 0.5
    const expected = bedDepth(height(column * shoreMap.cell, row * shoreMap.cell))
    expect(Math.abs(shore.depthAt(x, s) - expected)).toBeLessThanOrEqual(step)
  }
  shore.update(10, 20)
  expect(calls).toBe(shoreMap.size ** 2)
  check(10, 20)
  check(-200, 300)
  calls = 0
  shore.update(10.4, 20.2)
  expect(calls).toBe(0)
  shore.update(10 + shoreMap.cell * 2, 20 - shoreMap.cell)
  expect(calls).toBeLessThanOrEqual(shoreMap.size * 3)
  const reach = (shoreMap.size / 2 - 2) * shoreMap.cell
  for (const [dx, ds] of [
    [reach, 0],
    [-reach, 0],
    [0, reach],
    [0, -reach],
    [reach, -reach],
    [3, 7],
  ] as const)
    check(10 + shoreMap.cell * 2 + dx, 20 - shoreMap.cell + ds)
  for (let stride = 0; stride < 40; stride++) shore.update(16 + stride * 7.3, 17 - stride * 5.1)
  for (const [dx, ds] of [
    [reach, reach],
    [-reach, -reach],
    [-40, 90],
  ] as const)
    check(16 + 39 * 7.3 + dx, 17 - 39 * 5.1 + ds)
  shore.reset()
  calls = 0
  shore.update(5000, 5000)
  expect(calls).toBe(shoreMap.size ** 2)
  check(5000, 5000)
  shore.dispose()
})

test('shallow water shows its bed, loses red first and fades out at the waterline', () => {
  const water = new Water(new THREE.Scene(), () => -0.1)
  const shader = water.mesh.material.fragmentShader
  expect(shader).toContain('float waterDepthAt(vec2 p)')
  expect(shader).toContain('body = mix(body, bedColor, clear)')
  expect(shader).toContain('fresnel *= mix(1.0, film, liquid)')
  const [red, green, blue] = waterBody.absorption
  expect(red).toBeGreaterThan(green * 2)
  expect(green).toBeGreaterThan(blue)
  expect(water.mesh.material.uniforms.shoreReady?.value).toBe(0)
  expect(water.mesh.material.uniforms.shoreDepthMap?.value).toBe(water.shore?.texture)
  expect(water.mesh.material.uniforms.shoreCenter?.value).toBe(water.shore?.center)
  const uploads = water.shore?.texture.version ?? 0
  water.update(900, 2000, 0)
  expect(water.mesh.material.uniforms.shoreReady?.value).toBe(1)
  expect(water.mesh.material.uniforms.shoreCenter?.value.x).toBeCloseTo(900, -1)
  expect(water.mesh.material.uniforms.shoreCenter?.value.y).toBeCloseTo(2000, -1)
  expect(water.shore?.texture.version).toBeGreaterThan(uploads)
  const day = atmosphereProfile({ ...defaults, daylight: 'day' })
  const night = atmosphereProfile({ ...defaults, daylight: 'night' })
  const lit = (profile: typeof day) => {
    water.setAppearance(false, profile, 'fjord')
    const bed: THREE.Color = water.mesh.material.uniforms.bedColor?.value
    return bed.r + bed.g + bed.b
  }
  expect(lit(day)).toBeGreaterThan(lit(night) * 3)
  const sand = bedTone('desert', false)
  const loam = bedTone('jungle', false)
  expect(sand.r + sand.g + sand.b).toBeGreaterThan(loam.r + loam.g + loam.b)
  water.dispose()
  expect(new Water(new THREE.Scene()).shore).toBeNull()
})

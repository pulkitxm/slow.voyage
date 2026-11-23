import { expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  castGait,
  castLight,
  castPace,
  castPick,
  castShade,
  castSources,
  restClip,
  standing,
  stridePace,
} from './cast'

test('cattle come as a cow and a bull and the elephant has a model of its own', () => {
  const cattle = castSources.filter((source) => source.kind === 'cow')
  expect(cattle.length).toBe(2)
  expect(new Set(cattle.map((source) => source.url)).size).toBe(2)
  expect(castSources.some((source) => source.kind === 'elephant')).toBe(true)
  const elephant = castSources.find((source) => source.kind === 'elephant')
  expect(elephant?.height ?? 0).toBeGreaterThan((cattle[0]?.height ?? 0) * 1.7)
  for (const source of castSources) expect(source.url).toMatch(/\.glb/)
  for (const source of cattle) {
    expect(source.glow ?? 1).toBeGreaterThan(1.2)
    expect(source.height).toBeGreaterThan(1.7)
  }
})

test('a model without an idle clip stands in its rest pose', () => {
  const root = new THREE.Object3D()
  const hip = new THREE.Bone()
  hip.name = 'hip'
  hip.position.set(0, 1.2, 0)
  const knee = new THREE.Bone()
  knee.name = 'knee'
  knee.position.set(0, -0.6, 0.1)
  knee.quaternion.setFromEuler(new THREE.Euler(0.3, 0, 0))
  hip.add(knee)
  root.add(hip)
  const clip = restClip(root, 'Idle')
  expect(clip.name).toBe('Idle')
  expect(clip.tracks.length).toBe(6)
  knee.quaternion.identity()
  knee.position.set(0, 0, 0)
  const mixer = new THREE.AnimationMixer(root)
  mixer.clipAction(clip).play()
  mixer.update(0.5)
  expect(knee.position.y).toBeCloseTo(-0.6, 5)
  expect(knee.position.z).toBeCloseTo(0.1, 5)
  expect(new THREE.Euler().setFromQuaternion(knee.quaternion).x).toBeCloseTo(0.3, 5)
  expect(hip.position.y).toBeCloseTo(1.2, 5)
})

test('standing measures the height and the level of the feet, so a model with a low origin is lifted', () => {
  expect(standing(new THREE.Object3D())).toEqual({ height: 0, base: 0 })
  const root = new THREE.Object3D()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2.5, 1))
  body.position.y = 1.25
  root.add(body)
  expect(standing(root).height).toBeCloseTo(2.5, 5)
  expect(standing(root).base).toBeCloseTo(0, 5)
  body.position.y = 0.25
  expect(standing(root).height).toBeCloseTo(2.5, 5)
  expect(standing(root).base).toBeCloseTo(-1, 5)
})

test('herds are mostly cows with the odd bull, chosen the same way for the same animal', () => {
  const shares = castSources
    .filter((source) => source.kind === 'cow')
    .map((source) => source.share ?? 1)
  const counts = [0, 0]
  for (let animal = 0; animal < 400; animal++) {
    const pick = castPick(shares, animal * 0.0731 + 0.013)
    expect(castPick(shares, animal * 0.0731 + 0.013)).toBe(pick)
    counts[pick] = (counts[pick] ?? 0) + 1
  }
  expect(counts[0] ?? 0).toBeGreaterThan((counts[1] ?? 0) * 2)
  expect(counts[1] ?? 0).toBeGreaterThan(40)
  expect(castPick([1], 0.42)).toBe(0)
  expect(castPick([1, 1], 0)).toBe(0)
})

test('legs turn over at the rate the ground passes, and stop when the animal does', () => {
  const strides = { walk: 0.8, run: 4 }
  expect(castGait(0, 0.4, strides, true)).toBe(null)
  expect(castGait(castPace.still * 0.9, 0.4, strides, true)).toBe(null)
  expect(castGait(0.6, 0.02, strides, true)).toBe(null)
  expect(castGait(0.4, 0.4, strides, true)).toEqual({ clip: 'Walk', rate: 0.5 })
  expect(castGait(1.2, 0.4, strides, true)?.clip).toBe('Walk')
  expect(castGait(1.2, 0.4, strides, true)?.rate).toBeCloseTo(1.5, 9)
  expect(castGait(3, 0.9, strides, true)).toEqual({ clip: 'Run', rate: 0.75 })
  expect(castGait(3, 0.9, strides, false)).toEqual({ clip: 'Walk', rate: castPace.fastest })
  expect(castGait(0.15, 0.4, strides, true)?.rate).toBe(castPace.slowest)
  for (const pace of [0.3, 0.7, 1.4, 2.1])
    expect((castGait(pace, 0.4, strides, false)?.rate ?? 0) * strides.walk).toBeCloseTo(pace, 9)
})

test('the ground speed of a walk clip is read from how its planted feet slide', () => {
  const root = new THREE.Object3D()
  const hip = new THREE.Bone()
  hip.name = 'hip'
  hip.position.set(0, 1, 0)
  root.add(hip)
  const period = 1.2
  const reach = 0.3
  const planted = 0.6
  const pace = (reach * 2) / (planted * period)
  const tracks: THREE.KeyframeTrack[] = []
  for (const [name, offset] of [
    ['footL', 0],
    ['footR', 0.5],
  ] as const) {
    const foot = new THREE.Bone()
    foot.name = name
    root.add(foot)
    const times: number[] = []
    const values: number[] = []
    for (let key = 0; key <= 120; key++) {
      const beat = (key / 120 + offset) % 1
      const swing = (beat - planted) / (1 - planted)
      times.push((key / 120) * period)
      values.push(
        name === 'footL' ? -0.2 : 0.2,
        beat < planted ? 0 : Math.sin(Math.PI * swing) * 0.2,
        beat < planted ? reach - (beat / planted) * reach * 2 : -reach + swing * reach * 2,
      )
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, values))
  }
  const clip = new THREE.AnimationClip('Walk', period, tracks)
  expect(stridePace(root, clip)).toBeGreaterThan(pace * 0.88)
  expect(stridePace(root, clip)).toBeLessThan(pace * 1.12)
  expect(stridePace(root, restClip(root, 'Idle'))).toBe(0)
  expect(stridePace(new THREE.Object3D(), clip)).toBe(0)
})

test('animals and walkers darken with the canopy shade they stand in', () => {
  expect(castLight(0)).toBe(1)
  expect(castLight(0.34)).toBeCloseTo(1 - 0.34 * castShade.depth, 9)
  expect(castLight(0.34)).toBeLessThan(0.75)
  expect(castLight(1)).toBeGreaterThan(0.1)
  expect(castLight(2)).toBe(castLight(1))
  expect(castLight(-1)).toBe(1)
  expect(castLight(0.6)).toBeLessThan(castLight(0.3))
})

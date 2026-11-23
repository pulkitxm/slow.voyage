import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { castPick, castSources, restClip, standing } from './cast'

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

import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { paintFinish, paintTone, tintPaint } from './paint'
import { probeFace } from './reflection-probe'

describe('paint', () => {
  test('paint is toned below full saturation and never to a dead channel', () => {
    const red = tintPaint(new THREE.Color(), '#ff0000')
    expect(red.r).toBeLessThanOrEqual(paintTone.depth)
    expect(red.g).toBeGreaterThanOrEqual(paintTone.floor)
    expect(red.b).toBeGreaterThanOrEqual(paintTone.floor)
    const blue = tintPaint(new THREE.Color(), '#0000ff')
    expect(blue.r).toBeGreaterThanOrEqual(paintTone.floor)
    expect(blue.b).toBeGreaterThan(blue.r * 5)
  })

  test('toning keeps the hue and the order of brightness', () => {
    const light = tintPaint(new THREE.Color(), '#f0f0f0')
    const dark = tintPaint(new THREE.Color(), '#303030')
    expect(light.r).toBeGreaterThan(dark.r)
    expect(light.r).toBeCloseTo(light.g, 5)
    const green = tintPaint(new THREE.Color(), '#2e7d32')
    expect(green.g).toBeGreaterThan(green.r)
    expect(green.g).toBeGreaterThan(green.b)
  })

  test('the finish is a glossy clearcoat over a part-metallic base', () => {
    expect(paintFinish.clearcoat).toBe(1)
    expect(paintFinish.clearcoatRoughness).toBeLessThan(0.08)
    expect(paintFinish.metalness).toBeGreaterThan(0.2)
    expect(paintFinish.metalness).toBeLessThan(0.8)
    expect(paintFinish.live).toBeGreaterThan(paintFinish.chase)
  })
})

describe('reflection probe', () => {
  test('one cube face is drawn per frame in turn', () => {
    expect(Array.from({ length: 8 }, (_, frame) => probeFace(frame, 1))).toEqual([
      0, 1, 2, 3, 4, 5, 0, 1,
    ])
  })

  test('a slower cadence skips frames between faces', () => {
    expect(Array.from({ length: 6 }, (_, frame) => probeFace(frame, 2))).toEqual([
      0, -1, 1, -1, 2, -1,
    ])
    expect(probeFace(22, 2)).toBe(5)
    expect(probeFace(24, 2)).toBe(0)
  })
})

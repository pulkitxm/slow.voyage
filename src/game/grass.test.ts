import { expect, test } from 'bun:test'
import {
  grassDead,
  grassFragmentColor,
  grassLighting,
  grassLook,
  slopeHeight,
  vergeHeight,
} from './grass'

test('the extra light on grass blades is held back where the sun is shadowed', () => {
  expect(grassLighting).toContain('float grassSunlit')
  expect(grassLighting).toContain('reflectedLight.directDiffuse')
  const bonus = grassLighting.split('\n').filter((line) => line.startsWith('outgoingLight +='))
  expect(bonus.length).toBe(2)
  for (const line of bonus) expect(line).toContain('grassSunlit')
  expect(grassLighting.trim().endsWith('#include <opaque_fragment>')).toBe(true)
})

test('grass stands shorter at the road edge and reaches full height a few metres out', () => {
  expect(vergeHeight(-1)).toBe(grassLook.verge.low)
  expect(vergeHeight(0)).toBe(grassLook.verge.low)
  expect(vergeHeight(grassLook.verge.reach)).toBe(1)
  expect(vergeHeight(40)).toBe(1)
  let before = vergeHeight(0)
  for (let beyond = 0.25; beyond <= grassLook.verge.reach; beyond += 0.25) {
    const height = vergeHeight(beyond)
    expect(height).toBeGreaterThanOrEqual(before)
    before = height
  }
})

test('grass on steep ground is shorter than grass on the level and never taller', () => {
  expect(slopeHeight(1)).toBe(1)
  expect(slopeHeight(grassLook.slope.level)).toBe(1)
  expect(slopeHeight(grassLook.slope.steep)).toBe(grassLook.slope.low)
  expect(slopeHeight(0.2)).toBe(grassLook.slope.low)
  const part = slopeHeight((grassLook.slope.steep + grassLook.slope.level) / 2)
  expect(part).toBeGreaterThan(grassLook.slope.low)
  expect(part).toBeLessThan(1)
})

test('blades darken toward the root and every season has its own dead straw', () => {
  expect(grassLook.root).toBeLessThan(0.7)
  expect(grassLook.tip).toBeGreaterThan(1)
  expect(new Set([grassDead('summer'), grassDead('autumn'), grassDead('winter')]).size).toBe(3)
  for (const season of ['summer', 'autumn', 'winter'] as const)
    expect(grassDead(season)).toMatch(/^#[0-9a-f]{6}$/)
  expect(grassFragmentColor).toContain('bladeId')
  expect(grassFragmentColor).toContain('grassLush')
  expect(grassFragmentColor).toContain('fieldDryGrass')
})

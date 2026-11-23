import { expect, test } from 'bun:test'
import { grassLighting } from './grass'

test('the extra light on grass blades is held back where the sun is shadowed', () => {
  expect(grassLighting).toContain('float grassSunlit')
  expect(grassLighting).toContain('reflectedLight.directDiffuse')
  const bonus = grassLighting.split('\n').filter((line) => line.startsWith('outgoingLight +='))
  expect(bonus.length).toBe(2)
  for (const line of bonus) expect(line).toContain('grassSunlit')
  expect(grassLighting.trim().endsWith('#include <opaque_fragment>')).toBe(true)
})

import { describe, expect, test } from 'bun:test'
import { decodeSettings } from './settings'
import { defaults } from './world'

describe('saved preferences', () => {
  test('rejects unsupported choices and invalid numeric data', () => {
    const settings = decodeSettings({
      vehicle: 'unknown',
      season: null,
      volume: Number.NaN,
      power: '2',
      camera: {},
    })
    expect(settings).toEqual(defaults)
  })
  test('clamps bounded settings and ignores unrelated properties', () => {
    const settings = decodeSettings({
      volume: 900,
      grip: -10,
      seed: 1e8,
      power: 50,
      color: 'url(example)',
      extra: true,
    })
    expect(settings.volume).toBe(1)
    expect(settings.grip).toBe(0.5)
    expect(settings.power).toBe(2)
    expect(settings.seed).toBe(99999)
    expect(settings.color).toBe(defaults.color)
    expect('extra' in settings).toBe(false)
  })
  test('round-trips supported preferences', () => {
    const preferences = {
      ...defaults,
      vehicle: 'bus' as const,
      season: 'winter' as const,
      volume: 0,
      units: 'mi' as const,
      color: '#b65a44',
    }
    expect(decodeSettings(JSON.parse(JSON.stringify(preferences)))).toEqual(preferences)
  })
  test('recovers safely from absent or malformed storage', () => {
    for (const input of [undefined, null, [], 'invalid', 12])
      expect(decodeSettings(input)).toEqual(defaults)
  })
})

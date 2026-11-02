import { expect, test } from 'bun:test'
import { journeys, nextJourney } from './journeys'
import { defaults } from './world'

test('scenery shortcuts cycle every preset and wrap in both directions', () => {
  let settings = { ...defaults }
  for (let i = 0; i < journeys.length; i++) {
    const next = nextJourney(settings, 1)
    settings = {
      ...settings,
      landscape: next.landscape,
      season: next.season,
      daylight: next.daylight,
    }
  }
  expect(settings).toEqual(defaults)
  const previous = nextJourney(defaults, -1)
  expect(nextJourney({ ...defaults, ...previous }, 1).name).toBe('Summer hills')
})

test('custom scenery enters the preset list without dropping vehicle or handling choices', () => {
  const custom = {
    ...defaults,
    landscape: 'desert' as const,
    season: 'winter' as const,
    daylight: 'night' as const,
    vehicle: 'bus' as const,
    grip: 0.2,
  }
  expect(nextJourney(custom, 1).name).toBe('Summer hills')
  expect(nextJourney(custom, -1).name).toBe('Alpine night')
  expect(custom.vehicle).toBe('bus')
  expect(custom.grip).toBe(0.2)
})

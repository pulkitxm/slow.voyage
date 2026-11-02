import { expect, test } from 'bun:test'
import { atmosphereProfile } from './atmosphere'
import { defaults } from './world'

test('weather changes visibility and direct light rather than only recoloring the sky', () => {
  const clear = atmosphereProfile(defaults)
  const fog = atmosphereProfile({ ...defaults, weather: 'fog' })
  const rain = atmosphereProfile({ ...defaults, weather: 'rain' })
  expect(fog.fog).toBeGreaterThan(clear.fog * 5)
  expect(rain.sunlight).toBeLessThan(clear.sunlight)
  expect(rain.wet).toBe(true)
  expect(fog.wet).toBe(false)
})

test('winter precipitation becomes snow and night preserves reduced exposure', () => {
  const snow = atmosphereProfile({ ...defaults, season: 'winter', weather: 'rain' })
  expect(snow.snow).toBe(true)
  expect(snow.wet).toBe(false)
  expect(atmosphereProfile({ ...defaults, daylight: 'night' }).exposure).toBeLessThan(
    atmosphereProfile(defaults).exposure,
  )
})

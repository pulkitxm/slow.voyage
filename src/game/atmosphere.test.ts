import { expect, test } from 'bun:test'
import { atmosphereProfile, cycleStage, dayCycle } from './atmosphere'
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

test('dawn and dusk sit between daylight and night', () => {
  const day = atmosphereProfile(defaults)
  const dawn = atmosphereProfile({ ...defaults, daylight: 'dawn' })
  const dusk = atmosphereProfile({ ...defaults, daylight: 'dusk' })
  const night = atmosphereProfile({ ...defaults, daylight: 'night' })
  expect(dawn.sunlight).toBeLessThan(day.sunlight)
  expect(dawn.sunlight).toBeGreaterThan(dusk.sunlight)
  expect(dusk.ambient).toBeGreaterThan(night.ambient)
  expect(dusk.stars).toBeGreaterThan(0)
  expect(dusk.stars).toBeLessThan(night.stars)
  expect(dawn.night).toBe(0)
  expect(dusk.night).toBe(1)
  expect(dawn.sunHeight).toBeLessThan(day.sunHeight)
})

test('a storm is darker, wetter and foggier than rain', () => {
  const rain = atmosphereProfile({ ...defaults, weather: 'rain' })
  const storm = atmosphereProfile({ ...defaults, weather: 'storm' })
  expect(storm.sunlight).toBeLessThan(rain.sunlight)
  expect(storm.fog).toBeGreaterThan(rain.fog)
  expect(storm.wet).toBe(true)
  expect(storm.downpour).toBe(1)
  expect(rain.downpour).toBe(0)
  expect(atmosphereProfile({ ...defaults, weather: 'storm', season: 'winter' }).snow).toBe(true)
})

test('the live sky passes through every phase and never jumps', () => {
  const settings = { ...defaults, daylight: 'cycle' as const }
  const seen = new Set<string>()
  let previous = atmosphereProfile(settings, 0)
  for (let clock = 0; clock <= dayCycle.seconds; clock += 0.5) {
    const stage = cycleStage(clock)
    seen.add(stage.from)
    expect(stage.blend).toBeGreaterThanOrEqual(0)
    expect(stage.blend).toBeLessThanOrEqual(1)
    const profile = atmosphereProfile(settings, clock)
    expect(Math.abs(profile.sunlight - previous.sunlight)).toBeLessThan(0.05)
    expect(Math.abs(profile.ambient - previous.ambient)).toBeLessThan(0.05)
    expect(Math.abs(profile.sunHeight - previous.sunHeight)).toBeLessThan(2.5)
    expect(profile.sky).toMatch(/^#[0-9a-f]{6}$/)
    previous = profile
  }
  expect([...seen].sort()).toEqual(['dawn', 'day', 'dusk', 'night', 'sunset'])
  const wrapped = atmosphereProfile(settings, dayCycle.seconds * 3 + 40)
  expect(wrapped).toEqual(atmosphereProfile(settings, 40))
})

test('a fixed time of day ignores the clock', () => {
  expect(atmosphereProfile(defaults, 500)).toEqual(atmosphereProfile(defaults, 0))
})

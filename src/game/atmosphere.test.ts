import { expect, test } from 'bun:test'
import { Color, ShaderChunk } from 'three'
import {
  airScatter,
  atmosphereProfile,
  bounceLevel,
  cycleStage,
  dayCycle,
  fillColor,
  lightBalance,
  reflectionLevel,
  reflectionSize,
  scatteredFog,
  scatterFor,
  sunElevation,
} from './atmosphere'
import { defaults } from './world'

const level = (color: Color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b

function keyToFill(settings: typeof defaults) {
  const profile = atmosphereProfile(settings)
  const sun = new Color(profile.sun)
  const key = profile.sunlight * sunElevation(profile.sunHeight) * level(sun)
  return key / (profile.fill * lightBalance.fillLevel)
}

test('clear midday ground takes several times more light from the sun than from the sky', () => {
  const ratio = keyToFill({ ...defaults, daylight: 'day', weather: 'clear' })
  expect(ratio).toBeGreaterThan(4)
  expect(ratio).toBeLessThan(9)
})

test('cloud cover hands the lighting from the sun to the sky', () => {
  for (const weather of ['overcast', 'rain', 'storm', 'fog'] as const)
    expect(keyToFill({ ...defaults, daylight: 'day', weather })).toBeLessThan(0.5)
})

test('moonlight is a cool key over a dimmer fill and stays far below daylight', () => {
  const night = atmosphereProfile({ ...defaults, daylight: 'night' })
  const day = atmosphereProfile({ ...defaults, daylight: 'day' })
  const moon = new Color(night.sun)
  expect(moon.b).toBeGreaterThan(moon.r)
  expect(night.moon).toBe(1)
  expect(day.moon).toBe(0)
  expect(night.sunlight).toBeLessThan(day.sunlight * 0.5)
  const ratio = keyToFill({ ...defaults, daylight: 'night' })
  expect(ratio).toBeGreaterThan(1.2)
  expect(ratio).toBeLessThan(5)
})

test('a low sun is warmer and lower than the midday sun', () => {
  const day = atmosphereProfile({ ...defaults, daylight: 'day' })
  for (const daylight of ['dawn', 'sunset', 'dusk'] as const) {
    const low = atmosphereProfile({ ...defaults, daylight })
    const sun = new Color(low.sun)
    expect(sunElevation(low.sunHeight)).toBeLessThan(0.25)
    expect(sun.r / sun.b).toBeGreaterThan(new Color(day.sun).r / new Color(day.sun).b)
  }
})

test('sky fill keeps the hue of the sky at one brightness', () => {
  const tone = new Color()
  for (const daylight of ['dawn', 'day', 'sunset', 'dusk', 'night'] as const) {
    const profile = atmosphereProfile({ ...defaults, daylight })
    fillColor(tone, profile.skyFill)
    expect(level(tone)).toBeCloseTo(lightBalance.fillLevel, 1)
  }
  fillColor(tone, atmosphereProfile({ ...defaults, daylight: 'day' }).skyFill)
  expect(tone.b).toBeGreaterThan(tone.r)
})

test('sunlit ground throws more light back up than shaded ground', () => {
  const day = atmosphereProfile({ ...defaults, daylight: 'day' })
  const overcast = atmosphereProfile({ ...defaults, daylight: 'day', weather: 'overcast' })
  expect(bounceLevel(day)).toBeGreaterThan(bounceLevel(overcast) * 2)
  expect(bounceLevel(overcast)).toBeGreaterThan(lightBalance.bounce)
  expect(bounceLevel({ sunlight: 0, sunHeight: 100, fill: 1 })).toBeCloseTo(lightBalance.bounce, 9)
})

test('clear air scatters blue first and thick weather scatters every colour alike', () => {
  const clear = scatterFor(atmosphereProfile({ ...defaults, daylight: 'day' }).fog)
  expect(clear).toEqual([...airScatter.clear])
  expect(clear[2]).toBeGreaterThan(clear[1])
  expect(clear[1]).toBeGreaterThan(clear[0])
  const fog = scatterFor(atmosphereProfile({ ...defaults, weather: 'fog' }).fog)
  expect(fog).toEqual([1, 1, 1])
  const rain = scatterFor(atmosphereProfile({ ...defaults, weather: 'rain' }).fog)
  expect(rain).toEqual([1, 1, 1])
})

test('distance fog is patched once and leaves linear fog a single shade', () => {
  const original = ShaderChunk.fog_fragment
  const scattered = scatteredFog(original)
  expect(scattered).not.toBe(original)
  expect(scattered).toContain('vec3 fogFactor = 1.0 - exp(')
  expect(scattered).toContain('* fogSpread )')
  expect(scattered).toContain('vec3 fogFactor = vec3( smoothstep( fogNear, fogFar, vFogDepth ) );')
  expect(scattered).not.toContain('float fogFactor')
  expect(scatteredFog(scattered)).toBe(scattered)
})

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

test('a software renderer keeps its first reflection map and only scales its brightness', () => {
  const day = atmosphereProfile({ ...defaults, daylight: 'day' }).ambient
  const night = atmosphereProfile({ ...defaults, daylight: 'night' }).ambient
  expect(reflectionLevel(day, day)).toBe(1)
  expect(reflectionLevel(night, day)).toBeCloseTo(night / day, 9)
  expect(reflectionLevel(night, day)).toBeLessThan(0.6)
  expect(reflectionLevel(day, night)).toBeGreaterThan(1.5)
  expect(reflectionLevel(1000, 1)).toBe(8)
  expect(reflectionLevel(0, 1)).toBe(0.05)
  expect(reflectionLevel(1, 0)).toBe(1)
  expect(reflectionSize.coarse * 4).toBeLessThanOrEqual(reflectionSize.full)
})

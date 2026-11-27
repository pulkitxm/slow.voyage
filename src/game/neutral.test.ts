import { describe, expect, it } from 'bun:test'
import { engineCatalog, engineFamilies, swapEngines } from './engine-catalog'
import { EngineVoice, engineSounds, ignition } from './engine-sound'
import { CarPhysics, type Input } from './physics'
import { engineProfiles, Gearbox, stickShift } from './powertrain'
import { paramIndex, SoundSynth, soundChannels } from './sound-synth'
import { defaults, engineIds, type Settings, World } from './world'

const rest: Input = {
  throttle: 0,
  boost: false,
  brake: 0,
  steer: 0,
  steeringSource: null,
  handbrake: false,
  regenBrake: 0,
}

function parked(changes: Partial<Settings> = {}) {
  const settings: Settings = { ...defaults, roadMode: 'straight', ...changes }
  const car = new CarPhysics(new World(settings))
  car.reset(300)
  car.update(1 / 60, rest, settings)
  return { car, settings }
}

function hold(car: CarPhysics, settings: Settings, input: Partial<Input>, seconds: number) {
  let highest = 0
  for (let step = 0; step < seconds * 60; step++) {
    car.update(1 / 60, { ...rest, ...input }, settings)
    highest = Math.max(highest, car.gearbox.rpm)
  }
  return highest
}

describe('neutral', () => {
  it.each([false, true])('revs freely in place with the manual gearbox %p', (manual) => {
    const { car, settings } = parked({ engine: 'five25' })
    const redline = car.gearbox.profile.redline
    const highest = hold(car, settings, { throttle: 1, manual, neutral: true }, 2)
    expect(car.telemetry().gear).toBe('N')
    expect(Math.abs(car.speed)).toBeLessThan(0.05)
    expect(highest).toBeGreaterThan(redline * 0.97)
    expect(highest).toBeLessThanOrEqual(redline)
    hold(car, settings, { throttle: 0, manual, neutral: true }, 3)
    expect(car.gearbox.rpm).toBeLessThan(car.gearbox.profile.idle * 1.05)
  })
  it('bounces off the limiter and cuts while held flat', () => {
    const { car, settings } = parked()
    let cuts = 0
    for (let step = 0; step < 180; step++) {
      car.update(1 / 60, { ...rest, throttle: 1, neutral: true }, settings)
      if (car.gearbox.cutting) cuts++
    }
    expect(cuts).toBeGreaterThan(10)
    expect(car.gearbox.limited).toBe(true)
  })
  it('climbs like a light engine and a heavy diesel at their own pace', () => {
    const climb = (engine: Settings['engine']) => {
      const { car, settings } = parked({ engine, vehicle: 'hatchback' })
      const profile = car.gearbox.profile
      const goal = profile.idle + (profile.redline - profile.idle) * 0.9
      for (let step = 1; step < 300; step++) {
        car.update(1 / 60, { ...rest, throttle: 1, neutral: true }, settings)
        if (car.gearbox.rpm >= goal) return step / 60
      }
      return Number.POSITIVE_INFINITY
    }
    const diesel = climb('diesel18')
    const race = climb('f1v10')
    expect(race).toBeLessThan(0.3)
    expect(diesel).toBeGreaterThan(0.6)
    expect(diesel).toBeLessThan(1.5)
  })
  it('lets the car coast and brake without reversing or burning boost', () => {
    const { car, settings } = parked()
    car.speed = 20
    hold(car, settings, { throttle: 1, boost: true, neutral: true }, 1)
    expect(car.speed).toBeLessThan(20)
    expect(car.nitro.level).toBe(1)
    hold(car, settings, { brake: 1, neutral: true }, 6)
    expect(car.speed).toBeGreaterThanOrEqual(-0.05)
    expect(car.speed).toBeLessThan(0.5)
  })
  it('engages the gear that suits the speed on the way out', () => {
    const box = new Gearbox(engineProfiles.touring)
    box.update(30, 0, 1 / 60, false, true)
    expect(box.label(30)).toBe('N')
    const shifts = box.shifts
    box.update(30, 0.3, 1 / 60, false, false)
    expect(box.gear).toBeGreaterThan(2)
    expect(box.engagedRpm(30)).toBeLessThan(engineProfiles.touring.redline)
    expect(box.shifts).toBe(shifts + 1)
  })
  it('drops into first and launches when released at a standstill with revs up', () => {
    const { car, settings } = parked({ transmission: 'manual' })
    hold(car, settings, { throttle: 1, manual: true, neutral: true }, 1)
    hold(car, settings, { throttle: 1, manual: true }, 1.5)
    expect(car.gearbox.gear).toBeGreaterThanOrEqual(1)
    expect(car.speed).toBeGreaterThan(3)
  })
  it('keeps reverse selected when leaving neutral while backing', () => {
    const box = new Gearbox(engineProfiles.touring)
    box.update(0, 0, 1 / 60, true)
    box.request(-1, 0)
    expect(box.gear).toBe(-1)
    box.update(0, 0, 1 / 60, true, true)
    box.update(-1, 0, 1 / 60, true, false)
    expect(box.gear).toBe(-1)
    expect(stickShift.free.climb).toBeGreaterThan(0)
  })
})

describe('starting an engine', () => {
  const rate = 48000
  function start(moving = 0) {
    const voice = new EngineVoice(rate, 1)
    voice.configure(engineCatalog.cross50.sound)
    voice.idle = 700
    voice.redline = 7500
    voice.rpm = 700
    voice.speed = moving
    voice.ignite()
    const out = [0, 1, 2, 3].map(() => new Float32Array(128))
    const windows: { exhaust: number; bay: number }[] = []
    let exhaust = 0
    let bay = 0
    for (let block = 1; block <= 3.6 * (rate / 128); block++) {
      voice.render(
        out[0] as Float32Array,
        out[1] as Float32Array,
        out[2] as Float32Array,
        out[3] as Float32Array,
        128,
      )
      for (const value of out[0] as Float32Array) exhaust += value * value
      for (const value of out[2] as Float32Array) bay += value * value
      if (block % Math.round((0.3 * rate) / 128) === 0) {
        windows.push({ exhaust, bay })
        exhaust = bay = 0
      }
    }
    return { windows, voice }
  }
  it('cranks on the starter, catches with a flare and settles to idle', () => {
    const { windows, voice } = start()
    const cranking = windows[1] as { exhaust: number; bay: number }
    const flare = windows[3] as { exhaust: number; bay: number }
    const settled = windows[10] as { exhaust: number; bay: number }
    expect(flare.exhaust).toBeGreaterThan(cranking.exhaust * 4)
    expect(cranking.bay).toBeGreaterThan(0)
    expect(flare.exhaust).toBeGreaterThan(settled.exhaust)
    expect(voice.starting).toBe(false)
    expect(ignition.crank + ignition.flare).toBeLessThan(3)
  })
  it('does not restart an engine that is already moving', () => {
    const { voice } = start(15)
    expect(voice.starting).toBe(false)
  })
  it('the synth starts the engine on a swap but not on the first sound', () => {
    const synth = new SoundSynth(rate, 1)
    const p = synth.params
    p[paramIndex.idle] = 800
    p[paramIndex.redline] = 6500
    p[paramIndex.rpm] = 800
    const channels = soundChannels.map(() => new Float32Array(128))
    synth.render(channels, 128)
    expect(synth.engine.starting).toBe(false)
    p[paramIndex.engine] = engineIds.indexOf('v1052')
    synth.render(channels, 128)
    expect(synth.engine.starting).toBe(true)
    expect(engineSounds.touring.cylinders).toBe(8)
  })
})

describe('engine families', () => {
  it('groups every engine and keeps the list in family order', () => {
    const order = Object.keys(engineFamilies)
    const families = swapEngines.map((id) => order.indexOf(engineCatalog[id].family))
    expect(families.every((family) => family >= 0)).toBe(true)
    expect([...families].sort((a, b) => a - b)).toEqual(families)
    for (const family of order)
      expect(swapEngines.some((id) => engineCatalog[id].family === family)).toBe(true)
    expect(swapEngines.length).toBeGreaterThanOrEqual(20)
  })
  it('models unequal headers on the boxer and a race engine past 18,000 rpm', () => {
    expect(engineCatalog.boxer25.sound.stagger?.some((delay) => delay > 0)).toBe(true)
    expect(engineCatalog.f1v10.profile.redline).toBeGreaterThan(18000)
    expect(engineCatalog.three10.sound.cylinders).toBe(3)
    expect(engineCatalog.rotary26.sound.valvetrain).toBe(0)
  })
})

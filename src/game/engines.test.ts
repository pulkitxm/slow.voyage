import { describe, expect, it } from 'bun:test'
import { carName, engineCars } from './engine-catalog'
import { EngineVoice, engineSounds, soundVehicles } from './engine-sound'
import {
  boostPull,
  engineCatalog,
  fitEngine,
  horsepower,
  spoolBoost,
  swapEngines,
  swappable,
} from './engines'
import { CarPhysics, type Input } from './physics'
import { engineProfiles } from './powertrain'
import { decodeSettings } from './settings'
import { SoundFrame } from './sound-frame'
import { paramIndex, SoundSynth, soundChannels } from './sound-synth'
import { freshAmbience } from './soundscape'
import { vehicleMetrics } from './vehicles'
import { defaults, type EngineId, engineIds, type Settings, type Vehicle, World } from './world'

const rest: Input = {
  throttle: 0,
  boost: false,
  brake: 0,
  steer: 0,
  steeringSource: null,
  handbrake: false,
  regenBrake: 0,
}

function launch(vehicle: Vehicle, engine: EngineId, seconds = 40) {
  const settings: Settings = { ...defaults, roadMode: 'straight', life: 'none', vehicle, engine }
  const car = new CarPhysics(new World(settings))
  car.reset(300)
  const dt = 1 / 60
  let hundred = Number.POSITIVE_INFINITY
  let top = 0
  for (let step = 0; step < seconds / dt; step++) {
    car.update(dt, { ...rest, throttle: 1 }, settings)
    if (car.speed * 3.6 >= 100 && hundred === Number.POSITIVE_INFINITY) hundred = step * dt
    top = Math.max(top, car.speed)
  }
  return { hundred, top, car }
}

describe('engine catalog', () => {
  it('lists every swap engine as a setting after the stock choice', () => {
    expect(engineIds[0]).toBe('stock')
    expect([...engineIds.slice(1)].sort()).toEqual([...swapEngines].sort())
  })
  it.each(swapEngines)('%s has a complete and consistent layout', (id) => {
    const spec = engineCatalog[id]
    const sound = spec.sound
    expect(sound.firing).toHaveLength(sound.cylinders)
    expect(sound.banks).toHaveLength(sound.cylinders)
    expect(sound.cylinders).toBeLessThanOrEqual(16)
    for (const angle of sound.firing) expect(angle).toBeGreaterThanOrEqual(0)
    for (const angle of sound.firing) expect(angle).toBeLessThan(720)
    expect(spec.profile.idle).toBeLessThan(spec.profile.downshift)
    expect(spec.profile.downshift).toBeLessThan(spec.profile.cruiseShift)
    expect(spec.profile.cruiseShift).toBeLessThan(spec.profile.upshift)
    expect(spec.profile.upshift).toBeLessThan(spec.profile.redline)
    expect(spec.power).toBeGreaterThan(0)
    expect(spec.torque).toBeGreaterThan(0)
  })
  it('spans a small diesel to a sixteen cylinder hypercar engine', () => {
    const powers = swapEngines.map((id) => engineCatalog[id].power)
    expect(Math.min(...powers)).toBe(engineCatalog.diesel18.power)
    expect(Math.max(...powers)).toBe(engineCatalog.w1680.power)
    expect(engineCatalog.diesel18.litres).toBe(1.8)
    expect(engineCatalog.diesel18.sound.clatter).toBeGreaterThan(0)
    expect(engineCatalog.w1680.sound.cylinders).toBe(16)
    expect(horsepower(engineCatalog.w1680.power)).toBe(1500)
  })
  it('gives each engine family its own sound character', () => {
    expect(new Set(swapEngines.map((id) => engineCatalog[id].sound.layout)).size).toBe(
      swapEngines.length,
    )
    expect(engineCatalog.rotary13.sound.valvetrain).toBe(0)
    expect(engineCatalog.five25.sound.cylinders).toBe(5)
    expect(engineCatalog.blown62.sound.blower).toBeDefined()
    expect(engineCatalog.flat39.sound.banks).toEqual([0, 1, 0, 1, 0, 1, 0, 1])
    expect(engineCatalog.cross50.sound.banks).toEqual(engineSounds.touring.banks)
    for (const id of ['diesel18', 'turbo20', 'five25', 'six30', 'flat39', 'w1680'] as const) {
      expect(engineCatalog[id].sound.turbo).not.toBeNull()
      expect(engineCatalog[id].boost).not.toBeNull()
    }
    for (const id of ['screamer20', 'rotary13', 'flat640', 'cross50', 'blown62', 'v1052'] as const)
      expect(engineCatalog[id].boost).toBeNull()
  })
})

describe('fitting an engine', () => {
  it.each(soundVehicles)('the stock choice leaves the %s exactly as built', (vehicle) => {
    const fitted = fitEngine(vehicle, 'stock')
    expect(fitted.engine).toBeNull()
    expect(fitted.metrics).toBe(vehicleMetrics[vehicle])
    expect(fitted.profile).toBe(engineProfiles[vehicle])
    expect(fitted.sound).toBe(engineSounds[vehicle])
    expect(fitted.boost).toBeNull()
  })
  it('keeps the motorcycle on its own twin', () => {
    expect(swappable('motorcycle')).toBe(false)
    expect(fitEngine('motorcycle', 'w1680')).toBe(fitEngine('motorcycle', 'stock'))
  })
  it('returns the same fitting for the same choice so the gearbox is not reset', () => {
    expect(fitEngine('touring', 'v1265')).toBe(fitEngine('touring', 'v1265'))
    expect(fitEngine('touring', 'v1265')).not.toBe(fitEngine('supercar', 'v1265'))
  })
  it.each(
    soundVehicles.filter(swappable).flatMap((vehicle) => swapEngines.map((id) => [vehicle, id])),
  )('%s with the %s keeps gears that cannot hunt', (vehicle, id) => {
    const fitted = fitEngine(vehicle as Vehicle, id as EngineId)
    const tops = fitted.profile.gearTops
    expect(tops).toHaveLength(engineProfiles[vehicle as Vehicle].gearTops.length)
    expect(fitted.profile.shiftSeconds).toBe(engineProfiles[vehicle as Vehicle].shiftSeconds)
    for (let gear = 1; gear < tops.length; gear++) {
      const after =
        (fitted.profile.cruiseShift * (tops[gear - 1] as number)) / (tops[gear] as number)
      expect(after).toBeGreaterThan(fitted.profile.downshift)
    }
    expect(fitted.profile.downshift).toBeGreaterThan(fitted.profile.idle)
    expect(fitted.metrics.wheelbase).toBe(vehicleMetrics[vehicle as Vehicle].wheelbase)
    expect(fitted.metrics.mass).toBe(vehicleMetrics[vehicle as Vehicle].mass)
  })
  it('scales pull and top speed with power in the same body', () => {
    const order: EngineId[] = ['diesel18', 'turbo20', 'five25', 'blown62', 'w1680']
    for (const vehicle of ['touring', 'hatchback', 'supercar', 'pickup', 'bus'] as const) {
      const fits = order.map((id) => fitEngine(vehicle, id).metrics)
      for (let index = 1; index < fits.length; index++) {
        expect(fits[index]?.acceleration).toBeGreaterThan(fits[index - 1]?.acceleration ?? 0)
        expect(fits[index]?.maxSpeed).toBeGreaterThan(fits[index - 1]?.maxSpeed ?? 0)
      }
    }
    const matched = fitEngine('supercar', 'v1265').metrics
    expect(matched.acceleration).toBeCloseTo(vehicleMetrics.supercar.acceleration, 0)
    expect(matched.maxSpeed).toBeCloseTo(vehicleMetrics.supercar.maxSpeed, 0)
  })
})

describe('driving a swapped engine', () => {
  it('a hypercar engine leaves a small diesel far behind in the same car', () => {
    const diesel = launch('hatchback', 'diesel18')
    const stock = launch('hatchback', 'stock')
    const hyper = launch('hatchback', 'w1680')
    expect(hyper.hundred).toBeLessThan(stock.hundred)
    expect(stock.hundred).toBeLessThan(diesel.hundred)
    expect(diesel.hundred).toBeLessThan(25)
    expect(hyper.top).toBeGreaterThan(stock.top * 1.4)
    expect(diesel.top).toBeLessThan(stock.top * 0.85)
    expect(diesel.car.gearbox.profile.redline).toBe(engineCatalog.diesel18.profile.redline)
  })
  it('turbo engines wait for boost while atmospheric engines answer at once', () => {
    const boost = engineCatalog.turbo20.boost
    if (!boost) throw new Error('missing boost')
    expect(boostPull(boost, 0)).toBeCloseTo(1 - boost.lag, 5)
    expect(boostPull(boost, 1)).toBe(1)
    expect(boostPull(null, 0)).toBe(1)
    let spool = 0
    spool = spoolBoost(boost, spool, 1, 0.1, 0.5)
    expect(spool).toBeLessThan(0.2)
    for (let step = 0; step < 120; step++) spool = spoolBoost(boost, spool, 1, 0.6, 1 / 60)
    expect(spool).toBeGreaterThan(0.8)
    for (let step = 0; step < 60; step++) spool = spoolBoost(boost, spool, 0, 0.6, 1 / 60)
    expect(spool).toBeLessThan(0.1)
  })
  it('a turbo stab from idle pulls softer than the same stab once spooled', () => {
    const settings: Settings = { ...defaults, roadMode: 'straight', engine: 'diesel18' }
    const car = new CarPhysics(new World(settings))
    car.reset(300)
    car.update(1 / 60, { ...rest, throttle: 1 }, settings)
    const cold = car.spool
    for (let step = 0; step < 240; step++) car.update(1 / 60, { ...rest, throttle: 1 }, settings)
    expect(cold).toBeLessThan(0.1)
    expect(car.spool).toBeGreaterThan(0.6)
  })
  it('changing the engine mid-drive swaps the gearbox for the new revs', () => {
    const settings: Settings = { ...defaults, roadMode: 'straight' }
    const car = new CarPhysics(new World(settings))
    car.reset(300)
    car.update(1 / 60, rest, settings)
    expect(car.gearbox.profile).toBe(engineProfiles.touring)
    const swapped = { ...settings, engine: 'flat640' as const }
    car.update(1 / 60, rest, swapped)
    expect(car.gearbox.profile).toBe(fitEngine('touring', 'flat640').profile)
    expect(car.telemetry().revs).toBeLessThan(0.2)
  })
})

describe('engine settings and sound', () => {
  it('remembers whether engines are browsed by engine or by car', () => {
    expect(defaults.engineView).toBe('car')
    expect(decodeSettings({ engineView: 'engine' }).engineView).toBe('engine')
    expect(decodeSettings({ engineView: 'truck' }).engineView).toBe('car')
  })
  it('names every car each engine went into, with no car listed twice', () => {
    const everyCar = engineCars.map((car) => car.name)
    for (const id of swapEngines) expect(engineCatalog[id].cars.length).toBeGreaterThan(0)
    expect(new Set(everyCar).size).toBe(everyCar.length)
    expect(engineCatalog.blown62.cars.map(carName)).toContain('Ram 1500 TRX')
    expect(engineCatalog.w1680.cars.map(carName)).toContain('Bugatti Veyron')
    expect(everyCar.length).toBeGreaterThan(swapEngines.length * 2)
    for (const car of engineCars) {
      expect(car.maker.length).toBeGreaterThan(1)
      expect(car.model.length).toBeGreaterThan(0)
      expect(car.name.startsWith(`${car.maker} `)).toBe(true)
    }
  })
  it('groups cars under makers that hold several engines', () => {
    const ferrari = engineCars.filter((car) => car.maker === 'Ferrari')
    expect(new Set(ferrari.map((car) => car.id))).toEqual(new Set(['flat39', 'italia45', 'f1v10']))
    expect(new Set(engineCars.map((car) => car.maker)).size).toBeGreaterThan(15)
  })
  it('remembers the chosen car, with its own engine or a swapped one', () => {
    expect(defaults.engineCar).toBe('')
    expect(decodeSettings({ engine: 'blown62', engineCar: 'Ram 1500 TRX' }).engineCar).toBe(
      'Ram 1500 TRX',
    )
    expect(decodeSettings({ engine: 'w1680', engineCar: 'Ram 1500 TRX' }).engineCar).toBe(
      'Ram 1500 TRX',
    )
    expect(decodeSettings({ engine: 'blown62', engineCar: 'Ram 9000' }).engineCar).toBe('')
    expect(
      decodeSettings({ engine: 'blown62', engineCar: 'Ram 1500 TRX', engineView: 'engine' })
        .engineCar,
    ).toBe('')
  })
  it('stores a chosen engine and rejects unknown ones', () => {
    expect(defaults.engine).toBe('stock')
    expect(decodeSettings({ engine: 'v1052' }).engine).toBe('v1052')
    expect(decodeSettings({ engine: 'jet' }).engine).toBe('stock')
    expect(decodeSettings({ engine: 12 }).engine).toBe('stock')
  })
  it('the sound frame reports the fitted engine and its revs', () => {
    const settings: Settings = { ...defaults, roadMode: 'straight', engine: 'screamer20' }
    const car = new CarPhysics(new World(settings))
    car.reset(300)
    car.update(1 / 60, rest, settings)
    const values = new SoundFrame().update(car, rest, settings, freshAmbience(), 1 / 60)
    expect(engineIds[values[paramIndex.engine] as number]).toBe('screamer20')
    expect(values[paramIndex.redline]).toBe(engineCatalog.screamer20.profile.redline)
    expect(values[paramIndex.idle]).toBe(engineCatalog.screamer20.profile.idle)
  })
  it('the synth voices the chosen engine at its own firing frequency', () => {
    const rate = 48000
    const firing = (engine: EngineId) => {
      const synth = new SoundSynth(rate, 1)
      synth.engine.steady = true
      const p = synth.params
      p[paramIndex.vehicle] = soundVehicles.indexOf('supercar')
      p[paramIndex.engine] = engineIds.indexOf(engine)
      p[paramIndex.idle] = 1000
      p[paramIndex.redline] = 8700
      p[paramIndex.rpm] = 6000
      p[paramIndex.load] = p[paramIndex.throttle] = 0.8
      const channels = soundChannels.map(() => new Float32Array(rate))
      synth.render(channels, rate)
      const left = channels[0] as Float32Array
      const line = (frequency: number) => {
        let real = 0
        let imaginary = 0
        for (let i = rate / 4; i < rate; i++) {
          const angle = (2 * Math.PI * frequency * i) / rate
          real += (left[i] as number) * Math.cos(angle)
          imaginary += (left[i] as number) * Math.sin(angle)
        }
        return Math.hypot(real, imaginary)
      }
      return { ten: line(500), twelve: line(600) }
    }
    const ten = firing('v1052')
    const twelve = firing('stock')
    expect(ten.ten).toBeGreaterThan(ten.twelve * 2)
    expect(twelve.twelve).toBeGreaterThan(twelve.ten * 2)
  })
  it('a supercharger whines in the induction channel even without a turbo', () => {
    const rate = 48000
    const render = (sound = engineCatalog.blown62.sound) => {
      const voice = new EngineVoice(rate, 1)
      voice.configure(sound)
      voice.steady = true
      voice.idle = 700
      voice.redline = 6200
      voice.rpm = 5000
      voice.load = voice.throttle = 1
      const out = [0, 1, 2, 3].map(() => new Float32Array(128))
      let energy = 0
      for (let block = 0; block < 200; block++) {
        voice.render(
          out[0] as Float32Array,
          out[1] as Float32Array,
          out[2] as Float32Array,
          out[3] as Float32Array,
          128,
        )
        for (const value of out[3] as Float32Array) energy += value * value
      }
      return energy
    }
    expect(render()).toBeGreaterThan(0.01)
    expect(render(engineCatalog.cross50.sound)).toBe(0)
  })
})

import { CarPhysics, type Input } from '../src/game/physics'
import { vehicleMetrics } from '../src/game/vehicles'
import { defaults, type EngineId, type Settings, type Vehicle, World } from '../src/game/world'

export const frameRate = 60

const rest: Input = {
  throttle: 0,
  boost: false,
  brake: 0,
  steer: 0,
  steeringSource: null,
  handbrake: false,
  regenBrake: 0,
}

export interface Scenario {
  name: string
  seconds: number
  settings?: Partial<Settings>
  only?: Vehicle
  begin?(car: CarPhysics, vehicle: Vehicle): void
  drive(): (time: number, car: CarPhysics, vehicle: Vehicle) => Input
}

const revs = (car: CarPhysics) => car.gearbox.rpm / car.gearbox.profile.redline

export const scenarios: Scenario[] = [
  { name: 'idle', seconds: 4, drive: () => () => rest },
  {
    name: 'pull',
    seconds: 14,
    drive: () => (time) => ({ ...rest, throttle: time > 0.6 ? 1 : 0 }),
  },
  {
    name: 'overrun',
    seconds: 11,
    drive: () => {
      let lifted = Number.POSITIVE_INFINITY
      return (time, car) => {
        const box = car.gearbox
        const turning = revs(car)
        const shift = time > 0.5 && box.gear === 1 && turning > 0.9 ? 1 : 0
        if (lifted > time && box.gear === 2 && turning > 0.86) lifted = time
        const since = time - lifted
        const pressed = since < 0 || (since > 2.6 && since < 3.5)
        return { ...rest, manual: true, shift, throttle: time > 0.5 && pressed ? 1 : 0 }
      }
    },
  },
  {
    name: 'rev',
    seconds: 8,
    drive: () => (time) => ({
      ...rest,
      neutral: true,
      throttle:
        (time > 0.6 && time < 0.85) || (time > 2 && time < 2.4) || (time > 3.6 && time < 5.8)
          ? 1
          : 0,
    }),
  },
  {
    name: 'limiter',
    seconds: 6,
    drive: () => (time) => ({ ...rest, manual: true, throttle: time > 0.5 && time < 5 ? 1 : 0 }),
  },
  {
    name: 'skid',
    seconds: 7,
    begin: (car, vehicle) => {
      car.speed = Math.min(27, vehicleMetrics[vehicle].maxSpeed * 0.75)
    },
    drive: () => (time, car, vehicle) => ({
      ...rest,
      throttle: time < 1 ? 0.4 : time > 2.4 && time < 5.8 ? 0.7 : 0,
      steer:
        (time > 2.8 && time < 4 ? 1 : time > 4 && time < 5.4 ? -1 : 0) *
        (vehicle === 'motorcycle' ? 0.35 : 0.8),
      steeringSource: 'analog',
      handbrake: time > 1 && time < 2.2,
      brake:
        (vehicle === 'motorcycle' && time > 1 && time < 2.2) || (time > 6 && car.speed > 1) ? 1 : 0,
    }),
  },
  {
    name: 'gravel',
    seconds: 7,
    settings: { landscape: 'canyon' },
    begin: (car) => {
      car.x += 7
      car.speed = 15
    },
    drive: () => (time, car) => ({
      ...rest,
      throttle: car.speed < 16 ? 0.6 : 0.1,
      steer: time > 3 && time < 4 ? 0.5 : time > 4 && time < 5 ? -0.5 : 0,
      steeringSource: 'analog',
    }),
  },
  {
    name: 'wind',
    seconds: 8,
    begin: (car, vehicle) => {
      car.speed = vehicleMetrics[vehicle].maxSpeed
    },
    drive: () => (time) => ({ ...rest, throttle: time < 3 ? 1 : 0 }),
  },
  {
    name: 'cruise',
    seconds: 16,
    begin: (car, vehicle) => {
      car.speed = vehicleMetrics[vehicle].maxSpeed * 0.42
    },
    drive: () => {
      let target = 0
      return (time, car) => {
        if (!target) target = car.speed
        const wanted = target * (1 + 0.12 * Math.sin((time / 16) * Math.PI * 2))
        const throttle = Math.min(1, Math.max(0, 0.35 + (wanted - car.speed) * 0.25))
        return { ...rest, throttle }
      }
    },
  },
  {
    name: 'bonnet-pull',
    seconds: 12,
    only: 'touring',
    settings: { camera: 'bonnet' },
    drive: () => (time) => ({ ...rest, throttle: time > 0.6 ? 1 : 0 }),
  },
  {
    name: 'storm-cruise',
    seconds: 8,
    only: 'touring',
    settings: { weather: 'storm', camera: 'bonnet' },
    begin: (car) => {
      car.speed = 24
    },
    drive: () => (_time, car) => ({ ...rest, throttle: car.speed < 24 ? 0.5 : 0.1 }),
  },
  {
    name: 'grass',
    seconds: 7,
    only: 'pickup',
    begin: (car) => {
      car.x += 8
      car.speed = 14
    },
    drive: () => (_time, car) => ({ ...rest, throttle: car.speed < 15 ? 0.6 : 0.1 }),
  },
  {
    name: 'dusk-forest',
    seconds: 10,
    only: 'touring',
    settings: { landscape: 'forest', daylight: 'dusk' },
    drive: () => (time) => ({ ...rest, throttle: time > 7 ? 0.3 : 0 }),
  },
  {
    name: 'dawn-birds',
    seconds: 10,
    only: 'touring',
    settings: { landscape: 'forest', daylight: 'dawn' },
    drive: () => () => rest,
  },
  {
    name: 'broken-road',
    seconds: 8,
    only: 'hatchback',
    settings: { roadWear: 'broken' },
    begin: (car) => {
      car.speed = 20
    },
    drive: () => (_time, car) => ({ ...rest, throttle: car.speed < 20 ? 0.5 : 0.1 }),
  },
]

export function stage(vehicle: Vehicle, name: string, engine: EngineId = 'stock', engineCar = '') {
  const scenario = scenarios.find((entry) => entry.name === name)
  if (!scenario) throw new Error(`Unknown scenario ${name}`)
  const settings: Settings = {
    ...defaults,
    roadMode: 'straight',
    volume: 0.6,
    ...scenario.settings,
    vehicle,
    engine,
    engineCar,
  }
  const world = new World(settings)
  const car = new CarPhysics(world)
  car.reset(300)
  car.update(1 / frameRate, rest, settings)
  scenario.begin?.(car, vehicle)
  return { scenario, settings, car, drive: scenario.drive() }
}

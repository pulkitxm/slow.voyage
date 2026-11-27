import { type BrakeType, brakeSpecs, vehicleBrakes } from './brakes'
import { type BodyChoice, bodyFor, bodyMetrics, type CarBody } from './car-bodies'
import { forwardDriveForce } from './drive'
import { type Boost, engineCatalog, horsepower, type SwapEngine, swappable } from './engine-catalog'
import type { EngineSound } from './engine-sound'
import { engineSounds, supercarSounds } from './engine-sound'
import { type EngineProfile, engineProfiles, supercarProfiles } from './powertrain'
import type { SupercarModel } from './supercars'
import { type VehicleMetrics, vehicleMetrics } from './vehicles'
import type { EngineId, Settings, Vehicle } from './world'

export {
  type Boost,
  type EngineSpec,
  engineCatalog,
  horsepower,
  type SwapEngine,
  swapEngines,
  swappable,
  torqueCurves,
} from './engine-catalog'

export const stockPower: Record<Vehicle, number> = {
  touring: 330,
  roadster: 250,
  hatchback: 180,
  supercar: 566,
  pickup: 300,
  motorcycle: 70,
  bus: 220,
}

export const engineSwap = { exponent: 0.4, least: 0.5, most: 2.2 } as const

export function terminalSpeed(
  metrics: Pick<VehicleMetrics, 'acceleration' | 'maxSpeed' | 'drag' | 'rollingResistance'>,
) {
  let low = 0
  let high = 200
  for (let step = 0; step < 50; step++) {
    const middle = (low + high) / 2
    const push = forwardDriveForce(middle, 1, false, metrics, 1)
    const resist = 0.1 + metrics.rollingResistance * middle + metrics.drag * middle * middle
    if (push > resist) low = middle
    else high = middle
  }
  return low
}

export interface Nitro {
  surge: number
  burn: number
}

export interface Fitted {
  engine: SwapEngine | null
  metrics: VehicleMetrics
  profile: EngineProfile
  sound: EngineSound
  boost: Boost | null
  nitro: Nitro
  brakes: BrakeType
}

export const classNitro: Nitro = { surge: 0.5, burn: 7 }
export const carNitro = {
  least: 0.32,
  most: 0.8,
  perPower: 1600,
  longest: 9.5,
  shortest: 4.5,
  fade: 140,
}
export const referenceMass: Record<Vehicle, number> = {
  touring: 1500,
  roadster: 1100,
  hatchback: 1250,
  supercar: 1550,
  pickup: 2100,
  motorcycle: 220,
  bus: 2600,
}
export const carTune = { most: 2.6, rolling: 0.3 }

export function nitroFor(body: CarBody) {
  const perTonne = horsepower(engineCatalog[body.engine].power) / (body.mass / 1000)
  return {
    surge: Math.min(
      carNitro.most,
      Math.max(carNitro.least, carNitro.least + perTonne / carNitro.perPower),
    ),
    burn: Math.min(
      carNitro.longest,
      Math.max(carNitro.shortest, carNitro.longest - perTonne / carNitro.fade),
    ),
  }
}

function retune(
  original: EngineProfile,
  profile: Omit<EngineProfile, 'gearTops' | 'shiftSeconds'>,
  reach: number,
): EngineProfile {
  const tops = original.gearTops.map((top) => top * reach)
  const narrowest = tops
    .slice(1)
    .reduce((least, top, index) => Math.min(least, (tops[index] ?? top) / top), 1)
  return {
    ...profile,
    downshift: Math.min(profile.downshift, profile.cruiseShift * narrowest * 0.9),
    gearTops: tops,
    shiftSeconds: original.shiftSeconds,
  }
}

function fitBody(vehicle: Vehicle, engine: SwapEngine | null, body: CarBody): Fitted {
  const stock = bodyMetrics(vehicleMetrics[vehicle], body)
  const original = engineProfiles[vehicle]
  const own = engineCatalog[body.engine]
  const perMass = own.power / body.mass / (stockPower[vehicle] / referenceMass[vehicle])
  const carShare = Math.min(
    engineSwap.most,
    Math.max(engineSwap.least, perMass ** engineSwap.exponent),
  )
  const engineShare =
    engine && engine !== body.engine
      ? (engineCatalog[engine].power / own.power) ** engineSwap.exponent
      : 1
  const native = stock.acceleration * carShare
  const top = body.topSpeed
  const push = forwardDriveForce(top, 1, false, { acceleration: native, maxSpeed: top }, 1) - 0.1
  const rollingResistance = Math.min(stock.rollingResistance, (carTune.rolling * push) / top)
  const drag = Math.max(0.00005, (push - rollingResistance * top) / (top * top))
  const tuned = {
    ...stock,
    acceleration:
      stock.acceleration *
      Math.min(carTune.most, Math.max(engineSwap.least, carShare * engineShare)),
    rollingResistance,
    drag,
    brake: (stock.brake * brakeSpecs[body.brakes].grip) / brakeSpecs[vehicleBrakes[vehicle]].grip,
    maxSpeed: top,
  }
  const reached = engineShare === 1 ? top : terminalSpeed(tuned)
  const metrics = { ...tuned, maxSpeed: reached }
  const reach = reached / vehicleMetrics[vehicle].maxSpeed
  const spec = engine ? engineCatalog[engine] : null
  return {
    engine,
    metrics,
    profile: retune(original, spec ? spec.profile : original, reach),
    sound: spec ? spec.sound : engineSounds[vehicle],
    boost: spec ? spec.boost : null,
    nitro: nitroFor(body),
    brakes: body.brakes,
  }
}

const fittings = new Map<string, Fitted>()

export function fitEngine(
  vehicle: Vehicle,
  choice: EngineId,
  body: CarBody | null = null,
  model: SupercarModel = 'classic',
): Fitted {
  const engine = choice !== 'stock' && swappable(vehicle) ? choice : null
  const variant = vehicle === 'supercar' && !body ? model : 'classic'
  const key = `${vehicle}:${engine ?? 'stock'}:${body?.id ?? ''}:${variant}`
  const known = fittings.get(key)
  if (known) return known
  const stock = bodyMetrics(vehicleMetrics[vehicle], body)
  const original = vehicle === 'supercar' ? supercarProfiles[variant] : engineProfiles[vehicle]
  let fitted: Fitted
  if (body) fitted = fitBody(vehicle, engine, body)
  else if (!engine) {
    fitted = {
      engine: null,
      metrics: stock,
      profile: original,
      sound: variant === 'classic' ? engineSounds[vehicle] : supercarSounds[variant],
      boost: null,
      nitro: classNitro,
      brakes: vehicleBrakes[vehicle],
    }
  } else {
    const spec = engineCatalog[engine]
    const share = Math.min(
      engineSwap.most,
      Math.max(engineSwap.least, (spec.power / stockPower[vehicle]) ** engineSwap.exponent),
    )
    const pushed = { ...stock, acceleration: stock.acceleration * share }
    const reach = terminalSpeed(pushed) / terminalSpeed(stock)
    const metrics = { ...pushed, maxSpeed: stock.maxSpeed * reach }
    const tops = original.gearTops.map((top) => top * reach)
    const narrowest = tops
      .slice(1)
      .reduce((least, top, index) => Math.min(least, (tops[index] ?? top) / top), 1)
    const profile: EngineProfile = {
      ...spec.profile,
      downshift: Math.min(spec.profile.downshift, spec.profile.cruiseShift * narrowest * 0.9),
      gearTops: tops,
      shiftSeconds: original.shiftSeconds,
    }
    fitted = {
      engine,
      metrics,
      profile,
      sound: spec.sound,
      boost: spec.boost,
      nitro: classNitro,
      brakes: vehicleBrakes[vehicle],
    }
  }
  fittings.set(key, fitted)
  return fitted
}

export function fitCar(settings: BodyChoice & Partial<Pick<Settings, 'supercarModel'>>) {
  return fitEngine(settings.vehicle, settings.engine, bodyFor(settings), settings.supercarModel)
}

export function boostTarget(boost: Boost, throttle: number, revs: number) {
  const reach = Math.min(1, Math.max(0, revs / boost.onset))
  return Math.min(1, Math.max(0, throttle)) * reach * reach * (3 - 2 * reach)
}

export function spoolBoost(
  boost: Boost,
  spool: number,
  throttle: number,
  revs: number,
  dt: number,
) {
  const target = boostTarget(boost, throttle, revs)
  const time = target > spool ? boost.rise : boost.fall
  return spool + (target - spool) * (1 - Math.exp(-dt / time))
}

export function boostPull(boost: Boost | null, spool: number) {
  return boost ? 1 - boost.lag * (1 - Math.min(1, Math.max(0, spool))) : 1
}

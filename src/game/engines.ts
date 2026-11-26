import { forwardDriveForce } from './drive'
import { type Boost, engineCatalog, type SwapEngine, swappable } from './engine-catalog'
import type { EngineSound } from './engine-sound'
import { engineSounds } from './engine-sound'
import { type EngineProfile, engineProfiles } from './powertrain'
import { type VehicleMetrics, vehicleMetrics } from './vehicles'
import type { EngineId, Vehicle } from './world'

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

export interface Fitted {
  engine: SwapEngine | null
  metrics: VehicleMetrics
  profile: EngineProfile
  sound: EngineSound
  boost: Boost | null
}

const fittings = new Map<string, Fitted>()

export function fitEngine(vehicle: Vehicle, choice: EngineId): Fitted {
  const engine = choice !== 'stock' && swappable(vehicle) ? choice : null
  const key = `${vehicle}:${engine ?? 'stock'}`
  const known = fittings.get(key)
  if (known) return known
  const stock = vehicleMetrics[vehicle]
  const original = engineProfiles[vehicle]
  let fitted: Fitted
  if (!engine) {
    fitted = {
      engine: null,
      metrics: stock,
      profile: original,
      sound: engineSounds[vehicle],
      boost: null,
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
    fitted = { engine, metrics, profile, sound: spec.sound, boost: spec.boost }
  }
  fittings.set(key, fitted)
  return fitted
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

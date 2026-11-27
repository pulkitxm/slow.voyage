import { clamp, type Vehicle } from './world'

export const brakeTypes = ['drum', 'disc', 'vented', 'sport', 'ceramic', 'carbon'] as const
export type BrakeType = (typeof brakeTypes)[number]

export interface BrakeSpec {
  name: string
  grip: number
  fade: number
  cold: number
}

export const brakeSpecs: Record<BrakeType, BrakeSpec> = {
  drum: { name: 'Front discs, rear drums', grip: 0.86, fade: 0.38, cold: 1 },
  disc: { name: 'Disc brakes', grip: 0.93, fade: 0.3, cold: 1 },
  vented: { name: 'Ventilated disc brakes', grip: 1, fade: 0.22, cold: 1 },
  sport: { name: 'Large multi-piston disc brakes', grip: 1.1, fade: 0.14, cold: 1 },
  ceramic: { name: 'Carbon-ceramic brakes', grip: 1.2, fade: 0.05, cold: 1 },
  carbon: { name: 'Carbon racing brakes', grip: 1.5, fade: 0, cold: 0.72 },
}

export const vehicleBrakes: Record<Vehicle, BrakeType> = {
  touring: 'vented',
  roadster: 'vented',
  hatchback: 'disc',
  supercar: 'sport',
  pickup: 'vented',
  motorcycle: 'sport',
  bus: 'drum',
}

export const brakeHeat = { gain: 1 / 1500, cool: 22, fadeFrom: 0.55, fadeSpan: 0.45, warmBy: 0.25 }

export function heatBrakes(heat: number, deceleration: number, speed: number, dt: number) {
  const warmed = heat + Math.max(0, deceleration) * Math.abs(speed) * dt * brakeHeat.gain
  return warmed * Math.exp(-dt / brakeHeat.cool)
}

export function brakeShare(type: BrakeType, heat: number) {
  const spec = brakeSpecs[type]
  const hot = clamp((heat - brakeHeat.fadeFrom) / brakeHeat.fadeSpan, 0, 1)
  const fade = 1 - spec.fade * hot * hot * (3 - 2 * hot)
  const warm = spec.cold + (1 - spec.cold) * clamp(heat / brakeHeat.warmBy, 0, 1)
  return fade * warm
}

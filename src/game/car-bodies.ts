import { type BrakeType, brakeTypes } from './brakes'
import sheets from './car-sheets.json'
import { type Footprint, footprints } from './collision'
import { engineCars, type SwapEngine } from './engine-catalog'
import { type TireDimensions, tireDimensions } from './tire-dimensions'
import { type Drivetrain, type VehicleMetrics, vehicleMetrics } from './vehicles'
import type { Settings, Vehicle } from './world'

export type BodyChassis = Exclude<Vehicle, 'motorcycle' | 'bus'>
export const bodyChassis = ['touring', 'roadster', 'pickup', 'hatchback', 'supercar'] as const

interface Sheet {
  variant: string
  chassis: string
  length: number
  width: number
  height: number
  wheelbase: number
  frontOverhang: number
  track: number[]
  tyres: string[]
  clearance: number
  mass: number
  topSpeed: number
  brakes: string
  drive: string
  frontWeight: number
  slicks?: boolean
  estimated: string[]
  paint?: string
}

export interface Tyre {
  radius: number
  width: number
  rim: number
}

export interface CarBody {
  id: string
  name: string
  maker: string
  model: string
  engine: SwapEngine
  variant: string
  chassis: BodyChassis
  length: number
  width: number
  height: number
  wheelbase: number
  frontOverhang: number
  track: readonly [front: number, rear: number]
  tyres: readonly [front: Tyre, rear: Tyre]
  clearance: number
  mass: number
  topSpeed: number
  brakes: BrakeType
  drive: Drivetrain
  frontWeight: number
  slicks: boolean
  paint: string | null
  footprint: Footprint
}

export function carSlug(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function readTyre(size: string): Tyre {
  const road = /^(\d+)\/(\d+)R(\d+)$/.exec(size)
  if (road) {
    const width = Number(road[1]) / 1000
    const rim = (Number(road[3]) * 0.0254) / 2
    return { radius: rim + (width * Number(road[2])) / 100, width, rim }
  }
  const race = /^(\d+)x(\d+)R(\d+)$/.exec(size)
  if (!race) throw new Error(`Unreadable tyre size ${size}`)
  return {
    radius: Number(race[1]) / 2000,
    width: Number(race[2]) / 1000,
    rim: (Number(race[3]) * 0.0254) / 2,
  }
}

function isChassis(value: string): value is BodyChassis {
  return (bodyChassis as readonly string[]).includes(value)
}

const drivetrains: readonly string[] = ['front', 'rear', 'all'] satisfies Drivetrain[]

function isDrive(value: string): value is Drivetrain {
  return drivetrains.includes(value)
}

function isBrake(value: string): value is BrakeType {
  return (brakeTypes as readonly string[]).includes(value)
}

const table = sheets as Record<string, Sheet>

export const carBodies: CarBody[] = engineCars.flatMap((car) => {
  const id = carSlug(car.name)
  const sheet = table[id]
  if (!sheet || !isChassis(sheet.chassis) || !isBrake(sheet.brakes) || !isDrive(sheet.drive))
    return []
  const [front, rear] = sheet.tyres
  const [trackFront, trackRear] = sheet.track
  if (!front || !rear || !trackFront || !trackRear) return []
  return [
    {
      id,
      name: car.name,
      maker: car.maker,
      model: car.model,
      engine: car.id,
      variant: sheet.variant,
      chassis: sheet.chassis,
      length: sheet.length / 1000,
      width: sheet.width / 1000,
      height: sheet.height / 1000,
      wheelbase: sheet.wheelbase / 1000,
      frontOverhang: sheet.frontOverhang / 1000,
      track: [trackFront / 1000, trackRear / 1000],
      tyres: [readTyre(front), readTyre(rear)],
      clearance: sheet.clearance / 1000,
      mass: sheet.mass,
      topSpeed: sheet.topSpeed / 3.6,
      brakes: sheet.brakes,
      drive: sheet.drive,
      frontWeight: sheet.frontWeight / 100,
      slicks: sheet.slicks ?? false,
      paint: sheet.paint ?? null,
      footprint: {
        front: (sheet.wheelbase / 2 + sheet.frontOverhang) / 1000,
        rear: (sheet.length - sheet.wheelbase / 2 - sheet.frontOverhang) / 1000,
        halfWidth: sheet.width / 2000,
      },
    },
  ]
})

const byName = new Map(carBodies.map((body) => [body.name, body]))
const unavailable = new Set<string>()
let withheld = false

export function withholdBodies(value: boolean) {
  withheld = value
}

export function retireBody(id: string) {
  unavailable.add(id)
}

export function bodiesWithheld() {
  return withheld
}

export function bodyNamed(name: string) {
  return byName.get(name) ?? null
}

export type BodyChoice = Pick<Settings, 'vehicle' | 'engine' | 'engineCar' | 'engineView'>

export function bodyFor(settings: BodyChoice): CarBody | null {
  if (withheld || !settings.engineCar) return null
  const body = byName.get(settings.engineCar)
  if (!body || body.chassis !== settings.vehicle) return null
  return unavailable.has(body.id) ? null : body
}

export function bodyFootprint(settings: BodyChoice): Footprint {
  return bodyFor(settings)?.footprint ?? footprints[settings.vehicle]
}

export interface WheelGeometry {
  wheelbase: number
  track: readonly [front: number, rear: number]
  radius: readonly [front: number, rear: number]
}

export function wheelGeometry(vehicle: Vehicle, body: CarBody | null): WheelGeometry {
  if (body)
    return {
      wheelbase: body.wheelbase,
      track: body.track,
      radius: [body.tyres[0].radius, body.tyres[1].radius],
    }
  const metrics = vehicleMetrics[vehicle]
  return {
    wheelbase: metrics.wheelbase,
    track: [metrics.trackWidth, metrics.trackWidth],
    radius: [metrics.wheelRadius, metrics.wheelRadius],
  }
}

export const bodyTravel = { arch: 0.08, floor: 0.008, least: 0.025 }

export function bodyMetrics(stock: VehicleMetrics, body: CarBody | null): VehicleMetrics {
  if (!body) return stock
  return {
    ...stock,
    wheelbase: body.wheelbase,
    trackWidth: (body.track[0] + body.track[1]) / 2,
    wheelRadius: (body.tyres[0].radius + body.tyres[1].radius) / 2,
    suspensionTravel: Math.min(
      stock.suspensionTravel,
      bodyTravel.arch,
      Math.max(bodyTravel.least, body.clearance - bodyTravel.floor),
    ),
  }
}

export function bodyTire(vehicle: Vehicle, body: CarBody | null): TireDimensions {
  const stock = tireDimensions[vehicle]
  if (!body) return stock
  const [front, rear] = body.tyres
  return {
    ...stock,
    tube: (front.radius - front.rim + rear.radius - rear.rim) / 4,
    width: (front.width + rear.width) / 2,
    inset: 0,
  }
}

import { garageLayout } from './garages'

export interface Spot {
  u: number
  v: number
}

export interface Rect {
  u0: number
  u1: number
  v0: number
  v1: number
}

export interface BayCar {
  halfWidth: number
  front: number
  rear: number
  height: number
  clearance: number
  wheelbase: number
  lifts: boolean
}

export interface BayWheel {
  u: number
  v: number
  radius: number
  width: number
}

export const bayRoom = {
  wall: 0.15,
  height: 5.2,
  post: 1.75,
  postSize: 0.32,
  postHeight: 3.6,
} as const

export const crewSpace = {
  body: 0.3,
  lane: 2.42,
  tail: 0.85,
  wheel: 0.66,
  staged: 0.78,
  apart: 0.38,
} as const

export const liftGeometry = {
  rest: 0.07,
  pad: 0.05,
  arm: 1.18,
  pivot: 1.52,
  inset: 0.24,
  rise: 0.72,
  droop: 0.07,
} as const

const { bay, front, back, half } = garageLayout

export const bayFurniture: readonly Rect[] = [
  { u0: -8.63, u1: -5.97, v0: back - 1.13, v1: back - 0.15 },
  { u0: -2.82, u1: 0.42, v0: back - 1.05, v1: back - 0.15 },
  { u0: 1.02, u1: 2.56, v0: back - 1.1, v1: back - 0.15 },
  { u0: 7.38, u1: 8.62, v0: front + 2.28, v1: front + 4.72 },
  { u0: -8.56, u1: -7.84, v0: front + 0.84, v1: front + 1.56 },
]

export const bayPosts: readonly Rect[] = [-1, 1].map((side) => ({
  u0: bay.u + side * bayRoom.post - bayRoom.postSize / 2,
  u1: bay.u + side * bayRoom.post + bayRoom.postSize / 2,
  v0: bay.v - bayRoom.postSize / 2,
  v1: bay.v + bayRoom.postSize / 2,
}))

export const bayInterior: Rect = {
  u0: -half + bayRoom.wall,
  u1: half - bayRoom.wall,
  v0: front + bayRoom.wall,
  v1: back - 2 * bayRoom.wall,
}

export function bayCentre(car: Pick<BayCar, 'front'>) {
  return Math.min(bay.v, bayInterior.v1 - 0.45 - car.front)
}

export function carRect(car: BayCar): Rect {
  const centre = bayCentre(car)
  return {
    u0: bay.u - car.halfWidth,
    u1: bay.u + car.halfWidth,
    v0: centre - car.rear,
    v1: centre + car.front,
  }
}

export function grow(rect: Rect, margin: number): Rect {
  return {
    u0: rect.u0 - margin,
    u1: rect.u1 + margin,
    v0: rect.v0 - margin,
    v1: rect.v1 + margin,
  }
}

export function inside(rect: Rect, spot: Spot) {
  return spot.u > rect.u0 && spot.u < rect.u1 && spot.v > rect.v0 && spot.v < rect.v1
}

export function crosses(rect: Rect, from: Spot, to: Spot) {
  let enter = 0
  let exit = 1
  const du = to.u - from.u
  const dv = to.v - from.v
  for (const [delta, start, low, high] of [
    [du, from.u, rect.u0, rect.u1],
    [dv, from.v, rect.v0, rect.v1],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (start <= low || start >= high) return false
      continue
    }
    const a = (low - start) / delta
    const b = (high - start) / delta
    enter = Math.max(enter, Math.min(a, b))
    exit = Math.min(exit, Math.max(a, b))
    if (enter >= exit) return false
  }
  return true
}

export function distanceToRect(rect: Rect, spot: Spot) {
  const du = Math.max(rect.u0 - spot.u, 0, spot.u - rect.u1)
  const dv = Math.max(rect.v0 - spot.v, 0, spot.v - rect.v1)
  if (du > 0 || dv > 0) return Math.hypot(du, dv)
  return -Math.min(spot.u - rect.u0, rect.u1 - spot.u, spot.v - rect.v0, rect.v1 - spot.v)
}

export type CrewSide = 1 | -1

export interface BayPlan {
  car: Rect
  solids: Rect[]
  tail: number
  nose: number
  lane(side: CrewSide): number
  home(side: CrewSide): Spot
  face(side: CrewSide): Spot
  stage(side: CrewSide, v: number): Spot
  fresh(side: CrewSide, v: number): Spot
  spent(side: CrewSide, v: number): Spot
}

export function bayPlan(car: BayCar): BayPlan {
  const rect = carRect(car)
  const reach = Math.max(
    crewSpace.lane,
    car.halfWidth + crewSpace.body + 0.45,
    bayRoom.post + bayRoom.postSize / 2 + crewSpace.body + 0.2,
  )
  const lane = (side: CrewSide) =>
    side > 0 ? bay.u + reach : Math.max(bay.u - reach, bayInterior.u0 + 1.55)
  const centre = rect.v0 + car.rear
  return {
    car: rect,
    solids: [rect, ...bayPosts, ...bayFurniture],
    tail: rect.v0 - crewSpace.tail,
    nose: Math.min(rect.v1, back - 1.13 - crewSpace.body - 0.06),
    lane,
    home: (side) => (side > 0 ? { u: lane(1) + 0.7, v: centre } : { u: lane(-1), v: centre }),
    face: () => ({ u: bay.u, v: bay.v }),
    stage: (side, v) => ({ u: lane(side), v }),
    fresh: (side, v) => ({ u: lane(side) + side * crewSpace.staged, v: v + crewSpace.apart }),
    spent: (side, v) => ({ u: lane(side) + side * crewSpace.staged, v: v - crewSpace.apart }),
  }
}

export function wheelSpot(side: CrewSide, wheel: BayWheel): Spot {
  return { u: wheel.u + side * (wheel.width / 2 + crewSpace.wheel), v: wheel.v }
}

function clear(plan: BayPlan, from: Spot, to: Spot, margin: number) {
  for (const solid of plan.solids) if (crosses(grow(solid, margin), from, to)) return false
  return true
}

export function routeClear(plan: BayPlan, points: readonly Spot[], margin: number) {
  for (let index = 1; index < points.length; index++)
    if (!clear(plan, points[index - 1] as Spot, points[index] as Spot, margin)) return false
  return true
}

export function crewRoute(side: CrewSide, from: Spot, to: Spot, plan: BayPlan): Spot[] {
  const margin = crewSpace.body - 0.02
  if (Math.hypot(to.u - from.u, to.v - from.v) < 0.02) return [to]
  if (clear(plan, from, to, margin)) return [to]
  const lane = plan.lane(side)
  const points: Spot[] = []
  const push = (spot: Spot) => {
    const last = points[points.length - 1] ?? from
    if (Math.hypot(spot.u - last.u, spot.v - last.v) > 0.02) points.push(spot)
  }
  push({ u: lane, v: from.v })
  push({ u: lane, v: to.v })
  push(to)
  return points
}

export function routeLength(from: Spot, points: readonly Spot[]) {
  let total = 0
  let last = from
  for (const point of points) {
    total += Math.hypot(point.u - last.u, point.v - last.v)
    last = point
  }
  return total
}

export function liftSwing(car: BayCar) {
  const inward = liftGeometry.pivot - Math.max(0.35, car.halfWidth - liftGeometry.inset)
  return Math.asin(Math.min(0.96, Math.max(0.15, inward / liftGeometry.arm)))
}

export function liftPose(travel: number, car: BayCar) {
  const touch = Math.max(0, car.clearance - liftGeometry.rest - liftGeometry.pad)
  const total = touch + liftGeometry.rise
  const raised = Math.min(1, Math.max(0, travel)) * total
  return { arm: liftGeometry.rest + raised, car: Math.max(0, raised - touch), total }
}

export const cameraRoom = { margin: 0.55, floor: 0.45, ceiling: 0.7, near: bay.u + 4.7 } as const

export function cameraInside(u: number, v: number, y: number) {
  return {
    u: Math.min(bayInterior.u1 - cameraRoom.margin, Math.max(cameraRoom.near, u)),
    v: Math.min(
      bayInterior.v1 - cameraRoom.margin,
      Math.max(bayInterior.v0 + cameraRoom.margin, v),
    ),
    y: Math.min(bayRoom.height - cameraRoom.ceiling, Math.max(cameraRoom.floor, y)),
  }
}

export type Shot = 'ready' | 'arrive' | 'wheels' | 'paint' | 'wash' | 'exhaust' | 'lift'

export function insideShot(shot: Shot, car: BayCar, focus: Spot, raised: number, drift = 0) {
  const tail = bayCentre(car) - car.rear
  const eye =
    shot === 'arrive'
      ? cameraInside(bay.u + 5.6, front + 1, 1.5)
      : shot === 'wheels'
        ? cameraInside(focus.u + 5.1, focus.v + (focus.v > bay.v ? 1.7 : -1.7), 1.3 + raised * 0.6)
        : shot === 'lift'
          ? cameraInside(bay.u + 5.6, bay.v - 2.6, 1.3)
          : shot === 'paint' || shot === 'wash'
            ? cameraInside(bay.u + 5 + drift * 0.3, focus.v - 2.5, shot === 'paint' ? 1.75 : 1.9)
            : shot === 'exhaust'
              ? cameraInside(bay.u + 4.2, tail - 2.2, 1.0 + raised)
              : cameraInside(bay.u + 5.5 + drift * 0.6, front + 0.85 + drift * 0.5, 1.8)
  const look =
    shot === 'wheels'
      ? { u: focus.u, v: focus.v, y: 0.45 + raised }
      : shot === 'exhaust'
        ? { u: bay.u, v: tail + 0.3, y: 0.45 + raised }
        : shot === 'paint' || shot === 'wash'
          ? { u: bay.u + 0.7, v: focus.v - 0.2, y: 0.8 }
          : shot === 'arrive'
            ? { u: focus.u, v: focus.v, y: 0.7 }
            : shot === 'ready'
              ? { u: bay.u - 0.2, v: bay.v - 0.55, y: 0.6 }
              : { u: bay.u, v: bay.v + 0.1, y: 0.62 + raised * 0.8 }
  return { eye, look }
}

export function outsideShot(from: Spot) {
  const flank = from.u <= bay.u ? 1 : -1
  return { u: bay.u + flank * 7.2, v: front - 5.6, y: 1.9 }
}

export interface DrivePose {
  u: number
  v: number
  heading: number
}

export interface DriveLeg {
  reverse: boolean
  length: number
  u: number[]
  v: number[]
  along: number[]
  bend: number[]
}

export interface DriveSample {
  u: number
  v: number
  heading: number
  bend: number
}

export const driveLayout = {
  align: front - 3.4,
  ahead: 5,
  lead: 13,
  back: 58,
  samples: 56,
  yard: { u0: -90, u1: 60, v0: -garageLayout.roadEdge - 3, v1: front - 2.6 },
} as const

function straight(from: Spot, to: Spot, reverse: boolean): DriveLeg {
  const length = Math.hypot(to.u - from.u, to.v - from.v)
  return {
    reverse,
    length,
    u: [from.u, to.u],
    v: [from.v, to.v],
    along: [0, length],
    bend: [0, 0],
  }
}

function swing(from: DrivePose, stop: number, lead = 0): DriveLeg {
  const start = {
    u: from.u + Math.cos(from.heading) * lead,
    v: from.v + Math.sin(from.heading) * lead,
    heading: from.heading,
  }
  const end = { u: bay.u, v: driveLayout.align }
  const span = Math.hypot(end.u - start.u, end.v - start.v)
  const reach = Math.min(9, Math.max(1.2, span * 0.45))
  const a = { u: start.u, v: start.v }
  const b = {
    u: start.u + Math.cos(start.heading) * reach,
    v: start.v + Math.sin(start.heading) * reach,
  }
  const c = { u: end.u, v: end.v - reach }
  const leg: DriveLeg = { reverse: false, length: 0, u: [], v: [], along: [], bend: [] }
  const count = driveLayout.samples
  if (lead > 0) {
    leg.u.push(from.u)
    leg.v.push(from.v)
    leg.along.push(0)
    leg.bend.push(0)
  }
  for (let index = 0; index <= count; index++) {
    const t = index / count
    const r = 1 - t
    const u = r * r * r * a.u + 3 * r * r * t * b.u + 3 * r * t * t * c.u + t * t * t * end.u
    const v = r * r * r * a.v + 3 * r * r * t * b.v + 3 * r * t * t * c.v + t * t * t * end.v
    const du = 3 * r * r * (b.u - a.u) + 6 * r * t * (c.u - b.u) + 3 * t * t * (end.u - c.u)
    const dv = 3 * r * r * (b.v - a.v) + 6 * r * t * (c.v - b.v) + 3 * t * t * (end.v - c.v)
    const ddu = 6 * r * (c.u - 2 * b.u + a.u) + 6 * t * (end.u - 2 * c.u + b.u)
    const ddv = 6 * r * (c.v - 2 * b.v + a.v) + 6 * t * (end.v - 2 * c.v + b.v)
    const pace = Math.hypot(du, dv)
    const last = leg.u.length - 1
    if (last >= 0)
      leg.length += Math.hypot(u - (leg.u[last] as number), v - (leg.v[last] as number))
    leg.u.push(u)
    leg.v.push(v)
    leg.along.push(leg.length)
    leg.bend.push(pace > 1e-4 ? (du * ddv - dv * ddu) / (pace * pace * pace) : 0)
  }
  leg.bend[leg.bend.length - 1] = 0
  const run = stop - driveLayout.align
  leg.u.push(bay.u)
  leg.v.push(stop)
  leg.length += run
  leg.along.push(leg.length)
  leg.bend.push(0)
  return leg
}

export function drivePath(start: DrivePose, speed = 0, stop: number = bay.v): DriveLeg[] {
  const hu = Math.cos(start.heading)
  const hv = Math.sin(start.heading)
  const ahead = (bay.u - start.u) * hu + (driveLayout.align - start.v) * hv
  const across = Math.abs((bay.u - start.u) * hv - (driveLayout.align - start.v) * hu)
  const facing = hv > 0.75 && across < 2.5
  if (ahead >= driveLayout.ahead || (facing && ahead > 0.5)) {
    const drift = Math.max(0.02, Math.abs(hv))
    return [swing(start, stop, Math.max(0, Math.min(ahead - driveLayout.lead, 0.7 / drift)))]
  }
  const legs: DriveLeg[] = []
  let from: Spot = { u: start.u, v: start.v }
  const slide = (speed * speed) / (2 * drivePace.brake)
  if (speed > 0.5 && slide > 0.2) {
    const halt = { u: from.u + hu * slide, v: from.v + hv * slide }
    legs.push(straight(from, halt, false))
    from = halt
  }
  const yard = driveLayout.yard
  let back = Math.min(driveLayout.back, driveLayout.ahead + 1 - ahead + (legs.length ? slide : 0))
  while (back > 0.5) {
    const u = from.u - hu * back
    const v = from.v - hv * back
    if (u > yard.u0 && u < yard.u1 && v > yard.v0 && v < yard.v1) break
    back -= 0.5
  }
  if (back > 0.5) {
    const staged = { u: from.u - hu * back, v: from.v - hv * back }
    legs.push(straight(from, staged, true))
    from = staged
  }
  legs.push(swing({ u: from.u, v: from.v, heading: start.heading }, stop))
  return legs
}

export function leavePath(entry: readonly DriveLeg[], start: DrivePose): DriveLeg[] {
  const last = entry[entry.length - 1]
  if (!last) return []
  const count = last.u.length
  const out: DriveLeg = { reverse: true, length: last.length, u: [], v: [], along: [], bend: [] }
  for (let index = count - 1; index >= 0; index--) {
    out.u.push(last.u[index] as number)
    out.v.push(last.v[index] as number)
    out.along.push(last.length - (last.along[index] as number))
    out.bend.push(-(last.bend[index] as number))
  }
  const legs = [out]
  const staged = { u: last.u[0] as number, v: last.v[0] as number }
  const gap = Math.hypot(staged.u - start.u, staged.v - start.v)
  if (gap > 0.05) {
    const forward =
      (start.u - staged.u) * Math.cos(start.heading) +
        (start.v - staged.v) * Math.sin(start.heading) >=
      0
    legs.push(straight(staged, { u: start.u, v: start.v }, !forward))
  }
  return legs
}

export function sampleLeg(leg: DriveLeg, distance: number, target: DriveSample): DriveSample {
  const along = Math.min(leg.length, Math.max(0, distance))
  let index = 1
  while (index < leg.along.length - 1 && (leg.along[index] as number) < along) index++
  const a = leg.along[index - 1] as number
  const b = leg.along[index] as number
  const t = b > a ? (along - a) / (b - a) : 0
  const u0 = leg.u[index - 1] as number
  const v0 = leg.v[index - 1] as number
  const u1 = leg.u[index] as number
  const v1 = leg.v[index] as number
  target.u = u0 + (u1 - u0) * t
  target.v = v0 + (v1 - v0) * t
  const before = Math.max(0, index - 2)
  const after = Math.min(leg.u.length - 1, index + 1)
  const wide = leg.u.length > 3 && index > 1 && index < leg.u.length - 2
  const du = wide ? (leg.u[after] as number) - (leg.u[before] as number) : u1 - u0
  const dv = wide ? (leg.v[after] as number) - (leg.v[before] as number) : v1 - v0
  const travel = Math.atan2(dv, du)
  target.heading = leg.reverse ? travel + Math.PI : travel
  const bend0 = leg.bend[index - 1] as number
  const bend1 = leg.bend[index] as number
  target.bend = bend0 + (bend1 - bend0) * t
  return target
}

export const drivePace = {
  cruise: 5.2,
  door: 2.3,
  reverse: 3.4,
  gain: 2.2,
  brake: 3.4,
  grip: 2.6,
  creep: 0.35,
} as const

const upcoming: DriveSample = { u: 0, v: 0, heading: 0, bend: 0 }

export function driveSpeed(
  leg: DriveLeg,
  distance: number,
  speed: number,
  sample: DriveSample,
  dt: number,
) {
  const left = Math.max(0, leg.length - distance)
  const near = sample.v > front - 3.5
  let limit: number = leg.reverse ? drivePace.reverse : near ? drivePace.door : drivePace.cruise
  sampleLeg(leg, distance + speed * 0.8 + 0.4, upcoming)
  const bend = Math.max(Math.abs(sample.bend), Math.abs(upcoming.bend))
  if (bend > 1e-3) limit = Math.min(limit, Math.sqrt(drivePace.grip / bend))
  limit = Math.min(limit, Math.sqrt(2 * drivePace.brake * 0.55 * left) + drivePace.creep * 0.3)
  limit = Math.max(limit, Math.min(drivePace.creep, left * 4 + 0.02))
  if (speed > limit) return Math.max(limit, speed - drivePace.brake * 1.6 * dt)
  return Math.min(limit, speed + drivePace.gain * dt)
}

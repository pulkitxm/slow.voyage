import { describe, expect, it } from 'bun:test'
import { carBodies, wheelGeometry } from './car-bodies'
import { footprints } from './collision'
import {
  type BayCar,
  type BayWheel,
  bayCentre,
  bayInterior,
  bayPlan,
  bayPosts,
  type CrewSide,
  cameraInside,
  cameraRoom,
  crewRoute,
  crewSpace,
  type DriveLeg,
  type DriveSample,
  distanceToRect,
  drivePace,
  drivePath,
  driveSpeed,
  inside,
  insideShot,
  leavePath,
  liftGeometry,
  liftPose,
  liftSwing,
  routeClear,
  type Shot,
  type Spot,
  sampleLeg,
  wheelSpot,
} from './garage-plan'
import { garageLayout } from './garages'
import { vehicleMetrics } from './vehicles'

const { bay, front } = garageLayout

interface Fitted {
  name: string
  car: BayCar
  wheels: BayWheel[]
}

function fitted(): Fitted[] {
  const list: Fitted[] = []
  const add = (
    name: string,
    footprint: { front: number; rear: number; halfWidth: number },
    geometry: ReturnType<typeof wheelGeometry>,
    clearance: number,
    height: number,
    width: number,
  ) => {
    const car: BayCar = {
      ...footprint,
      height,
      clearance,
      wheelbase: geometry.wheelbase,
      lifts: true,
    }
    const centre = bayCentre(car)
    const wheels: BayWheel[] = []
    for (const [axle, along] of [geometry.wheelbase / 2, -geometry.wheelbase / 2].entries())
      for (const side of [-1, 1])
        wheels.push({
          u: bay.u + (side * (geometry.track[axle] ?? 1.5)) / 2,
          v: centre + along,
          radius: geometry.radius[axle] ?? 0.33,
          width,
        })
    list.push({ name, car, wheels })
  }
  for (const body of carBodies)
    add(
      body.name,
      body.footprint,
      wheelGeometry(body.chassis, body),
      body.clearance,
      body.height,
      body.tyres[1].width,
    )
  for (const vehicle of ['touring', 'roadster', 'hatchback', 'supercar', 'pickup'] as const)
    add(vehicle, footprints[vehicle], wheelGeometry(vehicle, null), 0.16, 1.4, 0.24)
  return list
}

const everyCar = fitted()

describe('garage bay plan', () => {
  it('knows every real body and class it has to work around', () => {
    expect(everyCar.length).toBeGreaterThan(80)
    expect(vehicleMetrics.pickup.wheelbase).toBeGreaterThan(2)
  })
  it('keeps the crew routes clear of the car, the lift posts and the furniture', () => {
    const margin = crewSpace.body - 0.03
    for (const { name, car, wheels } of everyCar) {
      const plan = bayPlan(car)
      for (const side of [1, -1] as CrewSide[]) {
        const mine = wheels.filter((wheel) => Math.sign(wheel.u - bay.u) === side)
        expect(mine.length).toBe(2)
        const stops: Spot[] = [
          plan.home(side),
          ...mine.map((wheel) => wheelSpot(side, wheel)),
          ...mine.map((wheel) => plan.stage(side, wheel.v)),
          { u: bay.u + side * (car.halfWidth + 0.56), v: bayCentre(car) - 1.05 },
          {
            u: bay.u + side * (car.halfWidth + 0.56),
            v: Math.min(plan.nose, bayCentre(car) + 1.05),
          },
          { u: plan.lane(side), v: bayCentre(car) + 1.6 },
          { u: plan.lane(side), v: plan.nose },
          { u: plan.lane(side), v: plan.tail },
          { u: bay.u + side * 0.35, v: plan.tail },
        ]
        for (const stop of stops) {
          for (const solid of plan.solids)
            if (distanceToRect(solid, stop) < margin)
              throw new Error(`${name}: a stop at ${stop.u},${stop.v} is inside something`)
          expect(inside(bayInterior, stop) || stop.v < front).toBe(true)
        }
        for (const wheel of mine)
          for (const spot of [plan.fresh(side, wheel.v), plan.spent(side, wheel.v)]) {
            expect(inside(bayInterior, spot)).toBe(true)
            expect(Math.abs(spot.u - bayInterior.u0)).toBeGreaterThan(0.4)
            for (const solid of plan.solids)
              if (distanceToRect(solid, spot) < 0.36)
                throw new Error(
                  `${name}: a staged wheel at ${spot.u},${spot.v} is inside something`,
                )
            const reach = Math.hypot(spot.u - plan.lane(side), crewSpace.apart)
            expect(reach).toBeLessThan(0.95)
          }
        for (const from of stops)
          for (const to of stops) {
            const route = crewRoute(side, from, to, plan)
            expect(route[route.length - 1]).toEqual(to)
            if (!routeClear(plan, [from, ...route], margin))
              throw new Error(`${name}: route ${from.u},${from.v} to ${to.u},${to.v} is blocked`)
            for (const point of route) expect(Math.sign(point.u - bay.u) || side).toBe(side)
          }
      }
    }
  })
  it('keeps the two mechanics on their own sides so they never meet', () => {
    for (const { car } of everyCar) {
      const plan = bayPlan(car)
      expect(plan.lane(1) - plan.lane(-1)).toBeGreaterThan(4)
      expect(plan.home(1).u).toBeGreaterThan(bay.u + 2)
      expect(plan.home(-1).u).toBeLessThan(bay.u - 2)
    }
  })
  it('swings the lift arms under the sills and picks the car up only after touching', () => {
    for (const { car } of everyCar) {
      const swing = liftSwing(car)
      const pad = liftGeometry.pivot - Math.sin(swing) * liftGeometry.arm
      expect(pad).toBeLessThan(car.halfWidth)
      expect(pad).toBeGreaterThan(0.2)
      expect(liftPose(0, car).car).toBe(0)
      expect(liftPose(0, car).arm + liftGeometry.pad).toBeLessThanOrEqual(car.clearance + 0.13)
      const top = liftPose(1, car)
      expect(top.car).toBeCloseTo(liftGeometry.rise, 5)
      expect(top.car + car.height).toBeLessThan(3.6)
      let last = -1
      for (let step = 0; step <= 20; step++) {
        const pose = liftPose(step / 20, car)
        expect(pose.car).toBeGreaterThanOrEqual(last)
        last = pose.car
      }
    }
  })
  it('keeps every camera inside the room, off the walls and away from the car', () => {
    const shots: Shot[] = ['ready', 'arrive', 'wheels', 'paint', 'wash', 'exhaust', 'lift']
    for (const { car, wheels } of everyCar) {
      const plan = bayPlan(car)
      for (const shot of shots)
        for (const focus of [...wheels, { u: bay.u, v: bay.v }])
          for (const drift of [-0.6, 0, 0.6]) {
            const { eye } = insideShot(shot, car, focus, liftGeometry.rise, drift)
            expect(eye.u).toBeGreaterThanOrEqual(cameraRoom.near)
            expect(eye.u).toBeLessThanOrEqual(bayInterior.u1 - cameraRoom.margin)
            expect(eye.v).toBeGreaterThanOrEqual(bayInterior.v0 + cameraRoom.margin)
            expect(eye.v).toBeLessThanOrEqual(bayInterior.v1 - cameraRoom.margin)
            expect(eye.y).toBeGreaterThan(0.4)
            expect(eye.y).toBeLessThan(4.6)
            expect(distanceToRect(plan.car, eye)).toBeGreaterThan(1.5)
            for (const post of bayPosts) expect(distanceToRect(post, eye)).toBeGreaterThan(1)
          }
    }
    expect(cameraInside(-40, 0, -3)).toEqual({
      u: cameraRoom.near,
      v: bayInterior.v0 + cameraRoom.margin,
      y: cameraRoom.floor,
    })
  })
})

function drive(legs: DriveLeg[], speed: number) {
  const sample: DriveSample = { u: 0, v: 0, heading: 0, bend: 0 }
  let time = 0
  let tightest = Number.POSITIVE_INFINITY
  let fastest = 0
  let pace = speed
  const trail: DriveSample[] = []
  for (const leg of legs) {
    let distance = 0
    if (leg.reverse) pace = 0
    while (distance < leg.length - 0.004) {
      sampleLeg(leg, distance, sample)
      pace = driveSpeed(leg, distance, pace, sample, 1 / 60)
      distance += pace / 60
      time += 1 / 60
      fastest = Math.max(fastest, pace)
      if (Math.abs(sample.bend) > 1e-6) tightest = Math.min(tightest, 1 / Math.abs(sample.bend))
      trail.push({ ...sample })
      if (time > 120) throw new Error('The drive never finished')
    }
    pace = 0
  }
  return { time, tightest, fastest, trail }
}

describe('garage drive in and out', () => {
  const starts: { u: number; v: number; heading: number; speed: number }[] = []
  for (const u of [-34, -26, -18, -14.5, -11, -8, -4.5, -1, 1.5])
    for (const v of [-3, 0, 2, 4])
      for (const heading of [0, Math.PI, 0.12, -0.1])
        for (const speed of [0, 4, 9]) starts.push({ u: bay.u + u + 4.5, v, heading, speed })
  it('ends square in the bay, nose first, from anywhere the prompt allows', () => {
    for (const start of starts) {
      const legs = drivePath(start, start.speed)
      const last = legs[legs.length - 1] as DriveLeg
      expect(last.reverse).toBe(false)
      const end = sampleLeg(last, last.length, { u: 0, v: 0, heading: 0, bend: 0 })
      expect(end.u).toBeCloseTo(bay.u, 5)
      expect(end.v).toBeCloseTo(bay.v, 5)
      expect(Math.sin(end.heading)).toBeCloseTo(1, 5)
      const first = legs[0] as DriveLeg
      expect(first.u[0]).toBeCloseTo(start.u, 6)
      expect(first.v[0]).toBeCloseTo(start.v, 6)
    }
  })
  it('is lined up straight before the nose reaches the door and never touches the frame', () => {
    for (const start of starts) {
      const { trail } = drive(drivePath(start, start.speed), start.speed)
      for (const point of trail) {
        expect(Number.isFinite(point.u + point.v + point.heading)).toBe(true)
        if (point.v > front - 3.2) {
          expect(Math.abs(point.u - bay.u)).toBeLessThan(0.25)
          expect(Math.sin(point.heading)).toBeGreaterThan(0.985)
        }
        expect(point.v).toBeGreaterThan(-garageLayout.roadEdge - 4)
      }
    }
  })
  it('turns no tighter than a real car can and takes a sensible time', () => {
    for (const start of starts) {
      const run = drive(drivePath(start, start.speed), start.speed)
      expect(run.tightest).toBeGreaterThan(start.v <= 2 ? 3.5 : 2.1)
      expect(run.time).toBeGreaterThan(2.5)
      expect(run.time).toBeLessThan(42)
      expect(run.fastest).toBeLessThanOrEqual(Math.max(start.speed, drivePace.cruise) + 0.01)
    }
  })
  it('backs up first when the door is already behind or beside the car', () => {
    const past = drivePath({ u: bay.u + 4, v: 2, heading: 0 })
    expect(past.length).toBe(2)
    expect(past[0]?.reverse).toBe(true)
    const direct = drivePath({ u: bay.u - 12, v: 2, heading: 0 })
    expect(direct.length).toBe(1)
    const away = drivePath({ u: bay.u - 12, v: 2, heading: Math.PI }, 6)
    expect(away.map((leg) => leg.reverse)).toEqual([false, true, false])
  })
  it('leaves by backing out the way it came and stops exactly where it started', () => {
    for (const start of starts) {
      const legs = drivePath(start, start.speed)
      const out = leavePath(legs, start)
      expect(out[0]?.reverse).toBe(true)
      const first = sampleLeg(out[0] as DriveLeg, 0, { u: 0, v: 0, heading: 0, bend: 0 })
      expect(first.v).toBeCloseTo(bay.v, 5)
      expect(Math.sin(first.heading)).toBeCloseTo(1, 4)
      const last = out[out.length - 1] as DriveLeg
      const end = sampleLeg(last, last.length, { u: 0, v: 0, heading: 0, bend: 0 })
      expect(end.u).toBeCloseTo(start.u, 5)
      expect(end.v).toBeCloseTo(start.v, 5)
      expect(Math.cos(end.heading - start.heading)).toBeGreaterThan(0.995)
      expect(drive(out, 0).time).toBeLessThan(44)
    }
  })
})

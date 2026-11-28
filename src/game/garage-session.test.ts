import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import {
  type BayCar,
  bayInterior,
  bayPlan,
  bayPosts,
  cameraRoom,
  crewSpace,
  distanceToRect,
  liftGeometry,
} from './garage-plan'
import { buildBayRig, stepDoor } from './garage-rig'
import { type GarageHooks, type GarageJob, GarageSession, type Pose } from './garage-session'
import { type Garage, garageLayout } from './garages'

const { bay, front } = garageLayout

const cars: Record<string, BayCar> = {
  coupe: {
    halfWidth: 0.93,
    front: 2.25,
    rear: 2.3,
    height: 1.28,
    clearance: 0.11,
    wheelbase: 2.46,
    lifts: true,
  },
  pickup: {
    halfWidth: 1.04,
    front: 2.68,
    rear: 2.79,
    height: 1.9,
    clearance: 0.22,
    wheelbase: 3.4,
    lifts: true,
  },
}

function bench(side: 1 | -1, car: BayCar) {
  const scene = new THREE.Scene()
  const group = new THREE.Group()
  group.position.set(40, 3, -120)
  group.rotation.y = 0.6
  scene.add(group)
  const material = new THREE.MeshBasicMaterial()
  const rig = buildBayRig(side, material)
  group.add(rig.group)
  group.updateMatrixWorld(true)
  const log: string[] = []
  const state = { foam: 0, foamSweep: 0, rinse: 0, paint: 0, sheen: 0, grime: 0.8, hiss: 0 }
  const garage: Garage = { id: 1, s: 120, side, floor: 3, yaw: 0 }
  const session: { current: GarageSession | null } = { current: null }
  const rests = [
    [-0.8, car.wheelbase / 2],
    [0.8, car.wheelbase / 2],
    [-0.8, -car.wheelbase / 2],
    [0.8, -car.wheelbase / 2],
  ] as const
  const hooks: GarageHooks = {
    wash: (foam, foamSweep, rinse) => Object.assign(state, { foam, foamSweep, rinse }),
    washed: () => {
      Object.assign(state, { foam: 0, foamSweep: 0, rinse: 0, grime: 0 })
      log.push('washed')
    },
    paintSweep: (_color, sweep) => {
      state.paint = sweep
    },
    painted: (color) => {
      state.paint = 0
      log.push(`painted ${color}`)
    },
    sheen: (level) => {
      state.sheen = level
    },
    cleared: () => {
      Object.assign(state, { foam: 0, foamSweep: 0, rinse: 0, paint: 0 })
      log.push('cleared')
    },
    wheelSwap: (index, style) => log.push(`swap ${index} ${style}`),
    wheelsFitted: (style, finish) => log.push(`fitted ${style} ${finish}`),
    wheelProp: () => new THREE.Group(),
    exhaustFitted: (exhaust) => log.push(`exhaust ${exhaust}`),
    hiss: (level) => {
      state.hiss = level
    },
    ratchet: () => {},
    blip: (strength) => log.push(`blip ${strength}`),
    wheelCount: () => 4,
    wheelHub: (index, target) => {
      const live = session.current
      const [x, z] = rests[index] ?? [0, 0]
      if (!live) return target.set(0, 0, 0)
      const lift = Math.max(0, live.lift - liftGeometry.droop)
      target.set(x, 0.33 + lift, z)
      target.applyAxisAngle(new THREE.Vector3(0, 1, 0), live.pose.yaw)
      return target.add(new THREE.Vector3(live.pose.x, live.pose.y, live.pose.z))
    },
    wheelSize: () => ({ radius: 0.33, width: 0.25 }),
    car: () => car,
    ground: () => 2.6,
    calm: () => false,
  }
  const made = new GarageSession(scene, { site: () => ({ group, rig }) }, hooks)
  session.current = made
  const start = group.localToWorld(new THREE.Vector3(side * 1.8, -0.4, 14.5))
  const pose: Pose = { x: start.x, y: start.y, z: start.z, yaw: 0.6 }
  return { session: made, group, rig, garage, log, state, pose, scene }
}

type Bench = ReturnType<typeof bench>

function watch(rigged: Bench, car: BayCar, side: 1 | -1) {
  const { session, group } = rigged
  const plan = bayPlan(car)
  const spots = session.crew.map((member) => ({
    u: -member.root.position.z,
    v: side * member.root.position.x,
  }))
  const margin = crewSpace.body - 0.06
  for (const [index, spot] of spots.entries()) {
    for (const solid of [plan.car, ...bayPosts])
      if (distanceToRect(solid, spot) < margin)
        throw new Error(`Mechanic ${index} walked into something at ${spot.u}, ${spot.v}`)
    expect(Math.sign(spot.u - bay.u)).toBe(index === 0 ? 1 : -1)
    expect(spot.v).toBeGreaterThan(front - 4)
    expect(spot.u).toBeGreaterThan(bayInterior.u0 + 0.3)
    expect(spot.u).toBeLessThan(bayInterior.u1 - 0.3)
  }
  const [one, two] = spots
  if (one && two) expect(Math.hypot(one.u - two.u, one.v - two.v)).toBeGreaterThan(1.5)
  if (session.inside) {
    const eye = group.worldToLocal(session.camera.clone())
    const u = -eye.z
    const v = side * eye.x
    expect(u).toBeGreaterThanOrEqual(cameraRoom.near - 0.01)
    expect(u).toBeLessThanOrEqual(bayInterior.u1 - cameraRoom.margin + 0.01)
    expect(v).toBeGreaterThanOrEqual(bayInterior.v0 + cameraRoom.margin - 0.01)
    expect(v).toBeLessThanOrEqual(bayInterior.v1 - cameraRoom.margin + 0.01)
    expect(eye.y).toBeGreaterThan(0.4)
    expect(eye.y).toBeLessThan(4.6)
  }
}

function run(rigged: Bench, car: BayCar, side: 1 | -1, until: () => boolean, limit = 150) {
  let time = 0
  let settled: Pose | null = null
  while (!until()) {
    stepDoor(rigged.rig, 1 / 30)
    rigged.session.update(1 / 30, (pose) => {
      settled = pose
    })
    if (rigged.session.active) watch(rigged, car, side)
    time += 1 / 30
    if (time > limit) throw new Error(`Still ${rigged.session.phase} after ${limit} seconds`)
  }
  return { time, settled: settled as Pose | null }
}

function rested(rigged: Bench, car: BayCar) {
  const { session, rig } = rigged
  expect(session.phase).toBe('ready')
  expect(session.job).toBeNull()
  expect(session.lift).toBe(0)
  expect(session.status().progress).toBe(0)
  for (const place of session.wheelPlaces) expect(place.held).toBe(false)
  for (const carriage of rig.carriages)
    expect(carriage.position.y).toBeCloseTo(liftGeometry.rest, 5)
  for (const arm of rig.arms) expect(Math.abs(Math.sin(arm.rotation.y))).toBeLessThan(1e-6)
  for (const member of session.crew) expect(member.tool).toBe('none')
  expect(session.mist.active).toBe(false)
  expect(session.water.active).toBe(false)
  expect(session.props.trays.every((tray) => !tray.visible)).toBe(true)
  expect(session.props.hubs.every((hub) => !hub.visible)).toBe(true)
  expect(rigged.state.hiss).toBe(0)
  expect(car.lifts).toBe(true)
}

const jobs: GarageJob[] = [
  { kind: 'wash' },
  { kind: 'paint', color: '#1f6fd0' },
  { kind: 'wheels', style: 'mesh', finish: 'bronze' },
  { kind: 'exhaust', exhaust: 'sport' },
]

const outcome: Record<GarageJob['kind'], string> = {
  wash: 'washed',
  paint: 'painted #1f6fd0',
  wheels: 'fitted mesh bronze',
  exhaust: 'exhaust sport',
}

describe('garage session', () => {
  for (const side of [1, -1] as const)
    for (const [name, car] of Object.entries(cars))
      it(`drives a ${name} in, does every job and backs out on side ${side}`, () => {
        const rigged = bench(side, car)
        const { session, garage, pose, log, state, rig, group } = rigged
        expect(session.enter(garage, pose, 4)).toBe(true)
        expect(session.status().phase).toBe('entering')
        const drive = run(rigged, car, side, () => session.phase !== 'entering')
        expect(drive.time).toBeGreaterThan(2.5)
        expect(drive.time).toBeLessThan(30)
        expect(rig.open).toBe(1)
        const parked = group.worldToLocal(
          new THREE.Vector3(session.pose.x, session.pose.y, session.pose.z),
        )
        expect(-parked.z).toBeCloseTo(bay.u, 4)
        expect(side * parked.x).toBeCloseTo(bay.v, 4)
        expect(parked.y).toBeCloseTo(0.06, 4)
        rested(rigged, car)
        for (const job of jobs) {
          log.length = 0
          expect(session.choose(job)).toBe(true)
          expect(session.choose(job)).toBe(false)
          expect(session.leave()).toBe(false)
          let highest = 0
          let held = 0
          let last = 0
          const took = run(rigged, car, side, () => {
            highest = Math.max(highest, session.lift)
            held = Math.max(held, session.wheelPlaces.filter((place) => place.held).length)
            const progress = session.status().progress
            if (session.phase === 'working') {
              expect(progress).toBeGreaterThanOrEqual(last - 1e-9)
              last = progress
            }
            return session.phase !== 'working'
          })
          expect(took.time).toBeGreaterThan(6)
          expect(took.time).toBeLessThan(70)
          expect(log).toContain(outcome[job.kind])
          rested(rigged, car)
          if (job.kind === 'wheels') {
            expect(highest).toBeCloseTo(liftGeometry.rise, 4)
            expect(held).toBe(2)
            for (let wheel = 0; wheel < 4; wheel++)
              expect(log.indexOf(`swap ${wheel} mesh`)).toBeGreaterThanOrEqual(0)
            expect(log.indexOf('fitted mesh bronze')).toBeGreaterThan(log.indexOf('swap 3 mesh'))
          }
          if (job.kind === 'exhaust') {
            expect(highest).toBeCloseTo(liftGeometry.rise, 4)
            expect(log.filter((entry) => entry.startsWith('blip')).length).toBe(3)
            expect(log.indexOf('exhaust sport')).toBeLessThan(log.indexOf('blip 0.75'))
          }
          if (job.kind === 'wash') expect(state.grime).toBe(0)
        }
        expect(session.leave()).toBe(true)
        const out = run(rigged, car, side, () => !session.active)
        expect(out.settled).toEqual(pose)
        expect(rig.wanted).toBe(0)
        expect(session.crew.every((member) => member.root.parent === null)).toBe(true)
        session.dispose()
      })
  it('skips any job at any moment and leaves nothing half done', () => {
    const car = cars.coupe as BayCar
    for (const job of jobs)
      for (const after of [0, 0.4, 2.2, 4.9, 7.3, 11.6, 16.2, 21.5, 27.8]) {
        const rigged = bench(-1, car)
        const { session, garage, pose, log, state } = rigged
        session.enter(garage, pose)
        expect(session.skip()).toBe(true)
        expect(session.phase).toBe('ready')
        expect(session.skip()).toBe(false)
        session.update(1 / 30, () => {})
        session.choose(job)
        let time = 0
        while (time < after && session.phase === 'working') {
          session.update(1 / 30, () => {})
          time += 1 / 30
        }
        const working = session.phase === 'working'
        expect(session.skip()).toBe(working)
        session.update(1 / 30, () => {})
        rested(rigged, car)
        expect(log).toContain(outcome[job.kind])
        expect(state.foam + state.rinse + state.paint).toBe(0)
        if (job.kind === 'wheels')
          for (let wheel = 0; wheel < 4; wheel++) expect(log).toContain(`swap ${wheel} mesh`)
        const plan = bayPlan(car)
        for (const [index, member] of session.crew.entries()) {
          if (!working) continue
          const home = plan.home(index === 0 ? 1 : -1)
          expect(-member.root.position.z).toBeCloseTo(home.u, 4)
          expect(-member.root.position.x).toBeCloseTo(home.v, 4)
          expect(member.walking).toBe(false)
        }
        expect(session.choose({ kind: 'wash' })).toBe(true)
        session.dispose()
      }
  })
  it('keeps the body level through slow and uneven frames', () => {
    const car = cars.coupe as BayCar
    const rigged = bench(1, car)
    const { session, garage, pose, rig } = rigged
    session.enter(garage, pose, 8)
    let frame = 0
    while (session.phase === 'entering' && frame < 4000) {
      const dt = frame % 3 === 0 ? 0.25 : frame % 3 === 1 ? 0.004 : 0.09
      stepDoor(rig, dt)
      session.update(dt, () => {})
      expect(Math.abs(session.pitch)).toBeLessThanOrEqual(0.05)
      expect(Math.abs(session.lean)).toBeLessThanOrEqual(0.05)
      expect(
        Number.isFinite(session.pose.x + session.pose.y + session.pose.z + session.pose.yaw),
      ).toBe(true)
      frame++
    }
    expect(session.phase).toBe('ready')
    for (let settle = 0; settle < 40; settle++) session.update(0.1, () => {})
    expect(Math.abs(session.pitch)).toBeLessThan(0.002)
    expect(Math.abs(session.lean)).toBeLessThan(0.002)
    session.dispose()
  })
  it('skips the drive in and the drive out', () => {
    const car = cars.pickup as BayCar
    const rigged = bench(1, car)
    const { session, garage, pose } = rigged
    session.enter(garage, pose, 6)
    for (let frame = 0; frame < 20; frame++) session.update(1 / 30, () => {})
    session.skip()
    rested(rigged, car)
    expect(session.leave()).toBe(true)
    for (let frame = 0; frame < 10; frame++) session.update(1 / 30, () => {})
    expect(session.skip()).toBe(true)
    let settled: Pose | null = null
    session.update(1 / 30, (at) => {
      settled = at
    })
    expect(session.active).toBe(false)
    expect(settled as Pose | null).toEqual(pose)
    session.dispose()
  })
  it('puts everything back when the garage is torn down in the middle of a job', () => {
    const car = cars.coupe as BayCar
    for (const job of jobs) {
      const rigged = bench(1, car)
      const { session, garage, pose, log, rig, state } = rigged
      session.enter(garage, pose)
      session.skip()
      session.choose(job)
      for (let frame = 0; frame < 30 * 9; frame++) session.update(1 / 30, () => {})
      session.finish()
      expect(session.active).toBe(false)
      expect(log).toContain('cleared')
      expect(log).not.toContain(outcome[job.kind])
      expect(session.lift).toBe(0)
      expect(session.wheelPlaces.length).toBe(0)
      expect(state.hiss).toBe(0)
      for (const carriage of rig.carriages)
        expect(carriage.position.y).toBeCloseTo(liftGeometry.rest, 5)
      session.dispose()
    }
  })
})

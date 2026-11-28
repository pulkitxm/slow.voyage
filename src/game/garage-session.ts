import * as THREE from 'three'
import { CrewMember } from './garage-crew'
import type { GarageSites } from './garage-sites'
import { GarageSpray } from './garage-spray'
import { type Garage, garageLayout } from './garages'
import type { Exhaust, RimFinish, WheelStyle } from './styling'
import { clamp, damp } from './world'

export type GarageJob =
  | { kind: 'wash' }
  | { kind: 'paint'; color: string }
  | { kind: 'wheels'; style: WheelStyle; finish: RimFinish }
  | { kind: 'exhaust'; exhaust: Exhaust }

export type GaragePhase = 'idle' | 'entering' | 'ready' | 'working' | 'leaving'

export interface GarageStatus {
  phase: GaragePhase
  job: GarageJob['kind'] | null
  progress: number
  step: string
}

export interface GarageHooks {
  wash(rinse: number, foam: number, foamSweep: number, wet: number): void
  washed(): void
  paintSweep(color: string, sweep: number): void
  painted(color: string): void
  wheelSwap(index: number, style: WheelStyle, finish: RimFinish): void
  wheelsFitted(style: WheelStyle, finish: RimFinish): void
  exhaustFitted(exhaust: Exhaust): void
  hiss(level: number, band: number): void
  ratchet(): void
  blip(strength: number): void
  wheelOffset(index: number, outward: number): void
  wheelCount(): number
  wheelHub(index: number, target: THREE.Vector3): THREE.Vector3
  carLength(): number
}

export const garageTiming = {
  pace: 4.2,
  shortest: 3,
  wash: 17,
  paint: 15,
  wheelLift: 1.8,
  perWheel: 3.4,
  exhaust: 11,
  lift: 0.38,
} as const

export const jobSteps: Record<GarageJob['kind'], string> = {
  wash: 'Washing',
  paint: 'Painting',
  wheels: 'Fitting new wheels',
  exhaust: 'Fitting the exhaust',
}

interface Pose {
  x: number
  y: number
  z: number
  yaw: number
}

function bezier(a: number, b: number, c: number, d: number, t: number) {
  const r = 1 - t
  return r * r * r * a + 3 * r * r * t * b + 3 * r * t * t * c + t * t * t * d
}

function headingOf(dx: number, dz: number) {
  return Math.atan2(-dx, -dz)
}

export class GarageSession {
  phase: GaragePhase = 'idle'
  garage: Garage | null = null
  job: GarageJob | null = null
  elapsed = 0
  duration = 0
  pose: Pose = { x: 0, y: 0, z: 0, yaw: 0 }
  lift = 0
  roll = 0
  steer = 0
  crew = [new CrewMember(0), new CrewMember(1)]
  spray = new GarageSpray()
  camera = new THREE.Vector3()
  look = new THREE.Vector3()
  private site: THREE.Group | null = null
  private side: 1 | -1 = 1
  private start: Pose = { x: 0, y: 0, z: 0, yaw: 0 }
  private bay: Pose = { x: 0, y: 0, z: 0, yaw: 0 }
  private controls: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]
  private length = 1
  private beats = new Set<string>()
  private wheelIndex = -1
  private tip = new THREE.Vector3()
  private aim = new THREE.Vector3()
  private cameraGoal = new THREE.Vector3()
  private lookGoal = new THREE.Vector3()
  private snapped = false
  constructor(
    private scene: THREE.Scene,
    private sites: GarageSites,
    private hooks: GarageHooks,
  ) {
    scene.add(this.spray.points)
  }
  get active() {
    return this.phase !== 'idle'
  }
  get inside() {
    return this.phase === 'ready' || this.phase === 'working'
  }
  get busy() {
    return this.phase === 'entering' || this.phase === 'working' || this.phase === 'leaving'
  }
  status(): GarageStatus {
    return {
      phase: this.phase,
      job: this.job?.kind ?? null,
      progress: this.duration > 0 ? clamp(this.elapsed / this.duration, 0, 1) : 0,
      step: this.job ? jobSteps[this.job.kind] : '',
    }
  }
  local(u: number, v: number, y = 0, target = new THREE.Vector3()) {
    target.set(this.side * v, y, -u)
    if (this.site) this.site.localToWorld(target)
    return target
  }
  enter(garage: Garage, from: Pose) {
    const site = this.sites.site(garage)
    if (!site) return false
    this.garage = garage
    this.site = site.group
    this.side = garage.side
    this.start = { ...from }
    const bay = this.local(garageLayout.bay.u, garageLayout.bay.v, 0.06)
    const outward = this.local(garageLayout.bay.u, garageLayout.bay.v + 1, 0.06).sub(bay)
    this.bay = { x: bay.x, y: bay.y, z: bay.z, yaw: headingOf(outward.x, outward.z) }
    const along = Math.hypot(this.bay.x - from.x, this.bay.z - from.z)
    const reach = along * 0.42
    this.controls[0].set(from.x, from.y, from.z)
    this.controls[1].set(
      from.x - Math.sin(from.yaw) * reach,
      from.y,
      from.z - Math.cos(from.yaw) * reach,
    )
    this.controls[2].set(
      this.bay.x + Math.sin(this.bay.yaw) * reach,
      this.bay.y,
      this.bay.z + Math.cos(this.bay.yaw) * reach,
    )
    this.controls[3].set(this.bay.x, this.bay.y, this.bay.z)
    this.length = this.measure()
    this.phase = 'entering'
    this.elapsed = 0
    this.duration = Math.max(garageTiming.shortest, this.length / garageTiming.pace)
    this.snapped = false
    for (const [index, member] of this.crew.entries()) {
      site.group.add(member.root)
      member.root.visible = true
      const spot = this.localPlain(index ? 2.6 : -6.6, garageLayout.front + (index ? 2.2 : 1.4))
      member.place(spot.x, spot.z, index ? -Math.PI / 2 : Math.PI / 2)
      member.hold('none')
      member.pose = 'stand'
      member.effort = 0
    }
    return true
  }
  private localPlain(u: number, v: number) {
    return new THREE.Vector3(this.side * v, 0, -u)
  }
  private measure() {
    let total = 0
    const previous = new THREE.Vector3()
    const point = new THREE.Vector3()
    this.pathPoint(0, previous)
    for (let step = 1; step <= 40; step++) {
      this.pathPoint(step / 40, point)
      total += point.distanceTo(previous)
      previous.copy(point)
    }
    return total
  }
  private pathPoint(t: number, target: THREE.Vector3) {
    const [a, b, c, d] = this.controls
    return target.set(
      bezier(a.x, b.x, c.x, d.x, t),
      bezier(a.y, b.y, c.y, d.y, t),
      bezier(a.z, b.z, c.z, d.z, t),
    )
  }
  private travel(t: number, backwards: boolean) {
    const eased = t * t * (3 - 2 * t)
    const point = this.pathPoint(eased, new THREE.Vector3())
    const ahead = this.pathPoint(Math.min(1, eased + 0.01), new THREE.Vector3())
    const behind = this.pathPoint(Math.max(0, eased - 0.01), new THREE.Vector3())
    const tangent = ahead.sub(behind)
    const yaw = tangent.lengthSq() > 1e-8 ? headingOf(tangent.x, tangent.z) : this.pose.yaw
    const moved = Math.hypot(point.x - this.pose.x, point.z - this.pose.z)
    const turn = Math.atan2(Math.sin(yaw - this.pose.yaw), Math.cos(yaw - this.pose.yaw))
    this.steer = moved > 1e-4 ? clamp((turn / moved) * 2.6, -0.6, 0.6) : this.steer * 0.9
    this.roll += backwards ? -moved : moved
    this.pose = { x: point.x, y: point.y, z: point.z, yaw }
  }
  choose(job: GarageJob) {
    if (this.phase !== 'ready') return false
    this.job = job
    this.phase = 'working'
    this.elapsed = 0
    this.beats.clear()
    this.wheelIndex = -1
    this.duration =
      job.kind === 'wash'
        ? garageTiming.wash
        : job.kind === 'paint'
          ? garageTiming.paint
          : job.kind === 'wheels'
            ? garageTiming.wheelLift * 2 + garageTiming.perWheel * this.hooks.wheelCount()
            : garageTiming.exhaust
    if (job.kind === 'wash') this.spray.style('#f3f7fa', 0.16, 0.6)
    if (job.kind === 'paint') this.spray.style(job.color, 0.2, 0.32)
    return true
  }
  leave() {
    if (this.phase !== 'ready') return false
    this.phase = 'leaving'
    this.elapsed = 0
    this.duration = Math.max(garageTiming.shortest, this.length / garageTiming.pace)
    for (const member of this.crew) {
      member.hold('none')
      member.pose = 'stand'
      member.effort = 0
    }
    return true
  }
  private once(name: string, run: () => void) {
    if (this.beats.has(name)) return
    this.beats.add(name)
    run()
  }
  private wheelSpot(index: number, reach: number, target: THREE.Vector3) {
    this.hooks.wheelHub(index, target)
    const centre = new THREE.Vector3(this.pose.x, target.y, this.pose.z)
    const out = target.clone().sub(centre).setY(0)
    if (out.lengthSq() > 1e-6) target.addScaledVector(out.normalize(), reach)
    if (this.site) this.site.worldToLocal(target)
    return target
  }
  update(dt: number, settled: (pose: Pose) => void) {
    if (this.phase === 'idle') return
    this.elapsed += dt
    const progress = this.duration > 0 ? clamp(this.elapsed / this.duration, 0, 1) : 1
    if (this.phase === 'entering') {
      this.travel(progress, false)
      if (progress >= 1) {
        this.phase = 'ready'
        this.elapsed = 0
        this.duration = 0
        this.steer = 0
      }
    } else if (this.phase === 'leaving') {
      this.travel(1 - progress, true)
      if (progress >= 1) {
        this.finish()
        settled(this.start)
        return
      }
    } else if (this.phase === 'working' && this.job) {
      this.work(this.job, this.elapsed, dt)
      if (this.elapsed >= this.duration) this.complete(this.job)
    }
    for (const member of this.crew) member.update(dt)
    this.spray.update(dt, this.bay.y + 0.02)
    this.frameCamera(dt)
  }
  private complete(job: GarageJob) {
    const { hooks } = this
    if (job.kind === 'wash') hooks.washed()
    if (job.kind === 'paint') hooks.painted(job.color)
    if (job.kind === 'wheels') {
      for (let index = 0; index < hooks.wheelCount(); index++) {
        hooks.wheelSwap(index, job.style, job.finish)
        hooks.wheelOffset(index, 0)
      }
      hooks.wheelsFitted(job.style, job.finish)
    }
    if (job.kind === 'exhaust') hooks.exhaustFitted(job.exhaust)
    this.phase = 'ready'
    this.job = null
    this.elapsed = 0
    this.duration = 0
    this.lift = 0
    this.wheelIndex = -1
    this.beats.clear()
    this.spray.clear()
    hooks.hiss(0, 1000)
    this.sendHome(false)
  }
  private sendHome(instantly: boolean) {
    for (const [index, member] of this.crew.entries()) {
      member.hold('none')
      member.pose = 'stand'
      member.effort = 0
      const spot = this.localPlain(index ? 2.6 : -6.6, garageLayout.front + (index ? 2.2 : 1.4))
      const facing = index ? -Math.PI / 2 : Math.PI / 2
      if (instantly) member.place(spot.x, spot.z, facing)
      else member.walkTo(spot.x, spot.z, facing)
    }
  }
  skip() {
    if (this.phase === 'entering' || this.phase === 'leaving') {
      this.elapsed = this.duration
      return true
    }
    if (this.phase !== 'working' || !this.job) return false
    this.complete(this.job)
    this.sendHome(true)
    return true
  }
  private crewAt(index: number, u: number, v: number, face: number) {
    const member = this.crew[index]
    if (!member) return
    const spot = this.localPlain(u, v)
    member.walkTo(spot.x, spot.z, face)
  }
  private facing(u: number, v: number, towardU: number, towardV: number) {
    const from = this.localPlain(u, v)
    const to = this.localPlain(towardU, towardV)
    return Math.atan2(to.x - from.x, to.z - from.z)
  }
  private work(job: GarageJob, time: number, dt: number) {
    const bayU = garageLayout.bay.u
    const bayV = garageLayout.bay.v
    const half = this.hooks.carLength() / 2
    const nose = bayV + half
    const tail = bayV - half
    const sideU = bayU + 1.75
    const farU = bayU - 1.75
    const [first, second] = this.crew
    if (!first || !second) return
    const sweepOf = (from: number, to: number) => clamp((time - from) / (to - from), 0, 1)
    const target = this.aim
    if (job.kind === 'wash') {
      const foamSweep = sweepOf(2.2, 7.5)
      const rinse = sweepOf(9.8, 15)
      const foam = time < 2.2 ? 0 : 1
      this.hooks.wash(rinse, foam, foamSweep, rinse > 0 ? 1 : 0)
      this.once('go', () => {
        first.hold('lance')
        second.hold('sponge')
        this.crewAt(0, sideU + 0.4, nose + 0.3, this.facing(sideU, nose, bayU, nose))
        this.crewAt(1, farU - 0.4, bayV, this.facing(farU, bayV, bayU, bayV))
      })
      const lanceV = time < 9.8 ? nose - foamSweep * half * 2 : nose - rinse * half * 2
      const working = (time > 2.2 && time < 7.6) || (time > 9.8 && time < 15.1)
      if (working) {
        this.crewAt(0, sideU + 0.45, lanceV + 0.2, this.facing(sideU, lanceV, bayU, lanceV))
        first.pose = 'reach'
        first.effort = 1
        first.toolTip(this.tip)
        this.local(bayU, lanceV, 0.75, target)
        const foamy = time < 9.8
        this.spray.style(foamy ? '#f6f8fa' : '#cfe4f2', foamy ? 0.17 : 0.07, foamy ? 0.7 : 0.45)
        this.spray.emit(this.tip, target, foamy ? 160 : 320, dt, foamy ? 0.5 : 0.25, foamy ? 4 : 9)
        this.hooks.hiss(foamy ? 0.5 : 0.85, foamy ? 900 : 2400)
      } else {
        first.pose = 'stand'
        first.effort = 0
        this.hooks.hiss(0, 1000)
      }
      if (time > 7.6 && time < 9.8) {
        this.once('scrub', () =>
          this.crewAt(1, farU - 0.35, bayV, this.facing(farU, bayV, bayU, bayV)),
        )
        second.pose = 'sweep'
        second.effort = 1
      } else if (time > 9.8) {
        second.pose = 'stand'
        second.effort = 0
        this.once('step back', () =>
          this.crewAt(1, farU - 1.6, tail - 0.5, this.facing(farU, tail, bayU, bayV)),
        )
      }
    }
    if (job.kind === 'paint') {
      const sweep = sweepOf(2.4, 11.5)
      this.hooks.paintSweep(job.color, sweep)
      this.once('go', () => {
        first.hold('spray')
        second.hold('spray')
        this.crewAt(0, sideU + 0.3, nose + 0.4, this.facing(sideU, nose, bayU, nose))
        this.crewAt(1, farU - 0.3, nose + 0.4, this.facing(farU, nose, bayU, nose))
      })
      if (time > 2.4 && time < 11.6) {
        const v = nose - sweep * half * 2
        for (const [index, member] of this.crew.entries()) {
          const u = index ? farU - 0.35 : sideU + 0.35
          this.crewAt(index, u, v + 0.25, this.facing(u, v, bayU, v))
          member.pose = 'sweep'
          member.effort = 0.6
          member.toolTip(this.tip)
          this.local(bayU, v, 0.7, target)
          this.spray.emit(this.tip, target, 110, dt, 0.6, 3)
        }
        this.hooks.hiss(0.45, 3200)
      } else {
        for (const member of this.crew) {
          member.pose = 'stand'
          member.effort = 0
        }
        this.hooks.hiss(0, 1000)
      }
    }
    if (job.kind === 'wheels') {
      const count = this.hooks.wheelCount()
      const lifting = clamp(time / garageTiming.wheelLift, 0, 1)
      const lowering = clamp((this.duration - time) / garageTiming.wheelLift, 0, 1)
      this.lift = garageTiming.lift * Math.min(lifting, lowering) ** 0.8
      this.once('go', () => {
        first.hold('wrench')
        second.hold('none')
        this.crewAt(1, bayU + 4.6, bayV - 1, this.facing(bayU + 4.6, bayV - 1, bayU, bayV))
      })
      const working = time - garageTiming.wheelLift
      const index = Math.floor(working / garageTiming.perWheel)
      if (working >= 0 && index < count) {
        const local = working - index * garageTiming.perWheel
        if (this.wheelIndex !== index) {
          this.wheelIndex = index
          const spot = this.wheelSpot(index, 0.75, new THREE.Vector3())
          const hub = this.wheelSpot(index, 0, new THREE.Vector3())
          first.walkTo(spot.x, spot.z, Math.atan2(hub.x - spot.x, hub.z - spot.z))
        }
        const arrived = !first.walking
        first.pose = arrived ? 'kneel' : 'stand'
        first.effort = arrived && (local < 1.2 || local > 2.5) ? 1 : 0
        if (arrived && local > 0.4) this.once(`loosen ${index}`, () => this.hooks.ratchet())
        const off = clamp((local - 1.3) / 0.35, 0, 1) - clamp((local - 2.1) / 0.35, 0, 1)
        this.hooks.wheelOffset(index, off * 0.32)
        if (local > 1.7)
          this.once(`swap ${index}`, () => this.hooks.wheelSwap(index, job.style, job.finish))
        if (local > 2.55) this.once(`tighten ${index}`, () => this.hooks.ratchet())
      } else {
        first.pose = 'stand'
        first.effort = 0
        if (index >= count)
          this.once('clear', () =>
            this.crewAt(0, sideU + 2.4, tail - 0.8, this.facing(sideU + 2.4, tail, bayU, bayV)),
          )
      }
    }
    if (job.kind === 'exhaust') {
      this.once('go', () => {
        first.hold('wrench')
        second.hold('none')
        this.crewAt(0, bayU + 0.5, tail - 0.55, this.facing(bayU + 0.5, tail - 0.55, bayU, bayV))
        this.crewAt(1, sideU + 0.6, bayV + 0.6, this.facing(sideU + 0.6, bayV + 0.6, bayU, bayV))
      })
      const fitting = time > 1.6 && time < 6
      first.pose = fitting ? 'kneel' : 'stand'
      first.effort = fitting ? 1 : 0
      for (const beat of [2, 3.4, 4.8])
        if (time > beat) this.once(`ratchet ${beat}`, () => this.hooks.ratchet())
      if (time > 6)
        this.once('fitted', () => {
          this.hooks.exhaustFitted(job.exhaust)
          this.crewAt(0, sideU + 2.6, tail - 1.4, this.facing(sideU + 2.6, tail - 1.4, bayU, bayV))
        })
      for (const beat of [7.2, 8.4, 9.5])
        if (time > beat) this.once(`blip ${beat}`, () => this.hooks.blip(beat > 9 ? 1 : 0.75))
    }
  }
  private frameCamera(dt: number) {
    const bayU = garageLayout.bay.u
    const bayV = garageLayout.bay.v
    const half = this.hooks.carLength() / 2
    const job = this.job?.kind
    if (this.phase === 'entering' || this.phase === 'leaving') {
      this.local(bayU + 7.5, garageLayout.front - 6, 3.2, this.cameraGoal)
      this.lookGoal.set(this.pose.x, this.pose.y + 0.8, this.pose.z)
    } else if (job === 'wheels') {
      const index = Math.max(0, this.wheelIndex)
      this.hooks.wheelHub(index, this.lookGoal)
      const centre = new THREE.Vector3(this.pose.x, this.lookGoal.y, this.pose.z)
      const out = this.lookGoal.clone().sub(centre).setY(0).normalize()
      const along = new THREE.Vector3(-Math.sin(this.pose.yaw), 0, -Math.cos(this.pose.yaw))
      this.cameraGoal
        .copy(this.lookGoal)
        .addScaledVector(out, 3.4)
        .addScaledVector(along, Math.sign(out.dot(along) || 1) * 0 + 1.6)
      this.cameraGoal.y = this.bay.y + 1.15
    } else if (job === 'exhaust') {
      this.local(bayU + 3.2, bayV - half - 3.6, 1.2, this.cameraGoal)
      this.local(bayU, bayV - half, 0.5, this.lookGoal)
    } else if (job === 'paint') {
      this.local(bayU + 5.2, bayV + 3.4, 2.4, this.cameraGoal)
      this.local(bayU, bayV, 0.6, this.lookGoal)
    } else if (job === 'wash') {
      this.local(bayU + 5.6, bayV - 3.6, 2.7, this.cameraGoal)
      this.local(bayU, bayV, 0.6, this.lookGoal)
    } else {
      const drift = Math.sin(this.elapsed * 0.25) * 0.6
      this.local(bayU + 3.6 + drift, garageLayout.front + 0.4, 1.7, this.cameraGoal)
      this.local(bayU - 0.3, bayV + 0.2, 0.6, this.lookGoal)
    }
    if (!this.snapped) {
      this.camera.copy(this.cameraGoal)
      this.look.copy(this.lookGoal)
      this.snapped = true
      return
    }
    const rate = this.phase === 'entering' || this.phase === 'leaving' ? 3 : 1.6
    this.camera.x = damp(this.camera.x, this.cameraGoal.x, rate, dt)
    this.camera.y = damp(this.camera.y, this.cameraGoal.y, rate, dt)
    this.camera.z = damp(this.camera.z, this.cameraGoal.z, rate, dt)
    this.look.x = damp(this.look.x, this.lookGoal.x, rate * 1.6, dt)
    this.look.y = damp(this.look.y, this.lookGoal.y, rate * 1.6, dt)
    this.look.z = damp(this.look.z, this.lookGoal.z, rate * 1.6, dt)
  }
  finish() {
    this.phase = 'idle'
    this.job = null
    this.garage = null
    this.site = null
    this.lift = 0
    this.spray.clear()
    this.hooks.hiss(0, 1000)
    for (const member of this.crew) {
      member.root.removeFromParent()
      member.root.visible = false
    }
  }
  dispose() {
    this.finish()
    this.spray.dispose()
    for (const member of this.crew) member.dispose()
    this.scene.remove(this.spray.points)
  }
}

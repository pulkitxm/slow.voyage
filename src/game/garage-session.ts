import * as THREE from 'three'
import { CrewMember } from './garage-crew'
import {
  type BayCar,
  type BayPlan,
  type BayWheel,
  bayCentre,
  bayPlan,
  type CrewSide,
  crewRoute,
  type DriveLeg,
  type DriveSample,
  drivePath,
  driveSpeed,
  insideShot,
  leavePath,
  liftPose,
  liftSwing,
  outsideShot,
  type Shot,
  type Spot,
  sampleLeg,
  wheelSpot,
} from './garage-plan'
import { type BayRig, GarageProps, nutLayout, setLift } from './garage-rig'
import {
  ease,
  easeBack,
  easeOut,
  type Stage,
  type Step,
  span,
  stageDone,
  stageProgress,
  Track,
} from './garage-script'
import { GarageSpray, sprayTexture } from './garage-spray'
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

export interface GarageSite {
  group: THREE.Group
  rig: BayRig
}

export interface GarageSiteSource {
  site(garage: Garage): GarageSite | null
}

export interface GarageHooks {
  wash(foam: number, foamSweep: number, rinse: number): void
  washed(): void
  paintSweep(color: string, sweep: number): void
  painted(color: string): void
  sheen(level: number): void
  cleared(): void
  wheelSwap(index: number, style: WheelStyle, finish: RimFinish): void
  wheelsFitted(style: WheelStyle, finish: RimFinish): void
  wheelProp(index: number, style: WheelStyle | null, finish: RimFinish): THREE.Object3D
  exhaustFitted(exhaust: Exhaust): void
  hiss(level: number, band: number): void
  ratchet(): void
  blip(strength: number): void
  wheelCount(): number
  wheelHub(index: number, target: THREE.Vector3): THREE.Vector3
  wheelSize(index: number): { radius: number; width: number }
  car(): BayCar
  ground(x: number, z: number): number
  calm(): boolean
}

export const garageTiming = {
  swing: 1.1,
  raise: 2.8,
  loosen: 0.23,
  tighten: 0.19,
  torque: 0.15,
  sweep: 0.52,
  coat: 0.42,
  scrub: 1.5,
  dry: 2.6,
  blip: 1.15,
} as const

export const jobSteps: Record<GarageJob['kind'], string> = {
  wash: 'Washing',
  paint: 'Painting',
  wheels: 'Fitting new wheels',
  exhaust: 'Fitting the exhaust',
}

export const carryLayout = { ahead: 0.44, height: 0.98, pull: 0.3, floor: 0.06 } as const

export interface Pose {
  x: number
  y: number
  z: number
  yaw: number
}

export interface WheelPlace {
  held: boolean
  position: THREE.Vector3
  yaw: number
  tilt: number
}

interface WheelProps {
  fresh: THREE.Object3D
  spent: THREE.Object3D
}

const { bay, front } = garageLayout
const starOrder = [0, 2, 4, 1, 3] as const

function carryYaw(facing: number, outward: number) {
  return Math.atan2(outward * Math.cos(facing), -outward * Math.sin(facing))
}

function turnToward(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t
}

export class GarageSession {
  phase: GaragePhase = 'idle'
  garage: Garage | null = null
  job: GarageJob | null = null
  pose: Pose = { x: 0, y: 0, z: 0, yaw: 0 }
  pitch = 0
  lean = 0
  lift = 0
  roll = 0
  steer = 0
  speed = 0
  wheelPlaces: WheelPlace[] = []
  crew = [new CrewMember(0), new CrewMember(1)]
  props = new GarageProps()
  mist: GarageSpray
  water: GarageSpray
  camera = new THREE.Vector3()
  look = new THREE.Vector3()
  site: THREE.Group | null = null
  private rig: BayRig | null = null
  private texture = sprayTexture()
  private side: 1 | -1 = 1
  private start: Pose = { x: 0, y: 0, z: 0, yaw: 0 }
  private startSpot: Spot = { u: 0, v: 0 }
  private bayPose: Pose = { x: 0, y: 0, z: 0, yaw: 0 }
  private bayYaw = 0
  private car: BayCar = {
    halfWidth: 0.9,
    front: 2.2,
    rear: 2.2,
    height: 1.4,
    clearance: 0.16,
    wheelbase: 2.6,
    lifts: true,
  }
  private plan: BayPlan = bayPlan(this.car)
  private centre: number = bay.v
  private legs: DriveLeg[] = []
  private exit: DriveLeg[] = []
  private leg = 0
  private travelled = 0
  private total = 1
  private covered = 0
  private sample: DriveSample = { u: 0, v: 0, heading: 0, bend: 0 }
  private spot: Spot = { u: 0, v: 0 }
  private rise = 0
  private pitchPace = 0
  private leanPace = 0
  private stages: Stage[] = []
  private stage = 0
  private swing = 0
  private travel = 0
  private shot: Shot = 'ready'
  private focus: Spot = { u: bay.u, v: bay.v }
  private wheelProps: WheelProps[] = []
  private clock = 0
  private outside = true
  private snapped = false
  private cameraGoal = new THREE.Vector3()
  private lookGoal = new THREE.Vector3()
  private tip = new THREE.Vector3()
  private aim = new THREE.Vector3()
  private point = new THREE.Vector3()
  private other = new THREE.Vector3()
  private third = new THREE.Vector3()
  private route: number[] = []
  private turn = new THREE.Quaternion()
  constructor(
    private scene: THREE.Scene,
    private sites: GarageSiteSource,
    private hooks: GarageHooks,
  ) {
    this.mist = new GarageSpray(520, this.texture, 4411)
    this.water = new GarageSpray(420, this.texture, 977)
    scene.add(this.mist.points, this.water.points)
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
    const moving = this.phase === 'entering' || this.phase === 'leaving'
    return {
      phase: this.phase,
      job: this.job?.kind ?? null,
      progress:
        this.phase === 'working'
          ? stageProgress(this.stages, this.stage)
          : moving
            ? clamp(this.covered / this.total, 0, 1)
            : 0,
      step: this.job ? (this.stages[this.stage]?.label ?? jobSteps[this.job.kind]) : '',
    }
  }
  private place(u: number, v: number, y: number, target: THREE.Vector3) {
    return target.set(this.side * v, y, -u)
  }
  private toWorld(u: number, v: number, y: number, target: THREE.Vector3) {
    this.place(u, v, y, target)
    if (this.site) this.site.localToWorld(target)
    return target
  }
  private spotOf(local: THREE.Vector3, target: Spot) {
    target.u = -local.z
    target.v = this.side * local.x
    return target
  }
  private facingTo(du: number, dv: number) {
    return Math.atan2(this.side * dv, -du)
  }
  private yawOf(heading: number) {
    this.point.set(this.side * Math.sin(heading), 0, -Math.cos(heading))
    if (this.site) this.point.transformDirection(this.site.matrixWorld)
    return Math.atan2(-this.point.x, -this.point.z)
  }
  enter(garage: Garage, from: Pose, speed = 0) {
    const site = this.sites.site(garage)
    if (!site) return false
    this.garage = garage
    this.site = site.group
    this.rig = site.rig
    this.side = garage.side
    this.start = { ...from }
    site.group.updateMatrixWorld(true)
    this.car = this.hooks.car()
    this.plan = bayPlan(this.car)
    this.centre = bayCentre(this.car)
    const local = site.group.worldToLocal(this.point.set(from.x, from.y, from.z))
    this.spotOf(local, this.startSpot)
    const turned = this.other
      .set(-Math.sin(from.yaw), 0, -Math.cos(from.yaw))
      .applyQuaternion(this.turn.copy(site.group.quaternion).invert())
    const heading = Math.atan2(this.side * turned.x, -turned.z)
    const begin = { u: this.startSpot.u, v: this.startSpot.v, heading }
    this.legs = drivePath(begin, Math.abs(speed), this.centre)
    this.exit = leavePath(this.legs, begin)
    this.beginDrive(this.legs, Math.abs(speed))
    this.bayYaw = this.yawOf(Math.PI / 2)
    const floor = this.toWorld(bay.u, this.centre, carryLayout.floor, this.point)
    this.bayPose = { x: floor.x, y: floor.y, z: floor.z, yaw: this.bayYaw }
    this.pose = { ...from }
    this.rise = from.y - this.hooks.ground(from.x, from.z)
    this.pitch = this.lean = this.pitchPace = this.leanPace = 0
    this.lift = this.swing = this.travel = 0
    this.steer = 0
    this.phase = 'entering'
    this.outside = true
    this.snapped = false
    this.shot = 'arrive'
    site.rig.wanted = 1
    site.group.add(this.props.group)
    this.props.clear()
    this.wheelPlaces = []
    for (let index = 0; index < this.hooks.wheelCount(); index++)
      this.wheelPlaces.push({ held: false, position: new THREE.Vector3(), yaw: 0, tilt: 0 })
    for (const member of this.crew) {
      site.group.add(member.root)
      member.root.visible = true
    }
    this.homeCrew(true)
    return true
  }
  private beginDrive(legs: DriveLeg[], speed: number) {
    this.leg = 0
    this.travelled = 0
    this.covered = 0
    this.total = 0
    for (const leg of legs) this.total += leg.length
    this.total = Math.max(0.01, this.total)
    this.speed = legs[0]?.reverse ? 0 : speed
  }
  private memberSide(index: number): CrewSide {
    return index === 0 ? 1 : -1
  }
  private homeCrew(instantly: boolean) {
    for (const [index, member] of this.crew.entries()) {
      const side = this.memberSide(index)
      const home = this.plan.home(side)
      const facing = this.facingTo(bay.u - home.u, this.centre - home.v)
      member.hold('none')
      member.rest()
      member.pace = 0
      if (instantly) {
        member.settle()
        member.place(this.side * home.v, -home.u, facing)
      } else this.send(index, home, facing)
    }
  }
  private send(index: number, to: Spot, facing: number | null) {
    const member = this.crew[index]
    if (!member) return
    const side = this.memberSide(index)
    const from = this.spotOf(member.root.position, this.spot)
    const points = crewRoute(side, from, to, this.plan)
    this.route.length = 0
    for (const point of points) this.route.push(this.side * point.v, -point.u)
    member.walk(this.route, facing)
  }
  private drive(legs: DriveLeg[], dt: number) {
    const leg = legs[this.leg]
    if (!leg) return true
    const sample = sampleLeg(leg, this.travelled, this.sample)
    const before = this.speed
    let speed = driveSpeed(leg, this.travelled, this.speed, sample, dt)
    const door = this.rig?.open ?? 1
    if (!leg.reverse && door < 0.86 && sample.v > front - 7.5)
      speed = Math.min(speed, Math.max(0, (front - 4.4 - sample.v) * 1.4))
    this.speed = speed
    const step = speed * dt
    this.travelled += step
    this.covered += step
    const direction = leg.reverse ? -1 : 1
    this.roll += step * direction
    sampleLeg(leg, this.travelled, sample)
    const world = this.toWorld(sample.u, sample.v, 0, this.point)
    const ground = this.hooks.ground(world.x, world.z) + this.rise
    const blend = ease(span(sample.v, front - 1.7, front + 0.1))
    const height = ground + (this.bayPose.y - ground) * blend
    this.pose.x = world.x
    this.pose.z = world.z
    this.pose.y = dt > 0 ? damp(this.pose.y, height, 9, dt) : this.pose.y
    this.pose.yaw = this.yawOf(sample.heading)
    const wanted = -this.side * direction * Math.atan(this.car.wheelbase * sample.bend)
    this.steer = dt > 0 ? damp(this.steer, wanted, 9, dt) : wanted
    if (dt > 0) {
      const push = ((speed - before) / dt) * direction
      this.rock(clamp(push * 0.0075, -0.028, 0.022), dt)
      const side = this.side * direction * sample.bend * speed * speed * 0.0085
      this.sway(clamp(side, -0.03, 0.03), dt)
    }
    if (this.travelled < leg.length - 0.004) return false
    this.leg++
    this.travelled = 0
    this.speed = 0
    return this.leg >= legs.length
  }
  private rock(target: number, dt: number) {
    if (this.hooks.calm()) {
      this.pitch = 0
      this.pitchPace = 0
      return
    }
    this.pitchPace += (-70 * (this.pitch - target) - 6.2 * this.pitchPace) * dt
    this.pitch += this.pitchPace * dt
  }
  private sway(target: number, dt: number) {
    if (this.hooks.calm()) {
      this.lean = 0
      this.leanPace = 0
      return
    }
    this.leanPace += (-60 * (this.lean - target) - 7 * this.leanPace) * dt
    this.lean += this.leanPace * dt
  }
  choose(job: GarageJob) {
    if (this.phase !== 'ready') return false
    this.job = job
    this.phase = 'working'
    this.stage = 0
    this.clock = 0
    this.stages =
      job.kind === 'wash'
        ? this.washStages()
        : job.kind === 'paint'
          ? this.paintStages(job.color)
          : job.kind === 'wheels'
            ? this.wheelStages(job.style, job.finish)
            : this.exhaustStages(job.exhaust)
    return true
  }
  leave() {
    if (this.phase !== 'ready') return false
    this.phase = 'leaving'
    this.beginDrive(this.exit, 0)
    this.shot = 'arrive'
    this.homeCrew(false)
    return true
  }
  skip() {
    if (this.phase === 'entering') {
      this.arrive()
      return true
    }
    if (this.phase === 'leaving') {
      this.leg = this.exit.length
      return true
    }
    if (this.phase !== 'working' || !this.job) return false
    this.complete(this.job)
    this.homeCrew(true)
    return true
  }
  private arrive() {
    this.phase = 'ready'
    this.pose = { ...this.bayPose }
    this.speed = 0
    this.steer = 0
    this.leg = this.legs.length
    this.covered = this.total
    this.shot = 'ready'
    if (this.rig) this.rig.wanted = 1
    if (this.outside) {
      this.outside = false
      this.snapped = false
    }
  }
  private complete(job: GarageJob) {
    const { hooks } = this
    if (job.kind === 'wash') hooks.washed()
    if (job.kind === 'paint') hooks.painted(job.color)
    if (job.kind === 'wheels') {
      for (let index = 0; index < hooks.wheelCount(); index++)
        hooks.wheelSwap(index, job.style, job.finish)
      hooks.wheelsFitted(job.style, job.finish)
    }
    if (job.kind === 'exhaust') hooks.exhaustFitted(job.exhaust)
    this.phase = 'ready'
    this.job = null
    this.restore()
    this.homeCrew(false)
  }
  private restore() {
    this.stages = []
    this.stage = 0
    this.lift = this.swing = this.travel = 0
    this.shot = 'ready'
    for (const place of this.wheelPlaces) {
      place.held = false
      place.tilt = 0
    }
    for (const props of this.wheelProps) {
      props.fresh.removeFromParent()
      if (!props.spent.visible) props.spent.removeFromParent()
    }
    this.props.clear()
    this.mist.clear()
    this.water.clear()
    this.hooks.hiss(0, 1000)
    if (this.rig) setLift(this.rig, liftPose(0, this.car).arm, 0)
    for (const member of this.crew) {
      member.hold('none')
      member.rest()
      member.pace = 0
    }
  }
  private clearWheelProps() {
    for (const props of this.wheelProps) {
      props.fresh.removeFromParent()
      props.spent.removeFromParent()
    }
    this.wheelProps = []
  }
  update(dt: number, settled: (pose: Pose) => void) {
    if (this.phase === 'idle') return
    this.clock += dt
    const site = this.site
    if (this.phase === 'entering') {
      if (this.leg >= this.legs.length || this.drive(this.legs, dt)) this.arrive()
    } else if (this.phase === 'leaving') {
      if (this.leg >= this.exit.length || this.drive(this.exit, dt)) {
        const start = this.start
        this.finish()
        settled(start)
        return
      }
    } else {
      this.rock(0, dt)
      this.sway(0, dt)
      if (this.phase === 'working' && this.job) this.work(this.job, dt)
    }
    if (this.rig) setLift(this.rig, liftPose(this.travel, this.car).arm, this.swing)
    this.lift = liftPose(this.travel, this.car).car
    if (this.phase !== 'working' && site) {
      const car = site.worldToLocal(this.point.set(this.pose.x, this.pose.y + 0.9, this.pose.z))
      for (const member of this.crew) member.look(car)
    }
    for (const member of this.crew) member.update(dt)
    this.props.update(dt)
    const floor = this.bayPose.y - carryLayout.floor + 0.075
    this.mist.update(dt, floor)
    this.water.update(dt, floor)
    this.frameCamera(dt)
  }
  private work(job: GarageJob, dt: number) {
    const stage = this.stages[this.stage]
    if (!stage) {
      this.complete(job)
      return
    }
    for (const track of stage.tracks) track.update(dt)
    if (!stageDone(stage)) return
    this.stage++
    if (this.stage >= this.stages.length) this.complete(job)
  }
  private walkStep(index: number, to: () => Spot, facing: () => number | null): Step {
    const member = this.crew[index] as CrewMember
    return {
      time: 0,
      begin: () => this.send(index, to(), facing()),
      until: () => !member.walking,
    }
  }
  private faceCar(index: number) {
    const side = this.memberSide(index)
    return this.facingTo(-side, 0)
  }
  private liftSteps(up: boolean): Step[] {
    const reach = liftSwing(this.car)
    const swing: Step = {
      time: garageTiming.swing,
      run: (t) => {
        this.swing = reach * (up ? ease(t) : 1 - ease(t))
      },
    }
    const move: Step = {
      time: garageTiming.raise,
      begin: () => this.hooks.hiss(0.22, 420),
      run: (t) => {
        this.travel = up ? ease(t) : 1 - ease(t)
      },
      end: () => this.hooks.hiss(0, 1000),
    }
    return up ? [swing, move] : [move, swing]
  }
  private view(shot: Shot, focus?: Spot): Step {
    return {
      time: 0,
      begin: () => {
        this.shot = shot
        if (focus) this.aimAt(focus)
      },
    }
  }
  private aimAt(focus: Spot) {
    this.focus.u = focus.u
    this.focus.v = focus.v
  }
  private hub(index: number, target: THREE.Vector3) {
    this.hooks.wheelHub(index, target)
    if (this.site) this.site.worldToLocal(target)
    return target
  }
  private carryPoint(member: CrewMember, target: THREE.Vector3) {
    const facing = member.facing
    const bob = Math.sin(this.clock * 7.5) * 0.012 * Math.min(1, member.speed)
    return target.set(
      member.root.position.x + Math.sin(facing) * carryLayout.ahead,
      carryLayout.floor + carryLayout.height + bob,
      member.root.position.z + Math.cos(facing) * carryLayout.ahead,
    )
  }
  private hands(member: CrewMember, centre: THREE.Vector3, radius: number) {
    const facing = member.facing
    const sx = Math.cos(facing)
    const sz = -Math.sin(facing)
    const wide = radius * 0.94
    this.other.set(centre.x + sx * wide, centre.y, centre.z + sz * wide)
    this.third.set(centre.x - sx * wide, centre.y, centre.z - sz * wide)
    member.grip(this.other, this.third)
  }
  private wheelSteps(index: number, wheel: number, style: WheelStyle, finish: RimFinish): Step[] {
    const member = this.crew[index] as CrewMember
    const side = this.memberSide(index)
    const plan = this.plan
    const size = this.hooks.wheelSize(wheel)
    const place = this.wheelPlaces[wheel] as WheelPlace
    const hub = new THREE.Vector3()
    const out = new THREE.Vector3(0, 0, -side)
    const from = new THREE.Vector3()
    const to = new THREE.Vector3()
    const nut = new THREE.Vector3()
    const tray = new THREE.Vector3()
    const rest = this.hub(wheel, new THREE.Vector3())
    const measured: BayWheel = { u: -rest.z, v: this.side * rest.x, ...size }
    const stand = wheelSpot(side, measured)
    const faceWheel = this.facingTo(-side, 0)
    const onHub = this.bayYaw - (this.site?.rotation.y ?? 0)
    const axleOut = Math.sign(Math.cos(onHub) * out.x - Math.sin(onHub) * out.z) || 1
    const nutYaw = Math.atan2(-out.z, out.x)
    const stage = plan.stage(side, measured.v)
    const freshSpot = plan.fresh(side, measured.v)
    const spentSpot = plan.spent(side, measured.v)
    const faceSpent = this.facingTo(spentSpot.u - stage.u, spentSpot.v - stage.v)
    const faceFresh = this.facingTo(freshSpot.u - stage.u, freshSpot.v - stage.v)
    const freshAt = this.place(
      freshSpot.u,
      freshSpot.v,
      carryLayout.floor + size.radius,
      new THREE.Vector3(),
    )
    const freshYaw = carryYaw(faceFresh, axleOut)
    let fromYaw = 0
    const nutAt = (order: number, depth: number, target: THREE.Vector3) => {
      const angle = (order / nutLayout.perWheel) * Math.PI * 2 + 0.3
      const across = Math.sin(angle) * nutLayout.ring
      return target
        .copy(hub)
        .addScaledVector(out, size.width * 0.3 + depth)
        .setY(hub.y + Math.cos(angle) * nutLayout.ring)
        .add(this.aim.set(out.z * across, 0, -out.x * across))
    }
    const steps: Step[] = [
      this.walkStep(
        index,
        () => stand,
        () => faceWheel,
      ),
      {
        time: 0.3,
        begin: () => {
          member.hold('wrench')
          this.hub(wheel, hub)
          tray.set(
            member.root.position.x + Math.cos(faceWheel) * -0.42,
            carryLayout.floor + 0.02,
            member.root.position.z - Math.sin(faceWheel) * -0.42,
          )
          this.props.tray(index, tray.x, tray.y, tray.z, faceWheel)
          for (let order = 0; order < nutLayout.perWheel; order++)
            this.props.nut(this.props.slot(wheel, order), nutAt(order, 0, nut), nutYaw)
          member.look(hub)
          if (index === 0) this.aimAt(measured)
        },
        run: () => member.work(nutAt(0, 0.03, nut)),
      },
    ]
    for (let order = 0; order < nutLayout.perWheel; order++)
      steps.push({
        time: garageTiming.loosen,
        begin: () => {
          if (order % 3 === 0) this.hooks.ratchet()
          member.spin = 46
          member.effort = 0.7
        },
        run: (t) => {
          const back = 0.05 * ease(t)
          member.work(nutAt(order, 0.03 + back, nut))
          this.props.nut(this.props.slot(wheel, order), nutAt(order, back, nut), nutYaw, t * 16)
        },
        end: () => {
          from.copy(nutAt(order, 0.05, nut))
          to.copy(tray)
          to.x += ((order % 3) - 1) * 0.07
          to.z += ((order % 2) - 0.5) * 0.06
          to.y += 0.03
          this.props.drop(this.props.slot(wheel, order), from, to)
        },
      })
    steps.push(
      {
        time: 0.4,
        begin: () => {
          member.work(null)
          member.spin = 0
          member.effort = 0
          member.hold('none')
        },
        run: () => this.hands(member, hub, size.radius),
      },
      {
        time: 0.6,
        begin: () => {
          place.held = true
          place.yaw = onHub
          place.tilt = 0
          member.lean = 0.12
          this.props.hub(wheel, to.copy(hub).addScaledVector(out, -size.width * 0.12), nutYaw)
        },
        run: (t) => {
          place.position.copy(hub).addScaledVector(out, carryLayout.pull * easeBack(t))
          place.position.y -= Math.sin(t * Math.PI) * 0.012 + 0.03 * ease(t)
          this.hands(member, place.position, size.radius)
        },
      },
      {
        time: 0.5,
        begin: () => from.copy(place.position),
        run: (t) => {
          place.position.lerpVectors(from, this.carryPoint(member, to), ease(t))
          place.yaw = turnToward(onHub, carryYaw(member.facing, axleOut), ease(t))
          this.hands(member, place.position, size.radius)
          member.lean = 0.12 * (1 - t)
        },
      },
      {
        time: 0,
        begin: () => {
          member.look(null)
          this.send(index, stage, faceSpent)
        },
        run: () => {
          this.carryPoint(member, place.position)
          place.yaw = carryYaw(member.facing, axleOut)
          this.hands(member, place.position, size.radius)
        },
        until: () => !member.walking,
      },
      {
        time: 1,
        begin: () => {
          from.copy(place.position)
          fromYaw = place.yaw
          this.place(spentSpot.u, spentSpot.v, carryLayout.floor + size.width * 0.5, to)
        },
        run: (t) => {
          const lower = ease(span(t, 0.1, 0.8))
          place.position.lerpVectors(from, to, lower)
          place.position.y += Math.sin(lower * Math.PI) * 0.06
          place.tilt = axleOut * (Math.PI / 2) * ease(span(t, 0, 0.6))
          place.yaw = fromYaw
          member.crouch = 0.92 * Math.sin(ease(span(t, 0, 0.8)) * Math.PI * 0.5)
          member.lean = 0.35 * lower
          this.hands(member, place.position, size.radius)
        },
        end: () => {
          const props = this.wheelProps[wheel]
          if (props) {
            props.spent.position.copy(to)
            props.spent.rotation.set(0, fromYaw, axleOut * (Math.PI / 2), 'YXZ')
            props.spent.visible = true
            props.fresh.visible = false
          }
          this.hooks.wheelSwap(wheel, style, finish)
          place.position.copy(freshAt)
          place.yaw = freshYaw
          place.tilt = 0
          member.grip(null, null)
        },
      },
      {
        time: 0.45,
        run: (t) => {
          member.crouch = 0.9 * (1 - ease(t))
          member.lean = 0.35 * (1 - ease(t))
        },
        end: () => {
          member.crouch = 0
          member.lean = 0
        },
      },
      {
        time: 0,
        begin: () => member.face(faceFresh),
        until: () => !member.walking,
      },
      {
        time: 0.5,
        run: (t) => {
          member.crouch = 0.45 * ease(t)
          member.lean = 0.3 * ease(t)
          this.hands(member, freshAt, size.radius)
        },
      },
      {
        time: 0.6,
        run: (t) => {
          place.position.lerpVectors(freshAt, this.carryPoint(member, to), ease(t))
          place.position.y += Math.sin(t * Math.PI) * 0.04
          member.crouch = 0.45 * (1 - ease(t))
          member.lean = 0.3 * (1 - ease(t))
          this.hands(member, place.position, size.radius)
        },
        end: () => {
          member.crouch = 0
          member.lean = 0
        },
      },
      {
        time: 0,
        begin: () => this.send(index, stand, faceWheel),
        run: () => {
          this.carryPoint(member, place.position)
          place.yaw = carryYaw(member.facing, axleOut)
          this.hands(member, place.position, size.radius)
        },
        until: () => !member.walking,
      },
      {
        time: 0.7,
        begin: () => {
          this.hub(wheel, hub)
          from.copy(place.position)
          fromYaw = place.yaw
          member.look(hub)
        },
        run: (t) => {
          to.copy(hub).addScaledVector(out, carryLayout.pull)
          place.position.lerpVectors(from, to, ease(t))
          place.yaw = turnToward(fromYaw, onHub, ease(t))
          this.hands(member, place.position, size.radius)
        },
      },
      {
        time: 0.5,
        run: (t) => {
          place.position.copy(hub).addScaledVector(out, carryLayout.pull * (1 - easeOut(t)))
          place.yaw = onHub
          this.hands(member, place.position, size.radius)
        },
        end: () => {
          place.held = false
          this.props.hub(wheel, null)
        },
      },
      {
        time: 0.7,
        begin: () => {
          to.copy(hub).addScaledVector(out, size.width * 0.5 + 0.03)
          to.y += 0.1
          member.grip(to, null)
        },
        run: (t) => {
          for (let order = 0; order < nutLayout.perWheel; order++)
            if (t * nutLayout.perWheel >= order + 0.5)
              this.props.nut(this.props.slot(wheel, order), nutAt(order, 0.03, nut), nutYaw)
          member.work(nutAt(Math.min(4, Math.floor(t * 5)), 0.02, nut))
        },
        end: () => {
          member.work(null)
          member.hold('wrench')
        },
      },
    )
    for (let order = 0; order < nutLayout.perWheel; order++)
      steps.push({
        time: garageTiming.tighten,
        begin: () => {
          if (order % 3 === 0) this.hooks.ratchet()
          member.spin = -46
          member.effort = 0.6
        },
        run: (t) => {
          const back = 0.03 * (1 - ease(t))
          member.work(nutAt(order, 0.03 + back, nut))
          this.props.nut(this.props.slot(wheel, order), nutAt(order, back, nut), nutYaw, -t * 14)
        },
      })
    for (const order of starOrder)
      steps.push({
        time: garageTiming.torque,
        begin: () => {
          member.spin = -9
          member.effort = 1
        },
        run: (t) => {
          member.work(nutAt(order, 0.03, nut))
          member.effort = t < 0.6 ? 1 : 0.2
        },
      })
    steps.push({
      time: 0.3,
      begin: () => {
        member.work(null)
        member.grip(null, null)
        member.spin = 0
        member.effort = 0
        member.look(null)
        for (let order = 0; order < nutLayout.perWheel; order++)
          this.props.nut(this.props.slot(wheel, order), null)
      },
    })
    return steps
  }
  private wheelStages(style: WheelStyle, finish: RimFinish): Stage[] {
    const count = this.hooks.wheelCount()
    this.clearWheelProps()
    if (!this.car.lifts) return []
    const lists: number[][] = [[], []]
    const spot = new THREE.Vector3()
    const places: Spot[] = []
    for (let wheel = 0; wheel < count; wheel++) {
      this.hub(wheel, spot)
      const at = { u: -spot.z, v: this.side * spot.x }
      places.push(at)
      lists[at.u >= bay.u ? 0 : 1]?.push(wheel)
    }
    for (const list of lists) list.sort((one, two) => (places[two]?.v ?? 0) - (places[one]?.v ?? 0))
    for (let wheel = 0; wheel < count; wheel++) {
      const fresh = this.hooks.wheelProp(wheel, style, finish)
      const spent = this.hooks.wheelProp(wheel, null, finish)
      const index = lists[0]?.includes(wheel) ? 0 : 1
      const side = this.memberSide(index)
      const at = this.plan.fresh(side, places[wheel]?.v ?? this.centre)
      const stage = this.plan.stage(side, places[wheel]?.v ?? this.centre)
      const size = this.hooks.wheelSize(wheel)
      const hubAt = this.hub(wheel, spot)
      const onHub = this.bayYaw - (this.site?.rotation.y ?? 0)
      const axleOut = Math.sign(-Math.sin(onHub) * -side) || 1
      const faceFresh = this.facingTo(at.u - stage.u, at.v - stage.v)
      this.place(at.u, at.v, carryLayout.floor + size.radius, fresh.position)
      fresh.rotation.set(0, carryYaw(faceFresh, axleOut), 0, 'YXZ')
      spent.visible = false
      spent.position.copy(hubAt)
      this.site?.add(fresh, spent)
      this.wheelProps.push({ fresh, spent })
    }
    const first = lists[0]?.[0]
    const tracks = [0, 1].map((index) => {
      const steps: Step[] = []
      for (const wheel of lists[index] ?? [])
        steps.push(...this.wheelSteps(index, wheel, style, finish))
      steps.push(
        this.walkStep(
          index,
          () => ({ u: this.plan.lane(this.memberSide(index)), v: this.centre + 1.6 }),
          () => this.faceCar(index),
        ),
      )
      return new Track(steps)
    })
    const ready = [0, 1].map(
      (index) =>
        new Track([
          {
            time: 0.4,
            begin: () => this.crew[index]?.hold('wrench'),
          },
          this.walkStep(
            index,
            () => ({ u: this.plan.lane(this.memberSide(index)), v: this.centre + 1.6 }),
            () => this.faceCar(index),
          ),
        ]),
    )
    return [
      {
        label: 'Raising the lift',
        tracks: [new Track([this.view('lift'), ...this.liftSteps(true)]), ...ready],
      },
      {
        label: 'Fitting new wheels',
        tracks: [
          new Track([this.view('wheels', first === undefined ? undefined : places[first])]),
          ...tracks,
        ],
      },
      {
        label: 'Lowering the lift',
        tracks: [
          new Track([
            this.view('lift'),
            ...this.liftSteps(false),
            { time: 0.5, begin: () => this.homeCrew(false) },
          ]),
        ],
      },
    ]
  }
  private sweepStages(
    tool: 'spray' | 'lance',
    label: string,
    pace: number,
    emit: (member: CrewMember, target: THREE.Vector3, dt: number, index: number) => void,
    mark: (along: number) => void,
    forward = true,
  ): Stage[] {
    const plan = this.plan
    const head = Math.min(plan.car.v1 - 0.25, plan.nose)
    const foot = plan.car.v0 + 0.25
    const begin = forward ? head : foot
    const end = forward ? foot : head
    const length = plan.car.v1 - plan.car.v0
    const high = Math.min(1.45, this.car.height * 0.92)
    const tracks = (walking: boolean) =>
      [0, 1].map((index) => {
        const member = this.crew[index] as CrewMember
        const side = this.memberSide(index)
        const lane = plan.lane(side)
        const direction = Math.sign(end - begin) || -1
        const facing = this.facingTo(0, direction)
        if (!walking)
          return new Track([
            { time: 0.3, begin: () => member.hold(tool) },
            this.walkStep(
              index,
              () => ({ u: lane, v: begin }),
              () => facing,
            ),
          ])
        const target = new THREE.Vector3()
        const where: Spot = { u: 0, v: 0 }
        return new Track([
          {
            time: 0,
            begin: () => {
              member.pace = pace
              this.send(index, { u: lane, v: end }, facing)
            },
            run: (_t, dt) => {
              this.spotOf(member.root.position, where)
              const v = where.v + direction * 0.18
              const wave = 0.5 + 0.5 * Math.sin(this.clock * 4.6 + index * 1.3)
              this.place(
                bay.u + side * this.car.halfWidth * 0.9,
                v,
                carryLayout.floor + 0.3 + (high - 0.3) * wave + this.lift,
                target,
              )
              member.work(target)
              member.look(target)
              emit(member, target, dt, index)
              if (index === 0) this.aimAt(where)
              if (index === 0) mark(clamp((plan.car.v1 - v) / length + 0.07, 0, 1))
            },
            until: () => !member.walking,
            end: () => {
              member.pace = 0
              member.work(null)
              member.look(null)
              if (index === 0) mark(1)
            },
          },
        ])
      })
    return [
      { label: 'Getting ready', tracks: tracks(false) },
      { label, tracks: tracks(true) },
    ]
  }
  private paintStages(color: string): Stage[] {
    const first = this.sweepStages(
      'spray',
      'Spraying the new colour',
      garageTiming.coat,
      (member, target, dt) => {
        member.toolTip(this.tip)
        this.site?.localToWorld(this.aim.copy(target))
        this.mist.emit(this.tip, this.aim, 150, dt, 0.5, 0.5)
        this.hooks.hiss(0.42, 3200)
      },
      (along) => this.hooks.paintSweep(color, along),
    )
    const setup = first[0] as Stage
    setup.tracks.push(
      new Track([
        this.view('paint'),
        {
          time: 0,
          begin: () => {
            this.mist.style(color, 0.2, 0.34)
            this.hooks.sheen(1)
          },
        },
      ]),
    )
    return [
      ...first,
      {
        label: 'Letting it dry',
        tracks: [
          new Track([
            {
              time: garageTiming.dry,
              begin: () => {
                this.hooks.hiss(0, 1000)
                this.hooks.sheen(1)
                this.shot = 'ready'
                this.homeCrew(false)
              },
            },
          ]),
        ],
      },
    ]
  }
  private washStages(): Stage[] {
    const plan = this.plan
    let foam = 0
    let rinse = 0
    const foaming = this.sweepStages(
      'lance',
      'Covering it in foam',
      garageTiming.sweep,
      (member, target, dt) => {
        member.toolTip(this.tip)
        this.site?.localToWorld(this.aim.copy(target))
        this.mist.emit(this.tip, this.aim, 190, dt, 0.42, 0.5)
        this.hooks.hiss(0.5, 900)
      },
      (along) => {
        foam = Math.max(foam, along)
        this.hooks.wash(1, foam, 0)
      },
    )
    const setup = foaming[0] as Stage
    setup.tracks.push(
      new Track([
        this.view('wash'),
        {
          time: 0,
          begin: () => {
            this.mist.style('#f6f8fa', 0.19, 0.62)
            this.water.style('#d6e8f4', 0.075, 0.5)
          },
        },
      ]),
    )
    const scrub = [0, 1].map((index) => {
      const member = this.crew[index] as CrewMember
      const side = this.memberSide(index)
      const reach = this.car.halfWidth + 0.56
      const target = new THREE.Vector3()
      const steps: Step[] = [
        {
          time: 0.3,
          begin: () => {
            this.hooks.hiss(0, 1000)
            member.hold('sponge')
          },
        },
      ]
      for (const along of [-1.05, 1.05]) {
        const v = clamp(bay.v + along, plan.car.v0 + 0.4, plan.nose)
        steps.push(
          this.walkStep(
            index,
            () => ({ u: bay.u + side * reach, v }),
            () => this.faceCar(index),
          ),
          {
            time: garageTiming.scrub,
            run: (t) => {
              const round = t * Math.PI * 5
              this.place(
                bay.u + side * (this.car.halfWidth - 0.04),
                v + Math.sin(round) * 0.3,
                carryLayout.floor + 0.78 + Math.cos(round) * 0.2 + Math.sin(t * Math.PI) * 0.12,
                target,
              )
              member.work(target)
              member.look(target)
              member.lean = 0.18
              if (index === 0) this.aimAt(this.spotOf(member.root.position, this.spot))
            },
            end: () => {
              member.work(null)
              member.look(null)
              member.lean = 0
            },
          },
        )
      }
      return new Track(steps)
    })
    const drip = new THREE.Vector3()
    const fall = new THREE.Vector3()
    const drips = (dt: number, upTo: number, rate: number) => {
      if (upTo <= 0.02) return
      const length = plan.car.v1 - plan.car.v0
      for (const side of [-1, 1]) {
        const along = Math.random() * upTo
        this.toWorld(
          bay.u + side * this.car.halfWidth * (0.82 + Math.random() * 0.16),
          plan.car.v1 - along * length,
          carryLayout.floor + 0.18 + Math.random() * 0.25,
          drip,
        )
        fall.copy(drip)
        fall.y -= 1
        this.water.emit(drip, fall, rate, dt, 0.12, 0.5, 0.4)
      }
    }
    const rinsing = this.sweepStages(
      'lance',
      'Rinsing it off',
      garageTiming.sweep,
      (member, target, dt, index) => {
        member.toolTip(this.tip)
        this.site?.localToWorld(this.aim.copy(target))
        this.water.emit(this.tip, this.aim, 230, dt, 0.16, 0.24)
        this.mist.emit(this.aim, this.tip, 40, dt, 1.4, 0.4, 1.1)
        this.hooks.hiss(0.85, 2400)
        if (index === 0) drips(dt, rinse, 26)
      },
      (along) => {
        rinse = Math.max(rinse, along)
        this.hooks.wash(1, 1, rinse)
      },
    )
    const tools = rinsing[0] as Stage
    tools.label = 'Fetching the rinse'
    tools.tracks.push(new Track([{ time: 0, begin: () => this.mist.style('#eef4f8', 0.16, 0.3) }]))
    return [
      ...foaming,
      { label: 'Scrubbing', tracks: scrub },
      ...rinsing,
      {
        label: 'Drying off',
        tracks: [
          new Track([
            {
              time: garageTiming.dry,
              begin: () => {
                this.hooks.hiss(0, 1000)
                this.shot = 'ready'
                this.homeCrew(false)
              },
              run: (t, dt) => drips(dt, 1, 22 * (1 - t)),
            },
          ]),
        ],
      },
    ]
  }
  private exhaustStages(exhaust: Exhaust): Stage[] {
    const plan = this.plan
    const member = this.crew[0] as CrewMember
    const target = new THREE.Vector3()
    const under: Spot = { u: bay.u + 0.32, v: plan.tail + 0.12 }
    const facing = this.facingTo(bay.u - under.u, plan.car.v0 - under.v)
    const fit: Step[] = [
      { time: 0.3, begin: () => member.hold('wrench') },
      this.walkStep(
        0,
        () => under,
        () => facing,
      ),
    ]
    for (let burst = 0; burst < 3; burst++)
      fit.push(
        {
          time: 0.95,
          begin: () => {
            this.hooks.ratchet()
            member.spin = 40
            member.effort = 0.8
          },
          run: () => {
            this.place(
              bay.u + (burst - 1) * 0.22,
              plan.car.v0 + 0.22,
              carryLayout.floor + this.lift + Math.max(0.12, this.car.clearance + 0.1),
              target,
            )
            member.work(target)
            member.look(target)
            member.lean = 0.1
          },
        },
        {
          time: 0.4,
          begin: () => {
            member.spin = 0
            member.effort = 0
          },
        },
      )
    fit.push(
      {
        time: 0.2,
        begin: () => {
          member.work(null)
          member.look(null)
          member.lean = 0
          this.hooks.exhaustFitted(exhaust)
        },
      },
      this.walkStep(
        0,
        () => ({ u: plan.lane(1), v: plan.tail }),
        () => this.facingTo(-1, 0.6),
      ),
    )
    const blips: Step[] = []
    for (const strength of [0.75, 0.75, 1])
      blips.push({ time: garageTiming.blip, begin: () => this.hooks.blip(strength) })
    const watch = new Track([
      this.walkStep(
        1,
        () => ({ u: plan.lane(-1), v: plan.tail + 0.4 }),
        () => this.facingTo(1, 0.5),
      ),
    ])
    const fitting: Stage = {
      label: 'Fitting the exhaust',
      tracks: [new Track([this.view('exhaust'), ...fit])],
    }
    const testing: Stage = {
      label: 'Testing the exhaust',
      tracks: [new Track([this.view('exhaust'), { time: 0.4 }, ...blips])],
    }
    if (!this.car.lifts) {
      fitting.tracks.push(watch)
      return [fitting, testing]
    }
    return [
      {
        label: 'Raising the lift',
        tracks: [new Track([this.view('lift'), ...this.liftSteps(true)]), watch],
      },
      fitting,
      {
        label: 'Lowering the lift',
        tracks: [new Track([this.view('lift'), ...this.liftSteps(false)])],
      },
      testing,
    ]
  }
  private frameCamera(dt: number) {
    const moving = this.phase === 'entering' || this.phase === 'leaving'
    const site = this.site
    const calm = this.hooks.calm()
    let outside = false
    if (moving && site) {
      const car = site.worldToLocal(this.point.set(this.pose.x, this.pose.y, this.pose.z))
      const v = this.side * car.x
      outside = this.phase === 'entering' ? v + this.car.front < front - 0.9 : v < front - 0.4
      this.focus.u = -car.z
      this.focus.v = v
    }
    if (outside !== this.outside) {
      this.outside = outside
      this.snapped = false
    }
    if (outside) {
      const eye = outsideShot(this.startSpot)
      this.toWorld(eye.u, eye.v, eye.y, this.cameraGoal)
      this.lookGoal.set(this.pose.x, this.pose.y + 0.75, this.pose.z)
    } else {
      const drift = calm ? 0 : Math.sin(this.clock * 0.22) * 0.55
      const shot = moving ? 'arrive' : this.shot
      const framed = insideShot(shot, this.car, this.focus, this.lift, drift)
      this.toWorld(framed.eye.u, framed.eye.v, framed.eye.y, this.cameraGoal)
      this.toWorld(framed.look.u, framed.look.v, framed.look.y, this.lookGoal)
    }
    if (!this.snapped) {
      this.camera.copy(this.cameraGoal)
      this.look.copy(this.lookGoal)
      this.snapped = true
      return
    }
    const rate = outside ? 2.2 : calm ? 4 : 1.5
    this.camera.x = damp(this.camera.x, this.cameraGoal.x, rate, dt)
    this.camera.y = damp(this.camera.y, this.cameraGoal.y, rate, dt)
    this.camera.z = damp(this.camera.z, this.cameraGoal.z, rate, dt)
    const turn = moving ? 6 : rate * 1.5
    this.look.x = damp(this.look.x, this.lookGoal.x, turn, dt)
    this.look.y = damp(this.look.y, this.lookGoal.y, turn, dt)
    this.look.z = damp(this.look.z, this.lookGoal.z, turn, dt)
  }
  finish() {
    const working = this.phase === 'working'
    this.phase = 'idle'
    this.job = null
    this.restore()
    this.clearWheelProps()
    if (working) this.hooks.cleared()
    if (this.rig) this.rig.wanted = 0
    this.garage = null
    this.site = null
    this.rig = null
    this.wheelPlaces = []
    this.pitch = this.lean = 0
    this.props.group.removeFromParent()
    for (const member of this.crew) {
      member.root.removeFromParent()
      member.root.visible = false
    }
  }
  dispose() {
    this.finish()
    this.mist.dispose()
    this.water.dispose()
    this.texture?.dispose()
    this.props.dispose()
    for (const member of this.crew) member.dispose()
    this.scene.remove(this.mist.points, this.water.points)
  }
}

import * as THREE from 'three'
import type { DriveAudio } from './audio'
import { engineSoundFor } from './engine-sound'
import { ExhaustCrackle } from './exhaust-crackle'
import { type GarageJob, GarageSession, type GarageStatus } from './garage-session'
import { GarageSites } from './garage-sites'
import { garageLayout, nearestGarage } from './garages'
import {
  accumulate,
  applyGrime,
  GrimeUniforms,
  grimeGain,
  grimeTint,
  keepGrime,
  loadGrime,
} from './grime'
import type { VehicleModel } from './model'
import type { CarPhysics, Input } from './physics'
import { engineProfileFor } from './powertrain'
import type { SupercarModel } from './supercars'
import { vehicleMetrics } from './vehicles'
import { styleWheel, styleWheels } from './wheel-styling'
import type { Settings, Vehicle, World } from './world'

export const tailpipes: Record<SupercarModel, [number, number, number][]> = {
  classic: [
    [-0.22, 0.5, 2.15],
    [-0.07, 0.5, 2.15],
    [0.07, 0.5, 2.15],
    [0.22, 0.5, 2.15],
  ],
  grand: [
    [-0.56, 0.27, 2.16],
    [-0.42, 0.27, 2.16],
    [0.42, 0.27, 2.16],
    [0.56, 0.27, 2.16],
  ],
  longtail: [
    [-0.07, 0.585, 2.76],
    [0.07, 0.585, 2.76],
  ],
  track: [
    [-0.13, 0.45, 2.1],
    [0.13, 0.45, 2.1],
  ],
}

export const garagePrompt = { ahead: garageLayout.approach, behind: 6, speed: 9 } as const

export interface WorkshopState {
  near: boolean
  garage: GarageStatus
  grime: number
}

function flameTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const fade = context.createLinearGradient(0, 0, 0, 128)
    fade.addColorStop(0, 'rgba(120,170,255,0.9)')
    fade.addColorStop(0.18, 'rgba(255,214,140,1)')
    fade.addColorStop(0.55, 'rgba(255,120,40,0.65)')
    fade.addColorStop(1, 'rgba(255,60,10,0)')
    context.fillStyle = fade
    context.beginPath()
    context.moveTo(16, 0)
    context.quadraticCurveTo(32, 30, 18, 128)
    context.lineTo(14, 128)
    context.quadraticCurveTo(0, 30, 16, 0)
    context.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class Workshop {
  grime = new GrimeUniforms()
  levels: Partial<Record<Vehicle, number>> = {}
  crackle = new ExhaustCrackle()
  sites: GarageSites
  session: GarageSession
  near = false
  onCustomize?: (changes: Partial<Settings>) => void
  private flames = new THREE.Group()
  private flameMaterial: THREE.MeshBasicMaterial
  private flameGeometry: THREE.PlaneGeometry
  private flameLife = 0
  private flamePower = 0
  private kept = 0
  private carLength = 4.4
  private blipAt = -1
  private blipStrength = 0
  constructor(
    scene: THREE.Scene,
    private world: World,
    private physics: CarPhysics,
    private audio: DriveAudio,
    private car: () => VehicleModel,
    private settings: () => Settings,
    private storage: Storage | null,
  ) {
    this.levels = loadGrime(storage)
    this.sites = new GarageSites(scene, world)
    this.flameGeometry = new THREE.PlaneGeometry(0.11, 0.42)
    this.flameGeometry.translate(0, 0.21, 0)
    this.flameGeometry.rotateX(Math.PI / 2)
    this.flameMaterial = new THREE.MeshBasicMaterial({
      map: flameTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    })
    this.flames.visible = false
    this.session = new GarageSession(scene, this.sites, {
      wash: (rinse, foam, foamSweep, wet) => {
        this.grime.rinseSweep.value = rinse
        this.grime.foam.value = foam
        this.grime.foamSweep.value = foamSweep
        this.grime.wet.value = Math.max(this.grime.wet.value, wet)
      },
      washed: () => {
        this.setLevel(0)
        this.grime.rinseSweep.value = 0
        this.grime.foam.value = 0
        this.grime.foamSweep.value = 0
        this.grime.wet.value = 1
      },
      paintSweep: (color, sweep) => {
        this.grime.paintNext.value.set(color).multiplyScalar(0.7)
        this.grime.paintSweep.value = sweep
      },
      painted: (color) => {
        this.onCustomize?.({ color })
        this.grime.paintSweep.value = 0
      },
      wheelSwap: (index, style, finish) => styleWheel(this.car(), index, style, finish),
      wheelsFitted: (wheelStyle, rimFinish) => this.onCustomize?.({ wheelStyle, rimFinish }),
      exhaustFitted: (exhaust) => this.onCustomize?.({ exhaust }),
      hiss: (level, band) => this.audio.workshopHiss(level, band),
      ratchet: () => this.audio.ratchet(),
      blip: (strength) => {
        this.blipAt = 0
        this.blipStrength = strength
      },
      wheelOffset: (index, outward) => {
        const spin = this.car().wheels[index]
        const pivot = spin?.parent
        if (!pivot || !spin) return
        const base = (pivot.userData.trackX as number | undefined) ?? pivot.position.x
        pivot.userData.trackX = base
        pivot.position.x = base + Math.sign(base || 1) * outward
        spin.visible = outward < 0.3
      },
      wheelCount: () => this.car().wheels.length,
      wheelHub: (index, target) => {
        const spin = this.car().wheels[index]
        if (!spin) return target.set(0, 0, 0)
        return spin.getWorldPosition(target)
      },
      carLength: () => this.carLength,
    })
  }
  outfit(model: VehicleModel) {
    applyGrime(model.body, this.grime)
  }
  dressed(model: VehicleModel) {
    const settings = this.settings()
    styleWheels(model, settings.vehicle, settings.wheelStyle, settings.rimFinish)
    model.group.updateMatrixWorld(true)
    const inverse = model.group.matrixWorld.clone().invert()
    const bounds = new THREE.Box3()
    const point = new THREE.Vector3()
    const target = model.exterior ?? model.group
    target.traverseVisible((part) => {
      if (!(part instanceof THREE.Mesh)) return
      part.geometry.computeBoundingBox()
      const box = part.geometry.boundingBox
      if (!box) return
      const placement = inverse.clone().multiply(part.matrixWorld)
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z])
            bounds.expandByPoint(point.set(x, y, z).applyMatrix4(placement))
    })
    const metrics = vehicleMetrics[settings.vehicle]
    if (!bounds.isEmpty()) {
      this.grime.span.value.set(
        bounds.min.z,
        bounds.max.z,
        metrics.wheelRadius,
        metrics.wheelbase / 2,
      )
      this.carLength = bounds.max.z - bounds.min.z
    }
    this.flames.removeFromParent()
    for (const flame of [...this.flames.children]) flame.removeFromParent()
    if (settings.vehicle === 'supercar')
      for (const [x, y, z] of tailpipes[settings.supercarModel]) {
        const flame = new THREE.Mesh(this.flameGeometry, this.flameMaterial)
        flame.position.set(x, y, Math.min(z, bounds.isEmpty() ? z : bounds.max.z + 0.02))
        flame.renderOrder = 4
        this.flames.add(flame)
      }
    model.group.add(this.flames)
    this.matchVehicle()
  }
  matchVehicle() {
    this.setLevel(this.levels[this.settings().vehicle] ?? 0, false)
    this.grime.tint.value.set(grimeTint(this.settings()))
  }
  restyle() {
    const settings = this.settings()
    styleWheels(this.car(), settings.vehicle, settings.wheelStyle, settings.rimFinish)
  }
  private setLevel(level: number, keep = true) {
    const vehicle = this.settings().vehicle
    this.levels[vehicle] = level
    this.grime.level.value = level
    if (keep) keepGrime(this.storage, this.levels)
  }
  refresh() {
    this.session.finish()
    this.sites.refresh()
  }
  get grimeLevel() {
    return this.grime.level.value
  }
  canEnter() {
    const physics = this.physics
    if (this.session.active || Math.abs(physics.speed) > garagePrompt.speed) return null
    const found = nearestGarage(this.world, physics.x, physics.s)
    if (!found) return null
    if (found.along > garagePrompt.ahead || found.along < -garagePrompt.behind) return null
    if (found.across < -garageLayout.roadEdge || found.across > garageLayout.front - 1) return null
    return found.garage
  }
  enter() {
    const garage = this.canEnter()
    if (!garage) return false
    const physics = this.physics
    const group = this.car().group
    const entered = this.session.enter(garage, {
      x: group.position.x,
      y: group.position.y,
      z: group.position.z,
      yaw: physics.yaw,
    })
    if (entered) {
      physics.speed = 0
      this.crackle.reset()
    }
    return entered
  }
  choose(job: GarageJob) {
    return this.session.choose(job)
  }
  leave() {
    return this.session.leave()
  }
  drive(dt: number, input: Input, moving: boolean) {
    const settings = this.settings()
    const physics = this.physics
    if (moving) {
      const metres = Math.abs(physics.speed) * dt
      const gain = grimeGain({
        metres,
        offroad: physics.offroad,
        wading: physics.wading > 0,
        weather: settings.weather,
        season: settings.season,
      })
      if (gain > 0) {
        const level = accumulate(this.grime.level.value, gain)
        this.grime.level.value = level
        this.levels[settings.vehicle] = level
        const tint = new THREE.Color(grimeTint(settings))
        this.grime.tint.value.lerp(tint, Math.min(1, gain * 30))
      }
      this.kept += dt
      if (this.kept > 6) {
        this.kept = 0
        keepGrime(this.storage, this.levels)
      }
    }
    this.grime.wet.value = Math.max(0, this.grime.wet.value - dt / 25)
    const sound = engineSoundFor(settings)
    const profile = engineProfileFor(settings)
    const box = physics.gearbox
    let throttle = input.throttle
    let revs = (box.rpm - profile.idle) / Math.max(1, profile.redline - profile.idle)
    let load = box.load
    if (this.blipAt >= 0) {
      this.blipAt += dt
      const rise = Math.min(1, this.blipAt / 0.16)
      const fall = Math.max(0, 1 - (this.blipAt - 0.22) / 0.7)
      const shape = this.blipAt < 0.22 ? rise : fall
      box.rpm = profile.idle + (profile.redline - profile.idle) * 0.78 * this.blipStrength * shape
      box.load = this.blipAt < 0.22 ? 1 : 0
      throttle = this.blipAt < 0.22 ? 1 : 0
      revs = (box.rpm - profile.idle) / Math.max(1, profile.redline - profile.idle)
      load = box.load
      if (this.blipAt > 1.1) {
        this.blipAt = -1
        box.rpm = profile.idle
        box.load = 0
      }
    }
    const strength =
      moving || this.blipAt >= 0
        ? this.crackle.step(dt, {
            revs,
            throttle,
            load,
            shifts: box.shifts,
            pops: sound.pops,
            sport: settings.exhaust === 'sport',
          })
        : 0
    if (strength > 0) {
      this.audio.backfire(strength)
      if (strength > 0.45 && this.flames.children.length) {
        this.flameLife = 0.035 + strength * 0.04
        this.flamePower = strength
      }
    }
    this.flameLife -= dt
    const lit = this.flameLife > 0
    this.flames.visible = lit
    if (lit) {
      this.flameMaterial.opacity = Math.min(1, this.flamePower * 1.2)
      for (const flame of this.flames.children)
        flame.scale.set(
          0.8 + Math.random() * 0.4,
          1,
          0.5 + this.flamePower * (0.6 + Math.random() * 0.5),
        )
    }
    return { throttle }
  }
  update(
    dt: number,
    s: number,
    dark: number,
    car: VehicleModel,
    settle: (x: number, y: number, z: number, yaw: number) => void,
  ) {
    this.sites.update(s, dark)
    const session = this.session
    this.near = !session.active && this.canEnter() !== null
    if (!session.active) return false
    this.pose(car)
    session.update(dt, (pose) => settle(pose.x, pose.y, pose.z, pose.yaw))
    if (!session.active) {
      this.restoreWheels(car)
      return false
    }
    this.pose(car)
    for (const spin of car.wheels)
      spin.rotation.x =
        -session.roll / Math.max(0.2, vehicleMetrics[this.settings().vehicle].wheelRadius)
    for (const [index, spin] of car.wheels.entries()) {
      const pivot = spin.parent
      if (!pivot) continue
      pivot.rotation.y = index >= 2 ? session.steer : 0
      if (session.lift > 0.01)
        pivot.position.y = vehicleMetrics[this.settings().vehicle].wheelRadius - 0.04
    }
    car.group.updateMatrixWorld(true)
    return true
  }
  private pose(car: VehicleModel) {
    const { pose, lift } = this.session
    car.group.position.set(pose.x, pose.y + lift, pose.z)
    car.group.rotation.set(0, pose.yaw, 0, 'YXZ')
    car.group.updateMatrixWorld(true)
  }
  restoreWheels(car: VehicleModel) {
    for (const spin of car.wheels) {
      spin.visible = true
      const pivot = spin.parent
      const base = pivot?.userData.trackX as number | undefined
      if (pivot && base !== undefined) pivot.position.x = base
    }
  }
  frame(car: VehicleModel) {
    this.grime.frame.value.copy(car.group.matrixWorld).invert()
  }
  state(): WorkshopState {
    return { near: this.near, garage: this.session.status(), grime: this.grime.level.value }
  }
  keep() {
    keepGrime(this.storage, this.levels)
  }
  dispose() {
    this.keep()
    this.session.dispose()
    this.sites.dispose()
    this.flames.removeFromParent()
    this.flameGeometry.dispose()
    this.flameMaterial.map?.dispose()
    this.flameMaterial.dispose()
  }
}

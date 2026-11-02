import * as THREE from 'three'
import { vehicleMetrics } from './vehicles'
import { angleDifference, type CameraMode, clamp, damp, type World } from './world'

interface CameraSubject {
  x: number
  y: number
  s: number
  yaw: number
  speed: number
}

export class DrivingCamera {
  yaw = 0
  pitch = 0
  zoom = 1
  private heading = 0
  private ready = false
  private mode: CameraMode = 'cinematic'
  private anchor = new THREE.Vector3()
  private position = new THREE.Vector3()
  private target = new THREE.Vector3()
  private forward = new THREE.Vector3()
  private side = new THREE.Vector3()
  private drag: { id: number; x: number; y: number; mode: CameraMode } | null = null

  constructor(public camera: THREE.PerspectiveCamera) {}

  snap() {
    this.ready = false
  }

  center() {
    this.yaw = 0
    this.pitch = 0
    this.zoom = 1
    this.cancelDrag()
  }

  beginDrag(id: number, x: number, y: number, mode: CameraMode) {
    if (mode === 'cinematic' || this.drag || !Number.isFinite(x + y)) return false
    this.drag = { id, x, y, mode }
    return true
  }

  moveDrag(id: number, x: number, y: number, width: number, height: number) {
    const drag = this.drag
    if (!drag || drag.id !== id || !Number.isFinite(x + y) || width <= 0 || height <= 0)
      return false
    this.yaw -= ((x - drag.x) / width) * Math.PI * 2
    this.pitch -= ((y - drag.y) / height) * Math.PI
    this.yaw = drag.mode === 'bonnet' ? clamp(this.yaw, -1.55, 1.55) : angleDifference(this.yaw, 0)
    this.pitch = clamp(
      this.pitch,
      drag.mode === 'bonnet' ? -0.65 : -0.12,
      drag.mode === 'bonnet' ? 0.65 : 1.05,
    )
    this.drag = { ...drag, x, y }
    return true
  }

  endDrag(id: number) {
    if (this.drag?.id !== id) return false
    this.cancelDrag()
    return true
  }

  cancelDrag() {
    this.drag = null
  }

  scroll(delta: number, mode: CameraMode) {
    if (mode !== 'chase' || !Number.isFinite(delta)) return false
    this.zoom = clamp(this.zoom * Math.exp(clamp(delta, -1000, 1000) * 0.001), 0.72, 2.6)
    return true
  }

  update(subject: CameraSubject, world: World, mode: CameraMode, elapsed: number) {
    const dt = clamp(Number.isFinite(elapsed) ? elapsed : 0, 0, 0.1)
    const { camera, position, target, forward, side } = this
    const { vehicle } = world.settings
    const metrics = vehicleMetrics[vehicle]
    const bus = vehicle === 'bus'
    const bike = vehicle === 'motorcycle'
    if (mode !== this.mode) {
      this.yaw = 0
      this.pitch = 0
      this.cancelDrag()
      this.snap()
      this.mode = mode
    }
    if (mode === 'bonnet' && !this.drag) {
      this.yaw = damp(this.yaw, 0, 6, dt)
      this.pitch = damp(this.pitch, 0, 6, dt)
    }
    this.heading +=
      angleDifference(subject.yaw, this.heading) * (this.ready ? 1 - Math.exp(-3 * dt) : 1)
    const heading = mode === 'bonnet' ? subject.yaw : this.heading
    forward.set(-Math.sin(heading), 0, -Math.cos(heading))
    side.set(Math.cos(heading), 0, -Math.sin(heading))
    position.set(subject.x, subject.y, -subject.s)
    target.copy(position)
    if (mode === 'bonnet') {
      position.addScaledVector(forward, bus ? 2.15 : bike ? 0.65 : 0.9)
      position.y += bus ? 2.5 : bike ? 1.1 : 1.45
      const pitch = Math.atan2(world.road(subject.s + 25).y - subject.y, 25) + this.pitch - 0.007
      const yaw = heading + this.yaw
      target.set(
        position.x - Math.sin(yaw) * Math.cos(pitch) * 35,
        position.y + Math.sin(pitch) * 35,
        position.z - Math.cos(yaw) * Math.cos(pitch) * 35,
      )
    } else if (mode === 'cinematic') {
      position.addScaledVector(forward, -12).addScaledVector(side, -8)
      position.y += 5.5
      target.addScaledVector(forward, 15)
      target.y += 1
    } else {
      const baseDistance = bus
        ? 9 + 2 * clamp(Math.abs(subject.speed) / 32, 0, 1)
        : bike
          ? 3.5 + clamp(Math.abs(subject.speed) / 50, 0, 1)
          : 4.2 + Math.abs(subject.speed) * 0.01
      const distance = baseDistance * Math.max(1, 0.9 / camera.aspect)
      const height = bus ? 4.7 : bike ? 1.8 : 2
      const pitch = 0.3 - clamp(Math.abs(subject.speed) / metrics.maxSpeed, 0, 1) * 0.1
      const slope = (world.road(subject.s + 20).y - subject.y) / 30
      target.y += bus
        ? 1 + (3.7 * baseDistance) / (baseDistance + 15)
        : Math.max(0.55, height + baseDistance * (slope - Math.tan(pitch)))
      const vertical = subject.y + height - target.y
      const radius = Math.hypot(distance, vertical) * this.zoom
      const elevation = clamp(Math.atan2(vertical, distance) + this.pitch, 0.025, 1.25)
      const yaw = heading + this.yaw
      position.set(
        target.x + Math.sin(yaw) * radius * Math.cos(elevation),
        target.y + radius * Math.sin(elevation),
        target.z + Math.cos(yaw) * radius * Math.cos(elevation),
      )
    }
    if (this.ready) camera.position.addScaledVector(this.anchor, -1)
    this.anchor.set(subject.x, subject.y, -subject.s)
    if (this.ready) camera.position.add(this.anchor)
    camera.position.lerp(position, this.ready ? 1 - Math.exp(-7 * dt) : 1)
    if (mode === 'chase') {
      let lift = 0
      for (let i = 1; i <= 12; i++) {
        const t = i / 12
        const x = target.x + (camera.position.x - target.x) * t
        const z = target.z + (camera.position.z - target.z) * t
        const y = target.y + (camera.position.y - target.y) * t
        lift = Math.max(lift, (world.height(x, -z) + 0.35 - y) / t)
      }
      camera.position.y += lift
    } else
      camera.position.y = Math.max(
        camera.position.y,
        world.height(camera.position.x, -camera.position.z) + 0.35,
      )
    camera.lookAt(target)
    const fraction = clamp(Math.abs(subject.speed) / metrics.maxSpeed, 0, 1)
    const fov = 68 + (mode === 'cinematic' ? 0 : 8 * fraction * fraction * (3 - 2 * fraction))
    camera.fov = damp(camera.fov, fov, 4, dt)
    camera.updateProjectionMatrix()
    this.ready = true
  }
}

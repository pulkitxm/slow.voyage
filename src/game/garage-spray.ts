import * as THREE from 'three'
import { random } from './world'

export const sprayLayout = { life: 0.55, drag: 2.2, gravity: 4.5 } as const

export function sprayTexture() {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const fade = context.createRadialGradient(32, 32, 2, 32, 32, 32)
    fade.addColorStop(0, 'rgba(255,255,255,1)')
    fade.addColorStop(0.45, 'rgba(255,255,255,0.55)')
    fade.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = fade
    context.fillRect(0, 0, 64, 64)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function sprayPace(distance: number, life: number) {
  const { drag } = sprayLayout
  return (distance * drag) / (1 - Math.exp(-drag * life))
}

const direction = new THREE.Vector3()
const hiddenHeight = -9999

export class GarageSpray {
  points: THREE.Points
  live = 0
  private material: THREE.PointsMaterial
  private positions: Float32Array
  private velocities: Float32Array
  private ages: Float32Array
  private lives: Float32Array
  private next = 0
  private owed = 0
  private rng: () => number
  constructor(
    private count: number,
    map: THREE.Texture | null,
    seed = 4411,
  ) {
    this.rng = random(seed)
    this.positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count * 3)
    this.ages = new Float32Array(count).fill(1)
    this.lives = new Float32Array(count).fill(1)
    for (let index = 0; index < count; index++) this.positions[index * 3 + 1] = hiddenHeight
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.material = new THREE.PointsMaterial({
      size: 0.09,
      map,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      color: '#e8f2f8',
    })
    this.points = new THREE.Points(geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
    this.points.visible = false
  }
  style(color: THREE.ColorRepresentation, size: number, opacity: number) {
    this.material.color.set(color)
    this.material.size = size
    this.material.opacity = opacity
  }
  emit(
    from: THREE.Vector3,
    toward: THREE.Vector3,
    rate: number,
    dt: number,
    spread: number,
    life: number = sprayLayout.life,
    speed = 0,
  ) {
    this.owed += rate * dt
    direction.copy(toward).sub(from)
    const distance = direction.length()
    if (distance < 1e-5) return
    direction.multiplyScalar(1 / distance)
    const reach = speed > 0 ? speed : sprayPace(distance, life)
    while (this.owed >= 1) {
      this.owed -= 1
      const index = this.next
      this.next = (this.next + 1) % this.count
      const at = index * 3
      this.ages[index] = 0
      this.lives[index] = life * (0.85 + this.rng() * 0.3)
      const start = this.rng() * 0.06
      const pace = reach * (0.82 + this.rng() * 0.36)
      const vx = (direction.x + (this.rng() - 0.5) * spread) * pace
      const vy = (direction.y + (this.rng() - 0.5) * spread) * pace
      const vz = (direction.z + (this.rng() - 0.5) * spread) * pace
      this.velocities[at] = vx
      this.velocities[at + 1] = vy
      this.velocities[at + 2] = vz
      this.positions[at] = from.x + vx * start * 0.2
      this.positions[at + 1] = from.y + vy * start * 0.2
      this.positions[at + 2] = from.z + vz * start * 0.2
    }
    this.live = Math.max(this.live, life * 1.2)
    this.points.visible = true
  }
  update(dt: number, floor: number) {
    if (this.live <= 0) return
    this.live -= dt
    const { drag, gravity } = sprayLayout
    const slow = Math.exp(-drag * dt)
    const { positions, velocities, ages, lives } = this
    for (let index = 0; index < this.count; index++) {
      const at = index * 3
      if ((positions[at + 1] as number) === hiddenHeight) continue
      const age = (ages[index] as number) + dt
      ages[index] = age
      if (age >= (lives[index] as number)) {
        positions[at + 1] = hiddenHeight
        continue
      }
      velocities[at] = (velocities[at] as number) * slow
      velocities[at + 1] = (velocities[at + 1] as number) * slow - gravity * dt
      velocities[at + 2] = (velocities[at + 2] as number) * slow
      positions[at] = (positions[at] as number) + (velocities[at] as number) * dt
      positions[at + 1] = Math.max(
        floor,
        (positions[at + 1] as number) + (velocities[at + 1] as number) * dt,
      )
      positions[at + 2] = (positions[at + 2] as number) + (velocities[at + 2] as number) * dt
    }
    this.points.geometry.getAttribute('position').needsUpdate = true
    if (this.live <= 0) this.points.visible = false
  }
  get active() {
    return this.live > 0
  }
  clear() {
    this.live = 0
    this.owed = 0
    for (let index = 0; index < this.count; index++) this.positions[index * 3 + 1] = hiddenHeight
    this.points.geometry.getAttribute('position').needsUpdate = true
    this.points.visible = false
  }
  dispose() {
    this.points.removeFromParent()
    this.points.geometry.dispose()
    this.material.dispose()
  }
}

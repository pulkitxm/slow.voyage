import * as THREE from 'three'
import { random } from './world'

export const sprayLayout = { count: 520, life: 0.55, drag: 2.2, gravity: 4.5 } as const

function puff() {
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

export class GarageSpray {
  points: THREE.Points
  private material: THREE.PointsMaterial
  private positions: Float32Array
  private velocities: Float32Array
  private ages: Float32Array
  private next = 0
  private owed = 0
  private rng = random(4411)
  private hidden = new THREE.Vector3(0, -9999, 0)
  constructor() {
    const { count } = sprayLayout
    this.positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count * 3)
    this.ages = new Float32Array(count).fill(sprayLayout.life)
    for (let index = 0; index < count; index++) this.hidden.toArray(this.positions, index * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.material = new THREE.PointsMaterial({
      size: 0.09,
      map: puff(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      color: '#e8f2f8',
    })
    this.points = new THREE.Points(geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
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
    speed: number,
  ) {
    this.owed += rate * dt
    const direction = toward.clone().sub(from).normalize()
    while (this.owed >= 1) {
      this.owed -= 1
      const index = this.next
      this.next = (this.next + 1) % sprayLayout.count
      this.ages[index] = 0
      this.positions[index * 3] = from.x
      this.positions[index * 3 + 1] = from.y
      this.positions[index * 3 + 2] = from.z
      const jitter = () => (this.rng() - 0.5) * spread
      const pace = speed * (0.7 + this.rng() * 0.6)
      this.velocities[index * 3] = (direction.x + jitter()) * pace
      this.velocities[index * 3 + 1] = (direction.y + jitter()) * pace
      this.velocities[index * 3 + 2] = (direction.z + jitter()) * pace
    }
  }
  update(dt: number, floor: number) {
    const { count, life, drag, gravity } = sprayLayout
    const slow = Math.exp(-drag * dt)
    for (let index = 0; index < count; index++) {
      const age = (this.ages[index] as number) + dt
      this.ages[index] = age
      const at = index * 3
      if (age >= life) {
        this.positions[at + 1] = this.hidden.y
        continue
      }
      this.velocities[at] = (this.velocities[at] as number) * slow
      this.velocities[at + 1] = (this.velocities[at + 1] as number) * slow - gravity * dt
      this.velocities[at + 2] = (this.velocities[at + 2] as number) * slow
      this.positions[at] = (this.positions[at] as number) + (this.velocities[at] as number) * dt
      this.positions[at + 1] = Math.max(
        floor,
        (this.positions[at + 1] as number) + (this.velocities[at + 1] as number) * dt,
      )
      this.positions[at + 2] =
        (this.positions[at + 2] as number) + (this.velocities[at + 2] as number) * dt
    }
    this.points.geometry.getAttribute('position').needsUpdate = true
  }
  clear() {
    this.ages.fill(sprayLayout.life)
    for (let index = 0; index < sprayLayout.count; index++)
      this.positions[index * 3 + 1] = this.hidden.y
    this.points.geometry.getAttribute('position').needsUpdate = true
  }
  dispose() {
    this.points.removeFromParent()
    this.points.geometry.dispose()
    this.material.map?.dispose()
    this.material.dispose()
  }
}

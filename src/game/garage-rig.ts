import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { bayRoom, liftGeometry } from './garage-plan'
import { garageLayout } from './garages'

export const rigPalette = {
  slat: '#9aa0a3',
  groove: '#7f8689',
  bar: '#3a3f43',
  carriage: '#d9a21b',
  arm: '#2b2f33',
  pad: '#1d1e1f',
} as const

export const doorLayout = { slats: 16, closed: 0.02, open: 0.965, pace: 0.55 } as const

function tinted(geometry: THREE.BufferGeometry, color: string) {
  const solid = geometry.index ? geometry.toNonIndexed() : geometry
  if (solid !== geometry) geometry.dispose()
  solid.deleteAttribute('uv')
  const tone = new THREE.Color(color)
  const count = solid.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let index = 0; index < count; index++) tone.toArray(colors, index * 3)
  solid.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return solid
}

function merged(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!geometry) throw new Error('Garage rig could not be assembled')
  geometry.computeVertexNormals()
  return geometry
}

export interface BayRig {
  group: THREE.Group
  door: THREE.Mesh
  carriages: THREE.Group[]
  arms: THREE.Group[]
  open: number
  wanted: number
}

export function buildBayRig(side: 1 | -1, material: THREE.Material): BayRig {
  const { door, front, bay } = garageLayout
  const group = new THREE.Group()
  group.name = 'bay-rig'
  const width = door.to - door.from - 0.26
  const slats: THREE.BufferGeometry[] = []
  const each = door.height / doorLayout.slats
  for (let slat = 0; slat < doorLayout.slats; slat++) {
    const last = slat === doorLayout.slats - 1
    const face = new THREE.BoxGeometry(0.05, each * 0.82, width)
    face.translate(0, -(slat + 0.45) * each, 0)
    slats.push(tinted(face, last ? rigPalette.bar : rigPalette.slat))
    const groove = new THREE.BoxGeometry(0.03, each * 0.2, width)
    groove.translate(0, -(slat + 0.95) * each, 0)
    slats.push(tinted(groove, rigPalette.groove))
  }
  const shutter = new THREE.Mesh(merged(slats), material)
  shutter.position.set(side * (front - 0.04), door.height, -(door.from + door.to) / 2)
  shutter.castShadow = true
  shutter.receiveShadow = true
  group.add(shutter)
  const carriages: THREE.Group[] = []
  const arms: THREE.Group[] = []
  const beam = tinted(new THREE.BoxGeometry(liftGeometry.arm, 0.05, 0.09), rigPalette.arm)
  beam.translate(liftGeometry.arm / 2, 0, 0)
  const pad = tinted(new THREE.CylinderGeometry(0.075, 0.075, liftGeometry.pad, 10), rigPalette.pad)
  pad.translate(liftGeometry.arm - 0.04, 0.025 + liftGeometry.pad / 2, 0)
  const armGeometry = merged([beam, pad])
  const blockGeometry = tinted(new THREE.BoxGeometry(0.42, 0.26, 0.4), rigPalette.carriage)
  blockGeometry.translate(0, 0.1, 0)
  for (const offset of [-1, 1]) {
    const carriage = new THREE.Group()
    carriage.position.set(side * bay.v, liftGeometry.rest, -(bay.u + offset * bayRoom.post))
    const block = new THREE.Mesh(blockGeometry, material)
    block.castShadow = true
    carriage.add(block)
    for (const fore of [-1, 1]) {
      const arm = new THREE.Group()
      arm.position.set(0, 0, offset * (bayRoom.post - liftGeometry.pivot))
      arm.userData.offset = offset
      arm.userData.fore = fore * side
      const mesh = new THREE.Mesh(armGeometry, material)
      mesh.castShadow = true
      arm.add(mesh)
      carriage.add(arm)
      arms.push(arm)
    }
    group.add(carriage)
    carriages.push(carriage)
  }
  const rig: BayRig = { group, door: shutter, carriages, arms, open: 0, wanted: 0 }
  setDoor(rig, 0)
  setLift(rig, liftGeometry.rest, 0)
  return rig
}

export function setDoor(rig: BayRig, open: number) {
  rig.open = Math.min(1, Math.max(0, open))
  rig.door.scale.y = 1 - rig.open * (doorLayout.open - doorLayout.closed) - doorLayout.closed
}

export function stepDoor(rig: BayRig, dt: number) {
  if (rig.open === rig.wanted) return
  const step = doorLayout.pace * dt
  const gap = rig.wanted - rig.open
  setDoor(rig, Math.abs(gap) <= step ? rig.wanted : rig.open + Math.sign(gap) * step)
}

export function setLift(rig: BayRig, height: number, swing: number) {
  for (const carriage of rig.carriages) carriage.position.y = height
  const reach = Math.sin(swing)
  const along = Math.cos(swing)
  for (const arm of rig.arms) {
    const offset = arm.userData.offset as number
    const fore = arm.userData.fore as number
    arm.rotation.y = Math.atan2(-reach * offset, along * fore)
  }
}

export function disposeBayRig(rig: BayRig) {
  rig.group.removeFromParent()
  const seen = new Set<THREE.BufferGeometry>()
  rig.group.traverse((part) => {
    if (part instanceof THREE.Mesh) seen.add(part.geometry)
  })
  for (const geometry of seen) geometry.dispose()
}

export const nutLayout = { perWheel: 5, wheels: 4, ring: 0.057, fall: 0.42 } as const

const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
const placing = new THREE.Matrix4()
const spinning = new THREE.Quaternion()
const facingTurn = new THREE.Quaternion()
const spot = new THREE.Vector3()
const unit = new THREE.Vector3(1, 1, 1)
const upward = new THREE.Vector3(0, 1, 0)
const axle = new THREE.Vector3(1, 0, 0)

export class GarageProps {
  group = new THREE.Group()
  nuts: THREE.InstancedMesh
  trays: THREE.Mesh[] = []
  hubs: THREE.Mesh[] = []
  private steel = new THREE.MeshStandardMaterial({
    color: '#c9ced2',
    roughness: 0.28,
    metalness: 0.9,
  })
  private dark = new THREE.MeshStandardMaterial({
    color: '#30353a',
    roughness: 0.7,
    metalness: 0.3,
  })
  private count = nutLayout.perWheel * nutLayout.wheels
  private falling: Float32Array
  constructor() {
    const nut = new THREE.CylinderGeometry(0.017, 0.017, 0.032, 6)
    nut.rotateZ(Math.PI / 2)
    this.nuts = new THREE.InstancedMesh(nut, this.steel, this.count)
    this.nuts.frustumCulled = false
    this.nuts.castShadow = true
    this.falling = new Float32Array(this.count * 8).fill(-1)
    const tray = new THREE.BoxGeometry(0.34, 0.035, 0.22)
    for (let index = 0; index < 2; index++) {
      const mesh = new THREE.Mesh(tray, this.dark)
      mesh.visible = false
      mesh.receiveShadow = true
      this.trays.push(mesh)
      this.group.add(mesh)
    }
    const hub = new THREE.CylinderGeometry(0.15, 0.15, 0.03, 20)
    hub.rotateZ(Math.PI / 2)
    for (let index = 0; index < nutLayout.wheels; index++) {
      const mesh = new THREE.Mesh(hub, this.steel)
      mesh.visible = false
      this.hubs.push(mesh)
      this.group.add(mesh)
    }
    this.group.add(this.nuts)
    this.clear()
  }
  slot(wheel: number, nut: number) {
    return (wheel % nutLayout.wheels) * nutLayout.perWheel + (nut % nutLayout.perWheel)
  }
  nut(slot: number, position: THREE.Vector3 | null, yaw = 0, roll = 0) {
    this.falling[slot * 8] = -1
    if (!position) {
      this.nuts.setMatrixAt(slot, hidden)
    } else {
      facingTurn.setFromAxisAngle(upward, yaw)
      spinning.setFromAxisAngle(axle, roll)
      placing.compose(position, facingTurn.multiply(spinning), unit)
      this.nuts.setMatrixAt(slot, placing)
    }
    this.nuts.instanceMatrix.needsUpdate = true
  }
  drop(slot: number, from: THREE.Vector3, to: THREE.Vector3) {
    const at = slot * 8
    this.falling[at] = 0
    this.falling[at + 1] = from.x
    this.falling[at + 2] = from.y
    this.falling[at + 3] = from.z
    this.falling[at + 4] = to.x
    this.falling[at + 5] = to.y
    this.falling[at + 6] = to.z
    this.falling[at + 7] = slot * 1.7
  }
  tray(index: number, x: number, y: number, z: number, yaw: number) {
    const tray = this.trays[index]
    if (!tray) return
    tray.visible = true
    tray.position.set(x, y, z)
    tray.rotation.y = yaw
  }
  hub(index: number, position: THREE.Vector3 | null, yaw = 0) {
    const hub = this.hubs[index % nutLayout.wheels]
    if (!hub) return
    hub.visible = position !== null
    if (!position) return
    hub.position.copy(position)
    hub.rotation.y = yaw
  }
  update(dt: number) {
    let moved = false
    for (let slot = 0; slot < this.count; slot++) {
      const at = slot * 8
      const age = this.falling[at] as number
      if (age < 0) continue
      const next = Math.min(1, age + dt / nutLayout.fall)
      const flat = next * (2 - next)
      const fx = this.falling[at + 1] as number
      const fy = this.falling[at + 2] as number
      const fz = this.falling[at + 3] as number
      const ty = this.falling[at + 5] as number
      spot.set(
        fx + ((this.falling[at + 4] as number) - fx) * flat,
        fy + (ty - fy) * next * next + Math.sin(next * Math.PI) * 0.05,
        fz + ((this.falling[at + 6] as number) - fz) * flat,
      )
      facingTurn.setFromAxisAngle(upward, (this.falling[at + 7] as number) + next * 5)
      spinning.setFromAxisAngle(axle, next * 9)
      placing.compose(spot, facingTurn.multiply(spinning), unit)
      this.nuts.setMatrixAt(slot, placing)
      this.falling[at] = next >= 1 ? -1 : next
      moved = true
    }
    if (moved) this.nuts.instanceMatrix.needsUpdate = true
  }
  settle() {
    for (let slot = 0; slot < this.count; slot++) {
      const at = slot * 8
      if ((this.falling[at] as number) < 0) continue
      spot.set(
        this.falling[at + 4] as number,
        this.falling[at + 5] as number,
        this.falling[at + 6] as number,
      )
      this.falling[at] = -1
      placing.compose(spot, facingTurn.identity(), unit)
      this.nuts.setMatrixAt(slot, placing)
    }
    this.nuts.instanceMatrix.needsUpdate = true
  }
  clear() {
    this.falling.fill(-1)
    for (let slot = 0; slot < this.count; slot++) this.nuts.setMatrixAt(slot, hidden)
    this.nuts.instanceMatrix.needsUpdate = true
    for (const tray of this.trays) tray.visible = false
    for (const hub of this.hubs) hub.visible = false
  }
  dispose() {
    this.group.removeFromParent()
    this.nuts.geometry.dispose()
    this.nuts.dispose()
    this.trays[0]?.geometry.dispose()
    this.hubs[0]?.geometry.dispose()
    this.steel.dispose()
    this.dark.dispose()
  }
}

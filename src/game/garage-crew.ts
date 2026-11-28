import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import manUrl from '../assets/models/man.glb?url'
import { restClip, standing, stridePace } from './cast'

export type CrewTool = 'none' | 'lance' | 'spray' | 'wrench' | 'sponge'

export const crewLayout = {
  height: 1.78,
  walk: 1.32,
  laden: 1.02,
  gain: 3.4,
  slow: 3,
  turn: 5.2,
  blend: 0.22,
  reach: 0.56,
  drop: 0.46,
  settle: 9,
  near: 0.025,
} as const

export const crewUniforms = [
  { shirt: '#24446a', pants: '#24446a' },
  { shirt: '#c45a23', pants: '#33383c' },
] as const

export const toolReach: Record<CrewTool, number> = {
  none: 0.08,
  lance: 0.86,
  spray: 0.2,
  wrench: 0.25,
  sponge: 0.1,
}

interface Template {
  scene: THREE.Object3D
  clips: THREE.AnimationClip[]
  scale: number
  base: number
  stride: number
}

let template: Promise<Template> | null = null

function load() {
  template ??= new Promise((resolve, reject) => {
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
      manUrl,
      (file) => {
        const { height, base } = standing(file.scene)
        const clips = file.animations.some((clip) => clip.name === 'Idle')
          ? file.animations
          : [...file.animations, restClip(file.scene, 'Idle')]
        const scale = height > 0 ? crewLayout.height / height : 1
        const walk = clips.find((clip) => clip.name === 'Walk')
        const stride = walk ? stridePace(file.scene, walk) * scale : 1.4
        resolve({ scene: file.scene, clips, scale, base, stride: stride || 1.4 })
      },
      undefined,
      reject,
    )
  })
  return template
}

function toolMesh(kind: CrewTool) {
  const group = new THREE.Group()
  if (kind === 'none') return group
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.6, metalness: 0.4 })
  const bright =
    kind === 'spray'
      ? new THREE.MeshStandardMaterial({ color: '#c9ccce', roughness: 0.3, metalness: 0.8 })
      : kind === 'wrench'
        ? new THREE.MeshStandardMaterial({ color: '#d9a21b', roughness: 0.5, metalness: 0.2 })
        : kind === 'sponge'
          ? new THREE.MeshStandardMaterial({ color: '#e7c64a', roughness: 0.95 })
          : new THREE.MeshStandardMaterial({ color: '#c33a2c', roughness: 0.5, metalness: 0.2 })
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    group.add(mesh)
    return mesh
  }
  if (kind === 'lance') {
    add(new THREE.BoxGeometry(0.05, 0.15, 0.07), dark, 0, -0.06, 0)
    add(new THREE.BoxGeometry(0.055, 0.07, 0.2), bright, 0, 0.02, 0.06)
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), dark, 0, 0.02, 0.46).rotation.x =
      Math.PI / 2
    add(new THREE.CylinderGeometry(0.024, 0.016, 0.1, 10), bright, 0, 0.02, 0.8).rotation.x =
      Math.PI / 2
  }
  if (kind === 'spray') {
    add(new THREE.BoxGeometry(0.04, 0.13, 0.05), dark, 0, -0.05, 0)
    add(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10), bright, 0, 0.02, 0.07).rotation.x =
      Math.PI / 2
    add(new THREE.CylinderGeometry(0.05, 0.04, 0.11, 12), bright, 0, 0.12, 0.05)
    add(new THREE.CylinderGeometry(0.03, 0.02, 0.03, 10), dark, 0, 0.02, 0.165).rotation.x =
      Math.PI / 2
  }
  if (kind === 'wrench') {
    add(new THREE.BoxGeometry(0.05, 0.15, 0.06), dark, 0, -0.07, -0.01)
    add(new THREE.BoxGeometry(0.075, 0.085, 0.17), bright, 0, 0.02, 0.03)
    add(new THREE.BoxGeometry(0.07, 0.045, 0.09), dark, 0, -0.16, 0)
    const socket = add(new THREE.CylinderGeometry(0.021, 0.021, 0.12, 6), dark, 0, 0.02, 0.17)
    socket.geometry.rotateX(Math.PI / 2)
    group.userData.socket = socket
  }
  if (kind === 'sponge') add(new THREE.BoxGeometry(0.13, 0.06, 0.19), bright, 0, 0, 0.06)
  return group
}

const up = new THREE.Vector3(0, 1, 0)
const origin = new THREE.Vector3()
const still = new THREE.Quaternion()
const a = new THREE.Vector3()
const b = new THREE.Vector3()
const c = new THREE.Vector3()
const along = new THREE.Vector3()
const across = new THREE.Vector3()
const joint = new THREE.Vector3()
const goal = new THREE.Vector3()
const turn = new THREE.Quaternion()
const world = new THREE.Quaternion()
const parent = new THREE.Quaternion()
const euler = new THREE.Euler()
const matrix = new THREE.Matrix4()
const pole = new THREE.Vector3()
const reach = new THREE.Vector3()
const facing = new THREE.Vector3()
const sideways = new THREE.Vector3()
const aimAt = new THREE.Vector3()
const shoulder = new THREE.Vector3()
const footLeft = new THREE.Vector3()
const footRight = new THREE.Vector3()
const legs = [
  ['L', 1, footLeft],
  ['R', -1, footRight],
] as const

function rotateWorld(bone: THREE.Object3D, rotation: THREE.Quaternion, weight: number) {
  if (weight < 1) rotation.copy(turn.copy(still).slerp(rotation, weight))
  bone.getWorldQuaternion(world)
  ;(bone.parent as THREE.Object3D).getWorldQuaternion(parent)
  bone.quaternion.copy(parent.invert().multiply(rotation).multiply(world))
  bone.updateWorldMatrix(false, true)
}

const swing = new THREE.Quaternion()

export function solveLimb(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  end: THREE.Object3D,
  target: THREE.Vector3,
  bend: THREE.Vector3,
  weight: number,
) {
  upper.getWorldPosition(a)
  lower.getWorldPosition(b)
  end.getWorldPosition(c)
  const first = a.distanceTo(b)
  const second = b.distanceTo(c)
  if (first < 1e-5 || second < 1e-5) return
  along.copy(target).sub(a)
  const distance = Math.min(
    first + second - 0.002,
    Math.max(Math.abs(first - second) + 0.01, along.length()),
  )
  if (along.lengthSq() < 1e-8) return
  along.normalize()
  const near = (first * first - second * second + distance * distance) / (2 * distance)
  const rise = Math.sqrt(Math.max(0, first * first - near * near))
  across.copy(bend).addScaledVector(along, -bend.dot(along))
  if (across.lengthSq() < 1e-6) across.set(0, -1, 0).addScaledVector(along, along.y)
  across.normalize()
  joint.copy(a).addScaledVector(along, near).addScaledVector(across, rise)
  goal.copy(a).addScaledVector(along, distance)
  b.sub(a).normalize()
  joint.sub(a).normalize()
  rotateWorld(upper, swing.setFromUnitVectors(b, joint), weight)
  lower.getWorldPosition(b)
  end.getWorldPosition(c)
  c.sub(b).normalize()
  goal.sub(b).normalize()
  rotateWorld(lower, swing.setFromUnitVectors(c, goal), weight)
}

function wrap(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function approach(value: number, target: number, rate: number, dt: number) {
  return target + (value - target) * Math.exp(-rate * dt)
}

export class CrewMember {
  root = new THREE.Group()
  ready = false
  tool: CrewTool = 'none'
  speed = 0
  effort = 0
  crouch = 0
  lean = 0
  spin = 0
  pace = 0
  private body: THREE.Object3D | null = null
  private base = 0
  private mixer: THREE.AnimationMixer | null = null
  private actions = new Map<string, THREE.AnimationAction>()
  private playing = ''
  private bones = new Map<string, THREE.Bone>()
  private holder = new THREE.Group()
  private holderRest = new THREE.Quaternion()
  private tools = new Map<CrewTool, THREE.Group>()
  private owned: THREE.Material[] = []
  private path: number[] = []
  private cursor = 0
  private heading = 0
  private finalFace: number | null = null
  private stride = 1.4
  private clock = 0
  private bent = 0
  private leant = 0
  private rightGoal = new THREE.Vector3()
  private leftGoal = new THREE.Vector3()
  private workGoal = new THREE.Vector3()
  private lookGoal = new THREE.Vector3()
  private rightWeight = 0
  private leftWeight = 0
  private workWeight = 0
  private lookWeight = 0
  private rightHeld = false
  private leftHeld = false
  private working = false
  private looking = false
  private glance = 0
  constructor(index: number) {
    this.root.visible = false
    this.clock = index * 1.7
    void load()
      .then((made) => this.dress(made, index))
      .catch(() => {})
  }
  private dress(made: Template, index: number) {
    const body = clone(made.scene)
    body.scale.setScalar(made.scale)
    this.base = -made.base * made.scale
    body.position.y = this.base
    const uniform = crewUniforms[index % crewUniforms.length] ?? crewUniforms[0]
    const copies = new Map<THREE.Material, THREE.Material>()
    body.traverse((part) => {
      if (part instanceof THREE.Bone) this.bones.set(part.name, part)
      if (!(part instanceof THREE.Mesh)) return
      part.castShadow = true
      part.receiveShadow = true
      part.frustumCulled = false
      const swap = (material: THREE.Material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return material
        let copy = copies.get(material) as THREE.MeshStandardMaterial | undefined
        if (!copy) {
          copy = material.clone()
          copy.metalness = 0
          copy.roughness = 0.9
          if (material.name === 'Shirt') copy.color.set(uniform.shirt)
          if (material.name === 'Pants') copy.color.set(uniform.pants)
          copies.set(material, copy)
          this.owned.push(copy)
        }
        return copy
      }
      part.material = Array.isArray(part.material) ? part.material.map(swap) : swap(part.material)
    })
    this.mixer = new THREE.AnimationMixer(body)
    for (const clip of made.clips) this.actions.set(clip.name, this.mixer.clipAction(clip))
    this.stride = made.stride
    const hand = this.bones.get('HandR')
    hand?.add(this.holder)
    this.holder.scale.setScalar(1 / Math.max(0.01, made.scale))
    this.holder.rotation.set(-Math.PI / 2, 0, 0)
    this.holderRest.copy(this.holder.quaternion)
    this.holder.position.set(0, 0.06 / Math.max(0.01, made.scale), 0)
    this.root.add(body)
    this.body = body
    this.ready = true
    this.play('Idle')
    this.hold(this.tool)
  }
  private play(name: string) {
    if (this.playing === name) return
    const next = this.actions.get(name) ?? this.actions.get('Idle')
    const previous = this.actions.get(this.playing)
    if (!next) return
    next.reset().play()
    if (previous) next.crossFadeFrom(previous, crewLayout.blend, false)
    this.playing = name
  }
  hold(tool: CrewTool) {
    this.tool = tool
    if (tool !== 'none' && !this.tools.has(tool)) {
      const mesh = toolMesh(tool)
      this.tools.set(tool, mesh)
      this.holder.add(mesh)
    }
    for (const [kind, mesh] of this.tools) mesh.visible = kind === tool
  }
  place(x: number, z: number, face: number) {
    this.root.position.set(x, 0, z)
    this.heading = face
    this.root.rotation.y = face
    this.path.length = 0
    this.cursor = 0
    this.finalFace = null
    this.speed = 0
  }
  walk(points: readonly number[], face: number | null = null) {
    this.path.length = 0
    for (const value of points) this.path.push(value)
    this.cursor = 0
    this.finalFace = face
  }
  face(angle: number | null) {
    this.finalFace = angle
  }
  get facing() {
    return this.heading
  }
  get walking() {
    if (this.cursor < this.path.length) return true
    return this.finalFace !== null && Math.abs(wrap(this.finalFace - this.heading)) > 0.07
  }
  get laden() {
    return this.rightHeld && this.leftHeld
  }
  rest() {
    this.rightHeld = this.leftHeld = this.working = this.looking = false
    this.crouch = this.lean = this.effort = this.spin = 0
  }
  settle() {
    this.rest()
    this.rightWeight = this.leftWeight = this.workWeight = this.lookWeight = 0
    this.bent = this.leant = this.glance = 0
  }
  grip(left: THREE.Vector3 | null, right: THREE.Vector3 | null) {
    this.leftHeld = left !== null
    this.rightHeld = right !== null
    if (left) this.leftGoal.copy(left)
    if (right) this.rightGoal.copy(right)
    if (right) this.working = false
  }
  work(point: THREE.Vector3 | null) {
    this.working = point !== null
    if (point) {
      this.workGoal.copy(point)
      this.rightHeld = false
    }
  }
  look(point: THREE.Vector3 | null) {
    this.looking = point !== null
    if (point) this.lookGoal.copy(point)
  }
  update(dt: number) {
    this.clock += dt
    const root = this.root
    if (this.cursor < this.path.length) {
      const tx = this.path[this.cursor] as number
      const tz = this.path[this.cursor + 1] as number
      const dx = tx - root.position.x
      const dz = tz - root.position.z
      const distance = Math.hypot(dx, dz)
      if (distance < crewLayout.near) {
        root.position.x = tx
        root.position.z = tz
        this.cursor += 2
      } else {
        const wanted = Math.atan2(dx, dz)
        const off = Math.abs(wrap(wanted - this.heading))
        const aligned = Math.min(1, Math.max(0, 1 - (off - 0.3) / 0.75))
        const last = this.cursor + 2 >= this.path.length
        const brake = Math.sqrt(2 * crewLayout.slow * distance) + (last ? 0.06 : 0.55)
        const top = this.pace > 0 ? this.pace : this.laden ? crewLayout.laden : crewLayout.walk
        const target = Math.min(top, brake) * aligned
        const change = target - this.speed
        this.speed +=
          change > 0
            ? Math.min(change, crewLayout.gain * dt)
            : Math.max(change, -crewLayout.gain * 2 * dt)
        const step = Math.min(distance, this.speed * dt)
        root.position.x += (dx / distance) * step
        root.position.z += (dz / distance) * step
        this.turnTo(wanted, dt)
      }
    } else {
      this.speed = Math.max(0, this.speed - crewLayout.gain * 2 * dt)
      if (this.finalFace !== null) this.turnTo(this.finalFace, dt)
    }
    root.rotation.y = this.heading
    if (!this.mixer) return
    const moving = this.speed > 0.14
    this.play(moving ? 'Walk' : 'Idle')
    const walking = this.actions.get('Walk')
    if (walking) walking.timeScale = moving ? this.speed / this.stride : 1
    this.mixer.update(dt)
    this.pose(dt, moving)
  }
  private turnTo(angle: number, dt: number) {
    const difference = wrap(angle - this.heading)
    const most = (1.1 + Math.abs(difference) * crewLayout.turn) * dt
    this.heading += Math.sign(difference) * Math.min(Math.abs(difference), most)
  }
  private bend(name: string, x: number, y = 0, z = 0) {
    const bone = this.bones.get(name)
    if (!bone) return
    bone.quaternion.multiply(turn.setFromEuler(euler.set(x, y, z)))
  }
  private pose(dt: number, moving: boolean) {
    const body = this.body
    if (!body) return
    const rate = crewLayout.settle
    this.bent = approach(this.bent, moving ? 0 : this.crouch, rate * 0.7, dt)
    this.leant = approach(this.leant, this.lean, rate * 0.7, dt)
    this.rightWeight = approach(this.rightWeight, this.rightHeld ? 1 : 0, rate, dt)
    this.leftWeight = approach(this.leftWeight, this.leftHeld ? 1 : 0, rate, dt)
    this.workWeight = approach(this.workWeight, this.working ? 1 : 0, rate, dt)
    this.lookWeight = approach(this.lookWeight, this.looking ? 1 : 0, rate * 0.5, dt)
    const drop = this.bent * crewLayout.drop
    body.position.y = this.base
    const shake = Math.sin(this.clock * 41) * 0.012 * this.effort
    const breathe = Math.sin(this.clock * 1.3) * 0.012
    const fold = this.leant + this.bent * 0.55
    if (fold > 0.002 || this.effort > 0) {
      this.bend('Spine', fold * 0.6 + shake, 0, 0)
      this.bend('Chest', fold * 0.4 + breathe, 0, 0)
      this.bend('Head', -fold * 0.45, 0, 0)
    }
    const root = this.root
    const site = root.parent
    facing.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    if (site) facing.transformDirection(site.matrixWorld)
    sideways.crossVectors(up, facing).normalize()
    if (this.lookWeight > 0.01) {
      goal.copy(this.lookGoal)
      if (site) site.localToWorld(goal)
      root.getWorldPosition(a)
      goal.sub(a)
      const offset = Math.atan2(goal.dot(sideways), goal.dot(facing))
      const wanted = Math.max(-1.1, Math.min(1.1, offset)) * this.lookWeight
      this.glance = approach(this.glance, wanted, 5, dt)
    } else this.glance = approach(this.glance, 0, 5, dt)
    if (Math.abs(this.glance) > 0.004) {
      this.bend('Neck', 0, this.glance * 0.45, 0)
      this.bend('Head', 0, this.glance * 0.45, 0)
      this.bend('Chest', 0, this.glance * 0.1, 0)
    }
    if (this.workWeight > 0.01) {
      goal.copy(this.workGoal)
      if (site) site.localToWorld(goal)
      root.getWorldPosition(a)
      goal.sub(a)
      const offset = Math.atan2(goal.dot(sideways), goal.dot(facing))
      const twist = Math.max(-1.3, Math.min(1.3, offset)) * this.workWeight
      this.bend('Spine', 0, twist * 0.32, 0)
      this.bend('Chest', 0, twist * 0.32, 0)
    }
    const fine = this.rightWeight > 0.01 || this.leftWeight > 0.01 || this.workWeight > 0.01
    if (this.workWeight <= 0.01) this.holder.quaternion.copy(this.holderRest)
    if (drop < 0.004 && !fine) return
    root.updateWorldMatrix(true, true)
    if (drop >= 0.004) this.sink(drop)
    if (this.workWeight > 0.01) this.aim(shake, dt)
    if (this.rightWeight > 0.01) this.arm('R', this.rightGoal, this.rightWeight)
    if (this.leftWeight > 0.01) this.arm('L', this.leftGoal, this.leftWeight)
  }
  private sink(drop: number) {
    const body = this.body
    if (!body) return
    for (const [side, , spot] of legs) this.bones.get(`Foot${side}`)?.getWorldPosition(spot)
    body.position.y = this.base - drop
    body.updateWorldMatrix(false, true)
    for (const [side, sign, spot] of legs) {
      const upper = this.bones.get(`UpperLeg${side}`)
      const lower = this.bones.get(`LowerLeg${side}`)
      const foot = this.bones.get(`Foot${side}`)
      if (!upper || !lower || !foot) continue
      pole.copy(facing).addScaledVector(sideways, sign * 0.35)
      solveLimb(upper, lower, foot, spot, pole, 1)
    }
  }
  private arm(side: 'L' | 'R', target: THREE.Vector3, weight: number) {
    const upper = this.bones.get(`UpperArm${side}`)
    const lower = this.bones.get(`LowerArm${side}`)
    const hand = this.bones.get(`Hand${side}`)
    if (!upper || !lower || !hand) return
    reach.copy(target)
    const site = this.root.parent
    if (site) site.localToWorld(reach)
    pole
      .set(0, -1, 0)
      .addScaledVector(sideways, side === 'L' ? 0.55 : -0.55)
      .addScaledVector(facing, -0.25)
    solveLimb(upper, lower, hand, reach, pole, weight)
  }
  private aim(shake: number, dt: number) {
    const upper = this.bones.get('UpperArmR')
    const lower = this.bones.get('LowerArmR')
    const hand = this.bones.get('HandR')
    if (!upper || !lower || !hand) return
    aimAt.copy(this.workGoal)
    const site = this.root.parent
    if (site) site.localToWorld(aimAt)
    upper.getWorldPosition(shoulder)
    shoulder.addScaledVector(facing, 0.05).y -= 0.12
    reach.copy(aimAt).sub(shoulder)
    const far = reach.length()
    if (far < 1e-4) return
    const tip = toolReach[this.tool]
    const out = Math.min(crewLayout.reach, Math.max(0.2, far - tip))
    reach.multiplyScalar(out / far).add(shoulder)
    reach.y += shake
    pole.set(0, -1, 0).addScaledVector(sideways, -0.5).addScaledVector(facing, -0.2)
    solveLimb(upper, lower, hand, reach, pole, this.workWeight)
    hand.getWorldPosition(shoulder)
    aimAt.sub(shoulder)
    if (aimAt.lengthSq() < 1e-8) return
    matrix.lookAt(aimAt, origin, up)
    world.setFromRotationMatrix(matrix)
    hand.getWorldQuaternion(parent)
    turn.copy(parent.invert().multiply(world))
    this.holder.quaternion.copy(this.holderRest).slerp(turn, this.workWeight)
    this.holder.updateWorldMatrix(false, true)
    const socket = this.tools.get('wrench')?.userData.socket as THREE.Object3D | undefined
    if (socket && this.spin) socket.rotation.z += this.spin * dt
  }
  toolTip(target: THREE.Vector3) {
    const mesh = this.tools.get(this.tool)
    if (!mesh || !this.ready) {
      target.set(this.root.position.x, 1.15, this.root.position.z)
      const site = this.root.parent
      return site ? site.localToWorld(target) : target
    }
    mesh.updateWorldMatrix(true, false)
    return target.set(0, 0.02, toolReach[this.tool]).applyMatrix4(mesh.matrixWorld)
  }
  dispose() {
    this.root.removeFromParent()
    this.mixer?.stopAllAction()
    for (const material of this.owned) material.dispose()
    for (const tool of this.tools.values()) {
      const materials = new Set<THREE.Material>()
      tool.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) return
        part.geometry.dispose()
        materials.add(part.material as THREE.Material)
      })
      for (const material of materials) material.dispose()
    }
  }
}

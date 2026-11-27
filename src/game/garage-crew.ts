import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import manUrl from '../assets/models/man.glb?url'
import { restClip, standing, stridePace } from './cast'

export type CrewTool = 'none' | 'lance' | 'spray' | 'wrench' | 'sponge'
export type CrewPose = 'stand' | 'reach' | 'bend' | 'kneel' | 'sweep'

export const crewLayout = { height: 1.78, walk: 1.35, turn: 6, blend: 0.25 } as const

export const crewArms = { raise: -1.15, elbow: -0.35 }

export const crewUniforms = [
  { shirt: '#24446a', pants: '#24446a' },
  { shirt: '#c45a23', pants: '#33383c' },
] as const

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
    add(new THREE.BoxGeometry(0.05, 0.14, 0.12), bright, 0, -0.04, 0.02)
    const pipe = add(new THREE.CylinderGeometry(0.011, 0.011, 0.75, 8), dark, 0, 0.02, 0.42)
    pipe.rotation.x = Math.PI / 2
    add(new THREE.CylinderGeometry(0.02, 0.016, 0.06, 8), dark, 0, 0.02, 0.81).rotation.x =
      Math.PI / 2
  }
  if (kind === 'spray') {
    add(new THREE.BoxGeometry(0.04, 0.12, 0.1), dark, 0, -0.03, 0.02)
    add(new THREE.CylinderGeometry(0.045, 0.04, 0.12, 12), bright, 0, 0.09, 0.03)
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), bright, 0, 0.02, 0.1).rotation.x =
      Math.PI / 2
  }
  if (kind === 'wrench') {
    add(new THREE.BoxGeometry(0.06, 0.16, 0.08), dark, 0, -0.05, 0)
    add(new THREE.BoxGeometry(0.07, 0.08, 0.2), bright, 0, 0.04, 0.06)
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.08, 8), dark, 0, 0.04, 0.19).rotation.x =
      Math.PI / 2
  }
  if (kind === 'sponge') add(new THREE.BoxGeometry(0.12, 0.06, 0.18), bright, 0, 0, 0.05)
  return group
}

export class CrewMember {
  root = new THREE.Group()
  ready = false
  private mixer: THREE.AnimationMixer | null = null
  private actions = new Map<string, THREE.AnimationAction>()
  private playing = ''
  private bones = new Map<string, THREE.Bone>()
  private holder = new THREE.Group()
  private tools = new Map<CrewTool, THREE.Group>()
  private owned: THREE.Material[] = []
  private target: THREE.Vector3 | null = null
  private facing = 0
  private aim: number | null = null
  private stride = 1.4
  tool: CrewTool = 'none'
  pose: CrewPose = 'stand'
  effort = 0
  private clock = 0
  constructor(index: number) {
    this.root.visible = false
    void load()
      .then((made) => this.dress(made, index))
      .catch(() => {})
  }
  private dress(made: Template, index: number) {
    const body = clone(made.scene)
    body.scale.setScalar(made.scale)
    body.position.y = -made.base * made.scale
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
    this.holder.position.set(0, 0.06 / Math.max(0.01, made.scale), 0)
    this.root.add(body)
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
    for (const [kind, mesh] of this.tools) mesh.visible = kind === tool
    if (tool !== 'none' && !this.tools.has(tool)) {
      const mesh = toolMesh(tool)
      this.tools.set(tool, mesh)
      this.holder.add(mesh)
    }
  }
  place(x: number, z: number, facing: number) {
    this.root.position.set(x, 0, z)
    this.facing = facing
    this.root.rotation.y = facing
    this.target = null
  }
  walkTo(x: number, z: number, face?: number) {
    this.target = new THREE.Vector3(x, 0, z)
    this.aim = face ?? null
  }
  face(angle: number) {
    this.aim = angle
  }
  get walking() {
    return this.target !== null
  }
  update(dt: number) {
    this.clock += dt
    const root = this.root
    let pace = 0
    if (this.target) {
      const dx = this.target.x - root.position.x
      const dz = this.target.z - root.position.z
      const distance = Math.hypot(dx, dz)
      if (distance < 0.05) {
        root.position.x = this.target.x
        root.position.z = this.target.z
        this.target = null
      } else {
        const step = Math.min(distance, crewLayout.walk * dt)
        root.position.x += (dx / distance) * step
        root.position.z += (dz / distance) * step
        this.turnTo(Math.atan2(dx, dz), dt)
        pace = crewLayout.walk
      }
    }
    if (!this.target && this.aim !== null) this.turnTo(this.aim, dt)
    root.rotation.y = this.facing
    if (!this.mixer) return
    this.play(pace > 0 ? 'Walk' : 'Idle')
    const walking = this.actions.get('Walk')
    if (walking) walking.timeScale = pace > 0 ? crewLayout.walk / this.stride : 1
    this.mixer.update(dt)
    this.work(pace > 0)
  }
  private turnTo(angle: number, dt: number) {
    const difference = Math.atan2(Math.sin(angle - this.facing), Math.cos(angle - this.facing))
    this.facing += difference * (1 - Math.exp(-crewLayout.turn * dt))
  }
  private bend(name: string, x: number, y = 0, z = 0) {
    const bone = this.bones.get(name)
    if (!bone) return
    bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)))
  }
  private work(walking: boolean) {
    const swing = Math.sin(this.clock * 3.2) * this.effort
    const shake = Math.sin(this.clock * 38) * 0.03 * this.effort
    if (this.pose === 'reach' || this.pose === 'sweep') {
      const sweep = this.pose === 'sweep' ? swing * 0.35 : 0
      this.bend('UpperArmR', crewArms.raise, sweep, 0)
      this.bend('LowerArmR', crewArms.elbow, 0, 0)
      this.bend('UpperArmL', crewArms.raise * 0.8, -0.2, 0)
      this.bend('LowerArmL', crewArms.elbow * 1.6, 0, 0)
      if (!walking) this.bend('Spine', 0.08, sweep * 0.3, 0)
    }
    if (walking) return
    if (this.pose === 'bend') {
      this.bend('Spine', 0.45, 0, 0)
      this.bend('Chest', 0.3, 0, 0)
      this.bend('UpperArmR', -0.9 + shake, 0, 0)
      this.bend('LowerArmR', -0.5, 0, 0)
      this.bend('UpperArmL', -0.7, 0, 0)
    }
    if (this.pose === 'kneel') {
      this.bend('Spine', 0.6, 0, 0)
      this.bend('Chest', 0.35, 0, 0)
      this.bend('Head', -0.3, 0, 0)
      this.bend('UpperArmR', -1.0 + shake, 0, 0)
      this.bend('LowerArmR', -0.4, 0, 0)
      this.bend('UpperArmL', -0.8, 0, 0)
    }
  }
  toolTip(target: THREE.Vector3) {
    const mesh = this.tools.get(this.tool)
    if (!mesh) return target.copy(this.root.position).setY(1.1)
    mesh.updateWorldMatrix(true, false)
    const reach = this.tool === 'lance' ? 0.84 : this.tool === 'spray' ? 0.14 : 0.2
    return target.set(0, 0.02, reach).applyMatrix4(mesh.matrixWorld)
  }
  dispose() {
    this.root.removeFromParent()
    for (const material of this.owned) material.dispose()
    for (const tool of this.tools.values())
      tool.traverse((part) => {
        if (part instanceof THREE.Mesh) {
          part.geometry.dispose()
          ;(part.material as THREE.Material).dispose()
        }
      })
  }
}

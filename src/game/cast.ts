import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import bullUrl from '../assets/models/bull.glb?url'
import cattleUrl from '../assets/models/cattle.glb?url'
import deerUrl from '../assets/models/deer.glb?url'
import elephantUrl from '../assets/models/elephant.glb?url'
import horseUrl from '../assets/models/horse.glb?url'
import manUrl from '../assets/models/man.glb?url'
import sheepUrl from '../assets/models/sheep.glb?url'
import womanUrl from '../assets/models/woman.glb?url'
import type { Creature } from './creatures'
import type { Placed, Stage } from './life'

export const castSources: {
  kind: Creature
  url: string
  height: number
  glow?: number
  share?: number
}[] = [
  { kind: 'person', url: manUrl, height: 1.78 },
  { kind: 'person', url: womanUrl, height: 1.68 },
  { kind: 'cow', url: cattleUrl, height: 1.78, glow: 1.9, share: 3 },
  { kind: 'cow', url: bullUrl, height: 1.84, glow: 5, share: 1 },
  { kind: 'elephant', url: elephantUrl, height: 3.1, glow: 1.35 },
  { kind: 'horse', url: horseUrl, height: 1.85 },
  { kind: 'deer', url: deerUrl, height: 1.6 },
  { kind: 'sheep', url: sheepUrl, height: 0.95 },
]

const sources = castSources

export function castPick(shares: number[], phase: number) {
  const total = shares.reduce((sum, share) => sum + share, 0)
  let mark = ((((phase * 7.3) % 1) + 1) % 1) * total
  for (const [index, share] of shares.entries()) {
    if (mark < share) return index
    mark -= share
  }
  return Math.max(0, shares.length - 1)
}

export function restClip(root: THREE.Object3D, name: string) {
  const tracks: THREE.KeyframeTrack[] = []
  root.traverse((part) => {
    if (!(part instanceof THREE.Bone) || !part.name) return
    const { position, quaternion, scale } = part
    tracks.push(
      new THREE.VectorKeyframeTrack(
        `${part.name}.position`,
        [0, 1],
        [...position.toArray(), ...position.toArray()],
      ),
      new THREE.QuaternionKeyframeTrack(
        `${part.name}.quaternion`,
        [0, 1],
        [...quaternion.toArray(), ...quaternion.toArray()],
      ),
      new THREE.VectorKeyframeTrack(
        `${part.name}.scale`,
        [0, 1],
        [...scale.toArray(), ...scale.toArray()],
      ),
    )
  })
  return new THREE.AnimationClip(name, 1, tracks)
}

export function standing(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3()
  root.traverse((part) => {
    if (part instanceof THREE.SkinnedMesh) {
      part.computeBoundingBox()
      if (part.boundingBox) bounds.union(part.boundingBox.clone().applyMatrix4(part.matrixWorld))
    } else if (part instanceof THREE.Mesh) bounds.expandByObject(part)
  })
  return bounds.isEmpty()
    ? { height: 0, base: 0 }
    : { height: bounds.max.y - bounds.min.y, base: bounds.min.y }
}

const dyes: Record<string, number> = { Shirt: 0, Pants: 1, Skin: 2 }
export const castPace = {
  walker: 1.25,
  grazer: 0.55,
  runner: 4.6,
  gallop: 6.5,
  blend: 0.35,
  shadows: 90,
  collapse: 1.7,
  detail: 60,
}

function clampPace(value: number) {
  return Math.max(0.5, Math.min(1.6, value))
}

interface Template {
  scene: THREE.Object3D
  clips: THREE.AnimationClip[]
  scale: number
  base: number
  order: number
  share: number
}

interface Actor {
  root: THREE.Object3D
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  playing: string
  member: unknown
  dyed: (THREE.MeshStandardMaterial | undefined)[]
  owned: THREE.Material[]
  meshes: THREE.Mesh[]
  shaded: boolean
  owed: number
}

export class Cast implements Stage {
  group = new THREE.Group()
  private templates = new Map<Creature, Template[]>()
  private actors = new Map<Template, Actor[]>()
  private used = new Map<Template, number>()
  private disposed = false
  private beat = 0
  constructor() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    for (const source of sources)
      loader.load(source.url, (file) => {
        if (this.disposed) return
        const { height: tall, base } = standing(file.scene)
        const clips = file.animations.some((clip) => clip.name === 'Idle')
          ? file.animations
          : [...file.animations, restClip(file.scene, 'Idle')]
        file.scene.traverse((part) => {
          if (!(part instanceof THREE.Mesh)) return
          part.castShadow = true
          part.receiveShadow = true
          part.frustumCulled = false
          for (const material of Array.isArray(part.material) ? part.material : [part.material])
            if (material instanceof THREE.MeshStandardMaterial) {
              material.metalness = 0
              material.roughness = 0.88
              material.color.multiplyScalar(source.glow ?? 1)
            }
        })
        const list = this.templates.get(source.kind) ?? []
        list.push({
          scene: file.scene,
          clips,
          scale: tall > 0 ? source.height / tall : 1,
          base,
          share: source.share ?? 1,
          order: sources.indexOf(source),
        })
        list.sort((a, b) => a.order - b.order)
        this.templates.set(source.kind, list)
      })
  }
  has(kind: Creature) {
    return this.templates.has(kind)
  }
  begin() {
    this.beat++
    this.used.clear()
  }
  private actor(template: Template, index: number) {
    const pool = this.actors.get(template) ?? []
    this.actors.set(template, pool)
    let actor = pool[index]
    if (actor) return actor
    const root = clone(template.scene)
    const owned: THREE.Material[] = []
    const dyed: Actor['dyed'] = []
    const copies = new Map<THREE.Material, THREE.Material>()
    const meshes: THREE.Mesh[] = []
    root.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return
      meshes.push(part)
      const swap = (material: THREE.Material) => {
        const slot = dyes[material.name]
        if (slot === undefined || !(material instanceof THREE.MeshStandardMaterial)) return material
        let copy = copies.get(material)
        if (!copy) {
          copy = material.clone()
          copies.set(material, copy)
          owned.push(copy)
          dyed[slot] = copy as THREE.MeshStandardMaterial
        }
        return copy
      }
      part.material = Array.isArray(part.material) ? part.material.map(swap) : swap(part.material)
    })
    const mixer = new THREE.AnimationMixer(root)
    const actions = new Map<string, THREE.AnimationAction>()
    for (const clip of template.clips) actions.set(clip.name, mixer.clipAction(clip))
    actor = {
      root,
      mixer,
      actions,
      playing: '',
      member: null,
      dyed,
      owned,
      meshes,
      shaded: true,
      owed: 0,
    }
    pool[index] = actor
    this.group.add(root)
    return actor
  }
  place(spot: Placed, dt: number, near: number) {
    const options = this.templates.get(spot.kind)
    if (!options?.length) return
    const template =
      options[
        castPick(
          options.map((option) => option.share),
          spot.member.phase,
        )
      ] ?? options[0]
    if (!template) return
    const index = this.used.get(template) ?? 0
    this.used.set(template, index + 1)
    const actor = this.actor(template, index)
    actor.root.visible = true
    const felled = spot.mood === 2
    const lying = felled && !actor.actions.has('Death') ? spot.tip : 0
    actor.root.rotation.order = 'YXZ'
    const size = template.scale * spot.member.scale
    actor.root.position.set(spot.x, spot.y + lying * 0.2 - template.base * size, -spot.s)
    actor.root.rotation.set((-Math.PI / 2) * lying, spot.yaw, 0)
    actor.root.scale.setScalar(size)
    const fresh = actor.member !== spot.member
    if (fresh) {
      actor.member = spot.member
      if (spot.kind === 'person')
        for (const [slot, tint] of spot.member.tints.entries()) actor.dyed[slot]?.color.copy(tint)
    }
    const walker = spot.kind === 'person'
    const want = felled
      ? actor.actions.has('Death')
        ? 'Death'
        : 'Idle'
      : spot.mood === 1 && actor.actions.has('Run')
        ? 'Run'
        : spot.stride > 0.08
          ? 'Walk'
          : spot.graze > 0.35 && actor.actions.has('Eating')
            ? 'Eating'
            : 'Idle'
    const next = actor.actions.get(want)
    if (next && actor.playing !== want) {
      const previous = actor.actions.get(actor.playing)
      next.reset()
      if (want === 'Death') {
        next.setLoop(THREE.LoopOnce, 1)
        next.clampWhenFinished = true
      }
      next.play()
      if (want === 'Death') {
        next.timeScale = castPace.collapse
        next.time = Math.min(spot.age * castPace.collapse, next.getClip().duration)
      } else
        next.time =
          ((spot.member.phase + spot.member.scale * 91.7 + spot.member.along * 13.1) * 1.7) %
          Math.max(0.1, next.getClip().duration)
      if (previous && !fresh) next.crossFadeFrom(previous, castPace.blend, false)
      else previous?.stop()
      actor.playing = want
    }
    if (next && want === 'Walk')
      next.timeScale =
        spot.mood === 1
          ? 2.3
          : walker
            ? spot.member.pace / castPace.walker
            : Math.max(0.4, spot.member.pace / castPace.grazer)
    if (next && want === 'Run')
      next.timeScale = clampPace(spot.pace / (walker ? castPace.runner : castPace.gallop))
    const shaded = near < castPace.shadows
    if (shaded !== actor.shaded) {
      actor.shaded = shaded
      for (const mesh of actor.meshes) mesh.castShadow = shaded
    }
    actor.owed += dt
    const turn = near < castPace.detail ? 1 : near < castPace.detail * 2.5 ? 2 : 4
    if (fresh || (this.beat + index) % turn === 0) {
      actor.mixer.update(actor.owed)
      actor.owed = 0
    }
  }
  end() {
    for (const [template, pool] of this.actors) {
      const used = this.used.get(template) ?? 0
      for (let index = used; index < pool.length; index++) {
        const actor = pool[index]
        if (actor) actor.root.visible = false
      }
    }
  }
  dispose() {
    this.disposed = true
    this.group.removeFromParent()
    for (const pool of this.actors.values())
      for (const actor of pool) {
        actor.mixer.stopAllAction()
        for (const material of actor.owned) material.dispose()
      }
    for (const list of this.templates.values())
      for (const template of list)
        template.scene.traverse((part) => {
          if (!(part instanceof THREE.Mesh)) return
          part.geometry.dispose()
          for (const material of Array.isArray(part.material) ? part.material : [part.material])
            material.dispose()
        })
  }
}

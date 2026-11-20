import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import fernUrl from '../assets/models/plants/fern.glb?url'
import quiverUrl from '../assets/models/plants/quiver.glb?url'
import stumpUrl from '../assets/models/plants/stump.glb?url'
import stoneUrl from '../assets/models/rocks/rock-a.glb?url'
import slabUrl from '../assets/models/rocks/rock-b.glb?url'
import boulderUrl from '../assets/models/rocks/rock-c.glb?url'
import { type Landscape, landscapeProfiles } from './landscapes'
import { roadCoordinates, roadPoint } from './road'
import { shoreHeight, type World } from './world'

export const boulderLayout = {
  nearest: 7.5,
  farthest: 46,
  sink: 0.3,
  cluster: 3.2,
  plantNearest: 6,
  plantFarthest: 40,
  kinds: [
    { url: stoneUrl, part: '', glow: 1, size: [0.5, 1.3], rock: true, solid: 0.42 },
    { url: slabUrl, part: '', glow: 1, size: [0.6, 1.5], rock: true, solid: 0.42 },
    { url: boulderUrl, part: '', glow: 1, size: [1.3, 3.4], rock: true, solid: 0.42 },
    { url: quiverUrl, part: '', size: [2.2, 3.6], rock: false, solid: 0.14, glow: 2.1 },
    { url: stumpUrl, part: '', size: [1.1, 1.9], rock: false, solid: 0.3, glow: 1.7 },
    { url: fernUrl, part: 'fern_tall', size: [1.2, 2], rock: false, solid: 0, glow: 2.6 },
    { url: fernUrl, part: 'fern_wide', size: [1.2, 2], rock: false, solid: 0, glow: 2.6 },
    { url: fernUrl, part: 'fern_small', size: [0.9, 1.5], rock: false, solid: 0, glow: 2.6 },
  ],
} as const

export const plantKinds: Record<Landscape, readonly number[]> = {
  highlands: [4],
  alpine: [4],
  desert: [3, 3, 3, 4],
  forest: [4, 4, 5, 6, 7],
  canyon: [3, 3, 4],
  fjord: [4, 5, 7],
  jungle: [5, 6, 7, 5, 6, 4],
}

export function planPlants(world: World, start: number, length: number, rng: () => number) {
  const landscape = world.settings.landscape
  const options = plantKinds[landscape]
  const wanted = landscapeProfiles[landscape].plants
  const list: Boulder[] = []
  const { plantNearest, plantFarthest, kinds } = boulderLayout
  for (let attempt = 0; attempt < wanted * 3 && list.length < wanted; attempt++) {
    const s = start + rng() * length
    const side = rng() > 0.5 ? 1 : -1
    const reach = plantNearest + rng() ** 1.4 * (plantFarthest - plantNearest)
    const kind = options[Math.floor(rng() * options.length)] ?? 4
    const yaw = rng() * Math.PI * 2
    const spec = kinds[kind]
    const [least, most] = spec?.size ?? [1, 1]
    const size = least + rng() * (most - least)
    const point = roadPoint(world.road(s), s, side * reach)
    if (world.height(point.x, point.s) < shoreHeight + 0.3) continue
    if (world.surface(point.x, point.s).onRoad) continue
    list.push({ kind, x: point.x, s: point.s, yaw, size, radius: size * (spec?.solid ?? 0) })
  }
  return list
}

export interface Boulder {
  kind: number
  x: number
  s: number
  yaw: number
  size: number
  radius: number
}

export function planBoulders(world: World, start: number, length: number, rng: () => number) {
  const wanted = landscapeProfiles[world.settings.landscape].boulders
  const list: Boulder[] = []
  const { nearest, farthest, kinds } = boulderLayout
  for (let attempt = 0; attempt < wanted * 3 && list.length < wanted; attempt++) {
    const s = start + rng() * length
    const side = rng() > 0.5 ? 1 : -1
    const reach = nearest + rng() ** 1.6 * (farthest - nearest)
    const kind = rng() < 0.3 ? 2 : rng() < 0.5 ? 0 : 1
    const yaw = rng() * Math.PI * 2
    const [least, most] = kinds[kind]?.size ?? [1, 1]
    const size = least + rng() ** 1.5 * (most - least)
    const point = roadPoint(world.road(s), s, side * reach)
    if (world.height(point.x, point.s) < shoreHeight + 0.3) continue
    if (world.surface(point.x, point.s).onRoad) continue
    list.push({ kind, x: point.x, s: point.s, yaw, size, radius: size * 0.42 })
    const companions = Math.floor(rng() * 3)
    for (let extra = 0; extra < companions; extra++) {
      const angle = rng() * Math.PI * 2
      const apart = size * 0.7 + rng() * boulderLayout.cluster
      const small = Math.floor(rng() * 2)
      const [low, high] = kinds[small]?.size ?? [1, 1]
      const girth = low + rng() ** 2 * (high - low)
      const x = point.x + Math.cos(angle) * apart
      const along = point.s + Math.sin(angle) * apart
      if (world.height(x, along) < shoreHeight + 0.3 || world.surface(x, along).onRoad) continue
      if (Math.abs(roadCoordinates(world, x, along).distance) < nearest - 1) continue
      list.push({ kind: small, x, s: along, yaw: rng() * 6.283, size: girth, radius: girth * 0.42 })
    }
  }
  return list
}

interface PlantModel {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  rock: boolean
  span: number
  base: number
}

export class Boulders {
  private models: (PlantModel | null)[] = boulderLayout.kinds.map(() => null)
  private pose = new THREE.Object3D()
  private plain = new THREE.Color('#ffffff')
  loaded = false
  ready: Promise<void>
  constructor() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const files = new Map<string, Promise<THREE.Object3D>>()
    const fetched = (url: string) => {
      let file = files.get(url)
      if (!file) {
        file = loader.loadAsync(url).then((gltf) => {
          gltf.scene.updateMatrixWorld(true)
          return gltf.scene
        })
        files.set(url, file)
      }
      return file
    }
    this.ready = Promise.all(
      boulderLayout.kinds.map((kind, index) =>
        fetched(kind.url).then((scene) => {
          const root = kind.part ? scene.getObjectByName(kind.part) : scene
          root?.traverse((part) => {
            if (!(part instanceof THREE.Mesh) || this.models[index]) return
            const geometry = part.geometry.clone()
            for (const name of ['position', 'normal']) {
              const packed = geometry.getAttribute(name)
              if (!packed) continue
              const plain = new Float32Array(packed.count * 3)
              for (let vertex = 0; vertex < packed.count; vertex++)
                plain.set(
                  [packed.getX(vertex), packed.getY(vertex), packed.getZ(vertex)],
                  vertex * 3,
                )
              geometry.setAttribute(name, new THREE.BufferAttribute(plain, 3))
            }
            geometry.applyMatrix4(part.matrixWorld)
            geometry.deleteAttribute('color')
            geometry.computeBoundingBox()
            const box = geometry.boundingBox ?? new THREE.Box3()
            geometry.translate(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2)
            geometry.computeVertexNormals()
            const source = Array.isArray(part.material) ? part.material[0] : part.material
            if (!source) return
            const material = kind.rock ? source : source.clone()
            if (material instanceof THREE.MeshStandardMaterial) {
              material.envMapIntensity = 0.4
              material.vertexColors = false
              if (!kind.rock) {
                material.metalness = 0
                material.metalnessMap = null
                material.side = THREE.DoubleSide
                material.color.setScalar(kind.glow)
              }
            }
            this.models[index] = {
              geometry,
              material,
              rock: kind.rock,
              span: Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 0.001),
              base: box.min.y,
            }
          })
        }),
      ),
    ).then(
      () => {
        this.loaded = true
      },
      () => {
        this.loaded = false
      },
    )
  }
  tint(rock: THREE.ColorRepresentation) {
    for (const model of this.models)
      if (model?.rock && model.material instanceof THREE.MeshStandardMaterial)
        model.material.color.set(rock).lerp(this.plain, 0.35).multiplyScalar(1.9)
  }
  add(group: THREE.Group, list: Boulder[], ground: (x: number, s: number) => number) {
    if (!this.loaded) return
    for (const [index, model] of this.models.entries()) {
      const mine = list.filter((boulder) => boulder.kind === index)
      if (!model || !mine.length) continue
      const mesh = new THREE.InstancedMesh(model.geometry, model.material, mine.length)
      for (const [slot, boulder] of mine.entries()) {
        const scale = boulder.size / model.span
        this.pose.position.set(
          boulder.x,
          ground(boulder.x, boulder.s) -
            model.base * scale -
            (model.rock ? boulder.size * boulderLayout.sink : 0.04),
          -boulder.s,
        )
        this.pose.rotation.set(0, boulder.yaw, 0)
        this.pose.scale.setScalar(scale)
        this.pose.updateMatrix()
        mesh.setMatrixAt(slot, this.pose.matrix)
      }
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
    }
  }
  owns(geometry: THREE.BufferGeometry) {
    return this.models.some((model) => model?.geometry === geometry)
  }
  dispose() {
    for (const model of this.models) {
      model?.geometry.dispose()
      if (model) {
        for (const value of Object.values(model.material))
          if (value instanceof THREE.Texture) value.dispose()
        model.material.dispose()
      }
    }
  }
}

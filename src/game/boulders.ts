import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import stoneUrl from '../assets/models/rocks/rock-a.glb?url'
import slabUrl from '../assets/models/rocks/rock-b.glb?url'
import boulderUrl from '../assets/models/rocks/rock-c.glb?url'
import { landscapeProfiles } from './landscapes'
import { roadCoordinates, roadPoint } from './road'
import { shoreHeight, type World } from './world'

export const boulderLayout = {
  nearest: 7.5,
  farthest: 46,
  sink: 0.3,
  cluster: 3.2,
  kinds: [
    { url: stoneUrl, size: [0.5, 1.3] },
    { url: slabUrl, size: [0.6, 1.5] },
    { url: boulderUrl, size: [1.3, 3.4] },
  ],
} as const

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
    this.ready = Promise.all(
      boulderLayout.kinds.map((kind, index) =>
        loader.loadAsync(kind.url).then((file) => {
          file.scene.updateMatrixWorld(true)
          file.scene.traverse((part) => {
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
            geometry.computeVertexNormals()
            geometry.computeBoundingBox()
            const box = geometry.boundingBox ?? new THREE.Box3()
            const material = Array.isArray(part.material) ? part.material[0] : part.material
            if (!material) return
            if (material instanceof THREE.MeshStandardMaterial) material.envMapIntensity = 0.4
            this.models[index] = {
              geometry,
              material,
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
      if (model?.material instanceof THREE.MeshStandardMaterial)
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
          ground(boulder.x, boulder.s) - model.base * scale - boulder.size * boulderLayout.sink,
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

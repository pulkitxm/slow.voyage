import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import stoneUrl from '../assets/models/rocks/rock-a.glb?url'
import slabUrl from '../assets/models/rocks/rock-b.glb?url'
import boulderUrl from '../assets/models/rocks/rock-c.glb?url'
import { landscapeProfiles } from './landscapes'
import { roadPoint } from './road'
import { shoreHeight, type World } from './world'

export const boulderLayout = {
  nearest: 8,
  farthest: 75,
  sink: 0.18,
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
  }
  return list
}

interface Scan {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  span: number
  base: number
}

export class Boulders {
  private scans: (Scan | null)[] = boulderLayout.kinds.map(() => null)
  private pose = new THREE.Object3D()
  loaded = false
  ready: Promise<void>
  constructor() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    this.ready = Promise.all(
      boulderLayout.kinds.map((kind, index) =>
        loader.loadAsync(kind.url).then((file) => {
          file.scene.updateMatrixWorld(true)
          file.scene.traverse((part) => {
            if (!(part instanceof THREE.Mesh) || this.scans[index]) return
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
            this.scans[index] = {
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
  add(group: THREE.Group, list: Boulder[], ground: (x: number, s: number) => number) {
    if (!this.loaded) return
    for (const [index, scan] of this.scans.entries()) {
      const mine = list.filter((boulder) => boulder.kind === index)
      if (!scan || !mine.length) continue
      const mesh = new THREE.InstancedMesh(scan.geometry, scan.material, mine.length)
      for (const [slot, boulder] of mine.entries()) {
        const scale = boulder.size / scan.span
        this.pose.position.set(
          boulder.x,
          ground(boulder.x, boulder.s) - scan.base * scale - boulder.size * boulderLayout.sink,
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
    return this.scans.some((scan) => scan?.geometry === geometry)
  }
  dispose() {
    for (const scan of this.scans) {
      scan?.geometry.dispose()
      if (scan) {
        for (const value of Object.values(scan.material))
          if (value instanceof THREE.Texture) value.dispose()
        scan.material.dispose()
      }
    }
  }
}

import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import bushUrl from '../assets/models/plants/bush.glb?url'
import smallBushUrl from '../assets/models/plants/bush-small.glb?url'
import calatheaUrl from '../assets/models/plants/calathea.glb?url'
import fernUrl from '../assets/models/plants/fern.glb?url'
import pachiraUrl from '../assets/models/plants/pachira.glb?url'
import quiverUrl from '../assets/models/plants/quiver.glb?url'
import scrubUrl from '../assets/models/plants/scrub.glb?url'
import shrubUrl from '../assets/models/plants/shrub.glb?url'
import wideShrubUrl from '../assets/models/plants/shrub-wide.glb?url'
import stumpUrl from '../assets/models/plants/stump.glb?url'
import stoneUrl from '../assets/models/rocks/rock-a.glb?url'
import slabUrl from '../assets/models/rocks/rock-b.glb?url'
import boulderUrl from '../assets/models/rocks/rock-c.glb?url'
import { type Landscape, landscapeProfiles } from './landscapes'
import { roadCoordinates, roadPoint } from './road'
import { StaticGroup } from './static-group'
import { type Season, shoreHeight, type World } from './world'

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
    { url: shrubUrl, part: '', size: [1.3, 2.1], rock: false, solid: 0, glow: 1.9, leafy: true },
    {
      url: wideShrubUrl,
      part: '',
      size: [1.8, 2.8],
      rock: false,
      solid: 0,
      glow: 1.9,
      leafy: true,
    },
    { url: bushUrl, part: '', size: [1.2, 2], rock: false, solid: 0, glow: 1.9, leafy: true },
    {
      url: smallBushUrl,
      part: '',
      size: [0.7, 1.3],
      rock: false,
      solid: 0,
      glow: 1.9,
      leafy: true,
    },
    { url: scrubUrl, part: '', size: [0.7, 1.4], rock: false, solid: 0, glow: 1.8 },
    { url: pachiraUrl, part: '', size: [1.2, 2.2], rock: false, solid: 0, glow: 1.4 },
    { url: calatheaUrl, part: '', size: [0.7, 1.2], rock: false, solid: 0, glow: 1.8 },
  ],
} as const

export const plantLook = {
  level: 0.8,
  keep: 0.72,
  root: 0.45,
  crown: 0.55,
  cast: 0.14,
  through: 0.3,
}

export function shadePlant(material: THREE.MeshStandardMaterial, base: number, rise: number) {
  const span = { value: new THREE.Vector2(base, Math.max(rise, 0.001)) }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.plantSpan = span
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec2 plantSpan;\nvarying float plantLift;\nvarying float plantCast;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
plantLift = clamp((position.y - plantSpan.x) / plantSpan.y, 0.0, 1.0);
#ifdef USE_INSTANCING
plantCast = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
#else
plantCast = 0.5;
#endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float plantLift;\nvarying float plantCast;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, ${plantLook.keep.toFixed(2)});
diffuseColor.rgb *= mix(${plantLook.root.toFixed(2)}, 1.0, smoothstep(0.0, ${plantLook.crown.toFixed(2)}, plantLift));
diffuseColor.rgb *= mix(vec3(${(1 - plantLook.cast).toFixed(2)}, ${(1 - plantLook.cast * 0.5).toFixed(2)}, ${(1 - plantLook.cast * 0.7).toFixed(2)}), vec3(${(1 + plantLook.cast).toFixed(2)}, ${(1 + plantLook.cast * 0.4).toFixed(2)}, ${(1 - plantLook.cast * 0.6).toFixed(2)}), plantCast);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#if NUM_DIR_LIGHTS > 0
float plantThrough = pow(max(dot(-normalize(vViewPosition), directionalLights[0].direction), 0.0), 3.0) * plantLift;
float plantReach = dot(diffuseColor.rgb * directionalLights[0].color, vec3(1.0)) * RECIPROCAL_PI * 0.3;
float plantSunlit = clamp(dot(reflectedLight.directDiffuse, vec3(1.0)) / max(plantReach, 0.0001), 0.0, 1.0);
outgoingLight += diffuseColor.rgb * directionalLights[0].color * RECIPROCAL_PI * plantThrough * ${plantLook.through.toFixed(2)} * mix(0.25, 1.0, plantSunlit);
#endif
#include <opaque_fragment>`,
      )
  }
  material.customProgramCacheKey = () => 'grounded-muted-plant'
}

export const plantSeasons = {
  autumn: [1.3, 0.92, 0.5],
} as const

export const plantKinds: Record<Landscape, readonly number[]> = {
  highlands: [4, 8, 9, 10, 11, 11],
  alpine: [4, 8, 10, 11, 11],
  desert: [3, 3, 3, 4, 12, 12, 12],
  forest: [4, 5, 6, 7, 8, 9, 10, 11],
  canyon: [3, 3, 4, 12, 12, 12],
  fjord: [4, 5, 7, 8, 10, 11],
  jungle: [5, 6, 7, 4, 13, 13, 13, 14, 14, 9],
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
    const reach = plantNearest + rng() ** 2.6 * (plantFarthest - plantNearest)
    const kind = options[Math.floor(rng() * options.length)] ?? 4
    const yaw = rng() * Math.PI * 2
    const spec = kinds[kind]
    const bare = world.settings.season === 'winter' && spec && 'leafy' in spec
    const [least, most] = spec?.size ?? [1, 1]
    const size = least + rng() * (most - least)
    const point = roadPoint(world.road(s), s, side * reach)
    if (world.height(point.x, point.s) < shoreHeight + 0.3) continue
    if (world.surface(point.x, point.s).onRoad || bare) continue
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
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[]
  rock: boolean
  leafy: boolean
  glow: number
  span: number
  base: number
}

interface Pool {
  model: PlantModel
  shadowed: boolean
  meshes: THREE.InstancedMesh[]
  free: number[]
  used: number
  capacity: number
}

const hidden = new THREE.Matrix4().makeScale(0, 0, 0)

export class Boulders {
  group = new StaticGroup()
  private pools = new Map<number, Pool>()
  private models: (PlantModel | null)[] = boulderLayout.kinds.map(() => null)
  private pose = new THREE.Object3D()
  private plain = new THREE.Color('#ffffff')
  private tone = new THREE.Color('#8c877a')
  private season: Season = 'summer'
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
          const parts: PlantModel['parts'] = []
          const box = new THREE.Box3()
          root?.traverse((part) => {
            if (!(part instanceof THREE.Mesh) || (kind.rock && parts.length)) return
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
            if (geometry.boundingBox) box.union(geometry.boundingBox)
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
                material.color.setScalar(kind.glow * plantLook.level)
              }
            }
            parts.push({ geometry, material })
          })
          if (!parts.length) return
          for (const part of parts) {
            part.geometry.translate(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2)
            part.geometry.computeVertexNormals()
          }
          if (!kind.rock)
            for (const part of parts)
              if (part.material instanceof THREE.MeshStandardMaterial)
                shadePlant(part.material, box.min.y, box.max.y - box.min.y)
          this.models[index] = {
            parts,
            rock: kind.rock,
            leafy: 'leafy' in kind,
            glow: kind.glow,
            span: Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 0.001),
            base: box.min.y,
          }
        }),
      ),
    ).then(
      () => {
        this.loaded = true
        this.tint(this.tone)
        this.dress(this.season)
      },
      () => {
        this.loaded = false
      },
    )
  }
  dress(season: Season) {
    this.season = season
    const [red, green, blue] = season === 'autumn' ? plantSeasons.autumn : [1, 1, 1]
    for (const model of this.models)
      if (model?.leafy)
        for (const part of model.parts)
          if (part.material instanceof THREE.MeshStandardMaterial && part.material.alphaTest > 0)
            part.material.color.setRGB(
              model.glow * plantLook.level * red,
              model.glow * plantLook.level * green,
              model.glow * plantLook.level * blue,
            )
  }
  tint(rock: THREE.ColorRepresentation) {
    this.tone.set(rock)
    for (const model of this.models)
      for (const part of model?.rock ? model.parts : [])
        if (part.material instanceof THREE.MeshStandardMaterial)
          part.material.color.copy(this.tone).lerp(this.plain, 0.35).multiplyScalar(1.9)
  }
  add(list: Boulder[], ground: (x: number, s: number) => number, shadowed: boolean) {
    const held: [Pool, number][] = []
    if (!this.loaded) return () => {}
    for (const boulder of list) {
      const model = this.models[boulder.kind]
      if (!model) continue
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
      const pool = this.pool(boulder.kind, model, shadowed)
      const slot = pool.free.pop() ?? pool.used++
      if (slot >= pool.capacity) this.grow(pool)
      for (const mesh of pool.meshes) {
        mesh.setMatrixAt(slot, this.pose.matrix)
        mesh.count = pool.used
        mesh.instanceMatrix.needsUpdate = true
      }
      held.push([pool, slot])
    }
    return () => {
      for (const [pool, slot] of held.splice(0)) {
        pool.free.push(slot)
        for (const mesh of pool.meshes) {
          mesh.setMatrixAt(slot, hidden)
          mesh.instanceMatrix.needsUpdate = true
        }
      }
    }
  }
  private pool(kind: number, model: PlantModel, shadowed: boolean) {
    const key = shadowed ? kind : -1 - kind
    let pool = this.pools.get(key)
    if (!pool) {
      pool = { model, shadowed, meshes: [], free: [], used: 0, capacity: 0 }
      this.pools.set(key, pool)
      this.grow(pool)
    }
    return pool
  }
  private grow(pool: Pool) {
    const capacity = Math.max(32, pool.capacity * 2)
    const meshes = pool.model.parts.map((part, index) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity)
      const before = pool.meshes[index]
      if (before) {
        mesh.instanceMatrix.array.set(before.instanceMatrix.array)
        this.group.remove(before)
        before.dispose()
      }
      mesh.count = pool.used
      mesh.castShadow = pool.shadowed
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      this.group.add(mesh)
      return mesh
    })
    pool.meshes = meshes
    pool.capacity = capacity
  }
  dispose() {
    for (const pool of this.pools.values()) for (const mesh of pool.meshes) mesh.dispose()
    this.pools.clear()
    this.group.clear()
    for (const model of this.models)
      for (const part of model?.parts ?? []) {
        part.geometry.dispose()
        for (const value of Object.values(part.material))
          if (value instanceof THREE.Texture) value.dispose()
        part.material.dispose()
      }
  }
}

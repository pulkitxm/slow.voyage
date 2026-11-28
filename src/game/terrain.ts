import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { asphaltTexture } from './asphalt'
import { type Boulder, Boulders, planBoulders, planPlants } from './boulders'
import { CanopyIndex, canopyShade, shadeStops, shadeTone, tuftLight } from './canopy'
import { type Trunk, trunkRadius } from './collision'
import { evergreenRelief, evergreenTile, Foliage, plantTint } from './foliage'
import {
  grassDead,
  grassFragmentColor,
  grassFragmentHead,
  grassFragmentNormal,
  grassGeometry,
  grassLighting,
  grassTexture,
  grassVertexBody,
  grassVertexHead,
  grassVertexNormal,
  slopeHeight,
  vergeHeight,
} from './grass'
import {
  groundGeometry,
  groundRows,
  groundTexture,
  MeadowMaterial,
  meadowNoise,
  vergeStart,
} from './ground'
import { groundLayout } from './ground-grid'
import { GroundSampler } from './ground-sample'
import { guardRailMaterial, guardRails } from './guard-rail'
import { landmarkFootprints, landmarkGeometry, landmarksBetween } from './landmarks'
import { landscapeProfiles } from './landscapes'
import { easyOpenLayout, fogHiding, lightOpenLayout, openLayout, openSurface } from './open-grid'
import { OpenGround } from './open-ground'
import { easySceneryLayout, lightSceneryLayout, OpenScenery, sceneryLayout } from './open-scenery'
import { fernGeometry, palmGeometry, palmLayout, palmMaterial } from './palms'
import { carFrame, type Driver } from './reactions'
import { roadCoordinates, roadLayout, roadPoint } from './road'
import { roadStrip } from './road-mesh'
import { RoadSurface } from './road-surface'
import { chevrons, chevronTexture, delineators, delineatorVertices } from './roadside'
import { RoamingMeadow } from './roaming-meadow'
import { loadRoadSurface } from './rock'
import { receiveUnbiasedShadows } from './shadow-receiver'
import { StaticGroup } from './static-group'
import {
  cragFootprint,
  cragGeometry,
  waterfallClearing,
  waterfallGeometry,
  waterfallMaterial,
  waterfallsNear,
} from './waterfalls'
import { coniferBuild, roadsidePlantHeight, woodlandTrees } from './woodland'
import { clamp, random, type Settings, type World } from './world'

const grassViewDistance = { full: 45, end: 120 }
const grassSway = 1.5
const canopyReach = 64
const stoneReach = { behind: 1, ahead: 5 }
const poolReach = { behind: 1, ahead: 3 }
const plantRootRecess = 0.1

function placeGrassOnGround(matrix: THREE.Matrix4, ground: GroundSampler) {
  const values = matrix.elements
  values[13] = ground.sample(values[12], -values[14]) - 0.025
  const xSlope = -ground.normal.x / ground.normal.y
  const zSlope = -ground.normal.z / ground.normal.y
  values[1] = xSlope * values[0] + zSlope * values[2]
  values[9] = xSlope * values[8] + zSlope * values[10]
}

export const palettes = {
  summer: { grass: '#7b9145', light: '#afbd70', tree: '#698344', shrub: '#72804d' },
  autumn: { grass: '#a69a64', light: '#c9b77a', tree: '#ad703b', shrub: '#b58d43' },
  winter: { grass: '#d7dfdc', light: '#edf0e7', tree: '#6f8176', shrub: '#9bada2' },
}
function terrainColors(settings: Settings) {
  const palette = palettes[settings.season]
  const profile = landscapeProfiles[settings.landscape]
  const ground = profile.sand || settings.season !== 'winter' ? profile.ground : null
  return {
    base: new THREE.Color(ground?.base ?? palette.grass),
    light: new THREE.Color(ground?.light ?? palette.light),
  }
}
export const foliageWarmth = 1.2
function shadeTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Shade texture canvas is unavailable')
  context.fillStyle = shadeTone(0)
  context.fillRect(0, 0, 64, 64)
  const fade = context.createRadialGradient(32, 32, 0, 32, 32, 31)
  for (const [away, depth] of shadeStops) fade.addColorStop(away, shadeTone(depth))
  context.fillStyle = fade
  context.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}
function viewLayouts(quality: Settings['quality'], software: boolean) {
  if (software) return { open: lightOpenLayout, scenery: lightSceneryLayout, fog: 0 }
  if (quality === 'low')
    return {
      open: easyOpenLayout,
      scenery: easySceneryLayout,
      fog: fogHiding(easyOpenLayout.reach),
    }
  return { open: openLayout, scenery: sceneryLayout, fog: 0 }
}

export const tileStreaming = {
  lead: 2,
  budget: 3,
  refreshBudget: 9,
  softwareRefresh: 110,
  unhurriedRefresh: 320,
  rebuildBehind: 15,
  rebuildAhead: 130,
  groundBatch: 2,
  grassBatch: 400,
  treeBatch: 30,
}

interface TileBuild {
  group: THREE.Group
  steps: Generator<undefined, void, undefined>
}

interface Soft {
  kind: 'post' | 'bush'
  x: number
  s: number
  radius: number
  down: boolean
  flatten(dirX: number, dirS: number): void
}

function bush(mesh: THREE.InstancedMesh, index: number, x: number, s: number, width: number): Soft {
  return {
    kind: 'bush',
    x,
    s,
    radius: Math.max(0.35, width * 0.32),
    down: false,
    flatten: () => {
      const matrix = new THREE.Matrix4()
      const position = new THREE.Vector3()
      const turn = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      mesh.getMatrixAt(index, matrix)
      matrix.decompose(position, turn, scale)
      scale.set(scale.x * 1.2, scale.y * 0.16, scale.z * 1.2)
      mesh.setMatrixAt(index, matrix.compose(position, turn, scale))
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}

export class Terrain {
  tiles = new Map<number, THREE.Group>()
  trunks = new Map<number, Trunk[]>()
  pools = new Map<number, CanopyIndex>()
  unhurried = false
  private softs = new Map<number, Soft[]>()
  builds = new Map<number, TileBuild>()
  retired: THREE.Group[] = []
  materials: THREE.Material[] = []
  sharedGeometries: THREE.BufferGeometry[] = []
  grassMaterial: MeadowMaterial
  openMaterial: MeadowMaterial
  open: OpenGround
  scenery: OpenScenery
  roadMaterial: THREE.MeshStandardMaterial
  edgeMaterial: THREE.MeshStandardMaterial
  railMaterial: THREE.MeshStandardMaterial
  furnitureMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  reflectorMaterial = new THREE.MeshStandardMaterial({
    color: '#ffd27a',
    emissive: '#ffb84d',
    emissiveIntensity: 0.25,
    roughness: 0.4,
  })
  landmarkMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
  })
  glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
  fallMaterial: THREE.MeshStandardMaterial
  fallWarmUp: THREE.Mesh
  palmMaterial = palmMaterial()
  palms = [palmGeometry(1), palmGeometry(2), palmGeometry(3)]
  fern = fernGeometry(1)
  shadeMaterial: THREE.MeshBasicMaterial | null = null
  shadeDisc = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
  chevronMaterial: THREE.MeshStandardMaterial
  foliage: Foliage
  bladeMaterial: THREE.MeshStandardMaterial
  blade: THREE.BufferGeometry
  bladeTexture: THREE.DataTexture
  bladeFootprint: number
  asphalt: THREE.CanvasTexture
  roadPhoto: ReturnType<typeof loadRoadSurface> | null = null
  boulders: Boulders | null = null
  groundTexture: THREE.CanvasTexture
  meadow: RoamingMeadow | null = null
  rebuilding = false
  fogFloor: number
  private current = 0
  windTime = { value: 0 }
  grassDead = { value: new THREE.Color() }
  roadWetness: { value: number }
  roadSurface: RoadSurface
  constructor(
    public scene: THREE.Scene,
    public world: World,
    public quality: Settings['quality'],
    public software: boolean,
  ) {
    this.groundTexture = groundTexture()
    const view = viewLayouts(quality, software)
    this.fogFloor = view.fog
    if (!software)
      this.shadeMaterial = new THREE.MeshBasicMaterial({
        color: '#0b130c',
        alphaMap: shadeTexture(),
        transparent: true,
        opacity: canopyShade.opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    this.chevronMaterial = new THREE.MeshStandardMaterial({
      map: chevronTexture(),
      side: THREE.DoubleSide,
      roughness: 0.6,
    })
    this.grassMaterial = new MeadowMaterial(this.groundTexture, world.settings, software)
    this.railMaterial = guardRailMaterial(this.grassMaterial.fieldUniforms.fieldNoiseMap)
    this.openMaterial = new MeadowMaterial(
      this.groundTexture,
      world.settings,
      software,
      this.grassMaterial,
    )
    this.open = new OpenGround(
      world,
      this.openMaterial,
      () => terrainColors(this.world.settings),
      tileStreaming.groundBatch,
      view.open,
    )
    this.open.group.userData.label = 'open-ground'
    scene.add(this.open.group)
    this.foliage = new Foliage(world.settings.season, software)
    this.tintFoliage(world.settings)
    this.scenery = new OpenScenery(
      world,
      this.foliage,
      this.shadeMaterial ? { material: this.shadeMaterial, disc: this.shadeDisc } : null,
      quality,
      view.scenery,
    )
    this.scenery.group.userData.label = 'open-scenery'
    scene.add(this.scenery.group)
    this.bladeTexture = grassTexture()
    this.grassDead.value.set(grassDead(world.settings.season))
    this.bladeMaterial = new THREE.MeshStandardMaterial({
      map: this.bladeTexture,
      alphaTest: 0.4,
      color: '#ffffff',
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
    })
    this.bladeMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.windTime = this.windTime
      shader.uniforms.grassDead = this.grassDead
      shader.uniforms.fieldDryGrass = this.grassMaterial.fieldUniforms.fieldDryGrass
      shader.uniforms.fieldDryness = this.grassMaterial.fieldUniforms.fieldDryness
      shader.uniforms.fieldMeadowShade = this.grassMaterial.fieldUniforms.fieldMeadowShade
      shader.uniforms.fieldNoiseMap = this.grassMaterial.fieldUniforms.fieldNoiseMap
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${grassVertexHead}\n${meadowNoise}`)
        .replace(
          '#include <defaultnormal_vertex>',
          `#include <defaultnormal_vertex>\n${grassVertexNormal}`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>\n${grassVertexBody(grassViewDistance.full, grassViewDistance.end)}`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${grassFragmentHead}`)
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>\n${grassFragmentNormal}`,
        )
        .replace(
          '#include <alphatest_fragment>',
          `#include <alphatest_fragment>\n${grassFragmentColor}`,
        )
        .replace('#include <opaque_fragment>', grassLighting)
    }
    this.bladeMaterial.customProgramCacheKey = () => 'grounded-distance-faded-varied-meadow-blades'
    this.asphalt = asphaltTexture()
    this.fallMaterial = waterfallMaterial(
      this.grassMaterial.fieldUniforms.fieldNoiseMap,
      this.windTime,
    )
    const warmUp = new THREE.BufferGeometry()
    warmUp.setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3))
    warmUp.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3))
    warmUp.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(6).fill(0), 2))
    warmUp.setAttribute('fallFlow', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3))
    this.fallWarmUp = new THREE.Mesh(warmUp, this.fallMaterial)
    this.fallWarmUp.frustumCulled = false
    scene.add(this.fallWarmUp)
    this.roadPhoto = software ? null : loadRoadSurface()
    this.grassMaterial.fieldUniforms.fieldStoneMap.value = this.roadPhoto?.albedo ?? null
    this.boulders = software ? null : new Boulders()
    if (this.boulders) scene.add(this.boulders.group)
    this.roadSurface = new RoadSurface(
      this.asphalt,
      this.roadPhoto,
      this.grassMaterial.fieldUniforms.fieldNoiseMap,
      this.windTime,
      software,
    )
    this.roadMaterial = this.roadSurface.material
    this.edgeMaterial = this.roadSurface.marking.material
    this.roadWetness = this.roadSurface.uniforms.roadWetness
    this.blade = grassGeometry()
    const bounds = this.blade.boundingBox
    if (!bounds) throw new Error('Grass bounds are unavailable')
    this.bladeFootprint =
      Math.hypot(
        Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
        Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
      ) +
      bounds.max.y ** 2 * 0.18 * Math.hypot(1, 0.6)
    this.materials = [
      this.grassMaterial,
      this.openMaterial,
      this.roadMaterial,
      this.edgeMaterial,
      this.railMaterial,
      this.furnitureMaterial,
      this.reflectorMaterial,
      this.landmarkMaterial,
      this.fallMaterial,
      this.palmMaterial,
      this.chevronMaterial,
      this.bladeMaterial,
    ]
    for (const material of this.materials) receiveUnbiasedShadows(material)
    this.sharedGeometries = [
      ...this.foliage.treeGeometries,
      ...this.foliage.winterShrubGeometries,
      this.blade,
      this.shadeDisc,
      ...this.palms,
      this.fern,
    ]
    if (!software) {
      this.meadow = new RoamingMeadow(
        this.blade,
        this.bladeMaterial,
        quality === 'low' ? 3600 : 12000,
        world,
        (s) => this.samplerAt(s),
        terrainColors(world.settings),
      )
      scene.add(this.meadow.mesh)
    }
  }
  openAt = (x: number, s: number) => openSurface(this.world, x, s)
  samplerAt(s: number) {
    const id = Math.floor(s / groundLayout.tileLength)
    const group = this.tiles.get(id)
    const ground = group?.getObjectByName('ground')
    if (!group || !(ground instanceof THREE.Mesh)) return null
    if (!(group.userData.sampler instanceof GroundSampler))
      group.userData.sampler = new GroundSampler(
        ground.geometry,
        id * groundLayout.tileLength,
        group.userData.groundRows,
        this.openAt,
      )
    return group.userData.sampler as GroundSampler
  }
  addMesh(group: THREE.Group, g: THREE.BufferGeometry, material: THREE.Material) {
    const mesh = new THREE.Mesh(g, material)
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  addBatch(group: THREE.Group, parts: THREE.BufferGeometry[], material: THREE.Material) {
    if (!parts.length) return
    const merged = mergeGeometries(parts)
    if (!merged) throw new Error('Road geometry could not be batched')
    for (const part of parts) part.dispose()
    return this.addMesh(group, merged, material)
  }
  brush(car: Driver) {
    const struck: Soft['kind'][] = []
    if (Math.abs(car.speed) < 1) return struck
    const tile = Math.floor(car.s / groundLayout.tileLength)
    const facing = Math.sign(car.speed) || 1
    const dirX = -Math.sin(car.yaw) * facing
    const dirS = Math.cos(car.yaw) * facing
    for (let id = tile - 1; id <= tile + 1; id++)
      for (const soft of this.softs.get(id) ?? []) {
        if (soft.down || Math.abs(soft.s - car.s) > 8) continue
        const { ahead, aside } = carFrame(car, soft.x, soft.s)
        if (
          ahead > car.front + soft.radius ||
          ahead < -car.rear - soft.radius ||
          Math.abs(aside) > car.halfWidth + soft.radius
        )
          continue
        soft.down = true
        soft.flatten(dirX, dirS)
        struck.push(soft.kind)
      }
    return struck
  }
  *buildTile(id: number, rows: number, group: THREE.Group): Generator<undefined, void, undefined> {
    const start = id * groundLayout.tileLength,
      settings = this.world.settings
    const rng = random(Math.imul(id, 967) + settings.seed * 137)
    const { base, light } = terrainColors(settings)
    const color = new THREE.Color()
    const ground = this.addMesh(
      group,
      yield* groundRows(this.world, start, base, light, rows, tileStreaming.groundBatch),
      this.grassMaterial,
    )
    ground.name = 'ground'
    group.userData.groundRows = rows
    const groundSurface = new GroundSampler(ground.geometry, start, rows, this.openAt)
    yield
    const road = roadStrip(
      this.world,
      start,
      groundLayout.tileLength,
      -roadLayout.halfWidth,
      roadLayout.halfWidth,
    )
    this.addMesh(group, road, this.roadMaterial)
    const markings: THREE.BufferGeometry[] = []
    for (const side of [-1, 1]) {
      const edge = side * (roadLayout.halfWidth - roadLayout.edgeInset)
      markings.push(
        roadStrip(
          this.world,
          start,
          groundLayout.tileLength,
          edge - roadLayout.edgeWidth / 2,
          edge + roadLayout.edgeWidth / 2,
          0.012,
        ),
      )
    }
    for (let s = start; s < start + groundLayout.tileLength; s += roadLayout.dashPeriod)
      markings.push(
        roadStrip(
          this.world,
          s,
          roadLayout.dashLength,
          -roadLayout.centerWidth / 2,
          roadLayout.centerWidth / 2,
          0.016,
        ),
      )
    this.addBatch(group, markings, this.edgeMaterial)
    yield
    const rails = guardRails(this.world, start, groundLayout.tileLength)
    this.addBatch(group, rails, this.railMaterial)
    yield
    const profile = landscapeProfiles[settings.landscape]
    const low = this.quality === 'low'
    const treeCount =
      low && profile.roadside.trees > 8
        ? Math.round((profile.roadside.trees * 4) / 7)
        : profile.roadside.trees
    const shrubCount =
      low && profile.roadside.shrubs > 20
        ? Math.round((profile.roadside.shrubs * 7) / 18)
        : profile.roadside.shrubs
    const clusters = Array.from({ length: 6 }, () => ({
      s: start + rng() * groundLayout.tileLength,
      d: (rng() > 0.5 ? 1 : -1) * (12 + rng() ** 1.5 * 250),
    }))
    const matrix = new THREE.Object3D()
    const trunks: Trunk[] = []
    const posts = delineators(this.world, start, groundLayout.tileLength)
    const signs = chevrons(this.world, start, groundLayout.tileLength)
    const frame = [...posts.posts, ...signs.posts]
    for (const foot of signs.feet) trunks.push({ ...foot, radius: 0.09 })
    const softs: Soft[] = []
    const stakes = this.addBatch(group, frame, this.furnitureMaterial)
    const studs = this.addBatch(group, posts.reflectors, this.reflectorMaterial)
    if (stakes && studs)
      for (const [index, spot] of posts.spots.entries())
        softs.push({
          kind: 'post',
          x: spot.x,
          s: spot.s,
          radius: 0.08,
          down: false,
          flatten: (dirX, dirS) => {
            for (const [mesh, count] of [
              [stakes, delineatorVertices.post],
              [studs, delineatorVertices.reflector],
            ] as const) {
              const position = mesh.geometry.getAttribute('position')
              for (let vertex = index * count; vertex < index * count + count; vertex++) {
                const dx = position.getX(vertex) - spot.x
                const dy = position.getY(vertex) - spot.y
                const dz = position.getZ(vertex) + spot.s
                const along = dx * dirX - dz * dirS
                const laid = along * Math.cos(1.46) + dy * Math.sin(1.46)
                const height = dy * Math.cos(1.46) - along * Math.sin(1.46)
                position.setXYZ(
                  vertex,
                  spot.x + dx + (laid - along) * dirX,
                  spot.y + Math.max(0.03, height + 0.06),
                  -spot.s + dz - (laid - along) * dirS,
                )
              }
              position.needsUpdate = true
            }
          },
        })
    this.softs.set(id, softs)
    this.addBatch(group, signs.panels, this.chevronMaterial)
    const falls = waterfallsNear(this.world, start + groundLayout.tileLength / 2)
    for (const fall of falls) {
      if (fall.s < start || fall.s >= start + groundLayout.tileLength) continue
      const water = this.addMesh(group, waterfallGeometry(this.world, fall), this.fallMaterial)
      water.renderOrder = 2
      this.addMesh(
        group,
        cragGeometry(this.world, fall, profile.field?.rock ?? '#807d74'),
        this.landmarkMaterial,
      ).castShadow = true
      trunks.push(...cragFootprint(fall))
    }
    for (const landmark of landmarksBetween(this.world, start, start + groundLayout.tileLength)) {
      const built = landmarkGeometry(landmark)
      if (built.body) this.addMesh(group, built.body, this.landmarkMaterial).castShadow = true
      if (built.glow) this.addMesh(group, built.glow, this.glowMaterial)
      trunks.push({ x: landmark.x, s: landmark.s, radius: landmarkFootprints[landmark.kind] })
    }
    if (this.boulders?.loaded) {
      const scattered = planBoulders(
        this.world,
        start,
        groundLayout.tileLength,
        random(Math.imul(id, 613) + settings.seed * 211 + 5),
      ).filter((boulder) => !waterfallClearing(falls, boulder.x, boulder.s))
      group.userData.stones = {
        list: [...scattered],
        ground: (x: number, s: number) => groundSurface.sample(x, s),
      }
      for (const boulder of scattered)
        trunks.push({ x: boulder.x, s: boulder.s, radius: boulder.radius })
      const planted = planPlants(
        this.world,
        start,
        groundLayout.tileLength,
        random(Math.imul(id, 389) + settings.seed * 97 + 11),
      ).filter(
        (plant) =>
          !waterfallClearing(falls, plant.x, plant.s) &&
          !scattered.some(
            (rock) => Math.hypot(rock.x - plant.x, rock.s - plant.s) < rock.radius + 0.8,
          ),
      )
      group.userData.stones.list.push(...planted)
      for (const plant of planted)
        if (plant.radius > 0) trunks.push({ x: plant.x, s: plant.s, radius: plant.radius })
    }
    yield
    const beside = this.world.road(start + groundLayout.tileLength / 2).x
    const overhead = woodlandTrees(
      this.world,
      beside - canopyReach,
      start,
      canopyReach * 2,
      groundLayout.tileLength,
    ).filter((tree) => !waterfallClearing(falls, tree.x, tree.s))
    if (profile.palms && settings.season !== 'winter') {
      const palmCount = low ? Math.round(profile.palms / 2) : profile.palms
      const fernCount = Math.round(palmCount * palmLayout.ferns)
      const pose = new THREE.Object3D()
      const plant = (geometry: THREE.BufferGeometry, count: number, palm: boolean) => {
        const mesh = new THREE.InstancedMesh(geometry, this.palmMaterial, count)
        let placed = 0
        for (let index = 0; index < count; index++) {
          const s = start + rng() * groundLayout.tileLength
          const side = rng() > 0.5 ? 1 : -1
          const reach =
            palmLayout.nearest + rng() ** 1.4 * (palmLayout.farthest - palmLayout.nearest)
          const size = palm ? 0.8 + rng() * 0.5 : 0.7 + rng() * 0.7
          const yaw = rng() * Math.PI * 2
          const point = roadPoint(this.world.road(s), s, side * (palm ? reach : reach * 0.6))
          const ground = roadsidePlantHeight(this.world, point.x, point.s)
          if (ground === null || waterfallClearing(falls, point.x, point.s)) continue
          pose.position.set(point.x, ground - 0.05, -point.s)
          pose.rotation.set(0, yaw, 0)
          pose.scale.setScalar(size)
          pose.updateMatrix()
          mesh.setMatrixAt(placed++, pose.matrix)
          if (palm) trunks.push({ x: point.x, s: point.s, radius: palmLayout.trunk * size * 1.4 })
        }
        mesh.count = placed
        mesh.castShadow = palm
        mesh.receiveShadow = true
        mesh.instanceMatrix.needsUpdate = true
        if (placed) group.add(mesh)
        else mesh.dispose()
      }
      for (const [index, geometry] of this.palms.entries())
        plant(geometry, Math.ceil(palmCount / this.palms.length) + (index ? 0 : 1), true)
      plant(this.fern, fernCount, false)
    }
    yield
    const conifers = Math.round(treeCount * profile.roadside.conifers)
    const narrow = Math.round(treeCount * profile.roadside.narrow)
    const broadleaf = treeCount - conifers - narrow
    const vegetationCounts = [
      Math.ceil(broadleaf / 2),
      Math.floor(broadleaf / 2),
      Math.ceil(shrubCount / 2),
      Math.floor(shrubCount / 2),
      conifers,
      narrow,
    ]
    const shades: number[] = []
    const relief = evergreenRelief(profile.foliage)
    for (let variant = 0; variant < vegetationCounts.length; variant++) {
      const geometry =
        settings.season === 'winter' && variant >= 2 && variant < 4
          ? this.foliage.winterShrubGeometries[variant - 2]
          : this.foliage.treeGeometries[variant]
      if (!geometry) continue
      const shrub = variant >= 2 && variant < 4
      const count = vegetationCounts[variant] ?? 0
      if (!count) continue
      const trees = new THREE.InstancedMesh(geometry, this.foliage.treeMaterial, count)
      let placed = 0
      for (let i = 0; i < count; i++) {
        const cluster = clusters[Math.floor(rng() * clusters.length)]
        if (!cluster) continue
        if (i && i % tileStreaming.treeBatch === 0) yield
        const clustered = rng() < 0.8
        const s = clustered
          ? clamp(cluster.s + (rng() - 0.5) * 38, start, start + groundLayout.tileLength)
          : start + rng() * groundLayout.tileLength
        const d = clustered
          ? cluster.d + (rng() - 0.5) * 35
          : (rng() > 0.5 ? 1 : -1) * (8 + rng() ** 1.6 * 350)
        if (Math.abs(d) < (shrub ? 7 : 12)) continue
        const x = this.world.road(s).x + d
        const elevation = roadsidePlantHeight(this.world, x, s)
        if (elevation === null) continue
        const h = shrub ? 2 + rng() * 4 : variant >= 4 ? 6 + rng() * 6 : 5 + rng() * 4
        matrix.position.set(x, groundSurface.sample(x, s) - plantRootRecess, -s)
        matrix.rotation.set(0, rng() * Math.PI, 0)
        const width =
          h *
          (shrub
            ? 0.85 + rng() * 0.35
            : variant === 4
              ? coniferBuild.slim + rng() * coniferBuild.spread
              : variant === 5
                ? 0.42 + rng() * 0.13
                : 0.9 + rng() * 0.2)
        matrix.scale.set(width, h, width)
        if (!shrub) trunks.push({ x, s, radius: trunkRadius(width) })
        else softs.push(bush(trees, placed, x, s, width))
        shades.push(x, s, width)
        matrix.updateMatrix()
        trees.setMatrixAt(placed, matrix.matrix)
        const tone = 0.88 + rng() * 0.24
        rng()
        rng()
        plantTint(color, tone, x, s)
        if (variant === evergreenTile) color.multiply(relief)
        trees.setColorAt(placed++, color)
      }
      trees.count = placed
      trees.castShadow = true
      trees.customDepthMaterial = this.foliage.shadowMaterial
      group.add(trees)
      yield
    }
    if (this.shadeMaterial && shades.length) {
      this.pools.set(id, new CanopyIndex(shades))
      const pools = new THREE.InstancedMesh(this.shadeDisc, this.shadeMaterial, shades.length / 3)
      pools.name = 'shade'
      pools.renderOrder = 1
      const pool = new THREE.Matrix4()
      for (let index = 0; index < shades.length; index += 3) {
        const x = shades[index] ?? 0
        const s = shades[index + 1] ?? 0
        const reach = (shades[index + 2] ?? 1) * canopyShade.spread
        const height = groundSurface.sample(x, s)
        const normal = groundSurface.normal
        pool.makeScale(reach, 1, reach)
        pool.elements[1] = (-normal.x / normal.y) * reach
        pool.elements[9] = (-normal.z / normal.y) * reach
        pool.setPosition(x, height + canopyShade.lift, -s)
        pools.setMatrixAt(index / 3, pool)
      }
      group.add(pools)
      yield
    }
    const count = this.software
      ? 600
      : this.quality === 'low'
        ? Math.min(2800, profile.grass)
        : profile.grass
    const grass = new THREE.InstancedMesh(this.blade, this.bladeMaterial, count)
    const canopy = this.shadeMaterial
      ? new CanopyIndex([...shades, ...overhead.flatMap((tree) => [tree.x, tree.s, tree.width])])
      : null
    grass.name = 'meadow'
    group.userData.grass = grass
    grass.receiveShadow = true
    let placedGrass = 0
    for (let i = 0; i < count; i++) {
      if (i && i % tileStreaming.grassBatch === 0) yield
      const s = start + rng() * groundLayout.tileLength,
        d =
          (rng() > 0.5 ? 1 : -1) *
          (roadLayout.halfWidth + roadLayout.shoulder + 0.15 + vergeStart(s) + rng() ** 2.2 * 23)
      const road = this.world.road(s)
      const x = road.x + d
      const roadsideDistance = Math.abs(roadCoordinates(this.world, x, s).distance)
      if (roadsideDistance < roadLayout.halfWidth + roadLayout.shoulder) continue
      const elevation = groundSurface.sample(x, s)
      if (elevation < 0.3 || groundSurface.normal.y < 0.65) continue
      if (elevation - road.y > 0.15 && Math.abs(d) < 18.5) {
        const slope = Math.abs(groundSurface.normal.x / groundSurface.normal.y)
        if (rng() < clamp((slope - 0.55) / 0.4, 0, 1)) continue
      }
      matrix.position.set(x, elevation, -s)
      matrix.rotation.set(0, rng() * 6.28, 0)
      const roadsideScale = (roadsideDistance - roadLayout.halfWidth - 0.05) / this.bladeFootprint
      matrix.scale.set(
        Math.min(0.8 + rng() * 0.8, roadsideScale),
        (0.55 + rng() * 0.65) *
          vergeHeight(roadsideDistance - roadLayout.halfWidth - roadLayout.shoulder) *
          slopeHeight(groundSurface.normal.y),
        Math.min(0.8 + rng() * 0.8, roadsideScale),
      )
      matrix.updateMatrix()
      placeGrassOnGround(matrix.matrix, groundSurface)
      grass.setMatrixAt(placedGrass, matrix.matrix)
      color
        .copy(base)
        .lerp(light, 0.12 + rng() * 0.7)
        .multiplyScalar(0.88 + rng() * 0.2)
      if (canopy) color.multiplyScalar(tuftLight(canopy.cover(x, s)))
      grass.setColorAt(placedGrass++, color)
    }
    grass.count = placedGrass
    grass.computeBoundingSphere()
    if (grass.boundingSphere) grass.boundingSphere.radius += grassSway
    group.add(grass)
    this.tiles.set(id, group)
    this.trunks.set(id, trunks)
    this.settleStones(id, group)
    this.scene.add(group)
  }
  update(s: number, time: number, cameraS: number, x = this.world.road(s).x) {
    this.windTime.value = time
    const current = Math.floor(s / groundLayout.tileLength),
      ahead = this.quality === 'low' ? 8 : 14
    const cameraTile = Math.floor(cameraS / groundLayout.tileLength)
    const near = Math.min(current, cameraTile) - 1
    const far = Math.max(current, cameraTile) + 1
    const rowsFor = (id: number) =>
      this.software && (id < near || id > far) ? groundLayout.distantRows : groundLayout.fullRows
    const outside = (id: number) => id < current - 4 || id > current + ahead
    for (const [id, group] of this.tiles) if (outside(id)) this.removeTile(id, group)
    for (const [id, build] of this.builds)
      if (outside(id)) {
        this.disposeGroup(build.group)
        this.builds.delete(id)
      }
    const urgent = (id: number) => id >= near - 1 && id <= far + tileStreaming.lead
    this.current = current
    for (let id = current - 4; id <= current + ahead; id++) {
      if (this.tiles.has(id)) continue
      let build = this.builds.get(id)
      if (!build) {
        const group = new StaticGroup()
        build = { group, steps: this.buildTile(id, rowsFor(id), group) }
        this.builds.set(id, build)
      }
      const immediate = this.rebuilding
        ? !this.software &&
          id >= Math.floor((s - tileStreaming.rebuildBehind) / groundLayout.tileLength) &&
          id <= Math.floor((s + tileStreaming.rebuildAhead) / groundLayout.tileLength)
        : urgent(id)
      if (immediate) {
        while (!build.steps.next().done);
        this.builds.delete(id)
      }
    }
    this.open.field.update(x, s)
    this.scenery.update(x, s)
    this.stream()
    for (const [id, group] of this.tiles) {
      this.settleStones(id, group)
      const gap = id - current
      const close = Math.abs(gap) <= 1
      if (group.userData.close !== close) {
        group.userData.close = close
        for (const child of group.children)
          if (child instanceof THREE.InstancedMesh && child.customDepthMaterial)
            child.castShadow = close
      }
      const shade = group.getObjectByName('shade')
      if (shade) shade.visible = gap >= -poolReach.behind && gap <= poolReach.ahead
      const rows = rowsFor(id)
      if (group.userData.groundRows !== rows) {
        const ground = group.getObjectByName('ground')
        if (ground instanceof THREE.Mesh) {
          const { base, light } = terrainColors(this.world.settings)
          ground.geometry.dispose()
          ground.geometry = groundGeometry(
            this.world,
            id * groundLayout.tileLength,
            base,
            light,
            rows,
          )
          group.userData.groundRows = rows
          group.userData.sampler = undefined
          const sampler = new GroundSampler(
            ground.geometry,
            id * groundLayout.tileLength,
            rows,
            this.openAt,
          )
          const matrix = new THREE.Matrix4()
          const grass = group.getObjectByName('meadow')
          if (grass instanceof THREE.InstancedMesh) {
            for (let index = 0; index < grass.count; index++) {
              grass.getMatrixAt(index, matrix)
              placeGrassOnGround(matrix, sampler)
              grass.setMatrixAt(index, matrix)
            }
            grass.instanceMatrix.needsUpdate = true
          }
          for (const plant of group.children) {
            if (
              !(plant instanceof THREE.InstancedMesh) ||
              plant.material !== this.foliage.treeMaterial
            )
              continue
            for (let index = 0; index < plant.count; index++) {
              plant.getMatrixAt(index, matrix)
              matrix.elements[13] =
                sampler.sample(matrix.elements[12], -matrix.elements[14]) - plantRootRecess
              plant.setMatrixAt(index, matrix)
            }
            plant.instanceMatrix.needsUpdate = true
            plant.computeBoundingSphere()
          }
        }
      }
      const grass = group.getObjectByName('meadow')
      if (grass)
        grass.visible =
          id * groundLayout.tileLength < cameraS + grassViewDistance.end &&
          (id + 1) * groundLayout.tileLength > cameraS - grassViewDistance.end
    }
    this.meadow?.update(x, s)
    let from = current
    let to = current
    while (this.tiles.has(from - 1)) from--
    while (this.tiles.has(to + 1)) to++
    if (this.tiles.has(current))
      this.openMaterial.corridorSpan.value.set(
        from * groundLayout.tileLength,
        (to + 1) * groundLayout.tileLength,
      )
    else this.openMaterial.corridorSpan.value.set(1, 0)
  }
  tintFoliage(settings: Settings) {
    const material = this.foliage.treeMaterial
    const tint = landscapeProfiles[settings.landscape].foliage
    material.color.set(tint ?? '#ffffff').multiplyScalar(tint ? foliageWarmth : 1)
    material.emissive.set(palettes[settings.season].tree).multiplyScalar(0.012)
  }
  setNight(dark: boolean) {
    this.foliage.treeMaterial.emissiveIntensity = dark ? 0.1 : 1
    this.glowMaterial.color.setScalar(dark ? 3.2 : 1.1)
    this.reflectorMaterial.emissiveIntensity = dark ? 1.8 : 0.25
  }
  prime(s: number, budget: number, x = this.world.road(s).x) {
    const current = Math.floor(s / groundLayout.tileLength)
    const deadline = performance.now() + budget
    let ready = 0
    const first = current - 2
    const last = current + 1 + tileStreaming.lead
    for (let id = first; id <= last; id++) {
      if (this.tiles.has(id)) {
        ready++
        continue
      }
      let build = this.builds.get(id)
      if (!build) {
        const group = new StaticGroup()
        build = { group, steps: this.buildTile(id, groundLayout.fullRows, group) }
        this.builds.set(id, build)
      }
      while (performance.now() < deadline) {
        if (!build.steps.next().done) continue
        this.builds.delete(id)
        ready++
        break
      }
      if (performance.now() >= deadline) break
    }
    const strips = last - first + 1
    if (ready < strips) return ready / (strips + 1)
    this.open.field.update(x, s)
    this.scenery.update(x, s)
    return this.open.field.work(deadline) && this.scenery.field.work(deadline)
      ? 1
      : strips / (strips + 1)
  }
  grassCover() {
    const cover: THREE.Object3D[] = []
    if (this.meadow) cover.push(this.meadow.mesh)
    for (const group of this.tiles.values())
      if (group.userData.grass instanceof THREE.Object3D) cover.push(group.userData.grass)
    return cover
  }
  shadeAt(x: number, s: number) {
    const tile = Math.floor(s / groundLayout.tileLength)
    let open = 1
    for (let id = tile - 1; id <= tile + 1; id++) {
      const pools = this.pools.get(id)
      if (pools) open *= 1 - pools.cover(x, s)
    }
    return 1 - open * (1 - this.scenery.shadeAt(x, s))
  }
  *trunksNear(s: number, x: number) {
    const tile = Math.floor(s / groundLayout.tileLength)
    for (let id = tile - 1; id <= tile + 1; id++) yield* this.trunks.get(id) ?? []
    yield* this.scenery.trunksNear(x, s)
  }
  stream() {
    if (!this.builds.size) this.rebuilding = false
    const budget = this.rebuilding
      ? this.software
        ? this.unhurried
          ? tileStreaming.unhurriedRefresh
          : tileStreaming.softwareRefresh
        : tileStreaming.refreshBudget
      : tileStreaming.budget
    const began = performance.now()
    const waiting = this.open.field.pending + this.scenery.field.pending
    const deadline = began + (waiting ? budget / 2 : budget)
    const priority = (id: number) =>
      id >= this.current ? id - this.current : (this.current - id) * 3
    for (const [id, build] of [...this.builds].sort((a, b) => priority(a[0]) - priority(b[0]))) {
      while (performance.now() < deadline) {
        if (build.steps.next().done) {
          this.builds.delete(id)
          break
        }
      }
      if (performance.now() >= deadline) break
    }
    if (!this.open.field.work(began + budget)) return
    if (!this.scenery.field.work(began + budget)) return
    if (this.builds.size) return
    const group = this.retired.pop()
    if (group) this.disposeGroup(group)
  }
  settleStones(id: number, group: THREE.Group) {
    const stones = group.userData.stones as
      | { list: Boulder[]; ground: (x: number, s: number) => number; near?: boolean | null }
      | undefined
    const gap = id - this.current
    const near = gap < -stoneReach.behind || gap > stoneReach.ahead ? null : Math.abs(gap) <= 1
    if (!stones || !this.boulders || stones.near === near) return
    group.userData.release?.()
    stones.near = near
    group.userData.release =
      near === null ? undefined : this.boulders.add(stones.list, stones.ground, near)
  }
  disposeGroup(group: THREE.Group) {
    group.userData.release?.()
    group.userData.release = undefined
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose()
      if (o instanceof THREE.Mesh && !this.sharedGeometries.includes(o.geometry))
        o.geometry.dispose()
    })
  }
  removeTile(id: number, group: THREE.Group) {
    this.scene.remove(group)
    group.userData.release?.()
    group.userData.release = undefined
    this.retired.push(group)
    this.tiles.delete(id)
    this.trunks.delete(id)
    this.pools.delete(id)
    this.softs.delete(id)
  }
  clear() {
    for (const [id, group] of this.tiles) this.removeTile(id, group)
    this.open.field.clear()
    this.scenery.field.clear()
    for (const build of this.builds.values()) this.disposeGroup(build.group)
    this.builds.clear()
    for (const group of this.retired.splice(0)) this.disposeGroup(group)
  }
  refresh(settings: Settings, quality: Settings['quality']) {
    this.quality = quality
    this.scenery.quality = quality
    const view = viewLayouts(quality, this.software)
    this.open.field.layout = view.open
    this.scenery.field.layout = view.scenery
    this.fogFloor = view.fog
    this.clear()
    this.rebuilding = true
    this.foliage.update(settings.season)
    this.tintFoliage(settings)
    this.grassMaterial.setAppearance(settings)
    this.grassDead.value.set(grassDead(settings.season))
    if (this.meadow) {
      this.meadow.palette = terrainColors(settings)
      this.meadow.reset()
    }
  }
  dispose() {
    this.clear()
    if (this.meadow) {
      this.scene.remove(this.meadow.mesh)
      this.meadow.dispose()
    }
    for (const material of this.materials) material.dispose()
    this.glowMaterial.dispose()
    this.shadeMaterial?.alphaMap?.dispose()
    this.shadeMaterial?.dispose()
    this.shadeDisc.dispose()
    this.chevronMaterial.map?.dispose()
    this.blade.dispose()
    this.bladeTexture.dispose()
    this.foliage.dispose()
    this.asphalt.dispose()
    if (this.boulders) this.scene.remove(this.boulders.group)
    this.boulders?.dispose()
    this.roadPhoto?.albedo.dispose()
    this.roadPhoto?.normal.dispose()
    this.roadSurface.dispose()
    this.fallWarmUp.removeFromParent()
    this.fallWarmUp.geometry.dispose()
    this.groundTexture.dispose()
    this.scene.remove(this.open.group, this.scenery.group)
  }
}

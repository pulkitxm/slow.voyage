import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { asphaltTexture } from './asphalt'
import { type Trunk, trunkRadius } from './collision'
import { loopCells, loopIndex, worldLoop } from './field'
import { Foliage } from './foliage'
import { grassGeometry, grassTexture } from './grass'
import { groundGeometry, groundRows, groundTexture, MeadowMaterial, meadowNoise } from './ground'
import { groundLayout } from './ground-grid'
import { GroundSampler } from './ground-sample'
import { landmarkFootprints, landmarkGeometry, lapLandmarks } from './landmarks'
import { landscapeProfiles } from './landscapes'
import { guardrailAt, roadCoordinates, roadLayout, roadPoint } from './road'
import { roadStrip } from './road-mesh'
import { bannerTexture, chevrons, chevronTexture, delineators, startGantry } from './roadside'
import { RoamingMeadow } from './roaming-meadow'
import { receiveUnbiasedShadows } from './shadow-receiver'
import { createWoodland, roadsidePlantHeight } from './woodland'
import { clamp, random, type Settings, type World } from './world'

const grassViewDistance = { full: 45, end: 120 }
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
function geometry(positions: number[], indices: number[], colors?: number[]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}
export const foliageWarmth = 1.5
export const seamTwins = { show: 150, hide: 100 }

function twinMesh(source: THREE.Mesh) {
  let twin: THREE.Mesh
  if (source instanceof THREE.InstancedMesh) {
    const instances = new THREE.InstancedMesh(source.geometry, source.material, 0)
    instances.instanceMatrix = source.instanceMatrix
    instances.instanceColor = source.instanceColor
    instances.count = source.count
    twin = instances
  } else twin = new THREE.Mesh(source.geometry, source.material)
  twin.name = source.name
  twin.castShadow = source.castShadow
  twin.receiveShadow = source.receiveShadow
  twin.frustumCulled = source.frustumCulled
  twin.userData.source = source
  return twin
}

function twinMatches(twin: THREE.Object3D | undefined, source: THREE.Object3D) {
  return (
    twin instanceof THREE.Mesh &&
    source instanceof THREE.Mesh &&
    twin.userData.source === source &&
    twin.geometry === source.geometry &&
    (!(source instanceof THREE.InstancedMesh) ||
      (twin instanceof THREE.InstancedMesh && twin.count === source.count))
  )
}

export const tileStreaming = {
  lead: 2,
  budget: 3,
  refreshBudget: 9,
  rebuildBehind: 15,
  rebuildAhead: 130,
  jump: 2,
  groundBatch: 8,
  grassBatch: 2500,
}

interface TileBuild {
  group: THREE.Group
  steps: Generator<undefined, void, undefined>
}

export class Terrain {
  tiles = new Map<number, THREE.Group>()
  twins = new Map<number, THREE.Group>()
  seamSide = 0
  private lastX = 0
  trunks = new Map<number, Trunk[]>()
  builds = new Map<number, TileBuild>()
  retired: THREE.Group[] = []
  materials: THREE.Material[] = []
  sharedGeometries: THREE.BufferGeometry[] = []
  grassMaterial: MeadowMaterial
  roadMaterial: THREE.MeshStandardMaterial
  edgeMaterial = new THREE.MeshStandardMaterial({ color: '#eeeedd', roughness: 1 })
  railMaterial = new THREE.MeshStandardMaterial({
    color: '#aeb6b6',
    metalness: 0.55,
    roughness: 0.45,
    side: THREE.DoubleSide,
  })
  furnitureMaterial = new THREE.MeshStandardMaterial({ color: '#e9e9e2', roughness: 0.7 })
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
  chevronMaterial: THREE.MeshStandardMaterial
  bannerMaterial: THREE.MeshStandardMaterial
  foliage: Foliage
  bladeMaterial: THREE.MeshStandardMaterial
  blade: THREE.BufferGeometry
  bladeTexture: THREE.DataTexture
  bladeFootprint: number
  asphalt: THREE.CanvasTexture
  groundTexture: THREE.CanvasTexture
  meadow: RoamingMeadow | null = null
  rebuilding = false
  private current = 0
  windTime = { value: 0 }
  roadWetness = { value: 0 }
  constructor(
    public scene: THREE.Scene,
    public world: World,
    public quality: Settings['quality'],
    public software: boolean,
    multisampling: boolean,
  ) {
    this.groundTexture = groundTexture()
    this.chevronMaterial = new THREE.MeshStandardMaterial({
      map: chevronTexture(),
      side: THREE.DoubleSide,
      roughness: 0.6,
    })
    this.bannerMaterial = new THREE.MeshStandardMaterial({
      map: bannerTexture(),
      side: THREE.DoubleSide,
      roughness: 0.8,
    })
    this.grassMaterial = new MeadowMaterial(this.groundTexture, world.settings, software)
    this.foliage = new Foliage(world.settings.season)
    this.tintFoliage(world.settings)
    this.bladeTexture = grassTexture()
    this.bladeMaterial = new THREE.MeshStandardMaterial({
      map: this.bladeTexture,
      alphaTest: 0.25,
      alphaToCoverage: multisampling,
      blending: multisampling ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      color: '#ffffff',
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
    })
    this.bladeMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.windTime = this.windTime
      shader.uniforms.fieldDryGrass = this.grassMaterial.fieldUniforms.fieldDryGrass
      shader.uniforms.fieldDryness = this.grassMaterial.fieldUniforms.fieldDryness
      shader.uniforms.fieldMeadowShade = this.grassMaterial.fieldUniforms.fieldMeadowShade
      shader.uniforms.fieldNoiseMap = this.grassMaterial.fieldUniforms.fieldNoiseMap
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nuniform float windTime;\nvarying vec2 fieldGrassPosition;\nvarying float fieldGrassVariation;\nvarying vec3 fieldGrassNormal;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
mat3 grassInstance = mat3(instanceMatrix);
mat3 grassNormal = mat3(cross(grassInstance[1], grassInstance[2]), cross(grassInstance[2], grassInstance[0]), cross(grassInstance[0], grassInstance[1]));
transformedNormal = normalMatrix * grassNormal * objectNormal;
fieldGrassNormal = normalMatrix * grassNormal * vec3(0.0, 1.0, 0.0);`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
fieldGrassPosition = root.xz;
fieldGrassVariation = fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453);
float wind = sin(root.x * 0.3 + root.z * 0.15 + windTime * 1.8);
transformed.xz += vec2(wind, wind * 0.6) * position.y * position.y * 0.18;
float grassDistance = length((viewMatrix * vec4(root, 1.0)).xyz);
transformed *= 1.0 - smoothstep(${grassViewDistance.full.toFixed(1)}, ${grassViewDistance.end.toFixed(1)}, grassDistance);`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\nvarying vec2 fieldGrassPosition;\nvarying float fieldGrassVariation;\nvarying vec3 fieldGrassNormal;\nuniform vec3 fieldDryGrass;\nuniform float fieldDryness;\nuniform vec3 fieldMeadowShade;\n${meadowNoise}`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal = normalize(mix(normal, normalize(fieldGrassNormal), 0.7));\nnonPerturbedNormal = normal;',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        '#include <alphatest_fragment>\nfloat dryBlend = smoothstep(0.35, 0.7, fieldVariationAt(fieldGrassPosition)) * fieldDryness;\nfloat strawBlend = smoothstep(0.72, 0.98, fieldGrassVariation) * min(0.7, fieldDryness * 2.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, fieldDryGrass * sampledDiffuseColor.rgb * diffuse * vColor.rgb * 1.08, max(dryBlend, strawBlend));\ndiffuseColor.rgb *= mix(vec3(1.0), fieldMeadowShade, fieldMeadowAt(fieldGrassPosition));\ndiffuseColor.rgb *= mix(vec3(0.84, 0.9, 0.8), vec3(1.12, 1.07, 0.94), fieldVariationAt(fieldGrassPosition * 0.13 + vec2(17.3, 61.9))) * 1.14;',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#if NUM_DIR_LIGHTS > 0
float grassBacklight = pow(max(dot(-normal, directionalLights[0].direction), 0.0), 2.0);
outgoingLight += diffuseColor.rgb * directionalLights[0].color * (0.025 + grassBacklight * 0.06);
#endif
#include <opaque_fragment>`,
      )
    }
    this.bladeMaterial.customProgramCacheKey = () => 'grounded-distance-faded-meadow'
    this.asphalt = asphaltTexture()
    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: this.asphalt,
      bumpMap: this.asphalt,
      bumpScale: 0.0015,
      color: '#c4ccd1',
      roughness: 0.98,
    })
    this.roadMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.roadWetness = this.roadWetness
      shader.uniforms.fieldNoiseMap = this.grassMaterial.fieldUniforms.fieldNoiseMap
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec2 roadPosition;\nvarying float roadLane;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nroadPosition = (modelMatrix * vec4(position, 1.0)).xz;\nroadLane = abs(uv.x - 0.5) * 2.0;',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\nvarying vec2 roadPosition;\nvarying float roadLane;\nuniform float roadWetness;\n${meadowNoise}`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor *= 0.94 + roadVariation * 0.06;\nfloat surfaceWetness = smoothstep(0.25, 0.75, roadSurfaceNoise);\nroughnessFactor = mix(roughnessFactor, mix(0.1, 0.46, surfaceWetness), roadWetness);',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat roadVariation = fieldVariationAt(roadPosition * 25.0);\nfloat roadSurfaceNoise = fieldVariationAt(roadPosition * 45.0);\ndiffuseColor.rgb *= (0.92 + roadVariation * 0.16) * mix(1.0, 0.68 + roadSurfaceNoise * 0.3, roadWetness);\nfloat roadTracks = (1.0 - smoothstep(0.0, 0.1, abs(roadLane - 0.27))) + (1.0 - smoothstep(0.0, 0.1, abs(roadLane - 0.73)));\nfloat roadPatchy = fieldVariationAt(roadPosition * 1.7 + vec2(5.0, 11.0));\ndiffuseColor.rgb *= 1.0 - roadTracks * (0.5 + roadPatchy * 0.5) * 0.11;\ndiffuseColor.rgb *= mix(1.0, 1.09, smoothstep(0.84, 1.0, roadLane));\ndiffuseColor.rgb *= 1.0 - smoothstep(0.69, 0.72, fieldVariationAt(roadPosition * 0.9 + vec2(31.0, 7.0))) * 0.1;',
      )
    }
    this.roadMaterial.customProgramCacheKey = () => 'aggregate-asphalt-worn'
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
      this.roadMaterial,
      this.edgeMaterial,
      this.railMaterial,
      this.furnitureMaterial,
      this.reflectorMaterial,
      this.landmarkMaterial,
      this.chevronMaterial,
      this.bannerMaterial,
      this.bladeMaterial,
    ]
    for (const material of this.materials) receiveUnbiasedShadows(material)
    this.sharedGeometries = [
      ...this.foliage.treeGeometries,
      ...this.foliage.winterShrubGeometries,
      this.blade,
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
    this.addMesh(group, merged, material)
  }
  *buildTile(id: number, rows: number, group: THREE.Group): Generator<undefined, void, undefined> {
    const start = id * groundLayout.tileLength,
      settings = this.world.settings
    const rng = random(
      loopIndex(id, loopCells(groundLayout.tileLength)) * 967 + settings.seed * 137,
    )
    const { base, light } = terrainColors(settings)
    const color = new THREE.Color()
    const ground = this.addMesh(
      group,
      yield* groundRows(this.world, start, base, light, rows, tileStreaming.groundBatch),
      this.grassMaterial,
    )
    ground.name = 'ground'
    group.userData.groundRows = rows
    const groundSurface = new GroundSampler(ground.geometry, start, rows)
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
    const rails: THREE.BufferGeometry[] = []
    for (const side of [-1, 1]) {
      for (let s = start; s < start + groundLayout.tileLength; s += roadLayout.railSegmentLength) {
        if (!guardrailAt(this.world, s, side)) continue
        const r1 = this.world.road(s),
          r2 = this.world.road(s + roadLayout.railSegmentLength),
          d = side * roadLayout.railOffset
        const profile: [number, number][] = [
          [0.429, 0.1],
          [0.51, 0],
          [0.56, 0.04],
          [0.61, 0.075],
          [0.6864, 0],
          [0.78, 0.1],
        ]
        for (let i = 0; i < profile.length - 1; i++) {
          const lower = profile[i],
            upper = profile[i + 1]
          if (!lower || !upper) continue
          const a = roadPoint(r1, s, d + side * lower[1])
          const b = roadPoint(r1, s, d + side * upper[1])
          const c = roadPoint(r2, s + roadLayout.railSegmentLength, d + side * lower[1])
          const e = roadPoint(r2, s + roadLayout.railSegmentLength, d + side * upper[1])
          rails.push(
            geometry(
              [
                a.x,
                r1.y + lower[0],
                -a.s,
                b.x,
                r1.y + upper[0],
                -b.s,
                c.x,
                r2.y + lower[0],
                -c.s,
                e.x,
                r2.y + upper[0],
                -e.s,
              ],
              side < 0 ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2],
            ),
          )
        }
        const post = new THREE.BoxGeometry(0.13, 0.8, 0.12)
        post.deleteAttribute('uv')
        const point = roadPoint(r1, s, d + side * 0.1)
        post.rotateY(r1.yaw)
        post.translate(point.x, r1.y + 0.38, -point.s)
        rails.push(post)
      }
    }
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
    if (loopIndex(id, loopCells(groundLayout.tileLength)) === 0) {
      const gantry = startGantry(this.world, start)
      frame.push(...gantry.frame)
      this.addMesh(group, gantry.banner, this.bannerMaterial)
      for (const foot of gantry.feet) trunks.push({ ...foot, radius: 0.2 })
    }
    this.addBatch(group, frame, this.furnitureMaterial)
    this.addBatch(group, posts.reflectors, this.reflectorMaterial)
    this.addBatch(group, signs.panels, this.chevronMaterial)
    const lap = Math.floor(start / worldLoop.length) * worldLoop.length
    for (const landmark of lapLandmarks(this.world)) {
      const s = landmark.s + lap
      if (s < start || s >= start + groundLayout.tileLength) continue
      const built = landmarkGeometry({ ...landmark, s })
      if (built.body) this.addMesh(group, built.body, this.landmarkMaterial).castShadow = true
      if (built.glow) this.addMesh(group, built.glow, this.glowMaterial)
      trunks.push({ x: landmark.x, s, radius: landmarkFootprints[landmark.kind] })
    }
    yield
    const woodland = createWoodland(this.world, id, this.quality)
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
    for (let variant = 0; variant < vegetationCounts.length; variant++) {
      const geometry =
        settings.season === 'winter' && variant >= 2 && variant < 4
          ? this.foliage.winterShrubGeometries[variant - 2]
          : this.foliage.treeGeometries[variant]
      if (!geometry) continue
      const shrub = variant >= 2 && variant < 4
      const count = vegetationCounts[variant] ?? 0
      const forest = woodland.filter((tree) => tree.variant === variant)
      if (!count && !forest.length) continue
      const trees = new THREE.InstancedMesh(
        geometry,
        this.foliage.treeMaterial,
        count + forest.length,
      )
      let placed = 0
      for (let i = 0; i < count; i++) {
        const cluster = clusters[Math.floor(rng() * clusters.length)]
        if (!cluster) continue
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
              ? 0.42 + rng() * 0.16
              : variant === 5
                ? 0.42 + rng() * 0.13
                : 0.9 + rng() * 0.2)
        matrix.scale.set(width, h, width)
        if (!shrub) trunks.push({ x, s, radius: trunkRadius(width) })
        matrix.updateMatrix()
        trees.setMatrixAt(placed, matrix.matrix)
        trees.setColorAt(placed++, new THREE.Color().setScalar(0.88 + rng() * 0.24))
      }
      for (const tree of forest) {
        matrix.position.set(tree.x, groundSurface.sample(tree.x, tree.s) - plantRootRecess, -tree.s)
        matrix.rotation.set(0, tree.yaw, 0)
        matrix.scale.set(tree.width, tree.height, tree.width)
        if (!shrub) trunks.push({ x: tree.x, s: tree.s, radius: trunkRadius(tree.width) })
        matrix.updateMatrix()
        trees.setMatrixAt(placed, matrix.matrix)
        trees.setColorAt(placed++, color.setScalar(tree.shade))
      }
      trees.count = placed
      trees.castShadow = true
      group.add(trees)
      yield
    }
    const count = this.software
      ? 600
      : this.quality === 'low'
        ? Math.min(2800, profile.grass)
        : profile.grass
    const grass = new THREE.InstancedMesh(this.blade, this.bladeMaterial, count)
    grass.name = 'meadow'
    grass.receiveShadow = true
    grass.frustumCulled = false
    let placedGrass = 0
    for (let i = 0; i < count; i++) {
      if (i && i % tileStreaming.grassBatch === 0) yield
      const s = start + rng() * groundLayout.tileLength,
        d =
          (rng() > 0.5 ? 1 : -1) *
          (roadLayout.halfWidth + roadLayout.shoulder + 0.15 + rng() ** 2.2 * 23)
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
        0.55 + rng() * 0.65,
        Math.min(0.8 + rng() * 0.8, roadsideScale),
      )
      matrix.updateMatrix()
      placeGrassOnGround(matrix.matrix, groundSurface)
      grass.setMatrixAt(placedGrass, matrix.matrix)
      color
        .copy(base)
        .lerp(light, 0.12 + rng() * 0.7)
        .multiplyScalar(0.88 + rng() * 0.2)
      grass.setColorAt(placedGrass++, color)
    }
    grass.count = placedGrass
    group.add(grass)
    this.tiles.set(id, group)
    this.trunks.set(id, trunks)
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
    let missing = 0
    for (let id = current - 4; id <= current + ahead; id++)
      if (!this.tiles.has(id) && !this.builds.has(id)) missing++
    const jump = missing > tileStreaming.jump && !this.rebuilding
    this.current = current
    for (let id = current - 4; id <= current + ahead; id++) {
      if (this.tiles.has(id)) continue
      let build = this.builds.get(id)
      if (!build) {
        const group = new THREE.Group()
        build = { group, steps: this.buildTile(id, rowsFor(id), group) }
        this.builds.set(id, build)
      }
      const immediate = this.rebuilding
        ? id >= Math.floor((s - tileStreaming.rebuildBehind) / groundLayout.tileLength) &&
          id <= Math.floor((s + tileStreaming.rebuildAhead) / groundLayout.tileLength)
        : jump || id <= far + tileStreaming.lead
      if (immediate) {
        while (!build.steps.next().done);
        this.builds.delete(id)
      }
    }
    this.stream()
    for (const [id, group] of this.tiles) {
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
          const sampler = new GroundSampler(ground.geometry, id * groundLayout.tileLength, rows)
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
    const offset = x - this.world.road(s).x
    if (Math.abs(offset) > seamTwins.show) this.seamSide = Math.sign(offset)
    else if (Math.abs(offset) < seamTwins.hide) this.seamSide = 0
    this.syncTwins()
    const wrapped = Math.abs(x - this.lastX) > worldLoop.width / 2
    this.lastX = x
    this.meadow?.update(x, s, wrapped)
  }
  tintFoliage(settings: Settings) {
    const material = this.foliage.treeMaterial
    const tint = landscapeProfiles[settings.landscape].foliage
    material.color.set(tint ?? '#ffffff').multiplyScalar(tint ? foliageWarmth : 1)
    material.emissive.set(palettes[settings.season].tree).multiplyScalar(0.09)
  }
  setNight(dark: boolean) {
    this.foliage.treeMaterial.emissiveIntensity = dark ? 0.1 : 1
    this.glowMaterial.color.setScalar(dark ? 3.2 : 1.1)
    this.reflectorMaterial.emissiveIntensity = dark ? 1.8 : 0.25
  }
  syncTwins() {
    for (const [id, twin] of this.twins) {
      if (this.tiles.get(id) === twin.userData.source) continue
      this.scene.remove(twin)
      this.twins.delete(id)
    }
    if (!this.seamSide) {
      for (const twin of this.twins.values()) twin.visible = false
      return
    }
    for (const [id, group] of this.tiles) {
      let twin = this.twins.get(id)
      if (!twin) {
        twin = new THREE.Group()
        twin.userData.source = group
        this.twins.set(id, twin)
        this.scene.add(twin)
      }
      twin.visible = true
      twin.position.x = this.seamSide * worldLoop.width
      const current =
        twin.children.length === group.children.length &&
        group.children.every((source, index) => twinMatches(twin.children[index], source))
      if (!current) {
        twin.clear()
        for (const source of group.children)
          if (source instanceof THREE.Mesh) twin.add(twinMesh(source))
      }
      for (const [index, source] of group.children.entries()) {
        const copy = twin.children[index]
        if (copy) copy.visible = source.visible
      }
    }
  }
  prime(s: number, budget: number) {
    const current = Math.floor(s / groundLayout.tileLength)
    const ahead = this.quality === 'low' ? 8 : 14
    const deadline = performance.now() + budget
    let ready = 0
    for (let id = current - 4; id <= current + ahead; id++) {
      if (this.tiles.has(id)) {
        ready++
        continue
      }
      let build = this.builds.get(id)
      if (!build) {
        const group = new THREE.Group()
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
    return ready / (ahead + 5)
  }
  *trunksNear(s: number) {
    const tile = Math.floor(s / groundLayout.tileLength)
    for (let id = tile - 1; id <= tile + 1; id++) yield* this.trunks.get(id) ?? []
  }
  stream() {
    if (!this.builds.size) this.rebuilding = false
    const budget = this.rebuilding ? tileStreaming.refreshBudget : tileStreaming.budget
    const deadline = performance.now() + budget
    const priority = (id: number) =>
      id >= this.current ? id - this.current : (this.current - id) * 3
    for (const [id, build] of [...this.builds].sort((a, b) => priority(a[0]) - priority(b[0]))) {
      while (performance.now() < deadline) {
        if (build.steps.next().done) {
          this.builds.delete(id)
          break
        }
      }
      if (performance.now() >= deadline) return
    }
    const group = this.retired.pop()
    if (group) this.disposeGroup(group)
  }
  disposeGroup(group: THREE.Group) {
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose()
      if (o instanceof THREE.Mesh && !this.sharedGeometries.includes(o.geometry))
        o.geometry.dispose()
    })
  }
  removeTile(id: number, group: THREE.Group) {
    this.scene.remove(group)
    this.retired.push(group)
    this.tiles.delete(id)
    this.trunks.delete(id)
  }
  clear() {
    for (const twin of this.twins.values()) this.scene.remove(twin)
    this.twins.clear()
    for (const [id, group] of this.tiles) this.removeTile(id, group)
    for (const build of this.builds.values()) this.disposeGroup(build.group)
    this.builds.clear()
    for (const group of this.retired.splice(0)) this.disposeGroup(group)
  }
  refresh(settings: Settings, quality: Settings['quality']) {
    this.quality = quality
    this.clear()
    this.rebuilding = true
    this.foliage.update(settings.season)
    this.tintFoliage(settings)
    this.grassMaterial.setAppearance(settings)
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
    this.chevronMaterial.map?.dispose()
    this.bannerMaterial.map?.dispose()
    this.blade.dispose()
    this.bladeTexture.dispose()
    this.foliage.dispose()
    this.asphalt.dispose()
    this.groundTexture.dispose()
  }
}

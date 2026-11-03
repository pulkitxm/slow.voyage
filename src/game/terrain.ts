import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { asphaltTexture } from './asphalt'
import { Foliage } from './foliage'
import { grassGeometry, grassTexture } from './grass'
import { groundGeometry, groundTexture, MeadowMaterial, meadowNoise } from './ground'
import { GroundSampler } from './ground-sample'
import { guardrailAt, roadCoordinates, roadLayout, roadPoint } from './road'
import { roadStrip } from './road-mesh'
import { createWoodland, roadsidePlantHeight } from './woodland'
import { clamp, random, type Settings, type World } from './world'

const grassViewDistance = { full: 45, end: 120 }

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
  return {
    base: new THREE.Color(settings.landscape === 'desert' ? '#c8ad7f' : palette.grass),
    light: new THREE.Color(settings.landscape === 'desert' ? '#ddc291' : palette.light),
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
export class Terrain {
  tiles = new Map<number, THREE.Group>()
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
  foliage: Foliage
  bladeMaterial: THREE.MeshStandardMaterial
  blade: THREE.BufferGeometry
  bladeTexture: THREE.DataTexture
  bladeFootprint: number
  asphalt: THREE.CanvasTexture
  groundTexture: THREE.CanvasTexture
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
    this.grassMaterial = new MeadowMaterial(this.groundTexture, world.settings)
    this.foliage = new Foliage(world.settings.season)
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
      color: '#cbcbcb',
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
        '#include <alphatest_fragment>\nfloat dryBlend = smoothstep(0.35, 0.7, fieldVariationAt(fieldGrassPosition)) * fieldDryness;\nfloat strawBlend = smoothstep(0.72, 0.98, fieldGrassVariation) * min(0.7, fieldDryness * 2.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, fieldDryGrass * sampledDiffuseColor.rgb * diffuse * vColor.rgb * 1.08, max(dryBlend, strawBlend));\ndiffuseColor.rgb *= mix(vec3(1.0), fieldMeadowShade, fieldMeadowAt(fieldGrassPosition));',
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
        '#include <common>\nvarying vec2 roadPosition;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nroadPosition = (modelMatrix * vec4(position, 1.0)).xz;',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\nvarying vec2 roadPosition;\nuniform float roadWetness;\n${meadowNoise}`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor *= 0.94 + roadVariation * 0.06;\nfloat surfaceWetness = smoothstep(0.25, 0.75, roadSurfaceNoise);\nroughnessFactor = mix(roughnessFactor, mix(0.1, 0.46, surfaceWetness), roadWetness);',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat roadVariation = fieldVariationAt(roadPosition * 25.0);\nfloat roadSurfaceNoise = fieldVariationAt(roadPosition * 45.0);\ndiffuseColor.rgb *= (0.92 + roadVariation * 0.16) * mix(1.0, 0.68 + roadSurfaceNoise * 0.3, roadWetness);',
      )
    }
    this.roadMaterial.customProgramCacheKey = () => 'aggregate-asphalt'
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
      this.bladeMaterial,
    ]
    this.sharedGeometries = [
      ...this.foliage.treeGeometries,
      ...this.foliage.winterShrubGeometries,
      this.blade,
    ]
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
  createTile(id: number, rows: number) {
    const start = id * 120,
      group = new THREE.Group(),
      settings = this.world.settings
    const rng = random(id * 967 + settings.seed * 137)
    const { base, light } = terrainColors(settings)
    const color = new THREE.Color()
    const ground = this.addMesh(
      group,
      groundGeometry(this.world, start, base, light, rows),
      this.grassMaterial,
    )
    ground.name = 'ground'
    group.userData.groundRows = rows
    const road = roadStrip(this.world, start, 120, -roadLayout.halfWidth, roadLayout.halfWidth)
    this.addMesh(group, road, this.roadMaterial)
    const markings: THREE.BufferGeometry[] = []
    for (const side of [-1, 1]) {
      const edge = side * (roadLayout.halfWidth - roadLayout.edgeInset)
      markings.push(
        roadStrip(
          this.world,
          start,
          120,
          edge - roadLayout.edgeWidth / 2,
          edge + roadLayout.edgeWidth / 2,
          0.012,
        ),
      )
    }
    for (let s = start; s < start + 120; s += roadLayout.dashPeriod)
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
    const rails: THREE.BufferGeometry[] = []
    for (const side of [-1, 1]) {
      for (let s = start; s < start + 120; s += roadLayout.railSegmentLength) {
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
    const treeCount = settings.landscape === 'desert' ? 4 : this.quality === 'low' ? 16 : 28
    const shrubCount = settings.landscape === 'desert' ? 12 : this.quality === 'low' ? 70 : 180
    const clusters = Array.from({ length: 6 }, () => ({
      s: start + rng() * 120,
      d: (rng() > 0.5 ? 1 : -1) * (12 + rng() ** 1.5 * 250),
    }))
    const matrix = new THREE.Object3D()
    const woodland = createWoodland(this.world, id, this.quality)
    const conifers =
      settings.landscape === 'desert'
        ? 0
        : Math.round(treeCount * (settings.landscape === 'alpine' ? 0.7 : 0.3))
    const narrow = settings.landscape === 'desert' ? 0 : Math.round(treeCount * 0.15)
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
          ? clamp(cluster.s + (rng() - 0.5) * 38, start, start + 120)
          : start + rng() * 120
        const d = clustered
          ? cluster.d + (rng() - 0.5) * 35
          : (rng() > 0.5 ? 1 : -1) * (8 + rng() ** 1.6 * 350)
        if (Math.abs(d) < (shrub ? 7 : 12)) continue
        const x = this.world.road(s).x + d
        const elevation = roadsidePlantHeight(this.world, x, s)
        if (elevation === null) continue
        const h = shrub ? 2 + rng() * 4 : variant >= 4 ? 6 + rng() * 6 : 5 + rng() * 4
        matrix.position.set(x, elevation - 0.1, -s)
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
        matrix.updateMatrix()
        trees.setMatrixAt(placed, matrix.matrix)
        trees.setColorAt(placed++, new THREE.Color().setScalar(0.88 + rng() * 0.24))
      }
      for (const tree of forest) {
        matrix.position.set(tree.x, tree.y, -tree.s)
        matrix.rotation.set(0, tree.yaw, 0)
        matrix.scale.set(tree.width, tree.height, tree.width)
        matrix.updateMatrix()
        trees.setMatrixAt(placed, matrix.matrix)
        trees.setColorAt(placed++, color.setScalar(tree.shade))
      }
      trees.count = placed
      trees.castShadow = true
      group.add(trees)
    }
    const count = this.software
      ? 600
      : settings.landscape === 'desert'
        ? 1200
        : this.quality === 'low'
          ? 2800
          : 10000
    const grass = new THREE.InstancedMesh(this.blade, this.bladeMaterial, count)
    grass.name = 'meadow'
    grass.frustumCulled = false
    const grassGround = new GroundSampler(ground.geometry, start, rows)
    let placedGrass = 0
    for (let i = 0; i < count; i++) {
      const s = start + rng() * 120,
        d =
          (rng() > 0.5 ? 1 : -1) *
          (roadLayout.halfWidth + roadLayout.shoulder + 0.15 + rng() ** 2.2 * 23)
      const road = this.world.road(s)
      const x = road.x + d
      const roadsideDistance = Math.abs(roadCoordinates(this.world, x, s).distance)
      if (roadsideDistance < roadLayout.halfWidth + roadLayout.shoulder) continue
      const elevation = grassGround.sample(x, s)
      if (elevation < 0.3 || grassGround.normal.y < 0.65) continue
      if (elevation - road.y > 0.15 && Math.abs(d) < 18.5) {
        const slope = Math.abs(grassGround.normal.x / grassGround.normal.y)
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
      placeGrassOnGround(matrix.matrix, grassGround)
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
    this.scene.add(group)
  }
  update(s: number, time: number, cameraS: number) {
    this.windTime.value = time
    const current = Math.floor(s / 120),
      ahead = this.quality === 'low' ? 8 : 14
    const cameraTile = Math.floor(cameraS / 120)
    const near = Math.min(current, cameraTile) - 1
    const far = Math.max(current, cameraTile) + 1
    const rowsFor = (id: number) => (this.software && (id < near || id > far) ? 12 : 96)
    for (const [id, group] of this.tiles)
      if (id < current - 4 || id > current + ahead) this.removeTile(id, group)
    for (let id = current - 4; id <= current + ahead; id++)
      if (!this.tiles.has(id)) this.createTile(id, rowsFor(id))
    for (const [id, group] of this.tiles) {
      const rows = rowsFor(id)
      if (group.userData.groundRows !== rows) {
        const ground = group.getObjectByName('ground')
        if (ground instanceof THREE.Mesh) {
          const { base, light } = terrainColors(this.world.settings)
          ground.geometry.dispose()
          ground.geometry = groundGeometry(this.world, id * 120, base, light, rows)
          group.userData.groundRows = rows
          const grass = group.getObjectByName('meadow')
          if (grass instanceof THREE.InstancedMesh) {
            const sampler = new GroundSampler(ground.geometry, id * 120, rows)
            const matrix = new THREE.Matrix4()
            for (let index = 0; index < grass.count; index++) {
              grass.getMatrixAt(index, matrix)
              placeGrassOnGround(matrix, sampler)
              grass.setMatrixAt(index, matrix)
            }
            grass.instanceMatrix.needsUpdate = true
          }
        }
      }
      const grass = group.getObjectByName('meadow')
      if (grass)
        grass.visible =
          id * 120 < cameraS + grassViewDistance.end &&
          (id + 1) * 120 > cameraS - grassViewDistance.end
    }
  }
  removeTile(id: number, group: THREE.Group) {
    this.scene.remove(group)
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose()
      if (o instanceof THREE.Mesh && !this.sharedGeometries.includes(o.geometry))
        o.geometry.dispose()
    })
    this.tiles.delete(id)
  }
  refresh(settings: Settings, quality: Settings['quality']) {
    this.quality = quality
    for (const [id, group] of this.tiles) this.removeTile(id, group)
    this.foliage.update(settings.season)
    this.grassMaterial.setAppearance(settings)
  }
  dispose() {
    for (const [id, group] of this.tiles) this.removeTile(id, group)
    for (const material of this.materials) material.dispose()
    this.blade.dispose()
    this.bladeTexture.dispose()
    this.foliage.dispose()
    this.asphalt.dispose()
    this.groundTexture.dispose()
  }
}

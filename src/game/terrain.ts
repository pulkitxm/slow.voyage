import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Foliage } from './foliage'
import { groundGeometry, groundTexture, MeadowMaterial, meadowNoise } from './ground'
import { createWoodland, roadsidePlantHeight } from './woodland'
import { clamp, random, type Settings, type World } from './world'

export const palettes = {
  summer: { grass: '#819e48', light: '#b2c76b', tree: '#698344', shrub: '#72804d' },
  autumn: { grass: '#a69a64', light: '#c9b77a', tree: '#ad703b', shrub: '#b58d43' },
  winter: { grass: '#d7dfdc', light: '#edf0e7', tree: '#6f8176', shrub: '#9bada2' },
}
function geometry(positions: number[], indices: number[], colors?: number[]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}
function strip(world: World, start: number, left: number, right: number, lift: number) {
  const p: number[] = [],
    indices: number[] = []
  for (let i = 0; i <= 24; i++) {
    const s = start + i * 5,
      r = world.road(s)
    p.push(r.x + left, r.y + lift, -s, r.x + right, r.y + lift, -s)
    if (i < 24) {
      const n = i * 2
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2)
    }
  }
  return geometry(p, indices)
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
  asphalt: THREE.CanvasTexture
  groundTexture: THREE.CanvasTexture
  windTime = { value: 0 }
  roadWetness = { value: 0 }
  constructor(
    public scene: THREE.Scene,
    public world: World,
    public quality: Settings['quality'],
  ) {
    this.groundTexture = groundTexture()
    this.grassMaterial = new MeadowMaterial(this.groundTexture, world.settings)
    this.foliage = new Foliage(world.settings.season)
    this.bladeMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
    })
    this.bladeMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.windTime = this.windTime
      shader.uniforms.fieldDryGrass = this.grassMaterial.fieldUniforms.fieldDryGrass
      shader.uniforms.fieldDryness = this.grassMaterial.fieldUniforms.fieldDryness
      shader.uniforms.fieldNoiseMap = this.grassMaterial.fieldUniforms.fieldNoiseMap
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nuniform float windTime;\nvarying vec2 fieldGrassPosition;\nvarying float fieldGrassVariation;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;\nfieldGrassPosition = root.xz;\nfieldGrassVariation = fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453);\nfloat wind = sin(root.x * 0.3 + root.z * 0.15 + windTime * 1.8);\ntransformed.xz += vec2(wind, wind * 0.6) * position.y * position.y * 0.18;',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\nvarying vec2 fieldGrassPosition;\nvarying float fieldGrassVariation;\nuniform vec3 fieldDryGrass;\nuniform float fieldDryness;\n${meadowNoise}`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat dryBlend = smoothstep(0.35, 0.7, fieldVariationAt(fieldGrassPosition)) * fieldDryness;\nfloat strawBlend = smoothstep(0.72, 0.98, fieldGrassVariation) * min(0.7, fieldDryness * 2.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, fieldDryGrass * 1.08, max(dryBlend, strawBlend));',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#if NUM_DIR_LIGHTS > 0
float grassBacklight = pow(max(dot(-normal, directionalLights[0].direction), 0.0), 2.0);
outgoingLight += diffuseColor.rgb * directionalLights[0].color * (0.06 + grassBacklight * 0.12);
#endif
#include <opaque_fragment>`,
      )
    }
    this.bladeMaterial.customProgramCacheKey = () => 'translucent-meadow-blades'
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable')
    const data = ctx.createImageData(256, 256)
    const rng = random(14)
    for (let i = 0; i < data.data.length; i += 4) {
      const c = 133 + rng() * 10
      data.data.set([c, c + 3, c + 3, 255], i)
    }
    ctx.putImageData(data, 0, 0)
    this.asphalt = new THREE.CanvasTexture(canvas)
    this.asphalt.wrapS = this.asphalt.wrapT = THREE.RepeatWrapping
    this.asphalt.repeat.set(6, 80)
    this.asphalt.anisotropy = 8
    this.asphalt.colorSpace = THREE.SRGBColorSpace
    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: this.asphalt,
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
        '#include <roughnessmap_fragment>\nfloat surfaceWetness = smoothstep(0.25, 0.75, fieldVariationAt(roadPosition * 45.0));\nroughnessFactor = mix(roughnessFactor, mix(0.1, 0.46, surfaceWetness), roadWetness);',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.68 + fieldVariationAt(roadPosition * 45.0) * 0.3, roadWetness);',
      )
    }
    this.roadMaterial.customProgramCacheKey = () => 'weathered-asphalt'
    const bladePositions: number[] = [],
      bladeIndices: number[] = [],
      bladeColors: number[] = []
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.4,
        radius = 0.12 + (i % 4) * 0.055,
        x = Math.cos(angle) * radius,
        z = Math.sin(angle) * radius,
        width = 0.005 + (i % 3) * 0.002,
        height = 0.23 + ((i * 7) % 12) * 0.025,
        bend = 0.08 + (i % 3) * 0.025,
        n = i * 5
      for (const [elevation, offset, spread] of [
        [0, 0, -width],
        [0, 0, width],
        [height * 0.6, bend * 0.25, -width * 0.55],
        [height * 0.6, bend * 0.25, width * 0.55],
        [height, bend, 0],
      ] as const) {
        bladePositions.push(
          x + Math.cos(angle) * offset - Math.sin(angle) * spread,
          elevation,
          z + Math.sin(angle) * offset + Math.cos(angle) * spread,
        )
        const shade = elevation === 0 ? 0.75 : elevation === height ? 1 : 0.9
        bladeColors.push(shade, shade, shade)
      }
      bladeIndices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2, n + 2, n + 3, n + 4)
    }
    this.blade = geometry(bladePositions, bladeIndices, bladeColors)
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
  createTile(id: number) {
    const start = id * 120,
      group = new THREE.Group(),
      settings = this.world.settings
    const rng = random(id * 967 + settings.seed * 137)
    const palette = palettes[settings.season]
    const base = new THREE.Color(settings.landscape === 'desert' ? '#c8ad7f' : palette.grass)
    const light = new THREE.Color(settings.landscape === 'desert' ? '#ddc291' : palette.light)
    const color = new THREE.Color()
    this.addMesh(group, groundGeometry(this.world, start, base, light), this.grassMaterial)
    const road = strip(this.world, start, -4.5, 4.5, 0)
    const uv: number[] = []
    for (let i = 0; i <= 24; i++) uv.push(0, i / 24, 1, i / 24)
    road.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    this.addMesh(group, road, this.roadMaterial)
    const markings: THREE.BufferGeometry[] = []
    for (const side of [-1, 1])
      markings.push(strip(this.world, start, side * 4.22 - 0.045, side * 4.22 + 0.045, 0.012))
    for (let s = start; s < start + 120; s += 12) {
      const r1 = this.world.road(s),
        r2 = this.world.road(s + 5)
      markings.push(
        geometry(
          [
            r1.x - 0.065,
            r1.y + 0.016,
            -s,
            r1.x + 0.065,
            r1.y + 0.016,
            -s,
            r2.x - 0.065,
            r2.y + 0.016,
            -s - 5,
            r2.x + 0.065,
            r2.y + 0.016,
            -s - 5,
          ],
          [0, 1, 2, 1, 3, 2],
        ),
      )
    }
    this.addBatch(group, markings, this.edgeMaterial)
    const rails: THREE.BufferGeometry[] = []
    for (const side of [-1, 1]) {
      for (let s = start; s < start + 120; s += 5) {
        if (!this.world.guardrail(s + 2.5, side)) continue
        const r1 = this.world.road(s),
          r2 = this.world.road(s + 5),
          d = side * 6.2
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
          rails.push(
            geometry(
              [
                r1.x + d + side * lower[1],
                r1.y + lower[0],
                -s,
                r1.x + d + side * upper[1],
                r1.y + upper[0],
                -s,
                r2.x + d + side * lower[1],
                r2.y + lower[0],
                -s - 5,
                r2.x + d + side * upper[1],
                r2.y + upper[0],
                -s - 5,
              ],
              side < 0 ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2],
            ),
          )
        }
        const post = new THREE.BoxGeometry(0.13, 0.8, 0.12)
        post.deleteAttribute('uv')
        post.translate(r1.x + d + side * 0.1, r1.y + 0.38, -s)
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
    const count = settings.landscape === 'desert' ? 1200 : this.quality === 'low' ? 2800 : 10000
    const grass = new THREE.InstancedMesh(this.blade, this.bladeMaterial, count)
    grass.name = 'meadow'
    let placedGrass = 0
    for (let i = 0; i < count; i++) {
      const s = start + rng() * 120,
        d = (rng() > 0.5 ? 1 : -1) * (4.8 + rng() ** 2.2 * 23)
      const road = this.world.road(s)
      const x = road.x + d
      const elevation = this.world.height(x, s)
      if (elevation < 0.3) continue
      if (elevation - road.y > 0.15 && Math.abs(d) < 18.5) {
        const slope = Math.abs(
          (this.world.height(x + 0.25, s) - this.world.height(x - 0.25, s)) / 0.5,
        )
        if (rng() < clamp((slope - 0.55) / 0.4, 0, 1)) continue
      }
      matrix.position.set(x, elevation, -s)
      matrix.rotation.set(0, rng() * 6.28, 0)
      matrix.scale.set(0.8 + rng() * 0.8, 0.55 + rng() * 0.65, 0.8 + rng() * 0.8)
      matrix.updateMatrix()
      grass.setMatrixAt(placedGrass, matrix.matrix)
      color
        .copy(base)
        .lerp(light, 0.3 + rng() * 0.7)
        .multiplyScalar(0.88 + rng() * 0.2)
      grass.setColorAt(placedGrass++, color)
    }
    grass.count = placedGrass
    group.add(grass)
    this.tiles.set(id, group)
    this.scene.add(group)
  }
  update(s: number, time: number) {
    this.windTime.value = time
    const current = Math.floor(s / 120),
      ahead = this.quality === 'low' ? 8 : 14
    for (const [id, group] of this.tiles)
      if (id < current - 4 || id > current + ahead) this.removeTile(id, group)
    for (let id = current - 4; id <= current + ahead; id++)
      if (!this.tiles.has(id)) this.createTile(id)
    for (const [id, group] of this.tiles) {
      const grass = group.getObjectByName('meadow')
      if (grass) grass.visible = id >= current - 1 && id <= current + 2
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
    this.foliage.dispose()
    this.asphalt.dispose()
    this.groundTexture.dispose()
  }
}

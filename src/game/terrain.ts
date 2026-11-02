import * as THREE from 'three'
import { Foliage } from './foliage'
import { groundTexture, meadowMaterial } from './ground'
import { clamp, random, type Settings, type World } from './world'

export const palettes = {
  summer: { grass: '#839b59', light: '#adba76', tree: '#698344', shrub: '#72804d' },
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
  grassMaterial: THREE.MeshStandardMaterial
  roadMaterial: THREE.MeshStandardMaterial
  edgeMaterial = new THREE.MeshStandardMaterial({ color: '#eeeedd', roughness: 1 })
  railMaterial = new THREE.MeshStandardMaterial({
    color: '#bcc1b7',
    metalness: 0.55,
    roughness: 0.7,
  })
  barkMaterial = new THREE.MeshStandardMaterial({ color: '#635c47', roughness: 1 })
  foliage: Foliage
  bladeMaterial: THREE.MeshStandardMaterial
  blade: THREE.BufferGeometry
  asphalt: THREE.CanvasTexture
  groundTexture: THREE.CanvasTexture
  windTime = { value: 0 }
  constructor(
    public scene: THREE.Scene,
    public world: World,
  ) {
    const palette = palettes[world.settings.season]
    this.groundTexture = groundTexture()
    this.grassMaterial = meadowMaterial(this.groundTexture)
    this.foliage = new Foliage(world.settings.season)
    this.bladeMaterial = new THREE.MeshStandardMaterial({
      color: palette.light,
      side: THREE.DoubleSide,
      roughness: 1,
    })
    this.bladeMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.windTime = this.windTime
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nuniform float windTime;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;\nfloat wind = sin(root.x * 0.3 + root.z * 0.15 + windTime * 1.8);\ntransformed.xz += vec2(wind, wind * 0.6) * position.y * position.y * 0.18;',
      )
    }
    this.bladeMaterial.customProgramCacheKey = () => 'meadow-blades'
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable')
    const data = ctx.createImageData(128, 128)
    const rng = random(14)
    for (let i = 0; i < data.data.length; i += 4) {
      const c = 128 + rng() * 20
      data.data.set([c, c + 3, c + 3, 255], i)
    }
    ctx.putImageData(data, 0, 0)
    this.asphalt = new THREE.CanvasTexture(canvas)
    this.asphalt.wrapS = this.asphalt.wrapT = THREE.RepeatWrapping
    this.asphalt.repeat.set(2, 24)
    this.asphalt.colorSpace = THREE.SRGBColorSpace
    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: this.asphalt,
      color: '#c4ccd1',
      roughness: 0.98,
    })
    const bladePositions: number[] = [],
      bladeIndices: number[] = []
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4,
        x = Math.cos(angle) * 0.11,
        z = Math.sin(angle) * 0.11,
        width = 0.018
      const n = i * 3
      bladePositions.push(
        x - Math.cos(angle) * width,
        0,
        z - Math.sin(angle) * width,
        x + Math.cos(angle) * width,
        0,
        z + Math.sin(angle) * width,
        x + Math.cos(angle) * 0.1,
        0.27 + i * 0.042,
        z + Math.sin(angle) * 0.1,
      )
      bladeIndices.push(n, n + 1, n + 2)
    }
    this.blade = geometry(bladePositions, bladeIndices)
    this.materials = [
      this.grassMaterial,
      this.roadMaterial,
      this.edgeMaterial,
      this.railMaterial,
      this.barkMaterial,
      this.bladeMaterial,
    ]
    this.sharedGeometries = [...this.foliage.treeGeometries, this.blade]
  }
  addMesh(group: THREE.Group, g: THREE.BufferGeometry, material: THREE.Material) {
    const mesh = new THREE.Mesh(g, material)
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  createTile(id: number) {
    const start = id * 120,
      group = new THREE.Group(),
      settings = this.world.settings
    const rng = random(id * 967 + settings.seed * 137)
    const palette = palettes[settings.season]
    const base = new THREE.Color(settings.landscape === 'desert' ? '#c8ad7f' : palette.grass)
    const light = new THREE.Color(settings.landscape === 'desert' ? '#ddc291' : palette.light)
    const offsets = [
      -1600, -1200, -900, -700, -520, -380, -270, -190, -130, -90, -60, -38, -24, -15, -9, -6, 0, 6,
      9, 15, 24, 38, 60, 90, 130, 190, 270, 380, 520, 700, 900, 1200, 1600,
    ]
    const p: number[] = [],
      indices: number[] = [],
      colors: number[] = [],
      color = new THREE.Color()
    for (let row = 0; row <= 24; row++) {
      const s = start + row * 5,
        r = this.world.road(s)
      for (let col = 0; col < offsets.length; col++) {
        const d = offsets[col] ?? 0,
          x = r.x + d
        p.push(x, this.world.height(x, s), -s)
        const variation =
          0.32 + Math.sin(x * 0.038 + s * 0.017) * 0.14 + Math.cos(x * 0.08 - s * 0.08) * 0.055
        color.copy(base).lerp(light, variation)
        const elevation = this.world.height(x, s)
        if (elevation < 1.2 && settings.landscape !== 'desert')
          color.lerp(
            new THREE.Color(settings.season === 'winter' ? '#dde3dc' : '#c5c1a3'),
            clamp((1.2 - elevation) / 1.5, 0, 1),
          )
        if (settings.landscape === 'alpine' && this.world.height(x, s) > 120)
          color.lerp(new THREE.Color('#dae0dc'), clamp((this.world.height(x, s) - 120) / 80, 0, 1))
        colors.push(color.r, color.g, color.b)
        if (row < 24 && col < offsets.length - 1) {
          const n = row * offsets.length + col
          indices.push(
            n,
            n + 1,
            n + offsets.length,
            n + 1,
            n + offsets.length + 1,
            n + offsets.length,
          )
        }
      }
    }
    const ground = geometry(p, indices, colors)
    const groundUv: number[] = []
    for (let i = 0; i < p.length; i += 3) groundUv.push((p[i] ?? 0) / 7, -(p[i + 2] ?? 0) / 7)
    ground.setAttribute('uv', new THREE.Float32BufferAttribute(groundUv, 2))
    this.addMesh(group, ground, this.grassMaterial)
    const road = strip(this.world, start, -4.5, 4.5, 0)
    const uv: number[] = []
    for (let i = 0; i <= 24; i++) uv.push(0, i / 24, 1, i / 24)
    road.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    this.addMesh(group, road, this.roadMaterial)
    for (const side of [-1, 1])
      this.addMesh(
        group,
        strip(this.world, start, side * 4.22 - 0.045, side * 4.22 + 0.045, 0.012),
        this.edgeMaterial,
      )
    for (let s = start; s < start + 120; s += 12) {
      const r1 = this.world.road(s),
        r2 = this.world.road(s + 5)
      this.addMesh(
        group,
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
        this.edgeMaterial,
      )
    }
    for (const side of [-1, 1]) {
      for (let s = start; s < start + 120; s += 5) {
        if (!this.world.guardrail(s + 2.5, side)) continue
        const r1 = this.world.road(s),
          r2 = this.world.road(s + 5),
          d = side * 6.2
        const rail = geometry(
          [
            r1.x + d,
            r1.y + 0.62,
            -s,
            r1.x + d,
            r1.y + 0.95,
            -s,
            r2.x + d,
            r2.y + 0.62,
            -s - 5,
            r2.x + d,
            r2.y + 0.95,
            -s - 5,
          ],
          [0, 2, 1, 1, 2, 3, 1, 2, 0, 3, 2, 1],
        )
        this.addMesh(group, rail, this.railMaterial)
        const post = this.addMesh(group, new THREE.BoxGeometry(0.13, 0.92, 0.12), this.railMaterial)
        post.position.set(r1.x + d, r1.y + 0.44, -s)
      }
    }
    const treeCount = settings.landscape === 'desert' ? 10 : settings.quality === 'low' ? 42 : 82
    const matrix = new THREE.Object3D()
    for (let variant = 0; variant < 4; variant++) {
      const geometry = this.foliage.treeGeometries[variant]
      if (!geometry) continue
      const count = Math.ceil(treeCount / 4)
      const trees = new THREE.InstancedMesh(geometry, this.foliage.treeMaterial, count)
      let placed = 0
      for (let i = 0; i < count; i++) {
        const s = start + rng() * 120
        const d = (rng() > 0.5 ? 1 : -1) * (14 + rng() ** 1.5 * 440)
        const x = this.world.road(s).x + d
        if (this.world.height(x, s) < 0.5) continue
        const h = 6 + rng() * 5
        matrix.position.set(x, this.world.height(x, s) - 0.1, -s)
        matrix.rotation.set(0, rng() * Math.PI, 0)
        matrix.scale.set(h * (0.72 + rng() * 0.15), h, h * (0.72 + rng() * 0.15))
        matrix.updateMatrix()
        trees.setMatrixAt(placed, matrix.matrix)
        trees.setColorAt(placed++, new THREE.Color().setScalar(0.88 + rng() * 0.24))
      }
      trees.count = placed
      trees.castShadow = true
      group.add(trees)
    }
    const count = settings.quality === 'low' ? 900 : 4800
    const grass = new THREE.InstancedMesh(this.blade, this.bladeMaterial, count)
    let placedGrass = 0
    for (let i = 0; i < count; i++) {
      const s = start + rng() * 120,
        d = (rng() > 0.5 ? 1 : -1) * (4.8 + rng() ** 1.7 * 24)
      const x = this.world.road(s).x + d
      if (this.world.height(x, s) < 0.3) continue
      matrix.position.set(x, this.world.height(x, s), -s)
      matrix.rotation.set(0, rng() * 6.28, 0)
      matrix.scale.setScalar(0.5 + rng() * 0.9)
      matrix.updateMatrix()
      grass.setMatrixAt(placedGrass++, matrix.matrix)
    }
    grass.count = placedGrass
    group.add(grass)
    this.tiles.set(id, group)
    this.scene.add(group)
  }
  update(s: number, time: number) {
    this.windTime.value = time
    const current = Math.floor(s / 120),
      ahead = this.world.settings.quality === 'low' ? 8 : 14
    for (const [id, group] of this.tiles)
      if (id < current - 4 || id > current + ahead) this.removeTile(id, group)
    for (let id = current - 4; id <= current + ahead; id++)
      if (!this.tiles.has(id)) this.createTile(id)
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
  refresh(settings: Settings) {
    for (const [id, group] of this.tiles) this.removeTile(id, group)
    this.foliage.update(settings.season)
    this.bladeMaterial.color.set(
      settings.landscape === 'desert' ? '#c5af79' : palettes[settings.season].light,
    )
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

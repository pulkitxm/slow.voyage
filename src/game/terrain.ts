import * as THREE from 'three'
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
  leafMaterial: THREE.MeshStandardMaterial
  bladeMaterial: THREE.MeshStandardMaterial
  sphere = new THREE.IcosahedronGeometry(1, 2)
  trunk = new THREE.CylinderGeometry(0.12, 0.22, 1, 5)
  blade: THREE.BufferGeometry
  asphalt: THREE.CanvasTexture
  constructor(
    public scene: THREE.Scene,
    public world: World,
  ) {
    const palette = palettes[world.settings.season]
    this.grassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
    this.leafMaterial = new THREE.MeshStandardMaterial({ color: palette.tree, roughness: 1 })
    this.bladeMaterial = new THREE.MeshStandardMaterial({
      color: palette.light,
      side: THREE.DoubleSide,
      roughness: 1,
    })
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable')
    const data = ctx.createImageData(128, 128)
    const rng = random(14)
    for (let i = 0; i < data.data.length; i += 4) {
      const c = 100 + rng() * 24
      data.data.set([c, c + 3, c + 3, 255], i)
    }
    ctx.putImageData(data, 0, 0)
    this.asphalt = new THREE.CanvasTexture(canvas)
    this.asphalt.wrapS = this.asphalt.wrapT = THREE.RepeatWrapping
    this.asphalt.repeat.set(2, 24)
    this.asphalt.colorSpace = THREE.SRGBColorSpace
    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: this.asphalt,
      color: '#b3b5b1',
      roughness: 0.98,
    })
    const bladePositions: number[] = [],
      bladeIndices: number[] = []
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4,
        x = Math.cos(angle) * 0.11,
        z = Math.sin(angle) * 0.11,
        width = 0.024
      const n = i * 3
      bladePositions.push(
        x - width,
        0,
        z,
        x + width,
        0,
        z,
        x + Math.cos(angle) * 0.1,
        0.27 + i * 0.055,
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
      this.leafMaterial,
      this.bladeMaterial,
    ]
    this.sharedGeometries = [this.sphere, this.trunk, this.blade]
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
    this.addMesh(group, geometry(p, indices, colors), this.grassMaterial)
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
    const trunks = new THREE.InstancedMesh(this.trunk, this.barkMaterial, treeCount)
    const leaves = new THREE.InstancedMesh(this.sphere, this.leafMaterial, treeCount * 3)
    const matrix = new THREE.Object3D()
    for (let i = 0; i < treeCount; i++) {
      const s = start + rng() * 120,
        d = (rng() > 0.5 ? 1 : -1) * (14 + rng() ** 1.8 * 440)
      const x = this.world.road(s).x + d,
        y = this.world.height(x, s),
        h = 4.5 + rng() * 6
      matrix.rotation.set(0, 0, 0)
      matrix.position.set(x, y + h * 0.34, -s)
      matrix.scale.set(h * 0.14, h * 0.7, h * 0.14)
      matrix.updateMatrix()
      trunks.setMatrixAt(i, matrix.matrix)
      for (let j = 0; j < 3; j++) {
        matrix.position.set(
          x + (rng() - 0.5) * h * 0.35,
          y + h * (0.62 + j * 0.12),
          -s + (rng() - 0.5) * h * 0.3,
        )
        matrix.scale.set(h * (0.33 + rng() * 0.1), h * 0.35, h * (0.34 + rng() * 0.1))
        matrix.rotation.set(rng(), rng() * 6, rng())
        matrix.updateMatrix()
        leaves.setMatrixAt(i * 3 + j, matrix.matrix)
        leaves.setColorAt(
          i * 3 + j,
          new THREE.Color().setHSL(0.18 + rng() * 0.08, 0.2, 0.78 + rng() * 0.2),
        )
      }
    }
    trunks.castShadow = leaves.castShadow = true
    leaves.receiveShadow = true
    group.add(trunks, leaves)
    const count = settings.quality === 'low' ? 650 : 2200
    const grass = new THREE.InstancedMesh(this.blade, this.bladeMaterial, count)
    for (let i = 0; i < count; i++) {
      const s = start + rng() * 120,
        d = (rng() > 0.5 ? 1 : -1) * (5 + rng() ** 2 * 45)
      const x = this.world.road(s).x + d
      matrix.position.set(x, this.world.height(x, s), -s)
      matrix.rotation.set(0, rng() * 6.28, 0)
      matrix.scale.setScalar(0.5 + rng() * 0.9)
      matrix.updateMatrix()
      grass.setMatrixAt(i, matrix.matrix)
    }
    group.add(grass)
    this.tiles.set(id, group)
    this.scene.add(group)
  }
  update(s: number) {
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
    this.leafMaterial.color.set(palettes[settings.season].tree)
    this.bladeMaterial.color.set(
      settings.landscape === 'desert' ? '#c5af79' : palettes[settings.season].light,
    )
  }
  dispose() {
    for (const [id, group] of this.tiles) this.removeTile(id, group)
    for (const material of this.materials) material.dispose()
    for (const g of this.sharedGeometries) g.dispose()
    this.asphalt.dispose()
  }
}

import * as THREE from 'three'
import { CanopyIndex, canopyShade } from './canopy'
import { type Trunk, trunkRadius } from './collision'
import { atlasShift, evergreenRelief, evergreenTile, type Foliage, plantTint } from './foliage'
import { landscapeProfiles } from './landscapes'
import { LodField } from './lod-field'
import { type GridLayout, nodeDistance, nodeSize, type OpenNode } from './open-grid'
import { StaticGroup } from './static-group'
import { waterfallClearing, waterfallsNear } from './waterfalls'
import { type OpenShrub, scatteredPlants, woodlandTrees } from './woodland'
import type { Settings, World } from './world'

export const sceneryLayout = {
  leaf: 256,
  levels: 3,
  detail: 0.8,
  reach: 1500,
  thinning: 3,
  rootRecess: 0.1,
  band: 32,
  bucket: 16,
  crowns: { show: 150, hide: 190 },
} as const

export const lightSceneryLayout: GridLayout = { ...sceneryLayout, reach: 600 }

interface Grove {
  node: OpenNode
  group: THREE.Group
  cards: THREE.InstancedMesh | null
  crowns: THREE.Group | null
  trunks: Trunk[]
  pools: number[]
  canopy: CanopyIndex | null
  buckets: Map<string, Trunk[]> | null
}

const variants = [0, 1, 4, 5] as const

export class OpenScenery {
  group = new StaticGroup()
  field: LodField<Grove>

  constructor(
    private world: World,
    private foliage: Foliage,
    private shade: { material: THREE.Material; disc: THREE.BufferGeometry } | null,
    public quality: Settings['quality'],
    layout: GridLayout = sceneryLayout,
  ) {
    this.field = new LodField<Grove>(
      layout,
      (node) => this.plant(node),
      (grove, visible) => {
        grove.group.visible = visible
      },
      (grove) => {
        this.group.remove(grove.group)
        grove.cards?.geometry.dispose()
        grove.group.traverse((child) => {
          if (child instanceof THREE.InstancedMesh) child.dispose()
        })
      },
    )
  }

  private *plant(node: OpenNode): Generator<undefined, Grove, undefined> {
    const grove = yield* this.grow(node)
    this.group.add(grove.group)
    return grove
  }

  private *grow(node: OpenNode): Generator<undefined, Grove, undefined> {
    const size = nodeSize(node.level, sceneryLayout.leaf)
    const left = node.column * size
    const near = node.row * size
    const settings = this.world.settings
    const profile = landscapeProfiles[settings.landscape]
    const thin = sceneryLayout.thinning ** node.level * (this.quality === 'low' ? 3 : 1)
    const falls = waterfallsNear(this.world, near + size / 2, size)
    const grove: Grove = {
      node,
      group: new THREE.Group(),
      cards: null,
      crowns: null,
      trunks: [],
      pools: [],
      canopy: null,
      buckets: null,
    }
    const close = node.level === 0
    const bands = Math.max(1, Math.round(size / sceneryLayout.band))
    const trees: ReturnType<typeof woodlandTrees> = []
    const shrubs: OpenShrub[] = []
    for (let band = 0; band < bands; band++) {
      for (const tree of woodlandTrees(
        this.world,
        left,
        near + (band * size) / bands,
        size,
        size / bands,
        thin,
      ))
        if (!waterfallClearing(falls, tree.x, tree.s)) trees.push(tree)
      yield
      const scattered = scatteredPlants(
        this.world,
        left,
        near + (band * size) / bands,
        size,
        size / bands,
        thin,
      )
      for (const tree of scattered.trees)
        if (!waterfallClearing(falls, tree.x, tree.s)) trees.push(tree)
      for (const shrub of scattered.shrubs)
        if (!waterfallClearing(falls, shrub.x, shrub.s)) shrubs.push(shrub)
      yield
    }
    grove.group.visible = false
    const cardGeometry = this.foliage.distantTreeGeometries[0]
    const pose = new THREE.Object3D()
    const color = new THREE.Color()
    const relief = evergreenRelief(profile.foliage)
    const tint = (tree: { variant: number; shade: number; x: number; s: number }) => {
      plantTint(color, tree.shade, tree.x, tree.s)
      if (tree.variant === evergreenTile) color.multiply(relief)
      return color
    }
    const place = (tree: {
      x: number
      s: number
      ground: number
      yaw: number
      width: number
      height: number
    }) => {
      pose.position.set(tree.x, tree.ground - sceneryLayout.rootRecess, -tree.s)
      pose.rotation.set(0, tree.yaw, 0)
      pose.scale.set(tree.width, tree.height, tree.width)
      pose.updateMatrix()
      return pose.matrix
    }
    for (const variant of [2, 3] as const) {
      const brush = shrubs.filter((shrub) => shrub.variant === variant)
      const geometry =
        settings.season === 'winter'
          ? this.foliage.winterShrubGeometries[variant - 2]
          : this.foliage.treeGeometries[variant]
      if (!brush.length || !geometry) continue
      const mesh = new THREE.InstancedMesh(geometry, this.foliage.treeMaterial, brush.length)
      for (const [index, shrub] of brush.entries()) {
        mesh.setMatrixAt(index, place(shrub))
        mesh.setColorAt(index, tint(shrub))
      }
      mesh.computeBoundingSphere()
      grove.group.add(mesh)
    }
    if (!trees.length || !cardGeometry) return grove
    const cards = new THREE.InstancedMesh(cardGeometry, this.foliage.treeMaterial, trees.length)
    const shifts = new Float32Array(trees.length * 2)
    for (const [index, tree] of trees.entries()) {
      cards.setMatrixAt(index, place(tree))
      cards.setColorAt(index, tint(tree))
      shifts.set(atlasShift(tree.variant), index * 2)
    }
    cards.geometry = cardGeometry.clone()
    cards.geometry.setAttribute('atlasShift', new THREE.InstancedBufferAttribute(shifts, 2))
    cards.computeBoundingSphere()
    grove.cards = cards
    grove.group.add(cards)
    yield
    if (this.shade && node.level < 2 && (close || this.quality !== 'low')) {
      const pools = new THREE.InstancedMesh(this.shade.disc, this.shade.material, trees.length)
      pools.renderOrder = 1
      const pool = new THREE.Matrix4()
      for (const [index, tree] of trees.entries()) {
        const reach = tree.width * canopyShade.spread
        pool.makeScale(reach, 1, reach)
        pool.elements[1] = tree.slopeX * reach
        pool.elements[9] = -tree.slopeS * reach
        pool.setPosition(tree.x, tree.ground + canopyShade.lift, -tree.s)
        pools.setMatrixAt(index, pool)
      }
      pools.computeBoundingSphere()
      grove.group.add(pools)
      yield
    }
    if (!close) return grove
    const crowns = new THREE.Group()
    crowns.visible = false
    for (const variant of variants) {
      const forest = trees.filter((tree) => tree.variant === variant)
      const geometry = this.foliage.treeGeometries[variant]
      if (!forest.length || !geometry) continue
      const mesh = new THREE.InstancedMesh(geometry, this.foliage.treeMaterial, forest.length)
      for (const [index, tree] of forest.entries()) {
        mesh.setMatrixAt(index, place(tree))
        mesh.setColorAt(index, tint(tree))
      }
      mesh.castShadow = true
      mesh.customDepthMaterial = this.foliage.shadowMaterial
      mesh.computeBoundingSphere()
      crowns.add(mesh)
    }
    for (const tree of trees) {
      grove.trunks.push({ x: tree.x, s: tree.s, radius: trunkRadius(tree.width) })
      grove.pools.push(tree.x, tree.s, tree.width)
    }
    yield
    grove.crowns = crowns
    grove.group.add(crowns)
    return grove
  }

  update(x: number, s: number) {
    this.field.update(x, s)
    const { show, hide } = sceneryLayout.crowns
    for (const { item } of this.field.visible(0)) {
      if (!item.crowns || !item.cards) continue
      const distance = nodeDistance(item.node, x, s, sceneryLayout.leaf)
      if (distance < show) item.crowns.visible = true
      else if (distance > hide) item.crowns.visible = false
      item.cards.visible = !item.crowns.visible
    }
  }

  *trunksNear(x: number, s: number, reach = 12) {
    const cell = sceneryLayout.bucket
    for (
      let column = Math.floor((x - reach) / cell);
      column <= Math.floor((x + reach) / cell);
      column++
    )
      for (let row = Math.floor((s - reach) / cell); row <= Math.floor((s + reach) / cell); row++) {
        const grove = this.field.at((column + 0.5) * cell, (row + 0.5) * cell)
        if (!grove) continue
        if (!grove.buckets) {
          grove.buckets = new Map()
          for (const trunk of grove.trunks) {
            const key = `${Math.floor(trunk.x / cell)}/${Math.floor(trunk.s / cell)}`
            const bucket = grove.buckets.get(key)
            if (bucket) bucket.push(trunk)
            else grove.buckets.set(key, [trunk])
          }
        }
        yield* grove.buckets.get(`${column}/${row}`) ?? []
      }
  }

  shadeAt(x: number, s: number) {
    const grove = this.field.at(x, s)
    if (!grove) return 0
    grove.canopy ??= new CanopyIndex(grove.pools)
    return grove.canopy.cover(x, s)
  }
}

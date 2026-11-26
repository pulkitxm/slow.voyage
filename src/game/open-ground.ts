import * as THREE from 'three'
import { GroundWriter } from './ground'
import { LodField } from './lod-field'
import { type GridLayout, nodeSize, type OpenNode, openLayout } from './open-grid'
import { StaticGroup } from './static-group'
import type { World } from './world'

export function* openGeometry(
  world: World,
  node: OpenNode,
  base: THREE.Color,
  light: THREE.Color,
  batch: number,
): Generator<undefined, THREE.BufferGeometry, undefined> {
  const { cells } = openLayout
  const size = nodeSize(node.level)
  const step = size / cells
  const left = node.column * size
  const near = node.row * size
  const writer = new GroundWriter(world, base, light)
  const offsets: number[] = []
  const indices: number[] = []
  const line = cells + 1
  for (let row = 0; row <= cells; row++) {
    if (row && row % batch === 0) yield
    const s = near + row * step
    const road = world.road(s)
    for (let column = 0; column <= cells; column++) {
      const x = left + column * step
      writer.vertex(x, s, road, x - road.x)
      offsets.push(x - road.x)
      if (row < cells && column < cells) {
        const n = row * line + column
        indices.push(n, n + 1, n + line, n + 1, n + line + 1, n + line)
      }
    }
  }
  const drop = size * 0.04 + 0.6
  const edge = (index: (step: number) => number) => {
    const first = writer.count
    for (let along = 0; along <= cells; along++) {
      writer.skirt(index(along), drop)
      offsets.push(offsets[index(along)] ?? 0)
    }
    for (let along = 0; along < cells; along++) {
      const a = index(along)
      const b = index(along + 1)
      const c = first + along
      const d = first + along + 1
      indices.push(a, b, c, b, d, c, a, c, b, b, c, d)
    }
  }
  edge((along) => along)
  edge((along) => cells * line + along)
  edge((along) => along * line)
  edge((along) => along * line + cells)
  const geometry = writer.geometry(indices)
  geometry.setAttribute('corridorOffset', new THREE.Float32BufferAttribute(offsets, 1))
  return geometry
}

export class OpenGround {
  group = new StaticGroup()
  field: LodField<THREE.Mesh>

  constructor(
    world: World,
    material: THREE.Material,
    colors: () => { base: THREE.Color; light: THREE.Color },
    batch: number,
    layout: GridLayout = openLayout,
  ) {
    const group = this.group
    this.field = new LodField<THREE.Mesh>(
      layout,
      function* (node) {
        const { base, light } = colors()
        const mesh = new THREE.Mesh(yield* openGeometry(world, node, base, light, batch), material)
        mesh.receiveShadow = true
        group.add(mesh)
        return mesh
      },
      (mesh, visible) => {
        mesh.visible = visible
      },
      (mesh) => {
        group.remove(mesh)
        mesh.geometry.dispose()
      },
    )
  }
}

import * as THREE from 'three'
import { smoothStep } from './field'
import type { GroundSampler } from './ground-sample'
import { random, type World } from './world'

export const roamingLayout = {
  cell: 10,
  span: 11,
  roadsideStart: 26,
  roadsideFull: 34,
  cellsPerFrame: 24,
}

export interface MeadowPalette {
  base: THREE.Color
  light: THREE.Color
}

function cellSeed(column: number, row: number, seed: number) {
  return Math.imul(column, 73856093) ^ Math.imul(row, 19349663) ^ Math.imul(seed, 83492791)
}

export class RoamingMeadow {
  mesh: THREE.InstancedMesh
  private perCell: number
  private slots: (string | null)[]
  private matrix = new THREE.Matrix4()
  private position = new THREE.Vector3()
  private rotation = new THREE.Quaternion()
  private scale = new THREE.Vector3()
  private color = new THREE.Color()
  private up = new THREE.Vector3(0, 1, 0)
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0)

  constructor(
    blade: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
    private world: World,
    private sampler: (s: number) => GroundSampler | null,
    public palette: MeadowPalette,
  ) {
    const cells = roamingLayout.span * roamingLayout.span
    this.perCell = Math.max(1, Math.floor(count / cells))
    this.mesh = new THREE.InstancedMesh(blade, material, this.perCell * cells)
    this.mesh.name = 'roaming-meadow'
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.slots = Array.from({ length: cells }, () => null)
    for (let index = 0; index < this.mesh.count; index++) {
      this.mesh.setMatrixAt(index, this.hidden)
      this.mesh.setColorAt(index, this.color.setRGB(1, 1, 1))
    }
  }

  reset() {
    this.slots.fill(null)
    for (let index = 0; index < this.mesh.count; index++) this.mesh.setMatrixAt(index, this.hidden)
    this.mesh.instanceMatrix.needsUpdate = true
  }

  update(x: number, s: number) {
    const { cell, span, cellsPerFrame } = roamingLayout
    const half = Math.floor(span / 2)
    const centerColumn = Math.floor(x / cell)
    const centerRow = Math.floor(s / cell)
    let budget = cellsPerFrame
    let changed = false
    for (let ring = 0; ring <= half && budget > 0; ring++)
      for (let row = centerRow - ring; row <= centerRow + ring && budget > 0; row++)
        for (
          let column = centerColumn - ring;
          column <= centerColumn + ring && budget > 0;
          column++
        ) {
          if (Math.max(Math.abs(row - centerRow), Math.abs(column - centerColumn)) !== ring)
            continue
          const slot = (((row % span) + span) % span) * span + (((column % span) + span) % span)
          const key = `${column}:${row}`
          if (this.slots[slot] === key) continue
          budget--
          changed = true
          this.slots[slot] = this.fill(slot, column, row) ? key : null
        }
    if (changed) {
      this.mesh.instanceMatrix.needsUpdate = true
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }
  }

  private fill(slot: number, column: number, row: number) {
    const { cell, roadsideStart, roadsideFull } = roamingLayout
    const rng = random(cellSeed(column, row, this.world.settings.seed))
    const first = slot * this.perCell
    let complete = true
    for (let index = 0; index < this.perCell; index++) {
      const x = (column + rng()) * cell
      const s = (row + rng()) * cell
      const keep = rng()
      const turn = rng() * Math.PI * 2
      const width = 0.8 + rng() * 0.8
      const height = 0.55 + rng() * 0.65
      const shade = rng()
      const offset = Math.abs(x - this.world.road(s).x)
      const density = smoothStep(
        Math.min(1, Math.max(0, (offset - roadsideStart) / (roadsideFull - roadsideStart))),
      )
      const ground = keep < density ? this.sampler(s) : null
      if (keep < density && !ground) complete = false
      const elevation = ground?.sample(x, s) ?? 0
      if (!ground || elevation < 0.3 || ground.normal.y < 0.65) {
        this.mesh.setMatrixAt(first + index, this.hidden)
        continue
      }
      this.rotation.setFromAxisAngle(this.up, turn)
      this.matrix.compose(
        this.position.set(x, elevation - 0.025, -s),
        this.rotation,
        this.scale.set(width, height, width),
      )
      const values = this.matrix.elements
      const xSlope = -ground.normal.x / ground.normal.y
      const zSlope = -ground.normal.z / ground.normal.y
      values[1] = xSlope * values[0] + zSlope * values[2]
      values[9] = xSlope * values[8] + zSlope * values[10]
      this.mesh.setMatrixAt(first + index, this.matrix)
      this.mesh.setColorAt(
        first + index,
        this.color
          .copy(this.palette.base)
          .lerp(this.palette.light, 0.12 + shade * 0.7)
          .multiplyScalar(0.88 + shade * 0.2),
      )
    }
    return complete
  }

  dispose() {
    this.mesh.dispose()
  }
}

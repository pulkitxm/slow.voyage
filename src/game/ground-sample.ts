import * as THREE from 'three'
import { clamp } from './world'

export class GroundSampler {
  normal = new THREE.Vector3(0, 1, 0)
  private positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
  private normals: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
  private columns: number

  constructor(
    geometry: THREE.BufferGeometry,
    private start: number,
    private rows: number,
  ) {
    this.positions = geometry.getAttribute('position')
    this.normals = geometry.getAttribute('normal')
    this.columns = this.positions.count / (rows + 1)
  }

  sample(x: number, s: number) {
    const position = this.positions
    const coordinate = clamp(((s - this.start) * this.rows) / 120, 0, this.rows)
    const row = Math.min(this.rows - 1, Math.floor(coordinate))
    const v = coordinate - row
    const base = row * this.columns
    const center = base + Math.floor(this.columns / 2)
    const rowOffset = position.getX(center + this.columns) - position.getX(center)
    const projectedX = x - rowOffset * v
    let lower = 0
    let upper = this.columns - 1
    while (upper - lower > 1) {
      const middle = Math.floor((lower + upper) / 2)
      if (position.getX(base + middle) > projectedX) upper = middle
      else lower = middle
    }
    const left = position.getX(base + lower)
    const right = position.getX(base + upper)
    const u = clamp((projectedX - left) / (right - left), 0, 1)
    let a = base + lower,
      b = a + 1,
      c = a + this.columns,
      wa = 1 - u - v,
      wb = u,
      wc = v
    if (u + v > 1) {
      a = base + upper
      b = base + this.columns + lower
      c = b + 1
      wa = 1 - v
      wb = 1 - u
      wc = u + v - 1
    }
    const normal = this.normals
    this.normal
      .set(
        normal.getX(a) * wa + normal.getX(b) * wb + normal.getX(c) * wc,
        normal.getY(a) * wa + normal.getY(b) * wb + normal.getY(c) * wc,
        normal.getZ(a) * wa + normal.getZ(b) * wb + normal.getZ(c) * wc,
      )
      .normalize()
    return position.getY(a) * wa + position.getY(b) * wb + position.getY(c) * wc
  }
}

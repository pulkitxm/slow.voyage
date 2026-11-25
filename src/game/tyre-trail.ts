import * as THREE from 'three'

export const trailLayout = {
  marks: 2400,
  markWidth: 0.2,
  markStep: 0.4,
  markBreak: 3,
  markSlip: 0.45,
} as const

interface MarkTrack {
  x: number
  y: number
  z: number
  live: boolean
}

export class SkidMarks {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private cursor = 0
  private position: THREE.BufferAttribute
  private tracks: MarkTrack[] = []
  written = 0

  constructor() {
    const quads = trailLayout.marks
    const geometry = new THREE.BufferGeometry()
    this.position = new THREE.BufferAttribute(new Float32Array(quads * 12), 3)
    this.position.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', this.position)
    const indices = new Uint16Array(quads * 6)
    for (let quad = 0; quad < quads; quad++) {
      const vertex = quad * 4
      indices.set([vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2], quad * 6)
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: '#0c0d0e',
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
  }

  trace(wheel: number, marking: boolean, x: number, y: number, z: number) {
    let track = this.tracks[wheel]
    if (!track) {
      track = { x, y, z, live: false }
      this.tracks[wheel] = track
    }
    if (!marking) {
      track.live = false
      return false
    }
    const dx = x - track.x
    const dz = z - track.z
    const span = Math.hypot(dx, dz)
    if (!track.live || span > trailLayout.markBreak) {
      Object.assign(track, { x, y, z, live: true })
      return false
    }
    if (span < trailLayout.markStep) return false
    const half = trailLayout.markWidth / 2
    const sideX = (-dz / span) * half
    const sideZ = (dx / span) * half
    const base = this.cursor * 4
    this.position.setXYZ(base, track.x - sideX, track.y, track.z - sideZ)
    this.position.setXYZ(base + 1, track.x + sideX, track.y, track.z + sideZ)
    this.position.setXYZ(base + 2, x - sideX, y, z - sideZ)
    this.position.setXYZ(base + 3, x + sideX, y, z + sideZ)
    this.position.needsUpdate = true
    this.cursor = (this.cursor + 1) % trailLayout.marks
    this.written++
    Object.assign(track, { x, y, z })
    return true
  }

  clear() {
    this.position.array.fill(0)
    this.position.needsUpdate = true
    this.tracks = []
    this.cursor = 0
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}

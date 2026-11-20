import * as THREE from 'three'

export const trailLayout = {
  particles: 900,
  life: 1.5,
  marks: 2400,
  markWidth: 0.2,
  markStep: 0.4,
  markBreak: 3,
  markSlip: 0.45,
  smokeSlip: 0.38,
} as const

export class TyreParticles {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  private cursor = 0
  private origin: THREE.BufferAttribute
  private drift: THREE.BufferAttribute
  private tone: THREE.BufferAttribute
  private born: THREE.BufferAttribute

  constructor() {
    const count = trailLayout.particles
    const geometry = new THREE.BufferGeometry()
    this.origin = new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    this.drift = new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    this.tone = new THREE.BufferAttribute(new Float32Array(count * 4), 4)
    this.born = new THREE.BufferAttribute(new Float32Array(count * 2).fill(-100), 2)
    geometry.setAttribute('position', this.origin)
    geometry.setAttribute('drift', this.drift)
    geometry.setAttribute('tone', this.tone)
    geometry.setAttribute('born', this.born)
    for (const attribute of [this.origin, this.drift, this.tone, this.born])
      attribute.setUsage(THREE.DynamicDrawUsage)
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog ?? {},
        {
          time: { value: 0 },
          life: { value: trailLayout.life },
          lift: { value: 320 },
          light: { value: 1 },
        },
      ]),
      vertexShader: `
#include <fog_pars_vertex>
attribute vec3 drift;
attribute vec4 tone;
attribute vec2 born;
uniform float time;
uniform float life;
uniform float lift;
varying vec4 cloud;
void main() {
  float age = time - born.x;
  float spent = clamp(age / life, 0.0, 1.0);
  vec3 place = position + drift * age * (1.0 - spent * 0.45) + vec3(0.0, age * age * 0.35, 0.0);
  vec4 mvPosition = modelViewMatrix * vec4(place, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float alive = step(0.0, age) * step(age, life);
  gl_PointSize = alive * born.y * (0.5 + spent * 1.9) * lift / max(0.5, -mvPosition.z);
  cloud = vec4(tone.rgb, tone.a * alive * smoothstep(0.0, 0.08, spent) * (1.0 - spent) * (1.0 - spent));
  #include <fog_vertex>
}`,
      fragmentShader: `
#include <fog_pars_fragment>
uniform float light;
varying vec4 cloud;
void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  float soft = (1.0 - smoothstep(0.0, 1.0, radius)) * 1.35;
  if (cloud.a * soft < 0.004) discard;
  gl_FragColor = vec4(cloud.rgb * light, cloud.a * soft);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    })
    this.points = new THREE.Points(geometry, material)
    this.points.frustumCulled = false
    this.points.renderOrder = 2
  }

  emit(
    position: THREE.Vector3Like,
    drift: THREE.Vector3Like,
    tone: THREE.Color,
    opacity: number,
    size: number,
    time: number,
  ) {
    const slot = this.cursor
    this.cursor = (slot + 1) % trailLayout.particles
    this.origin.setXYZ(slot, position.x, position.y, position.z)
    this.drift.setXYZ(slot, drift.x, drift.y, drift.z)
    this.tone.setXYZW(slot, tone.r, tone.g, tone.b, opacity)
    this.born.setXY(slot, time, size)
    for (const attribute of [this.origin, this.drift, this.tone, this.born])
      attribute.needsUpdate = true
    return slot
  }

  setLight(light: number) {
    const uniform = this.points.material.uniforms.light
    if (uniform) uniform.value = light
  }

  update(time: number, viewportHeight: number) {
    const uniforms = this.points.material.uniforms
    if (uniforms.time) uniforms.time.value = time
    if (uniforms.lift) uniforms.lift.value = viewportHeight * 0.62
  }

  dispose() {
    this.points.geometry.dispose()
    this.points.material.dispose()
  }
}

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

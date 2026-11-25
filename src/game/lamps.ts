import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { EffectsLevel } from './particles'

export const beamLayout = { reach: 24, spread: 3, drop: 0.045, segments: 28 } as const

type Spot = readonly [number, number, number]

export function beamHaze(fog: number, wet: boolean, night: boolean) {
  const thick = Math.min(1, Math.max(0, (fog - 0.0012) / 0.0068))
  return Math.min(1, (night ? 0.12 : 0.04) + thick * 0.85 + (wet ? 0.3 : 0))
}

function coneGeometry(spots: Spot[]) {
  const { reach, spread, drop, segments } = beamLayout
  const parts = spots.map(([x, y, z]) => {
    const cone = new THREE.CylinderGeometry(0.07, spread, reach, segments, 4, true)
    cone.rotateX(Math.PI / 2)
    cone.translate(0, 0, -reach / 2)
    cone.rotateX(-drop)
    cone.translate(x, y, z)
    const position = cone.getAttribute('position')
    const along = new Float32Array(position.count)
    for (let index = 0; index < position.count; index++)
      along[index] = Math.min(1, Math.max(0, (z - position.getZ(index)) / reach))
    cone.setAttribute('along', new THREE.BufferAttribute(along, 1))
    cone.setAttribute('side', new THREE.BufferAttribute(new Float32Array(position.count), 1))
    return cone
  })
  return mergeGeometries(parts) ?? new THREE.BufferGeometry()
}

function spriteGeometry(spots: Spot[]) {
  const position: number[] = []
  const along: number[] = []
  const side: number[] = []
  const index: number[] = []
  for (const [x, y, z] of spots) {
    const base = position.length / 3
    for (const [reach, across] of [
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 1],
    ] as const) {
      position.push(x, y, z)
      along.push(reach)
      side.push(across)
    }
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('along', new THREE.Float32BufferAttribute(along, 1))
  geometry.setAttribute('side', new THREE.Float32BufferAttribute(side, 1))
  geometry.setIndex(index)
  return geometry
}

const beamVertex = `
attribute float along;
attribute float side;
uniform float floorHeight;
uniform vec3 beamAim;
varying float beamAlong;
varying float beamSide;
varying float beamFacing;
varying float beamFloor;
void main() {
  beamAlong = along;
  beamSide = side;
  #ifdef SPRITE
    vec3 aim = normalize(mat3(modelMatrix) * beamAim);
    vec3 origin = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 middle = origin + aim * along * ${beamLayout.reach.toFixed(1)};
    vec3 across = normalize(cross(aim, cameraPosition - middle));
    vec3 world = middle + across * side * mix(0.08, ${(beamLayout.spread * 0.8).toFixed(2)}, along);
    beamFacing = 1.0;
  #else
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 facing = normalize(mat3(modelMatrix) * normal);
    vec3 sight = normalize(cameraPosition - world);
    float lined = pow(abs(dot(normalize(mat3(modelMatrix) * beamAim), sight)), 4.0);
    beamFacing = sqrt(mix(pow(abs(dot(facing, sight)), 2.0), 1.0, lined * 0.75));
  #endif
  beamFloor = world.y - floorHeight;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`

const beamFragment = `
uniform float beamLevel;
varying float beamAlong;
varying float beamSide;
varying float beamFacing;
varying float beamFloor;
void main() {
  #ifdef SPRITE
    float core = pow(max(0.0, 1.0 - beamSide * beamSide), 1.6);
  #else
    float core = beamFacing * beamFacing;
  #endif
  float falloff = smoothstep(0.0, 0.08, beamAlong) * pow(clamp(1.0 - beamAlong, 0.0, 1.0), 1.7) / (0.35 + beamAlong * 2.2);
  float grounded = smoothstep(0.0, 0.55, beamFloor);
  float glow = beamLevel * core * falloff * grounded * 0.55;
  if (glow < 0.0015) discard;
  gl_FragColor = vec4(vec3(1.0, 0.94, 0.84) * glow, 0.0);
}`

const haloVertex = `
attribute vec3 aim;
attribute float lamp;
uniform float headLevel;
uniform float tailLevel;
uniform float haloScale;
varying vec3 haloColor;
void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 facing = normalize(mat3(modelMatrix) * aim);
  float toward = dot(facing, normalize(cameraPosition - world));
  float level = lamp < 0.5 ? headLevel : tailLevel;
  float shown = level * smoothstep(-0.05, 0.55, toward);
  haloColor = lamp < 0.5 ? vec3(1.0, 0.93, 0.8) * shown * 2.4 : vec3(1.0, 0.06, 0.02) * shown * 3.0;
  vec4 mvPosition = viewMatrix * vec4(world + facing * 0.12, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float size = lamp < 0.5 ? 0.75 : 0.5 + tailLevel * 0.3;
  gl_PointSize = shown > 0.002 ? haloScale * size * (0.55 + 0.45 * toward) / max(0.5, -mvPosition.z) : 0.0;
}`

const haloFragment = `
varying vec3 haloColor;
void main() {
  float reach = length(gl_PointCoord - 0.5) * 2.0;
  if (reach > 1.0) discard;
  float glow = exp(-reach * reach * 7.0) * 1.4 + exp(-reach * 3.2) * 0.25;
  gl_FragColor = vec4(haloColor * glow * (1.0 - reach), 0.0);
}`

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const

export class Lamps {
  group = new THREE.Group()
  level: EffectsLevel = 'off'
  private beams: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null
  private halos: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  private beamUniforms: Record<string, THREE.IUniform>
  private haloUniforms = {
    headLevel: { value: 0 },
    tailLevel: { value: 0 },
    haloScale: { value: 400 },
  }
  private heads: Spot[] = []

  constructor() {
    this.beamUniforms = {
      beamLevel: { value: 0 },
      floorHeight: { value: 0 },
      beamAim: { value: new THREE.Vector3(0, -Math.sin(beamLayout.drop), -1).normalize() },
    }
    this.halos = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        ...additive,
        uniforms: this.haloUniforms,
        vertexShader: haloVertex,
        fragmentShader: haloFragment,
      }),
    )
    this.halos.frustumCulled = false
    this.halos.renderOrder = 4
    this.group.add(this.halos)
  }

  fit(heads: Spot[], tails: Spot[]) {
    this.heads = heads
    const position: number[] = []
    const aim: number[] = []
    const lamp: number[] = []
    for (const [kind, spots] of [heads, tails].entries())
      for (const spot of spots) {
        position.push(...spot)
        aim.push(0, 0, kind ? 1 : -1)
        lamp.push(kind)
      }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
    geometry.setAttribute('aim', new THREE.Float32BufferAttribute(aim, 3))
    geometry.setAttribute('lamp', new THREE.Float32BufferAttribute(lamp, 1))
    this.halos.geometry.dispose()
    this.halos.geometry = geometry
    this.rebuildBeams()
  }

  setLevel(level: EffectsLevel) {
    if (level === this.level) return
    this.level = level
    this.rebuildBeams()
  }

  private rebuildBeams() {
    if (this.beams) {
      this.group.remove(this.beams)
      this.beams.geometry.dispose()
      this.beams.material.dispose()
      this.beams = null
    }
    if (this.level === 'off' || !this.heads.length) return
    const sprite = this.level !== 'ultra'
    this.beams = new THREE.Mesh(
      sprite ? spriteGeometry(this.heads) : coneGeometry(this.heads),
      new THREE.ShaderMaterial({
        ...additive,
        side: THREE.DoubleSide,
        defines: sprite ? { SPRITE: '' } : {},
        uniforms: this.beamUniforms,
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
      }),
    )
    this.beams.frustumCulled = false
    this.beams.renderOrder = 4
    this.group.add(this.beams)
  }

  update(
    headLevel: number,
    tailLevel: number,
    haze: number,
    floor: number,
    viewportHeight: number,
    beamsShown: boolean,
  ) {
    this.haloUniforms.headLevel.value = headLevel * (0.55 + haze * 0.6)
    this.haloUniforms.tailLevel.value = tailLevel
    this.haloUniforms.haloScale.value = viewportHeight * 0.5
    const level = this.beamUniforms.beamLevel
    if (level) level.value = headLevel * haze
    const ground = this.beamUniforms.floorHeight
    if (ground) ground.value = floor
    if (this.beams) this.beams.visible = beamsShown && headLevel * haze > 0.01
  }

  dispose() {
    this.group.removeFromParent()
    this.halos.geometry.dispose()
    this.halos.material.dispose()
    if (this.beams) {
      this.beams.geometry.dispose()
      this.beams.material.dispose()
    }
  }
}

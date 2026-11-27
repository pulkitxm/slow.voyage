import * as THREE from 'three'
import { type AtmosphereProfile, sunDirection } from './atmosphere'
import { type Landscape, landscapeProfiles } from './landscapes'
import { fordDepth, fordShelf } from './world'

export const waterOptics = { waveLift: 0.22, sheen: 0.72, low: 0.02, high: 0.45 }
export const shoreMap = { size: 256, cell: 3, deepest: 8, land: 2 }
export const waterBody = {
  absorption: [0.45, 0.13, 0.09],
  clarity: 0.85,
  slick: 0.22,
  deep: 0.36,
  deepFacing: 0.34,
  calmDepth: 1.5,
  edge: 0.45,
} as const

export function bedDepth(height: number) {
  if (height >= 0) return -Math.min(height, shoreMap.land)
  const lift = (height - fordDepth) / -fordDepth
  return lift <= 0 ? shoreMap.deepest : Math.min(shoreMap.deepest, -fordShelf * Math.log(lift))
}

export function bedTone(landscape: Landscape, winter: boolean) {
  const profile = landscapeProfiles[landscape]
  const soil = new THREE.Color(winter ? '#969b8e' : (profile.field?.soil ?? '#807350'))
  const shore = new THREE.Color(
    profile.shore ? (winter ? '#dde3dc' : '#c5c1a3') : (profile.ground?.light ?? '#c5c1a3'),
  )
  return shore.lerp(soil.multiplyScalar(0.55), 0.6)
}

export class ShoreDepth {
  texture: THREE.DataTexture
  center = new THREE.Vector2()
  ready = false
  private data = new Uint8Array(shoreMap.size * shoreMap.size)
  private column = 0
  private row = 0

  constructor(private height: (x: number, s: number) => number) {
    this.texture = new THREE.DataTexture(this.data, shoreMap.size, shoreMap.size, THREE.RedFormat)
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter
    this.texture.needsUpdate = true
  }

  reset() {
    this.ready = false
  }

  private write(column: number, row: number) {
    const { size, cell, deepest, land } = shoreMap
    const depth = bedDepth(this.height((column + 0.5) * cell, (row + 0.5) * cell))
    const at = (((row % size) + size) % size) * size + (((column % size) + size) % size)
    this.data[at] = Math.round(((depth + land) / (deepest + land)) * 255)
  }

  update(x: number, s: number) {
    const { size, cell } = shoreMap
    const half = size / 2
    const column = Math.floor(x / cell)
    const row = Math.floor(s / cell)
    this.center.set((column + 0.5) * cell, (row + 0.5) * cell)
    const across = column - this.column
    const along = row - this.row
    if (this.ready && !across && !along) return
    if (!this.ready || Math.abs(across) >= half || Math.abs(along) >= half) {
      for (let r = row - half; r < row + half; r++)
        for (let c = column - half; c < column + half; c++) this.write(c, r)
    } else {
      const columns =
        across > 0 ? [this.column + half, column + half] : [column - half, this.column - half]
      for (let c = columns[0] ?? 0; c < (columns[1] ?? 0); c++)
        for (let r = row - half; r < row + half; r++) this.write(c, r)
      const rows = along > 0 ? [this.row + half, row + half] : [row - half, this.row - half]
      for (let r = rows[0] ?? 0; r < (rows[1] ?? 0); r++)
        for (let c = column - half; c < column + half; c++) this.write(c, r)
    }
    this.column = column
    this.row = row
    this.ready = true
    this.texture.needsUpdate = true
  }

  depthAt(x: number, s: number) {
    const { size, cell, deepest, land } = shoreMap
    const column = Math.floor(x / cell)
    const row = Math.floor(s / cell)
    const at = (((row % size) + size) % size) * size + (((column % size) + size) % size)
    return ((this.data[at] ?? 0) / 255) * (deepest + land) - land
  }

  dispose() {
    this.texture.dispose()
  }
}

export function skylineShare(bounce: number) {
  const { waveLift, low, high } = waterOptics
  const reach = Math.min(1, Math.max(0, (bounce + waveLift - low) / (high - low)))
  return reach * reach * (3 - 2 * reach)
}

export function waterSheen(facing: number) {
  return Math.min(waterOptics.sheen, 0.02 + 0.98 * (1 - facing) ** 5)
}

export class Water {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  shore: ShoreDepth | null
  constructor(scene: THREE.Scene, height?: (x: number, s: number) => number) {
    this.shore = height ? new ShoreDepth(height) : null
    const material = new THREE.ShaderMaterial({
      fog: true,
      uniforms: {
        ...THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog ?? {},
          {
            time: { value: 0 },
            deepColor: { value: new THREE.Color('#7595a7') },
            skyColor: { value: new THREE.Color('#dce7e8') },
            horizonColor: { value: new THREE.Color('#dce7e8') },
            zenithColor: { value: new THREE.Color('#9fbcd0') },
            frozen: { value: 0 },
            sunDirection: { value: new THREE.Vector3(0, 1, 0) },
            sunColor: { value: new THREE.Color() },
            glitter: { value: 0 },
            bedColor: { value: new THREE.Color('#5a5546') },
            shoreReady: { value: 0 },
          },
        ]),
        shoreDepthMap: { value: this.shore?.texture ?? null },
        shoreCenter: { value: this.shore?.center ?? new THREE.Vector2() },
      },
      vertexShader: `
#include <fog_pars_vertex>
varying vec3 waterPosition;
void main() {
  waterPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
#include <fog_pars_fragment>
uniform float time;
uniform float frozen;
uniform vec3 deepColor;
uniform vec3 skyColor;
uniform vec3 horizonColor;
uniform vec3 zenithColor;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float glitter;
uniform vec3 bedColor;
uniform sampler2D shoreDepthMap;
uniform vec2 shoreCenter;
uniform float shoreReady;
varying vec3 waterPosition;
vec2 rippleHash(vec2 cell) {
  vec3 h = fract(vec3(mod(cell.xyx, 512.0)) * vec3(0.1031, 0.103, 0.0973));
  h += dot(h, h.yzx + 33.33);
  return fract((h.xx + h.yz) * h.zy) * 2.0 - 1.0;
}
vec3 rippleNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = rippleHash(cell);
  vec2 gb = rippleHash(cell + vec2(1.0, 0.0));
  vec2 gc = rippleHash(cell + vec2(0.0, 1.0));
  vec2 gd = rippleHash(cell + vec2(1.0, 1.0));
  float va = dot(ga, f);
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0, 1.0));
  float value = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd);
  vec2 slope = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
    + du * (u.yx * (va - vb - vc + vd) + vec2(vb, vc) - va);
  return vec3(value, slope);
}
vec2 rippleOctave(vec2 p, float scale, float angle, vec2 drift) {
  float c = cos(angle);
  float s = sin(angle);
  vec2 q = mat2(c, -s, s, c) * p * scale + drift * mod(time, 2048.0);
  float calm = 1.0 - smoothstep(0.35, 1.0, length(fwidth(q)));
  vec2 slope = rippleNoise(q).yz;
  return mat2(c, s, -s, c) * slope * calm;
}
float waterDepthAt(vec2 p) {
  vec2 spot = vec2(p.x, -p.y);
  float stored = texture2D(shoreDepthMap, spot / ${(shoreMap.size * shoreMap.cell).toFixed(1)}).r;
  float reach = max(abs(spot.x - shoreCenter.x), abs(spot.y - shoreCenter.y));
  float known = (1.0 - smoothstep(${(shoreMap.size * shoreMap.cell * 0.4).toFixed(1)}, ${(shoreMap.size * shoreMap.cell * 0.48).toFixed(1)}, reach)) * shoreReady;
  return mix(${shoreMap.deepest.toFixed(1)}, stored * ${(shoreMap.deepest + shoreMap.land).toFixed(1)} - ${shoreMap.land.toFixed(1)}, known);
}
void main() {
  vec2 p = waterPosition.xz;
  float liquid = 1.0 - frozen;
  float depth = max(waterDepthAt(p), 0.0);
  float clock = mod(time, 2048.0);
  vec3 swell = rippleNoise(vec2(p.x * 0.008 + p.y * 0.004, p.y * 0.022 - p.x * 0.006) + vec2(0.021, -0.013) * clock);
  float gust = mix(${waterBody.slick.toFixed(2)}, 1.2, smoothstep(-0.25, 0.25, swell.x));
  vec2 q = p + swell.yz * 2.5;
  vec2 tilt = rippleOctave(q, 0.09, 0.3, vec2(0.05, 0.03)) * 0.8
    + rippleOctave(q, 0.27, 1.7, vec2(-0.12, 0.08)) * 0.75
    + rippleOctave(p, 0.83, 2.9, vec2(0.31, -0.22)) * 0.5
    + rippleOctave(p, 2.6, 4.4, vec2(-0.6, 0.45)) * 0.3
    + rippleOctave(p, 7.1, 5.6, vec2(0.9, 0.7)) * 0.16;
  tilt *= liquid * gust * mix(0.35, 1.0, smoothstep(0.0, ${waterBody.calmDepth.toFixed(1)}, depth));
  vec3 normal = normalize(vec3(tilt.x * 0.09, 1.0, tilt.y * 0.09));
  vec3 viewDirection = normalize(cameraPosition - waterPosition);
  float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec3 bounce = reflect(-viewDirection, normal);
  vec3 skyline = mix(horizonColor, zenithColor, smoothstep(${waterOptics.low.toFixed(2)}, ${waterOptics.high.toFixed(2)}, bounce.y + ${waterOptics.waveLift.toFixed(2)}));
  skyline = mix(skyline, skyColor, 0.25);
  float fresnel = min(${waterOptics.sheen.toFixed(2)}, 0.02 + 0.98 * pow(1.0 - facing, 5.0));
  vec3 body = deepColor * (${waterBody.deep.toFixed(2)} + ${waterBody.deepFacing.toFixed(2)} * facing);
  vec3 clear = exp(-depth * vec3(${waterBody.absorption.map((value) => value.toFixed(2)).join(', ')})) * ${waterBody.clarity.toFixed(2)} * (1.0 - smoothstep(${(shoreMap.deepest / 2).toFixed(1)}, ${shoreMap.deepest.toFixed(1)}, depth)) * mix(1.0, 0.25, frozen);
  body = mix(body, bedColor, clear);
  float film = smoothstep(0.0, ${waterBody.edge.toFixed(2)}, depth);
  fresnel *= mix(1.0, film, liquid);
  vec3 color = mix(body, skyline, fresnel * mix(1.0, 0.86, frozen));
  float glint = clamp(dot(bounce, sunDirection), 0.0, 1.0);
  color += sunColor * (pow(glint, 400.0) * 3.0 + pow(glint, 40.0) * 0.12) * glitter * liquid * film;
  float mirror = liquid * clamp(0.15 + fresnel * 0.85, 0.0, 0.92) * film;
  gl_FragColor = vec4(color, 1.0 + mirror);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000, 80, 80), material)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.y = 0
    scene.add(this.mesh)
  }
  update(x: number, s: number, time: number) {
    this.mesh.position.x = x
    this.mesh.position.z = -s
    if (this.shore) {
      this.shore.update(x, s)
      if (this.mesh.material.uniforms.shoreReady) this.mesh.material.uniforms.shoreReady.value = 1
    }
    if (this.mesh.material.uniforms.time) this.mesh.material.uniforms.time.value = time
  }
  setAppearance(winter: boolean, profile: AtmosphereProfile, landscape: Landscape = 'highlands') {
    const light =
      Math.min(
        1,
        Math.max(0.08, (profile.sunlight / 2.5) * 0.55 + (profile.ambient / 2.6) * 0.45),
      ) ** 1.4
    this.mesh.material.uniforms.bedColor?.value
      .copy(bedTone(landscape, winter))
      .multiplyScalar(light)
    this.mesh.material.uniforms.sunDirection?.value.copy(sunDirection(profile.sunHeight))
    this.mesh.material.uniforms.sunColor?.value.set(profile.sun)
    if (this.mesh.material.uniforms.glitter)
      this.mesh.material.uniforms.glitter.value = profile.sunGlow * 1.5
    this.mesh.material.uniforms.deepColor?.value.set(winter ? profile.frozenWater : profile.water)
    this.mesh.material.uniforms.skyColor?.value.set(profile.waterSky)
    this.mesh.material.uniforms.horizonColor?.value.set(profile.horizon)
    this.mesh.material.uniforms.zenithColor?.value.set(profile.sky)
    if (this.mesh.material.uniforms.frozen)
      this.mesh.material.uniforms.frozen.value = winter ? 1 : 0
  }
  dispose() {
    this.shore?.dispose()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}

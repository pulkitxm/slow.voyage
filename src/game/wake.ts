import * as THREE from 'three'

export const wakeLayout = {
  wheels: 1,
  slices: 11,
  reach: 9.5,
  startSpeed: 7,
  fullSpeed: 30,
  width: [1.75, 4.8],
  height: [0.42, 2.2],
} as const

function plumeGeometry() {
  const positions: number[] = []
  const shape: number[] = []
  const indices: number[] = []
  const { slices, reach, width, height } = wakeLayout
  const quad = (corners: [number, number, number][], along: [number, number], kind: number) => {
    const base = positions.length / 3
    for (const [index, corner] of corners.entries()) {
      positions.push(...corner)
      shape.push(index % 2, index < 2 ? 0 : 1, along[index < 2 ? 0 : 1] ?? 0, kind)
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
  }
  for (let index = 0; index < slices; index++) {
    const along = (index + 0.6) / slices
    const z = along * reach
    const wide = width[0] + (width[1] - width[0]) * along ** 0.8
    const tall = height[0] + (height[1] - height[0]) * along ** 0.7
    quad(
      [
        [-wide / 2, 0, z],
        [wide / 2, 0, z],
        [-wide / 2, tall, z],
        [wide / 2, tall, z],
      ],
      [along, along],
      0,
    )
  }
  const steps = 6
  for (const offset of [-0.8, 0, 0.8])
    for (let index = 0; index < steps; index++) {
      const from = index / steps
      const to = (index + 1) / steps
      const lift = (along: number) => height[0] + (height[1] - height[0]) * along ** 0.7
      const base = positions.length / 3
      for (const [along, top] of [
        [from, 0],
        [from, 1],
        [to, 0],
        [to, 1],
      ] as const) {
        positions.push(offset * (1 + along * 1.6), top ? lift(along) : 0, along * reach)
        shape.push(0.5 + offset * 0.3, top, along, 1)
      }
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('plume', new THREE.Float32BufferAttribute(shape, 4))
  geometry.setIndex(indices)
  return geometry
}

export function wakeStrength(speed: number, wet: boolean, onRoad: boolean, puddle: number) {
  if (!wet || !onRoad) return 0
  const pace =
    (Math.abs(speed) - wakeLayout.startSpeed) / (wakeLayout.fullSpeed - wakeLayout.startSpeed)
  return Math.max(0, Math.min(1, pace)) ** 0.7 * (0.6 + 0.4 * Math.min(1, puddle * 1.5))
}

export class Wake {
  group = new THREE.Group()
  private geometry = plumeGeometry()
  private material: THREE.ShaderMaterial
  private plumes: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = []
  private levels: { value: number }[] = []
  constructor(noise: THREE.IUniform) {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog ?? {},
        { wakeTime: { value: 0 }, wakeLight: { value: 1 }, wakeLevel: { value: 0 } },
      ]),
      vertexShader: `
#include <fog_pars_vertex>
attribute vec4 plume;
varying vec4 wakeShape;
varying float wakeFacing;
void main() {
  wakeShape = plume;
  vec3 wakePlace = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 wakeFace = normalize(mat3(modelMatrix) * (plume.w < 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
  wakeFacing = abs(dot(normalize(cameraPosition - wakePlace), wakeFace));
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
#include <fog_pars_fragment>
uniform sampler2D fieldNoiseMap;
uniform float wakeTime;
uniform float wakeLight;
uniform float wakeLevel;
varying vec4 wakeShape;
varying float wakeFacing;
void main() {
  float along = wakeShape.z;
  float rise = wakeShape.y;
  float across = abs(wakeShape.x - 0.5) * 2.0;
  float churn = texture2D(fieldNoiseMap, vec2(along * 0.13 - wakeTime * 0.21 + wakeShape.x * 0.09, rise * 0.06 + wakeShape.x * 0.11)).r * 0.6
    + texture2D(fieldNoiseMap, vec2(along * 0.37 - wakeTime * 0.47 + 0.4 - wakeShape.x * 0.23, rise * 0.17 - wakeTime * 0.05)).r * 0.4;
  float fade = smoothstep(0.0, 0.12, along) * pow(1.0 - along, 1.3);
  float dome = wakeShape.w < 0.5
    ? (1.0 - smoothstep(0.3, 1.0, across)) * (1.0 - smoothstep(0.08, 1.0, rise)) * smoothstep(0.0, 0.06, rise)
    : (1.0 - smoothstep(0.1, 1.0, rise)) * 0.9;
  float alpha = smoothstep(0.12, 0.55, wakeFacing) * fade * dome * smoothstep(0.25, 0.8, churn + wakeLevel * 0.2) * wakeLevel * 0.62;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vec3(0.82, 0.87, 0.9) * wakeLight, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    })
    this.material.uniforms.fieldNoiseMap = noise
    for (let index = 0; index < wakeLayout.wheels; index++) {
      const material = this.material.clone()
      material.uniforms.fieldNoiseMap = noise
      const level = material.uniforms.wakeLevel ?? { value: 0 }
      const plume = new THREE.Mesh(this.geometry, material)
      plume.frustumCulled = false
      plume.visible = false
      plume.renderOrder = 3
      this.plumes.push(plume)
      this.levels.push(level)
      this.group.add(plume)
    }
  }
  setLight(light: number) {
    for (const plume of this.plumes) {
      const uniform = plume.material.uniforms.wakeLight
      if (uniform) uniform.value = light
    }
  }
  place(
    index: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    level: number,
    time: number,
    dt: number,
  ) {
    const plume = this.plumes[index]
    const uniform = this.levels[index]
    if (!plume || !uniform) return
    uniform.value += (level - uniform.value) * Math.min(1, dt * 5)
    plume.visible = uniform.value > 0.02
    if (!plume.visible) return
    plume.position.set(x, y, z)
    plume.rotation.y = yaw
    const clock = plume.material.uniforms.wakeTime
    if (clock) clock.value = time + index * 3.1
  }
  hide(from: number) {
    for (let index = from; index < this.plumes.length; index++) {
      const plume = this.plumes[index]
      const level = this.levels[index]
      if (plume) plume.visible = false
      if (level) level.value = 0
    }
  }
  dispose() {
    this.group.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
    for (const plume of this.plumes) plume.material.dispose()
  }
}

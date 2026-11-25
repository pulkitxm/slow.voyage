import * as THREE from 'three'

export const particleKind = { smoke: 0, dust: 1, mist: 2, drop: 3, spark: 4 } as const
export type ParticleKind = (typeof particleKind)[keyof typeof particleKind]
export type EffectsLevel = 'ultra' | 'high' | 'off'

export const particleBudget: Record<EffectsLevel, { capacity: number; rate: number }> = {
  ultra: { capacity: 4096, rate: 1 },
  high: { capacity: 1536, rate: 0.45 },
  off: { capacity: 0, rate: 0 },
}

const stride = 16
const vertexShader = `
#include <fog_pars_vertex>
attribute vec4 start;
attribute vec4 motion;
attribute vec4 tone;
attribute vec4 shape;
uniform float time;
uniform vec3 wind;
uniform vec3 sunDirection;
uniform vec3 lampOrigin;
uniform vec3 lampAim;
uniform float lampLevel;
uniform vec3 tailOrigin;
uniform float tailLevel;
varying vec4 puffTone;
varying vec4 puffShape;
varying vec3 puffLamp;
varying vec3 puffSun;
varying vec3 puffView;
varying float puffFloor;
void main() {
  float age = time - start.w;
  float spent = age / motion.w;
  if (age < 0.0 || spent >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float kind = floor(shape.z);
  float seed = fract(shape.z);
  bool streak = kind > 2.5;
  float drag = kind < 0.5 ? 1.4 : kind < 1.5 ? 1.3 : kind < 2.5 ? 2.4 : kind < 3.5 ? 0.5 : 0.35;
  vec3 settle = streak ? vec3(0.0) : wind;
  float carried = (1.0 - exp(-drag * age)) / drag;
  vec3 place = start.xyz + settle * age + (motion.xyz - settle) * carried;
  vec3 velocity = settle + (motion.xyz - settle) * exp(-drag * age);
  float ground = start.y - shape.w;
  float fade = 1.0;
  if (streak) {
    float rise = motion.y;
    float drop = shape.w;
    float landing = (rise + sqrt(rise * rise + 19.62 * drop)) / 9.81;
    if (age < landing) {
      place.y = start.y + rise * age - 4.905 * age * age;
      velocity.y = rise - 9.81 * age;
    } else if (kind > 3.5) {
      float bounce = (9.81 * landing - rise) * 0.32;
      float after = age - landing;
      place.y = ground + max(0.0, bounce * after - 4.905 * after * after);
      velocity.y = bounce - 9.81 * after;
      velocity.xz *= 0.55;
      fade = 1.0 - smoothstep(0.0, 0.25, after);
    } else {
      place.y = ground;
      fade = 0.0;
    }
  } else {
    float lift = kind < 0.5 ? 0.7 : kind < 1.5 ? 0.22 : 0.05;
    place.y += lift * age;
  }
  vec4 centre = modelViewMatrix * vec4(place, 1.0);
  vec2 corner = position.xy;
  vec2 offset;
  float radius;
  if (streak) {
    vec2 flow = (viewMatrix * vec4(velocity, 0.0)).xy;
    float pace = length(flow);
    vec2 aim = flow / max(pace, 0.0001);
    float reach = clamp(pace * (kind > 3.5 ? 0.05 : 0.03), shape.x * 4.0, kind > 3.5 ? 1.2 : 0.5);
    offset = aim * (corner.y * reach) + vec2(aim.y, -aim.x) * (corner.x * shape.x);
    radius = reach;
  } else {
    radius = shape.x * (0.45 + shape.y * (kind < 0.5 ? sqrt(spent) : 1.0 - exp(-age * 2.2)));
    float turn = seed * 6.2832 + age * (seed - 0.5) * 1.4;
    float c = cos(turn);
    float s = sin(turn);
    offset = mat2(c, s, -s, c) * corner * radius;
  }
  vec4 mvPosition = centre;
  mvPosition.xy += offset;
  gl_Position = projectionMatrix * mvPosition;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float height = place.y + right.y * offset.x + up.y * offset.y - ground;
  puffFloor = streak ? 1.0 : smoothstep(-0.05, radius * 0.4, height);
  float bloom = kind < 2.5 ? smoothstep(0.0, kind < 0.5 ? 0.05 : 0.12, spent) * pow(1.0 - spent, kind < 0.5 ? 1.5 : 1.9) : (1.0 - spent);
  float near = streak ? 1.0 : smoothstep(0.4, 3.0, -centre.z - radius * 0.3);
  puffTone = vec4(tone.rgb, tone.a * bloom * fade * near);
  puffShape = vec4(corner, kind, seed + age * 0.05);
  vec3 fromLamp = place - lampOrigin;
  float lampReach = length(fromLamp);
  float beam = smoothstep(0.8, 0.96, dot(fromLamp / max(lampReach, 0.001), lampAim));
  vec3 fromTail = place - tailOrigin;
  puffLamp = vec3(1.0, 0.92, 0.8) * lampLevel * beam / (1.0 + lampReach * lampReach * 0.012)
    + vec3(1.0, 0.07, 0.03) * tailLevel / (1.0 + dot(fromTail, fromTail) * 0.9);
  puffSun = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);
  puffView = normalize(centre.xyz);
  #include <fog_vertex>
}`

const fragmentShader = `
#include <fog_pars_fragment>
uniform sampler2D noiseMap;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform vec3 groundColor;
varying vec4 puffTone;
varying vec4 puffShape;
varying vec3 puffLamp;
varying vec3 puffSun;
varying vec3 puffView;
varying float puffFloor;
void main() {
  vec2 corner = puffShape.xy;
  float kind = puffShape.z;
  vec3 color;
  float alpha;
  float glow = 0.0;
  if (kind > 2.5) {
    float across = exp(-corner.x * corner.x * 3.5);
    float along = 1.0 - smoothstep(0.35, 1.0, abs(corner.y));
    alpha = puffTone.a * across * along;
    if (kind > 3.5) {
      float head = smoothstep(-1.0, 0.8, corner.y);
      alpha = puffTone.a * across * head * (1.0 - smoothstep(0.75, 1.0, corner.y));
      color = puffTone.rgb * mix(vec3(0.7, 0.32, 0.12), vec3(1.0, 0.9, 0.75), head * head);
      glow = 1.0;
    } else {
      color = puffTone.rgb * (skyColor * 1.1 + sunColor * 0.4 + puffLamp * 0.6);
      alpha *= 0.85;
    }
  } else {
    float spread = dot(corner, corner);
    if (spread > 1.0) discard;
    vec2 swirl = corner * 0.025 + vec2(puffShape.w * 1.7, puffShape.w * 0.9);
    float billow = texture2D(noiseMap, swirl).r * 0.62 + texture2D(noiseMap, swirl * 2.7 + 0.31).r * 0.38;
    float body = (1.0 - spread) * (0.2 + billow * 1.6);
    alpha = puffTone.a * smoothstep(0.12, 0.8, body) * puffFloor;
    vec3 normal = normalize(vec3(corner + (billow - 0.5) * 0.7, sqrt(1.0 - spread) + 0.15));
    float facing = dot(normal, puffSun);
    float sunlit = clamp(facing * 0.6 + 0.4, 0.0, 1.0) * (0.55 + 0.45 * billow);
    float scatter = pow(max(0.0, dot(puffView, puffSun)), 5.0) * (kind < 0.5 ? 0.9 : 0.5);
    vec3 dome = mix(groundColor, skyColor, normal.y * 0.5 + 0.5);
    color = puffTone.rgb * (sunColor * (0.3 + 0.7 * sunlit + scatter) + dome * 1.8 + puffLamp * (0.6 + 0.4 * billow));
  }
  if (alpha < 0.003) discard;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float haze = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float haze = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    color = mix(color, fogColor * (1.0 - glow), haze);
  #endif
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha * (1.0 - glow));
}`

export class Particles {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>
  level: EffectsLevel = 'off'
  capacity = 0
  rate = 0
  private data: Float32Array
  private buffer: THREE.InstancedInterleavedBuffer
  private cursor = 0
  private first = -1
  private last = -1
  private wrapped = false
  private uniforms: Record<string, THREE.IUniform>

  constructor(noise: THREE.IUniform) {
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3),
    )
    geometry.setIndex([0, 1, 2, 1, 3, 2])
    this.data = new Float32Array(particleBudget.ultra.capacity * stride)
    for (let slot = 0; slot < particleBudget.ultra.capacity; slot++)
      this.data[slot * stride + 3] = -1e5
    this.buffer = new THREE.InstancedInterleavedBuffer(this.data, stride, 1)
    this.buffer.setUsage(THREE.DynamicDrawUsage)
    for (const [index, name] of ['start', 'motion', 'tone', 'shape'].entries())
      geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(this.buffer, 4, index * 4))
    geometry.instanceCount = 0
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog ?? {},
      {
        time: { value: 0 },
        wind: { value: new THREE.Vector3() },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color() },
        skyColor: { value: new THREE.Color() },
        groundColor: { value: new THREE.Color() },
        lampOrigin: { value: new THREE.Vector3() },
        lampAim: { value: new THREE.Vector3(0, 0, -1) },
        lampLevel: { value: 0 },
        tailOrigin: { value: new THREE.Vector3() },
        tailLevel: { value: 0 },
      },
    ])
    this.uniforms.noiseMap = noise
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    this.mesh.visible = false
  }

  get light() {
    return this.uniforms as {
      wind: { value: THREE.Vector3 }
      sunDirection: { value: THREE.Vector3 }
      sunColor: { value: THREE.Color }
      skyColor: { value: THREE.Color }
      groundColor: { value: THREE.Color }
      lampOrigin: { value: THREE.Vector3 }
      lampAim: { value: THREE.Vector3 }
      lampLevel: { value: number }
      tailOrigin: { value: THREE.Vector3 }
      tailLevel: { value: number }
    }
  }

  setLevel(level: EffectsLevel) {
    if (level === this.level) return
    this.level = level
    const budget = particleBudget[level]
    this.capacity = budget.capacity
    this.rate = budget.rate
    this.mesh.geometry.instanceCount = budget.capacity
    this.mesh.visible = budget.capacity > 0
    this.clear()
  }

  emit(
    kind: ParticleKind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    growth: number,
    floor: number,
    color: THREE.Color,
    opacity: number,
    time: number,
  ) {
    if (!this.capacity) return -1
    const slot = this.cursor
    this.cursor = (slot + 1) % this.capacity
    if (this.cursor === 0) this.wrapped = true
    const data = this.data
    const at = slot * stride
    data[at] = x
    data[at + 1] = y
    data[at + 2] = z
    data[at + 3] = time
    data[at + 4] = vx
    data[at + 5] = vy
    data[at + 6] = vz
    data[at + 7] = life
    data[at + 8] = color.r
    data[at + 9] = color.g
    data[at + 10] = color.b
    data[at + 11] = opacity
    data[at + 12] = size
    data[at + 13] = growth
    data[at + 14] = kind + Math.random() * 0.98
    data[at + 15] = floor
    if (this.first < 0) this.first = slot
    this.last = slot
    return slot
  }

  update(time: number) {
    const clock = this.uniforms.time
    if (clock) clock.value = time
    if (this.first < 0) return
    const buffer = this.buffer
    buffer.clearUpdateRanges()
    if (this.wrapped || this.last < this.first) buffer.addUpdateRange(0, this.capacity * stride)
    else buffer.addUpdateRange(this.first * stride, (this.last - this.first + 1) * stride)
    buffer.needsUpdate = true
    this.first = this.last = -1
    this.wrapped = false
  }

  clear() {
    for (let slot = 0; slot < particleBudget.ultra.capacity; slot++)
      this.data[slot * stride + 3] = -1e5
    this.cursor = 0
    this.first = -1
    this.wrapped = false
    this.buffer.clearUpdateRanges()
    this.buffer.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}

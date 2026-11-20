import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export const cinemaLook = {
  samples: 4,
  bloomLevels: 5,
  bloomThreshold: 3,
  bloomKnee: 0.8,
  bloomStrength: 0.5,
  skyGlow: 2.8,
  occlusionRadius: 0.6,
  occlusionStrength: 0.8,
  occlusionFade: [38, 85],
  contrast: 0.2,
  saturation: 1.1,
  vignette: 0.26,
  rushReach: 0.05,
} as const

const quadVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`

function pass(
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  toneMapped = false,
) {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped,
  })
}

function buffer(type: THREE.TextureDataType) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false })
  target.texture.minFilter = target.texture.magFilter = THREE.LinearFilter
  target.texture.generateMipmaps = false
  return target
}

export class CinematicPipeline {
  scene = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: cinemaLook.samples,
    depthTexture: new THREE.DepthTexture(1, 1),
  })
  private bloom = Array.from({ length: cinemaLook.bloomLevels }, () => buffer(THREE.HalfFloatType))
  private rise = Array.from({ length: cinemaLook.bloomLevels - 1 }, () =>
    buffer(THREE.HalfFloatType),
  )
  private occlusion = [buffer(THREE.UnsignedByteType), buffer(THREE.UnsignedByteType)]
  private size = new THREE.Vector2()
  rush = 0
  lensRain = 0
  lensTime = 0
  air = {
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(),
    hazeColor: new THREE.Color(),
  }
  private bright = pass(
    `
uniform sampler2D source;
uniform vec2 texel;
uniform float threshold;
uniform float knee;
uniform float skyGlow;
varying vec2 vUv;
vec3 glow(vec2 uv) {
  vec4 scene = texture2D(source, uv);
  vec3 color = min(scene.rgb, vec3(24.0)) * mix(skyGlow, 1.0, clamp(scene.a, 0.0, 1.0));
  float level = max(color.r, max(color.g, color.b));
  float soft = clamp(level - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  return color * max(soft, level - threshold) / max(level, 1e-4);
}
void main() {
  vec3 color = glow(vUv + texel * vec2(-1.0, -1.0)) + glow(vUv + texel * vec2(1.0, -1.0)) +
    glow(vUv + texel * vec2(-1.0, 1.0)) + glow(vUv + texel * vec2(1.0, 1.0));
  gl_FragColor = vec4(color * 0.25, 1.0);
}`,
    {
      source: { value: null },
      texel: { value: new THREE.Vector2() },
      threshold: { value: cinemaLook.bloomThreshold },
      knee: { value: cinemaLook.bloomKnee },
      skyGlow: { value: cinemaLook.skyGlow },
    },
  )
  private shrink = pass(
    `
uniform sampler2D source;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 color = texture2D(source, vUv).rgb * 4.0;
  color += texture2D(source, vUv + texel * vec2(-1.0, -1.0)).rgb;
  color += texture2D(source, vUv + texel * vec2(1.0, -1.0)).rgb;
  color += texture2D(source, vUv + texel * vec2(-1.0, 1.0)).rgb;
  color += texture2D(source, vUv + texel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(color / 8.0, 1.0);
}`,
    { source: { value: null }, texel: { value: new THREE.Vector2() } },
  )
  private grow = pass(
    `
uniform sampler2D source;
uniform sampler2D detail;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 color = texture2D(source, vUv + texel * vec2(-1.0, 0.0)).rgb;
  color += texture2D(source, vUv + texel * vec2(1.0, 0.0)).rgb;
  color += texture2D(source, vUv + texel * vec2(0.0, -1.0)).rgb;
  color += texture2D(source, vUv + texel * vec2(0.0, 1.0)).rgb;
  color += (texture2D(source, vUv + texel * vec2(-0.5, -0.5)).rgb +
    texture2D(source, vUv + texel * vec2(0.5, -0.5)).rgb +
    texture2D(source, vUv + texel * vec2(-0.5, 0.5)).rgb +
    texture2D(source, vUv + texel * vec2(0.5, 0.5)).rgb) * 2.0;
  gl_FragColor = vec4(color / 12.0 + texture2D(detail, vUv).rgb, 1.0);
}`,
    {
      source: { value: null },
      detail: { value: null },
      texel: { value: new THREE.Vector2() },
    },
  )
  private shade = pass(
    `
uniform sampler2D depth;
uniform mat4 projection;
uniform mat4 unprojection;
uniform vec2 texel;
uniform float radius;
uniform vec2 fade;
varying vec2 vUv;
vec3 viewPosition(vec2 uv) {
  vec4 clip = vec4(uv * 2.0 - 1.0, texture2D(depth, uv).x * 2.0 - 1.0, 1.0);
  vec4 view = unprojection * clip;
  return view.xyz / view.w;
}
float grain(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}
void main() {
  if (texture2D(depth, vUv).x >= 1.0) {
    gl_FragColor = vec4(1.0);
    return;
  }
  vec3 origin = viewPosition(vUv);
  float distance = -origin.z;
  if (distance > fade.y) {
    gl_FragColor = vec4(1.0);
    return;
  }
  vec3 right = viewPosition(vUv + vec2(texel.x, 0.0)) - origin;
  vec3 left = origin - viewPosition(vUv - vec2(texel.x, 0.0));
  vec3 up = viewPosition(vUv + vec2(0.0, texel.y)) - origin;
  vec3 down = origin - viewPosition(vUv - vec2(0.0, texel.y));
  vec3 across = abs(right.z) < abs(left.z) ? right : left;
  vec3 along = abs(up.z) < abs(down.z) ? up : down;
  vec3 normal = normalize(cross(across, along));
  float reach = radius * projection[1][1] * 0.5 / distance;
  float turn = grain(gl_FragCoord.xy) * 6.2831853;
  float aspect = texel.x / texel.y;
  float occlusion = 0.0;
  for (int index = 0; index < 8; index++) {
    float ring = (float(index) + 0.5) / 8.0;
    float angle = turn + float(index) * 2.3999632;
    vec2 offset = vec2(cos(angle) * aspect, sin(angle)) * reach * sqrt(ring);
    vec3 delta = viewPosition(vUv + offset) - origin;
    float span = dot(delta, delta);
    float facing = max(dot(delta, normal) - 0.012 * distance - 0.01, 0.0);
    occlusion += facing / (span + 0.02) * step(span, radius * radius * 2.5);
  }
  float open = clamp(1.0 - occlusion * radius * 0.42, 0.0, 1.0);
  open = mix(open, 1.0, smoothstep(fade.x, fade.y, distance));
  gl_FragColor = vec4(open, distance / fade.y, 0.0, 1.0);
}`,
    {
      depth: { value: null },
      projection: { value: new THREE.Matrix4() },
      unprojection: { value: new THREE.Matrix4() },
      texel: { value: new THREE.Vector2() },
      radius: { value: cinemaLook.occlusionRadius },
      fade: { value: new THREE.Vector2(...cinemaLook.occlusionFade) },
    },
  )
  private soften = pass(
    `
uniform sampler2D source;
uniform vec2 step;
varying vec2 vUv;
void main() {
  vec2 center = texture2D(source, vUv).rg;
  float total = center.r * 2.0;
  float weight = 2.0;
  for (int index = -2; index <= 2; index++) {
    if (index == 0) continue;
    vec2 tap = texture2D(source, vUv + step * float(index) * 1.4).rg;
    float match = 1.0 - smoothstep(0.0, 0.012, abs(tap.g - center.g));
    total += tap.r * match;
    weight += match;
  }
  gl_FragColor = vec4(total / weight, center.g, 0.0, 1.0);
}`,
    { source: { value: null }, step: { value: new THREE.Vector2() } },
  )
  private develop = pass(
    `
uniform sampler2D source;
uniform sampler2D glow;
uniform sampler2D shade;
uniform float glowStrength;
uniform float shadeStrength;
uniform float contrast;
uniform float saturation;
uniform float vignette;
uniform float aspect;
uniform float rush;
uniform float rushReach;
uniform sampler2D depth;
uniform mat4 unprojection;
uniform mat4 cameraWorld;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 hazeColor;
uniform float haze;
uniform mat4 projection;
uniform vec3 viewUp;
uniform float lensRain;
uniform float lensTime;
varying vec2 vUv;
float grain(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}
float viewDepth(float value) {
  float clip = value * 2.0 - 1.0;
  return (unprojection[2][2] * clip + unprojection[3][2]) / (unprojection[2][3] * clip + unprojection[3][3]);
}
vec3 lensDrops(vec2 uv) {
  vec3 bend = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 7.0 : 13.0;
    vec2 grid = uv * vec2(aspect, 1.0) * scale + float(layer) * 19.7;
    vec2 id = floor(grid);
    vec3 seed = fract(sin(vec3(dot(id, vec2(127.1, 311.7)), dot(id, vec2(269.5, 183.3)), dot(id, vec2(419.2, 371.9)))) * 43758.5453);
    float life = fract(lensTime * (0.05 + seed.z * 0.09) + seed.x * 13.0);
    float present = step(seed.y, 0.22 * lensRain);
    vec2 centre = (seed.xy - 0.5) * 0.5;
    centre.y -= life * life * life * 0.35;
    float radius = (0.045 + seed.z * 0.075) * smoothstep(0.0, 0.03, life) * (1.0 - smoothstep(0.7, 1.0, life));
    vec2 delta = fract(grid) - 0.5 - centre;
    delta.y *= 0.82;
    float drop = (1.0 - smoothstep(radius * 0.2, radius, length(delta))) * present;
    bend.xy -= delta / scale * drop * 1.5 / vec2(aspect, 1.0);
    bend.z += drop;
  }
  return bend;
}
void main() {
  vec3 drops = lensRain > 0.0 ? lensDrops(vUv) : vec3(0.0);
  vec2 sight = vUv + drops.xy;
  vec4 scene = texture2D(source, sight);
  float solid = clamp(scene.a, 0.0, 1.0);
  vec3 color = scene.rgb;
  if (rush > 0.002) {
    vec2 toward = vec2(0.5, 0.44) - vUv;
    float edge = smoothstep(0.16, 0.7, length(toward * vec2(aspect, 1.0)));
    vec2 stride = toward * rush * rushReach * edge / 5.0;
    float jitter = grain(gl_FragCoord.xy);
    for (int index = 1; index <= 8; index++)
      color += texture2D(source, sight + stride * (float(index) - jitter) * 0.625).rgb;
    color /= 9.0;
  }
  float depthValue = texture2D(depth, sight).x;
  float mirror = clamp(scene.a - 1.0, 0.0, 1.0);
  if (mirror > 0.01 && depthValue < 1.0) {
    vec4 start = unprojection * vec4(sight * 2.0 - 1.0, depthValue * 2.0 - 1.0, 1.0);
    vec3 origin = start.xyz / start.w;
    vec3 bounce = reflect(normalize(origin), viewUp);
    float stride = 0.3;
    float travelled = stride * (0.35 + 0.3 * grain(gl_FragCoord.xy));
    for (int index = 0; index < 30; index++) {
      travelled += stride;
      stride *= 1.2;
      vec3 point = origin + bounce * travelled;
      vec4 clip = projection * vec4(point, 1.0);
      if (clip.w <= 0.0) break;
      vec2 spot = clip.xy / clip.w * 0.5 + 0.5;
      if (spot.x < 0.0 || spot.x > 1.0 || spot.y < 0.0 || spot.y > 1.0) break;
      float gap = viewDepth(texture2D(depth, spot).x) - point.z;
      if (gap > 0.0 && gap < 1.2 + travelled * 0.3) {
        vec2 border = smoothstep(vec2(0.0), vec2(0.08), spot) * (1.0 - smoothstep(vec2(0.92), vec2(1.0), spot));
        vec4 seen = texture2D(source, spot);
        vec2 smear = vec2(0.0025, 0.004) * (1.0 + travelled * 0.12);
        vec3 glint = min(seen.rgb, vec3(12.0)) * 2.0;
        glint += min(texture2D(source, spot + smear * vec2(1.0, 0.6)).rgb, vec3(12.0));
        glint += min(texture2D(source, spot + smear * vec2(-1.0, 0.4)).rgb, vec3(12.0));
        glint += min(texture2D(source, spot + smear * vec2(0.5, -1.0)).rgb, vec3(12.0));
        glint += min(texture2D(source, spot + smear * vec2(-0.6, -0.8)).rgb, vec3(12.0));
        glint += min(texture2D(source, spot + smear * vec2(0.0, 1.6)).rgb, vec3(12.0));
        glint += min(texture2D(source, spot + smear * vec2(0.0, -1.7)).rgb, vec3(12.0));
        color = mix(color, glint / 8.0, mirror * border.x * border.y * step(seen.a, 1.01));
        break;
      }
    }
  }
  float open = texture2D(shade, sight).r;
  color *= mix(1.0, pow(open, shadeStrength), solid);
  if (depthValue < 1.0 && haze > 0.0) {
    vec4 view = unprojection * vec4(sight * 2.0 - 1.0, depthValue * 2.0 - 1.0, 1.0);
    view /= view.w;
    float reach = length(view.xyz);
    vec3 ray = normalize((cameraWorld * vec4(view.xyz, 0.0)).xyz);
    float height = (cameraWorld * vec4(view.xyz, 1.0)).y - cameraWorld[3].y;
    float thick = 1.0 - exp(-reach * 0.0006);
    float low = exp(-max(height + 25.0, 0.0) * 0.011);
    float toward = pow(max(dot(ray, sunDirection), 0.0), 5.0);
    vec3 air = hazeColor + sunColor * toward * 0.45;
    color = mix(color, air, clamp(thick * (0.22 + 0.42 * low) * haze, 0.0, 1.0) * solid);
  }
  color += texture2D(glow, sight).rgb * glowStrength;
  color *= 1.0 + drops.z * 0.06;
  vec3 mapped = color;
  #ifdef TONE_MAPPING
  mapped = toneMapping(color);
  #endif
  color = clamp(mix(color, mapped, solid), 0.0, 1.0);
  vec3 display = pow(color, vec3(0.4545));
  display = mix(display, display * display * (3.0 - 2.0 * display), contrast * solid);
  float luma = dot(display, vec3(0.2126, 0.7152, 0.0722));
  display = mix(vec3(luma), display, mix(1.0, saturation, solid));
  vec2 lens = (vUv - 0.5) * vec2(aspect, 1.0);
  display *= 1.0 - vignette * smoothstep(0.42, 1.05, length(lens));
  display += (grain(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(pow(clamp(display, 0.0, 1.0), vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}`,
    {
      source: { value: null },
      glow: { value: null },
      shade: { value: null },
      glowStrength: { value: cinemaLook.bloomStrength },
      shadeStrength: { value: cinemaLook.occlusionStrength },
      contrast: { value: cinemaLook.contrast },
      saturation: { value: cinemaLook.saturation },
      vignette: { value: cinemaLook.vignette },
      aspect: { value: 1 },
      rush: { value: 0 },
      depth: { value: null },
      unprojection: { value: new THREE.Matrix4() },
      cameraWorld: { value: new THREE.Matrix4() },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      hazeColor: { value: new THREE.Color() },
      haze: { value: 1 },
      rushReach: { value: cinemaLook.rushReach },
      projection: { value: new THREE.Matrix4() },
      viewUp: { value: new THREE.Vector3(0, 1, 0) },
      lensRain: { value: 0 },
      lensTime: { value: 0 },
    },
    true,
  )
  private quad = new FullScreenQuad(this.bright)

  constructor(private renderer: THREE.WebGLRenderer) {}

  resize() {
    this.renderer.getDrawingBufferSize(this.size)
    const width = Math.max(1, this.size.x)
    const height = Math.max(1, this.size.y)
    if (this.scene.width === width && this.scene.height === height) return
    this.scene.setSize(width, height)
    let w = width
    let h = height
    for (const [index, target] of this.bloom.entries()) {
      w = Math.max(1, Math.floor(w / 2))
      h = Math.max(1, Math.floor(h / 2))
      target.setSize(w, h)
      this.rise[index]?.setSize(w, h)
    }
    for (const target of this.occlusion)
      target.setSize(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2)))
  }

  private draw(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = material
    this.renderer.setRenderTarget(target)
    this.quad.render(this.renderer)
  }

  private bind(material: THREE.ShaderMaterial, name: string, texture: THREE.Texture | null) {
    const uniform = material.uniforms[name]
    if (uniform) uniform.value = texture
  }

  private texel(material: THREE.ShaderMaterial, source: THREE.WebGLRenderTarget) {
    this.bind(material, 'source', source.texture)
    material.uniforms.texel?.value.set(1 / source.width, 1 / source.height)
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const renderer = this.renderer
    this.resize()
    renderer.setRenderTarget(this.scene)
    renderer.render(scene, camera)
    const reset = renderer.info.autoReset
    renderer.info.autoReset = false
    try {
      const [first, ...lower] = this.bloom
      if (!first) return
      this.texel(this.bright, this.scene)
      this.draw(this.bright, first)
      let previous = first
      for (const target of lower) {
        this.texel(this.shrink, previous)
        this.draw(this.shrink, target)
        previous = target
      }
      let glow = previous
      for (let index = this.bloom.length - 2; index >= 0; index--) {
        const detail = this.bloom[index]
        const target = this.rise[index]
        if (!detail || !target) continue
        this.texel(this.grow, glow)
        this.bind(this.grow, 'detail', detail.texture)
        this.draw(this.grow, target)
        glow = target
      }
      const [rough, smooth] = this.occlusion
      if (!rough || !smooth) return
      const shade = this.shade.uniforms
      this.bind(this.shade, 'depth', this.scene.depthTexture)
      shade.projection?.value.copy(camera.projectionMatrix)
      shade.unprojection?.value.copy(camera.projectionMatrixInverse)
      shade.texel?.value.set(1 / rough.width, 1 / rough.height)
      this.draw(this.shade, rough)
      this.bind(this.soften, 'source', rough.texture)
      this.soften.uniforms.step?.value.set(1 / rough.width, 0)
      this.draw(this.soften, smooth)
      this.bind(this.soften, 'source', smooth.texture)
      this.soften.uniforms.step?.value.set(0, 1 / rough.height)
      this.draw(this.soften, rough)
      const develop = this.develop.uniforms
      this.bind(this.develop, 'source', this.scene.texture)
      this.bind(this.develop, 'glow', glow.texture)
      this.bind(this.develop, 'shade', rough.texture)
      if (develop.aspect) develop.aspect.value = this.scene.width / this.scene.height
      if (develop.rush) develop.rush.value = this.rush
      this.bind(this.develop, 'depth', this.scene.depthTexture)
      develop.unprojection?.value.copy(camera.projectionMatrixInverse)
      develop.projection?.value.copy(camera.projectionMatrix)
      develop.viewUp?.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse)
      if (develop.lensRain) develop.lensRain.value = this.lensRain
      if (develop.lensTime) develop.lensTime.value = this.lensTime
      develop.cameraWorld?.value.copy(camera.matrixWorld)
      develop.sunDirection?.value.copy(this.air.sunDirection)
      develop.sunColor?.value.copy(this.air.sunColor)
      develop.hazeColor?.value.copy(this.air.hazeColor)
      this.draw(this.develop, null)
    } finally {
      renderer.setRenderTarget(null)
      renderer.info.autoReset = reset
    }
  }

  dispose() {
    this.scene.depthTexture?.dispose()
    this.scene.dispose()
    for (const target of [...this.bloom, ...this.rise, ...this.occlusion]) target.dispose()
    for (const material of [
      this.bright,
      this.shrink,
      this.grow,
      this.shade,
      this.soften,
      this.develop,
    ])
      material.dispose()
    this.quad.dispose()
  }
}

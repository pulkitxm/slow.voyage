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
varying vec2 vUv;
float grain(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}
void main() {
  vec4 scene = texture2D(source, vUv);
  float solid = clamp(scene.a, 0.0, 1.0);
  vec3 color = scene.rgb;
  if (rush > 0.002) {
    vec2 toward = vec2(0.5, 0.44) - vUv;
    float edge = smoothstep(0.16, 0.7, length(toward * vec2(aspect, 1.0)));
    vec2 stride = toward * rush * rushReach * edge / 5.0;
    float jitter = grain(gl_FragCoord.xy);
    for (int index = 1; index <= 5; index++)
      color += texture2D(source, vUv + stride * (float(index) - jitter)).rgb;
    color /= 6.0;
  }
  float open = texture2D(shade, vUv).r;
  color *= mix(1.0, pow(open, shadeStrength), solid);
  color += texture2D(glow, vUv).rgb * glowStrength;
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
      rushReach: { value: cinemaLook.rushReach },
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

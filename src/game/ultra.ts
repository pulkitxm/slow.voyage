import { N8AOPostPass } from 'n8ao'
import {
  BlendFunction,
  BloomEffect,
  EdgeDetectionMode,
  Effect,
  EffectAttribute,
  EffectPass,
  SMAAEffect,
  SMAAPreset,
  VignetteEffect,
} from 'postprocessing'
import * as THREE from 'three'
import { brightFragment, cinemaLook } from './cinema'
import { reliefLevels } from './governor'

export const ultraLook = {
  samples: 4,
  occlusionRadius: 1.5,
  occlusionFalloff: 1,
  occlusionStrength: 2.6,
  occlusionSamples: 16,
  bloomLevels: 6,
  bloomRadius: 0.6,
  bloomStrength: 1.6,
  contrast: 0.05,
  saturation: 1,
  vignetteOffset: 0.32,
  vignetteDarkness: 0.42,
} as const

class BrightMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        inputBuffer: { value: null },
        texel: { value: new THREE.Vector2() },
        threshold: { value: cinemaLook.bloomThreshold },
        knee: { value: cinemaLook.bloomKnee },
      },
      vertexShader: `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`,
      fragmentShader: brightFragment('inputBuffer'),
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    })
  }

  set inputBuffer(texture: THREE.Texture | null) {
    const uniform = this.uniforms.inputBuffer
    if (uniform) uniform.value = texture
  }
}

class GlowEffect extends BloomEffect {
  active = true
  bright = new BrightMaterial()

  constructor() {
    super({
      blendFunction: BlendFunction.ADD,
      mipmapBlur: true,
      levels: ultraLook.bloomLevels,
      radius: ultraLook.bloomRadius,
      intensity: ultraLook.bloomStrength,
    })
    this.luminancePass.fullscreenMaterial.dispose()
    this.luminancePass.fullscreenMaterial = this.bright
    this.luminancePass.resolution.scale = 0.5
  }

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget) {
    if (!this.active) return
    this.bright.uniforms.texel?.value.set(1 / inputBuffer.width, 1 / inputBuffer.height)
    super.update(renderer, inputBuffer)
  }

  show(active: boolean) {
    this.active = active
    this.intensity = active ? ultraLook.bloomStrength : 0
  }
}

class LensEffect extends Effect {
  rush = new THREE.Uniform(0)
  lensRain = new THREE.Uniform(0)
  lensTime = new THREE.Uniform(0)
  unprojection = new THREE.Uniform(new THREE.Matrix4())
  projection = new THREE.Uniform(new THREE.Matrix4())
  cameraWorld = new THREE.Uniform(new THREE.Matrix4())
  viewUp = new THREE.Uniform(new THREE.Vector3(0, 1, 0))
  sunDirection = new THREE.Uniform(new THREE.Vector3(0, 1, 0))
  sunColor = new THREE.Uniform(new THREE.Color())
  hazeColor = new THREE.Uniform(new THREE.Color())
  scatter = new THREE.Uniform(new THREE.Vector3(1, 1, 1))

  constructor() {
    super(
      'LensEffect',
      `
uniform float rush;
uniform float rushReach;
uniform float lensRain;
uniform float lensTime;
uniform mat4 unprojection;
uniform mat4 projection;
uniform mat4 cameraWorld;
uniform vec3 viewUp;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 hazeColor;
uniform vec3 scatter;
vec3 lensBend = vec3(0.0);
float grain(const in vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}
float viewDepth(const in float value) {
  float clip = value * 2.0 - 1.0;
  return (unprojection[2][2] * clip + unprojection[3][2]) / (unprojection[2][3] * clip + unprojection[3][3]);
}
vec3 lensDrops(const in vec2 place) {
  vec3 bend = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 7.0 : 13.0;
    vec2 grid = place * vec2(aspect, 1.0) * scale + float(layer) * 19.7;
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
void mainUv(inout vec2 uv) {
  if (lensRain > 0.0) {
    lensBend = lensDrops(uv);
    uv += lensBend.xy;
  }
}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float solid = clamp(inputColor.a, 0.0, 1.0);
  vec3 color = inputColor.rgb;
  if (rush > 0.002) {
    vec2 toward = vec2(0.5, 0.44) - vUv;
    float edge = smoothstep(0.16, 0.7, length(toward * vec2(aspect, 1.0)));
    vec2 stride = toward * rush * rushReach * edge / 5.0;
    float jitter = grain(gl_FragCoord.xy);
    for (int index = 1; index <= 8; index++)
      color += texture2D(inputBuffer, uv + stride * (float(index) - jitter) * 0.625).rgb;
    color /= 9.0;
  }
  float mirror = clamp(inputColor.a - 1.0, 0.0, 1.0);
  if (mirror > 0.01 && depth < 1.0) {
    vec4 start = unprojection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
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
      float gap = viewDepth(readDepth(spot)) - point.z;
      if (gap > 0.0 && gap < 1.2 + travelled * 0.3) {
        vec2 border = smoothstep(vec2(0.0), vec2(0.08), spot) * (1.0 - smoothstep(vec2(0.92), vec2(1.0), spot));
        vec4 seen = texture2D(inputBuffer, spot);
        vec2 smear = vec2(0.0025, 0.004) * (1.0 + travelled * 0.12);
        vec3 glint = min(seen.rgb, vec3(12.0)) * 2.0;
        glint += min(texture2D(inputBuffer, spot + smear * vec2(1.0, 0.6)).rgb, vec3(12.0));
        glint += min(texture2D(inputBuffer, spot + smear * vec2(-1.0, 0.4)).rgb, vec3(12.0));
        glint += min(texture2D(inputBuffer, spot + smear * vec2(0.5, -1.0)).rgb, vec3(12.0));
        glint += min(texture2D(inputBuffer, spot + smear * vec2(-0.6, -0.8)).rgb, vec3(12.0));
        glint += min(texture2D(inputBuffer, spot + smear * vec2(0.0, 1.6)).rgb, vec3(12.0));
        glint += min(texture2D(inputBuffer, spot + smear * vec2(0.0, -1.7)).rgb, vec3(12.0));
        color = mix(color, glint / 8.0, mirror * border.x * border.y * step(seen.a, 1.01));
        break;
      }
    }
  }
  if (depth < 1.0) {
    vec4 view = unprojection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    view /= view.w;
    float reach = length(view.xyz);
    vec3 ray = normalize((cameraWorld * vec4(view.xyz, 0.0)).xyz);
    float height = (cameraWorld * vec4(view.xyz, 1.0)).y - cameraWorld[3].y;
    vec3 thick = 1.0 - exp(-reach * 0.0006 * scatter);
    float low = exp(-max(height + 25.0, 0.0) * 0.011);
    float toward = pow(max(dot(ray, sunDirection), 0.0), 5.0);
    vec3 air = hazeColor + sunColor * toward * 0.45;
    color = mix(color, air, clamp(thick * (0.22 + 0.42 * low), 0.0, 1.0) * solid);
  }
  outputColor = vec4(color * (1.0 + lensBend.z * 0.06), inputColor.a);
}`,
      { attributes: EffectAttribute.DEPTH },
    )
    for (const name of [
      'rush',
      'lensRain',
      'lensTime',
      'unprojection',
      'projection',
      'cameraWorld',
      'viewUp',
      'sunDirection',
      'sunColor',
      'hazeColor',
      'scatter',
    ] as const)
      this.uniforms.set(name, this[name])
    this.uniforms.set('rushReach', new THREE.Uniform(cinemaLook.rushReach))
  }
}

class GradeEffect extends Effect {
  constructor() {
    super(
      'GradeEffect',
      `
#include <tonemapping_pars_fragment>
uniform float contrast;
uniform float saturation;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 color = clamp(CustomToneMapping(inputColor.rgb), 0.0, 1.0);
  vec3 display = pow(color, vec3(0.4545));
  display = mix(display, display * display * (3.0 - 2.0 * display), contrast);
  float luma = dot(display, vec3(0.2126, 0.7152, 0.0722));
  display = mix(vec3(luma), display, saturation);
  outputColor = vec4(pow(clamp(display, 0.0, 1.0), vec3(2.2)), 1.0);
}`,
      {
        uniforms: new Map<string, THREE.Uniform>([
          ['contrast', new THREE.Uniform(ultraLook.contrast)],
          ['saturation', new THREE.Uniform(ultraLook.saturation)],
        ]),
      },
    )
  }
}

function buffer() {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  })
  target.texture.generateMipmaps = false
  return target
}

export class UltraPipeline {
  scene = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: ultraLook.samples,
    depthTexture: new THREE.DepthTexture(1, 1),
  })
  rush = 0
  lensRain = 0
  lensTime = 0
  air = {
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(),
    hazeColor: new THREE.Color(),
    scatter: new THREE.Vector3(1, 1, 1),
  }
  scale = 1
  private shaded = buffer()
  private graded = buffer()
  private size = new THREE.Vector2()
  private occlusion: N8AOPostPass
  private lens = new LensEffect()
  private glow = new GlowEffect()
  private develop: EffectPass
  private smooth: EffectPass

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.occlusion = new N8AOPostPass(scene, camera, 1, 1)
    const occlusion = this.occlusion.configuration
    occlusion.transparencyAware = false
    this.occlusion.autoDetectTransparency = false
    occlusion.halfRes = true
    occlusion.gammaCorrection = false
    occlusion.aoSamples = ultraLook.occlusionSamples
    occlusion.denoiseSamples = 8
    occlusion.aoRadius = ultraLook.occlusionRadius
    occlusion.distanceFalloff = ultraLook.occlusionFalloff
    occlusion.intensity = ultraLook.occlusionStrength
    this.develop = new EffectPass(
      camera,
      this.lens,
      this.glow,
      new GradeEffect(),
      new VignetteEffect({
        offset: ultraLook.vignetteOffset,
        darkness: ultraLook.vignetteDarkness,
      }),
    )
    this.smooth = new EffectPass(
      camera,
      new SMAAEffect({ preset: SMAAPreset.HIGH, edgeDetectionMode: EdgeDetectionMode.COLOR }),
    )
    this.smooth.renderToScreen = true
    this.smooth.dithering = true
    const alpha = renderer.getContext().getContextAttributes()?.alpha ?? false
    const depth = this.scene.depthTexture
    for (const pass of [this.occlusion, this.develop, this.smooth]) {
      pass.initialize(renderer, alpha, THREE.HalfFloatType)
      if (depth) pass.setDepthTexture(depth)
    }
  }

  tune(scale: number, relief: number) {
    this.scale = scale
    this.occlusion.enabled = relief < reliefLevels.flat
    this.glow.show(relief < reliefLevels.plain)
  }

  resize() {
    this.renderer.getDrawingBufferSize(this.size)
    const width = Math.max(1, Math.round(this.size.x * this.scale))
    const height = Math.max(1, Math.round(this.size.y * this.scale))
    if (this.scene.width === width && this.scene.height === height) return
    this.scene.setSize(width, height)
    this.shaded.setSize(width, height)
    this.graded.setSize(width, height)
    for (const pass of [this.occlusion, this.develop, this.smooth]) pass.setSize(width, height)
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const renderer = this.renderer
    this.resize()
    renderer.setRenderTarget(this.scene)
    renderer.render(scene, camera)
    const reset = renderer.info.autoReset
    renderer.info.autoReset = false
    try {
      let source = this.scene
      if (this.occlusion.enabled) {
        this.occlusion.render(renderer, source, this.shaded)
        source = this.shaded
      }
      const lens = this.lens
      lens.rush.value = this.rush
      lens.lensRain.value = this.lensRain
      lens.lensTime.value = this.lensTime
      lens.unprojection.value.copy(camera.projectionMatrixInverse)
      lens.projection.value.copy(camera.projectionMatrix)
      lens.cameraWorld.value.copy(camera.matrixWorld)
      lens.viewUp.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse)
      lens.sunDirection.value.copy(this.air.sunDirection)
      lens.sunColor.value.copy(this.air.sunColor)
      lens.hazeColor.value.copy(this.air.hazeColor)
      lens.scatter.value.copy(this.air.scatter)
      this.develop.render(renderer, source, this.graded, 0)
      this.smooth.render(renderer, this.graded, this.shaded, 0)
    } finally {
      renderer.setRenderTarget(null)
      renderer.info.autoReset = reset
    }
  }

  dispose() {
    this.scene.depthTexture?.dispose()
    this.scene.dispose()
    this.shaded.dispose()
    this.graded.dispose()
    this.glow.bright.dispose()
    this.occlusion.depthMipAtlas.dispose()
    for (const pass of [this.occlusion, this.develop, this.smooth]) pass.dispose()
  }
}

import * as THREE from 'three'

export const skyline = {
  horizon: { value: new THREE.Color('#dfe9ee') },
  zenith: { value: new THREE.Color('#7fb0dc') },
  ground: { value: new THREE.Color('#3b4034') },
  cloud: { value: new THREE.Color('#f4f6f5') },
  clouds: { value: 0.5 },
  strength: { value: 1 },
}

export const glassFace = { floor: 0.3, solid: 0.07, opacity: 0.5 }
export const paintFloor = 0.045
export const skylineDetail = { clear: 0.95, cover: 0.75, soft: 0.18, ridge: 0.025, relief: 0.085 }

export function cloudCover(clouds: number, billow: number) {
  const from = skylineDetail.clear - clouds * skylineDetail.cover
  const reach = Math.min(1, Math.max(0, (billow - from) / skylineDetail.soft))
  return reach * reach * (3 - 2 * reach)
}

const reflecting = new WeakSet<THREE.Material>()

export function reflectSkyline(material: THREE.MeshStandardMaterial, gain = 1, floor = paintFloor) {
  if (reflecting.has(material)) return
  reflecting.add(material)
  const compile = material.onBeforeCompile
  const key = material.customProgramCacheKey()
  const share = { value: gain }
  const facing = { value: floor }
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer)
    shader.uniforms.skylineHorizon = skyline.horizon
    shader.uniforms.skylineZenith = skyline.zenith
    shader.uniforms.skylineGround = skyline.ground
    shader.uniforms.skylineCloud = skyline.cloud
    shader.uniforms.skylineClouds = skyline.clouds
    shader.uniforms.skylineStrength = skyline.strength
    shader.uniforms.skylineGain = share
    shader.uniforms.skylineFloor = facing
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 skylineHorizon;
uniform vec3 skylineZenith;
uniform vec3 skylineGround;
uniform vec3 skylineCloud;
uniform float skylineClouds;
uniform float skylineStrength;
uniform float skylineGain;
uniform float skylineFloor;
float skylineHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float skylineNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(skylineHash(cell), skylineHash(cell + vec2(1.0, 0.0)), f.x),
    mix(skylineHash(cell + vec2(0.0, 1.0)), skylineHash(cell + vec2(1.0, 1.0)), f.x),
    f.y
  );
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 skylineView = normalize(vViewPosition);
vec3 skylineBounce = inverseTransformDirection(reflect(-skylineView, normal), viewMatrix);
float skylineRise = skylineBounce.y;
vec3 skylineAbove = mix(skylineHorizon, skylineZenith, pow(clamp(skylineRise, 0.0, 1.0), 0.45));
vec2 skylineDome = skylineBounce.xz / (0.3 + max(skylineRise, 0.0));
float skylineBillow = skylineNoise(skylineDome * 1.6) * 0.62 + skylineNoise(skylineDome * 4.1 + 9.0) * 0.38;
float skylineFrom = ${skylineDetail.clear.toFixed(2)} - skylineClouds * ${skylineDetail.cover.toFixed(2)};
float skylineCover = smoothstep(skylineFrom, skylineFrom + ${skylineDetail.soft.toFixed(2)}, skylineBillow);
skylineAbove = mix(skylineAbove, skylineCloud, skylineCover * smoothstep(0.03, 0.25, skylineRise));
vec2 skylineRound = normalize(skylineBounce.xz + vec2(0.00001)) * 2.6;
float skylineRidge = ${skylineDetail.ridge.toFixed(3)} + ${skylineDetail.relief.toFixed(3)} * skylineNoise(skylineRound + 5.0);
float skylineHills = 1.0 - smoothstep(skylineRidge - 0.012, skylineRidge + 0.012, skylineRise);
skylineAbove = mix(skylineAbove, mix(skylineGround, skylineHorizon, 0.3), skylineHills);
vec3 skylineBelow = mix(skylineHorizon * 0.5, skylineGround, smoothstep(0.0, 0.3, -skylineRise));
vec3 skylineSeen = mix(skylineBelow, skylineAbove, smoothstep(-0.012, 0.012, skylineRise));
float skylineGlance = skylineFloor + (1.0 - skylineFloor) * pow(1.0 - clamp(dot(normal, skylineView), 0.0, 1.0), 5.0);
outgoingLight += skylineSeen * skylineGlance * skylineStrength * skylineGain;
#include <opaque_fragment>`,
      )
  }
  material.customProgramCacheKey = () => `${key}-skyline-detailed`
}

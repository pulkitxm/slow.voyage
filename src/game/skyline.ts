import * as THREE from 'three'

export const skyline = {
  horizon: { value: new THREE.Color('#dfe9ee') },
  zenith: { value: new THREE.Color('#7fb0dc') },
  ground: { value: new THREE.Color('#3b4034') },
  strength: { value: 1 },
}

export function reflectSkyline(material: THREE.MeshStandardMaterial) {
  const compile = material.onBeforeCompile
  const key = material.customProgramCacheKey()
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer)
    shader.uniforms.skylineHorizon = skyline.horizon
    shader.uniforms.skylineZenith = skyline.zenith
    shader.uniforms.skylineGround = skyline.ground
    shader.uniforms.skylineStrength = skyline.strength
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 skylineHorizon;\nuniform vec3 skylineZenith;\nuniform vec3 skylineGround;\nuniform float skylineStrength;',
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 skylineView = normalize(vViewPosition);
vec3 skylineBounce = inverseTransformDirection(reflect(-skylineView, normal), viewMatrix);
float skylineRise = skylineBounce.y;
vec3 skylineAbove = mix(skylineHorizon, skylineZenith, pow(clamp(skylineRise, 0.0, 1.0), 0.45));
vec3 skylineBelow = mix(skylineHorizon * 0.5, skylineGround, smoothstep(0.0, 0.3, -skylineRise));
vec3 skylineSeen = mix(skylineBelow, skylineAbove, smoothstep(-0.012, 0.012, skylineRise));
float skylineGlance = 0.045 + 0.955 * pow(1.0 - clamp(dot(normal, skylineView), 0.0, 1.0), 5.0);
outgoingLight += skylineSeen * skylineGlance * skylineStrength;
#include <opaque_fragment>`,
      )
  }
  material.customProgramCacheKey = () => `${key}-skyline`
}

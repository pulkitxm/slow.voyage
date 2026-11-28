import * as THREE from 'three'
import type { Landscape } from './landscapes'
import type { Settings, Vehicle } from './world'

export const grimeRates = {
  base: 0.0065,
  wet: 2.6,
  storm: 3.6,
  loose: 9,
  wading: 30,
  snow: 2.2,
  standing: 0,
} as const

export interface GrimeConditions {
  metres: number
  offroad: boolean
  wading: boolean
  weather: Settings['weather']
  season: Settings['season']
}

export function grimeGain(conditions: GrimeConditions) {
  if (conditions.metres <= 0) return 0
  const km = conditions.metres / 1000
  let rate = 1
  if (conditions.weather === 'rain') rate *= grimeRates.wet
  if (conditions.weather === 'storm') rate *= grimeRates.storm
  if (conditions.season === 'winter') rate *= grimeRates.snow
  if (conditions.offroad) rate *= grimeRates.loose
  if (conditions.wading) rate *= grimeRates.wading
  return grimeRates.base * rate * km * 10
}

export function accumulate(level: number, gain: number) {
  if (gain <= 0) return level
  const room = 1 - level
  return Math.min(1, level + gain * (0.35 + 0.65 * room))
}

export const grimeTints: Record<Landscape, string> = {
  highlands: '#5b4a35',
  alpine: '#6a6256',
  desert: '#b59a72',
  forest: '#463a2b',
  canyon: '#9a5a3a',
  fjord: '#5c5750',
  jungle: '#4b3a26',
}

export function grimeTint(settings: Pick<Settings, 'landscape' | 'season'>) {
  return settings.season === 'winter' ? '#b9b8b0' : grimeTints[settings.landscape]
}

const storageKey = 'slow-voyage-grime'

export function loadGrime(
  storage: Pick<Storage, 'getItem'> | null,
): Partial<Record<Vehicle, number>> {
  try {
    const stored = JSON.parse(storage?.getItem(storageKey) ?? 'null') as unknown
    if (!stored || typeof stored !== 'object') return {}
    const levels: Partial<Record<Vehicle, number>> = {}
    for (const [key, value] of Object.entries(stored))
      if (typeof value === 'number' && Number.isFinite(value))
        levels[key as Vehicle] = Math.max(0, Math.min(1, value))
    return levels
  } catch {
    return {}
  }
}

export function keepGrime(
  storage: Pick<Storage, 'setItem'> | null,
  levels: Partial<Record<Vehicle, number>>,
) {
  try {
    storage?.setItem(storageKey, JSON.stringify(levels))
  } catch {}
}

export class GrimeUniforms {
  level = { value: 0 }
  tint = { value: new THREE.Color(grimeTints.highlands) }
  frame = { value: new THREE.Matrix4() }
  span = { value: new THREE.Vector4(-2.3, 2.3, 0.345, 1.3) }
  foam = { value: 0 }
  foamSweep = { value: 0 }
  rinseSweep = { value: 0 }
  wet = { value: 0 }
  paintNext = { value: new THREE.Color() }
  paintSweep = { value: 0 }
}

const grimeCommon = `
uniform float grimeLevel;
uniform vec3 grimeTint;
uniform vec4 grimeSpan;
uniform float grimeFoam;
uniform float grimeFoamSweep;
uniform float grimeRinseSweep;
uniform float grimeWet;
uniform vec3 grimePaintNext;
uniform float grimePaintSweep;
varying vec3 vGrimePosition;
float grimeHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float grimeNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(grimeHash(cell), grimeHash(cell + vec3(1.0, 0.0, 0.0)), f.x),
        mix(grimeHash(cell + vec3(0.0, 1.0, 0.0)), grimeHash(cell + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(grimeHash(cell + vec3(0.0, 0.0, 1.0)), grimeHash(cell + vec3(1.0, 0.0, 1.0)), f.x),
        mix(grimeHash(cell + vec3(0.0, 1.0, 1.0)), grimeHash(cell + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}
`

const grimeVertex = `
uniform mat4 grimeFrame;
varying vec3 vGrimePosition;
`

const grimeSurface = `
float grimeAlong = clamp((vGrimePosition.z - grimeSpan.x) / max(0.001, grimeSpan.y - grimeSpan.x), 0.0, 1.0);
float grimeBlotch = grimeNoise(vGrimePosition * 3.1) * 0.65 + grimeNoise(vGrimePosition * 9.0 + 4.0) * 0.35;
float grimeFleck = grimeNoise(vGrimePosition * 41.0);
float grimeLow = 1.0 - smoothstep(0.22, 0.95, vGrimePosition.y);
float grimeArc = 0.0;
for (int axle = 0; axle < 2; axle++) {
  float grimeAxle = axle == 0 ? grimeSpan.w : -grimeSpan.w;
  vec2 grimeHub = vec2(vGrimePosition.z - grimeAxle, vGrimePosition.y - grimeSpan.z);
  float grimeReach = length(grimeHub);
  grimeArc = max(grimeArc, (1.0 - smoothstep(grimeSpan.z + 0.08, grimeSpan.z + 0.55, grimeReach)) * smoothstep(-0.3, 0.2, grimeHub.y + 0.25));
}
float grimeUp = smoothstep(0.75, 1.3, vGrimePosition.y);
float grimeCover = grimeLevel * (0.18 + 1.25 * grimeLow + 0.9 * grimeArc + 0.12 * grimeUp);
grimeCover += (grimeBlotch - 0.5) * 0.7 * grimeLevel + (grimeFleck - 0.5) * 0.25 * grimeLevel;
float grimeMask = smoothstep(0.12, 0.8, grimeCover) * smoothstep(0.0, 0.08, grimeLevel);
float grimeRinsed = 1.0 - smoothstep(grimeRinseSweep - 0.06, grimeRinseSweep + 0.02, grimeAlong);
grimeMask *= 1.0 - grimeRinsed * step(0.001, grimeRinseSweep);
float grimeLather = grimeFoam * (1.0 - smoothstep(grimeFoamSweep - 0.05, grimeFoamSweep + 0.03, grimeAlong));
grimeLather *= 1.0 - grimeRinsed * step(0.001, grimeRinseSweep);
grimeLather *= mix(0.42, 1.0, smoothstep(0.3, 0.68, grimeNoise(vGrimePosition * 6.0))) * (0.82 + 0.18 * grimeNoise(vGrimePosition * 44.0));
float grimeSprayed = (1.0 - smoothstep(grimePaintSweep - 0.06, grimePaintSweep + 0.02, grimeAlong + (grimeBlotch - 0.5) * 0.05)) * step(0.001, grimePaintSweep);
`

export function applyGrime(material: THREE.MeshStandardMaterial, uniforms: GrimeUniforms) {
  const compile = material.onBeforeCompile
  const key = material.customProgramCacheKey()
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer)
    shader.uniforms.grimeLevel = uniforms.level
    shader.uniforms.grimeTint = uniforms.tint
    shader.uniforms.grimeFrame = uniforms.frame
    shader.uniforms.grimeSpan = uniforms.span
    shader.uniforms.grimeFoam = uniforms.foam
    shader.uniforms.grimeFoamSweep = uniforms.foamSweep
    shader.uniforms.grimeRinseSweep = uniforms.rinseSweep
    shader.uniforms.grimeWet = uniforms.wet
    shader.uniforms.grimePaintNext = uniforms.paintNext
    shader.uniforms.grimePaintSweep = uniforms.paintSweep
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${grimeVertex}`)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vGrimePosition = (grimeFrame * modelMatrix * vec4(transformed, 1.0)).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${grimeCommon}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${grimeSurface}
diffuseColor.rgb = mix(diffuseColor.rgb, grimePaintNext, grimeSprayed);
vec3 grimeMud = grimeTint * (0.72 + 0.5 * grimeBlotch) * (0.85 + 0.3 * grimeFleck);
diffuseColor.rgb = mix(diffuseColor.rgb, grimeMud, grimeMask * 0.94);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.94, 0.95), grimeLather * 0.92);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.97, grimeMask);
roughnessFactor = mix(roughnessFactor, 0.55, grimeLather);
roughnessFactor = mix(roughnessFactor, 0.14, grimeWet * (1.0 - grimeMask));`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= 1.0 - max(grimeMask, grimeLather * 0.7);
#endif`,
      )
      .replace(
        'outgoingLight += skylineSeen * skylineGlance * skylineStrength * skylineGain;',
        'outgoingLight += skylineSeen * skylineGlance * skylineStrength * skylineGain * (1.0 - max(grimeMask * 0.9, grimeLather * 0.6)) * (1.0 + grimeWet * 0.3);',
      )
  }
  material.customProgramCacheKey = () => `${key}-grime`
  material.needsUpdate = true
}

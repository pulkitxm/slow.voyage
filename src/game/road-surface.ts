import * as THREE from 'three'
import { meadowNoise } from './ground'
import { type RoadWear, roadConditionData, roadConditionLayout } from './road-condition'

export const roadWearLook: Record<RoadWear, [dirt: number, damage: number, repairs: number]> = {
  fresh: [0.25, 0, 0],
  worn: [1, 0, 1],
  broken: [1, 1, 1],
}

function roadConditionTexture() {
  const { rows, columns } = roadConditionLayout
  const texture = new THREE.DataTexture(
    new Uint8Array(roadConditionData()),
    columns,
    rows,
    THREE.RGBAFormat,
  )
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

const ripples = `
float roadRipple(vec2 p, float time) {
  vec2 cell = floor(p);
  vec2 local = p - cell;
  float total = 0.0;
  for (int row = -1; row <= 1; row++) {
    for (int column = -1; column <= 1; column++) {
      vec2 offset = vec2(float(column), float(row));
      vec2 id = mod(cell + offset, 512.0);
      vec2 seed = fract(sin(vec2(dot(id, vec2(127.1, 311.7)), dot(id, vec2(269.5, 183.3)))) * 43758.5453);
      float clock = time * (1.1 + seed.y * 0.7) + seed.x * 9.0;
      float phase = fract(clock);
      vec2 jump = fract(seed * 7.31 + floor(clock) * vec2(0.37, 0.71));
      float reach = length(local - offset - 0.15 - jump * 0.7);
      float front = reach - phase * 0.85;
      total += sin(front * 46.0) * exp(-abs(front) * 13.0) * (1.0 - phase) * (1.0 - phase);
    }
  }
  return total;
}
`

export class RoadSurface {
  condition = roadConditionTexture()
  uniforms = {
    roadConditionMap: { value: this.condition },
    roadWetness: { value: 0 },
    roadWear: { value: new THREE.Vector3(1, 0, 1) },
    roadPuddleLevel: { value: 2 },
    roadDirtColor: { value: new THREE.Color('#8d7f63') },
    roadRain: { value: 0 },
    roadSky: { value: new THREE.Color() },
  }
  material: THREE.MeshStandardMaterial
  constructor(
    asphalt: THREE.Texture,
    noise: THREE.IUniform,
    time: THREE.IUniform,
    software: boolean,
  ) {
    this.material = new THREE.MeshStandardMaterial({
      map: asphalt,
      bumpMap: asphalt,
      bumpScale: 0.0015,
      color: '#c4ccd1',
      roughness: 0.98,
    })
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, { fieldNoiseMap: noise, roadTime: time })
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec2 roadPosition;\nvarying float roadLane;\nvarying vec2 roadGrid;\nvarying float roadLevel;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
roadPosition = (modelMatrix * vec4(position, 1.0)).xz;
roadLane = abs(uv.x - 0.5) * 2.0;
roadLevel = (modelMatrix * vec4(position, 1.0)).y;
roadGrid = vec2(uv.x, -roadPosition.y / ${roadConditionLayout.period.toFixed(1)});`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec2 roadPosition;
varying float roadLane;
varying vec2 roadGrid;
varying float roadLevel;
uniform float roadWetness;
uniform sampler2D roadConditionMap;
uniform vec3 roadWear;
uniform float roadPuddleLevel;
uniform vec3 roadDirtColor;
uniform float roadRain;
uniform vec3 roadSky;
uniform float roadTime;
${meadowNoise}
${software ? '' : ripples}`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec4 roadState = texture2D(roadConditionMap, roadGrid);
float roadVariation = fieldVariationAt(roadPosition * 25.0);
float roadSurfaceNoise = fieldVariationAt(roadPosition * 45.0);
diffuseColor.rgb *= (0.92 + roadVariation * 0.16) * mix(1.0, 0.72 + roadSurfaceNoise * 0.26, roadWetness);
float roadTracks = (1.0 - smoothstep(0.0, 0.1, abs(roadLane - 0.27))) + (1.0 - smoothstep(0.0, 0.1, abs(roadLane - 0.73)));
float roadPatchy = fieldVariationAt(roadPosition * 1.7 + vec2(5.0, 11.0));
diffuseColor.rgb *= 1.0 - roadTracks * (0.5 + roadPatchy * 0.5) * 0.11;
diffuseColor.rgb *= mix(1.0, 1.09, smoothstep(0.84, 1.0, roadLane));
diffuseColor.rgb *= 1.0 - smoothstep(0.69, 0.72, fieldVariationAt(roadPosition * 0.9 + vec2(31.0, 7.0))) * 0.1;
float roadRepair = smoothstep(0.4, 0.5, roadState.a) * roadWear.z;
float roadSeam = (1.0 - smoothstep(0.0, 0.07, abs(roadState.a - 0.45))) * roadWear.z;
diffuseColor.rgb *= mix(1.0, 0.76 + roadPatchy * 0.12, roadRepair);
diffuseColor.rgb *= 1.0 - roadSeam * 0.42;
float roadCrackField = fieldVariationAt(roadPosition * 30.0 + vec2(3.0, 19.0));
float roadCrackWidth = max(0.0035, fwidth(roadCrackField) * 1.2);
float roadCrackZone = smoothstep(0.5, 0.66, fieldVariationAt(roadPosition * 2.3 + vec2(71.0, 13.0))) * roadWear.z * (1.0 - roadRepair);
float roadCrack = (1.0 - smoothstep(roadCrackWidth * 0.4, roadCrackWidth, abs(roadCrackField - 0.5))) * roadCrackZone * min(1.0, 0.0035 / roadCrackWidth * 2.0) * smoothstep(0.46, 0.56, fieldVariationAt(roadPosition * 9.0 + vec2(47.0, 83.0)));
diffuseColor.rgb *= 1.0 - roadCrack * 0.42;
float roadBroken = roadState.b + (roadSurfaceNoise - 0.5) * 0.16 + (roadVariation - 0.5) * 0.1;
float roadHole = smoothstep(${(roadConditionLayout.potholeEdge - 0.14).toFixed(2)}, ${(roadConditionLayout.potholeEdge + 0.2).toFixed(2)}, roadBroken) * roadWear.y;
float roadRim = smoothstep(0.26, 0.44, roadBroken) * (1.0 - roadHole) * roadWear.y;
float roadPit = smoothstep(0.47, 0.53, roadBroken) * roadWear.y;
float roadGrit = fieldVariationAt(roadPosition * 140.0 + vec2(9.0, 4.0));
vec3 roadEye = normalize(cameraPosition - vec3(roadPosition.x, roadLevel, roadPosition.y));
vec2 roadSink = -roadEye.xz / max(roadEye.y, 0.12) * 0.11;
vec2 roadBelow = roadPosition + roadSink;
float roadDeep = texture2D(roadConditionMap, roadGrid + vec2(roadSink.x / 6.0, -roadSink.y / ${roadConditionLayout.period.toFixed(1)})).b + (fieldVariationAt(roadBelow * 45.0) - 0.5) * 0.16 + (fieldVariationAt(roadBelow * 25.0) - 0.5) * 0.1;
float roadFloor = roadPit * smoothstep(0.47, 0.53, roadDeep);
float roadWall = roadPit - roadFloor;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.14, 0.13) * (0.45 + fieldVariationAt(roadBelow * 140.0) * 1.2), roadFloor * 0.95);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.33, 0.31) * (0.55 + roadGrit * 0.7), roadWall * 0.9);
diffuseColor.rgb *= 1.0 - roadFloor * (1.0 - roadHole) * 0.4;
diffuseColor.rgb *= 1.0 + roadRim * (1.0 - roadPit) * (roadGrit - 0.3) * 0.7;
float roadDirt = smoothstep(0.3, 0.9, roadState.g * (0.5 + roadVariation * 1.0)) * roadWear.x;
diffuseColor.rgb = mix(diffuseColor.rgb, mix(roadDirtColor, vec3(0.42, 0.4, 0.37), 0.35) * (0.6 + roadSurfaceNoise * 0.5) * mix(1.0, 0.5, roadWetness), roadDirt * 0.7);
float roadPuddle = smoothstep(roadPuddleLevel - 0.06, roadPuddleLevel + 0.1, roadState.r + roadHole * 0.3 + (roadVariation - 0.5) * 0.05);
diffuseColor.rgb *= mix(1.0, 0.3, roadPuddle);`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor *= 0.94 + roadVariation * 0.06;
float surfaceWetness = smoothstep(0.25, 0.75, roadSurfaceNoise);
roughnessFactor = mix(roughnessFactor, mix(0.1, 0.46, surfaceWetness), roadWetness);
roughnessFactor = mix(roughnessFactor, mix(1.0, 0.5, roadWetness), roadDirt * 0.7);
roughnessFactor = mix(roughnessFactor, 0.02, roadPuddle);`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, roadPuddle));
float roadRelief = -roadPit * 0.02 + roadPit * roadGrit * 0.012 - roadHole * ${roadConditionLayout.potholeDepth.toFixed(3)} + roadRim * roadSurfaceNoise * 0.006 - roadCrack * 0.002;
${
  software
    ? ''
    : `float roadNear = 1.0 - smoothstep(14.0, 42.0, length(vViewPosition));
if (roadRain > 0.0) roadRelief += roadRipple(roadPosition * 2.6, roadTime) * roadPuddle * roadNear * roadRain * 0.0016;`
}
normal = perturbNormalArb(-vViewPosition, normal, vec2(dFdx(roadRelief), dFdy(roadRelief)), faceDirection);`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
float roadGlance = 0.05 + 0.95 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
float roadSheen = roadPuddle + roadWetness * (1.0 - roadPuddle) * (1.0 - roadDirt) * 0.22 * (1.0 - surfaceWetness * 0.6);
gl_FragColor.rgb += roadSky * roadGlance * roadSheen * 0.6;
gl_FragColor.a = 1.0 + clamp(roadGlance * 1.5 * roadSheen, 0.0, 1.0);`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
material.specularColor = mix(material.specularColor, vec3(0.11), roadPuddle);`,
      )
    }
    this.material.customProgramCacheKey = () => `asphalt-condition-${software ? 'plain' : 'full'}`
  }
  setCondition(
    wear: RoadWear,
    puddleLevel: number,
    raining: boolean,
    dirt: THREE.ColorRepresentation,
    sky: THREE.Color,
  ) {
    this.uniforms.roadSky.value.copy(sky)
    this.uniforms.roadWear.value.set(...roadWearLook[wear])
    this.uniforms.roadPuddleLevel.value = puddleLevel
    this.uniforms.roadRain.value = raining ? 1 : 0
    this.uniforms.roadDirtColor.value.set(dirt)
  }
  dispose() {
    this.condition.dispose()
  }
}

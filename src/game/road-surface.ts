import * as THREE from 'three'
import { meadowNoise } from './ground'
import { roadLayout } from './road'
import { type RoadWear, roadConditionData, roadConditionLayout } from './road-condition'

export const asphaltLook = {
  albedo: 0.8,
  contrast: 0.82,
  sectionLength: 96,
  trackOffset: 0.76,
  trackWidth: 0.26,
  polish: 0.09,
  oilWidth: 0.3,
  oil: 0.26,
  crumble: 0.34,
  crackCell: 0.3,
}

export const markingLook = {
  color: '#c6c4b8',
  roughness: 0.72,
  chipNear: 30,
  chipFar: 80,
}

export const markingWear: Record<RoadWear, number> = { fresh: 0.25, worn: 1, broken: 1.25 }

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

const cells = `
float roadCells(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = p - cell;
  float nearest = 8.0;
  float second = 8.0;
  for (int row = -1; row <= 1; row++) {
    for (int column = -1; column <= 1; column++) {
      vec2 offset = vec2(float(column), float(row));
      vec2 id = mod(cell + offset, 512.0);
      vec2 seed = fract(sin(vec2(dot(id, vec2(127.1, 311.7)), dot(id, vec2(269.5, 183.3)))) * 43758.5453);
      float reach = length(offset + seed - local);
      if (reach < nearest) {
        second = nearest;
        nearest = reach;
      } else if (reach < second) second = reach;
    }
  }
  return second - nearest;
}
`

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

export function roadMarkingMaterial(noise: THREE.IUniform) {
  const wear = { value: markingWear.worn }
  const material = new THREE.MeshStandardMaterial({
    color: markingLook.color,
    roughness: markingLook.roughness,
  })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { fieldNoiseMap: noise, markWear: wear })
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec2 markPosition;',
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nmarkPosition = (modelMatrix * vec4(position, 1.0)).xz;',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec2 markPosition;
uniform float markWear;
${meadowNoise}`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
float markNear = 1.0 - smoothstep(${markingLook.chipNear.toFixed(1)}, ${markingLook.chipFar.toFixed(1)}, length(vViewPosition));
float markStretch = smoothstep(0.3, 0.75, fieldVariationAt(markPosition * 1.3 + vec2(40.0, 9.0)));
float markBlotch = fieldVariationAt(markPosition * 14.0 + vec2(3.0, 71.0));
float markChip = texture2D(fieldNoiseMap, (markPosition * 23.0 + 0.5) / 128.0).r;
float markFleck = texture2D(fieldNoiseMap, (markPosition * 71.0 + 0.5) / 128.0).r;
float markCover = markBlotch * 0.55 + markChip * 0.3 + markFleck * 0.15;
float markLoss = (0.18 + markStretch * 0.2) * markWear;
if (markCover < markLoss * markNear) discard;
float markThin = smoothstep(markLoss, markLoss + 0.22, markCover);
diffuseColor.rgb *= mix(0.62, 1.0, markThin) * (0.82 + markBlotch * 0.22) * mix(1.0, 0.86, (1.0 - markNear) * markStretch * min(1.0, markWear));
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.93, 0.9, 0.82), markStretch * 0.5 * min(1.0, markWear));`,
    )
  }
  material.customProgramCacheKey = () => 'road-marking-worn-chipped'
  return { material, wear }
}

export class RoadSurface {
  condition = roadConditionTexture()
  uniforms = {
    roadConditionMap: { value: this.condition },
    roadWetness: { value: 0 },
    roadWear: { value: new THREE.Vector3(1, 0, 1) },
    roadPuddleLevel: { value: 2 },
    roadDirtColor: { value: new THREE.Color('#8d7f63') },
    roadGravelColor: { value: new THREE.Color('#8f8d82') },
    roadRain: { value: 0 },
    roadSky: { value: new THREE.Color() },
  }
  material: THREE.MeshStandardMaterial
  marking: ReturnType<typeof roadMarkingMaterial>
  constructor(
    asphalt: THREE.Texture,
    photo: { albedo: THREE.Texture; normal: THREE.Texture } | null,
    noise: THREE.IUniform,
    time: THREE.IUniform,
    software: boolean,
  ) {
    this.marking = roadMarkingMaterial(noise)
    this.material = new THREE.MeshStandardMaterial({
      map: photo?.albedo ?? asphalt,
      normalMap: photo?.normal ?? null,
      normalScale: new THREE.Vector2(0.6, 0.6),
      bumpMap: asphalt,
      bumpScale: photo ? 0.0006 : 0.0015,
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
uniform vec3 roadGravelColor;
uniform float roadRain;
uniform vec3 roadSky;
uniform float roadTime;
${meadowNoise}
float roadLine(float offset, float width) {
  float reach = max(width, fwidth(offset) * 1.3);
  return (1.0 - smoothstep(reach * 0.5, reach, abs(offset))) * min(1.0, width / reach * 1.6);
}
${software ? '' : `${cells}${ripples}`}`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec4 roadState = texture2D(roadConditionMap, roadGrid);
float roadVariation = fieldVariationAt(roadPosition * 25.0);
float roadSurfaceNoise = fieldVariationAt(roadPosition * 45.0);
diffuseColor.rgb = diffuse * mix(vec3(${photo ? '0.25' : '0.245'}), sampledDiffuseColor.rgb, ${asphaltLook.contrast.toFixed(2)}) * ${asphaltLook.albedo.toFixed(2)};
diffuseColor.rgb *= (0.92 + roadVariation * 0.16) * mix(1.0, 0.72 + roadSurfaceNoise * 0.26, roadWetness);
float roadAcross = abs(roadGrid.x - 0.5) * ${(roadLayout.halfWidth * 2).toFixed(1)};
float roadAlong = -roadPosition.y;
vec2 roadFrame = vec2((roadGrid.x - 0.5) * ${(roadLayout.halfWidth * 2).toFixed(1)}, roadAlong);
float roadAged = mix(0.3, 1.0, roadWear.z);
float roadSectionAt = roadAlong / ${asphaltLook.sectionLength.toFixed(1)};
float roadSectionTone = fract(sin(floor(roadSectionAt) * 91.7) * 43758.5453);
diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.84, 0.85, 0.87), vec3(1.1, 1.08, 1.03), roadSectionTone), roadAged);
float roadJoint = roadLine((fract(roadSectionAt + 0.5) - 0.5) * ${asphaltLook.sectionLength.toFixed(1)}, 0.03) * roadAged;
float roadPatchy = fieldVariationAt(roadPosition * 1.7 + vec2(5.0, 11.0));
float roadTrackInner = (roadAcross - ${(roadLayout.halfWidth / 2 - asphaltLook.trackOffset).toFixed(2)}) / ${asphaltLook.trackWidth.toFixed(2)};
float roadTrackOuter = (roadAcross - ${(roadLayout.halfWidth / 2 + asphaltLook.trackOffset).toFixed(2)}) / ${asphaltLook.trackWidth.toFixed(2)};
float roadTracks = exp(-roadTrackInner * roadTrackInner) + exp(-roadTrackOuter * roadTrackOuter);
float roadPolish = roadTracks * (0.4 + roadPatchy * 0.9) * roadAged;
diffuseColor.rgb *= 1.0 + roadPolish * ${asphaltLook.polish.toFixed(2)};
float roadLaneMid = (roadAcross - ${(roadLayout.halfWidth / 2).toFixed(2)}) / ${asphaltLook.oilWidth.toFixed(2)};
float roadOilBlot = fieldVariationAt(roadFrame * vec2(7.0, 1.6) + vec2(13.0, 57.0));
float roadOilDrip = texture2D(fieldNoiseMap, (roadFrame * vec2(9.0, 4.0) + 0.5) / 128.0).r;
float roadOil = exp(-roadLaneMid * roadLaneMid) * (0.2 + smoothstep(0.38, 0.7, roadOilBlot) * 0.8 + smoothstep(0.7, 0.9, roadOilDrip) * 0.5) * roadAged;
diffuseColor.rgb *= 1.0 - min(roadOil, 1.2) * ${asphaltLook.oil.toFixed(2)};
diffuseColor.rgb *= 1.0 - smoothstep(0.69, 0.72, fieldVariationAt(roadPosition * 0.9 + vec2(31.0, 7.0))) * 0.1;
float roadMidJoint = roadLine(roadFrame.x + (roadPatchy - 0.5) * 0.03, 0.012) * roadAged;
float roadSealSide = sign(roadFrame.x + 0.25);
float roadSealZone = smoothstep(0.52, 0.68, texture2D(fieldNoiseMap, (vec2(roadAlong * 0.031, 17.0 + roadSealSide * 40.0) + 0.5) / 128.0).r) * roadWear.z;
float roadSealWobble = (texture2D(fieldNoiseMap, (vec2(roadAlong * 0.23, 91.0 + roadSealSide * 13.0) + 0.5) / 128.0).r - 0.5) * 0.5;
float roadSeal = roadLine(abs(roadFrame.x + 0.25) - 1.25 - roadSealWobble, 0.016) * roadSealZone;
float roadCrossAt = roadAlong / 7.0 + (roadPatchy - 0.5) * 0.12;
vec2 roadCrossRoll = fract(sin(floor(roadCrossAt) * vec2(37.3, 71.9)) * 43758.5453);
float roadCrossSpan = mix(1.0, step(0.0, roadFrame.x * (roadCrossRoll.y - 0.5)), step(0.45, roadCrossRoll.y) * step(roadCrossRoll.y, 0.9));
roadSeal = max(roadSeal, roadLine((fract(roadCrossAt) - 0.5) * 7.0, 0.018) * step(0.7, roadCrossRoll.x) * roadCrossSpan * roadWear.z);
float roadTar = max(max(roadJoint, roadMidJoint * 0.7), roadSeal);
diffuseColor.rgb *= 1.0 - roadTar * 0.5;
float roadRepair = smoothstep(0.4, 0.5, roadState.a) * roadWear.z;
float roadSeam = (1.0 - smoothstep(0.0, 0.07, abs(roadState.a - 0.45))) * roadWear.z;
diffuseColor.rgb *= mix(1.0, 0.76 + roadPatchy * 0.12, roadRepair);
diffuseColor.rgb *= 1.0 - roadSeam * 0.42;
float roadCrackFrom = mix(0.63, 0.5, roadWear.y);
float roadCrackZone = smoothstep(roadCrackFrom, roadCrackFrom + 0.12, fieldVariationAt(roadPosition * 2.3 + vec2(71.0, 13.0))) * roadWear.z * (1.0 - roadRepair);
float roadCrack = 0.0;
${
  software
    ? `float roadCrackField = fieldVariationAt(roadFrame * vec2(30.0, 9.0) + vec2(3.0, 19.0));
float roadCrackWidth = max(0.0035, fwidth(roadCrackField) * 1.2);
roadCrack = (1.0 - smoothstep(roadCrackWidth * 0.4, roadCrackWidth, abs(roadCrackField - 0.5))) * roadCrackZone * min(1.0, 0.0035 / roadCrackWidth * 2.0) * smoothstep(0.46, 0.56, fieldVariationAt(roadPosition * 9.0 + vec2(47.0, 83.0)));`
    : `if (roadCrackZone > 0.0) {
  vec2 roadBlock = roadFrame * vec2(${(1 / asphaltLook.crackCell).toFixed(2)}, ${(1 / asphaltLook.crackCell / 1.7).toFixed(2)}) + (vec2(roadVariation, roadSurfaceNoise) - 0.5) * 0.5;
  float roadBlockEdge = roadCells(roadBlock);
  float roadBlockWidth = max(0.03, fwidth(roadBlockEdge) * 1.2);
  roadCrack = (1.0 - smoothstep(roadBlockWidth * 0.4, roadBlockWidth, roadBlockEdge)) * min(1.0, 0.03 / roadBlockWidth * 1.6)
    * roadCrackZone * (0.35 + roadTracks * 0.65) * smoothstep(0.4, 0.56, fieldVariationAt(roadPosition * 5.0 + vec2(47.0, 83.0)));
}`
}
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
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.185, 0.175) * (0.6 + roadGrit * 0.7), roadWall * 0.92);
diffuseColor.rgb *= 1.0 - roadFloor * (1.0 - roadHole) * 0.4;
diffuseColor.rgb *= 1.0 + roadRim * (1.0 - roadPit) * (roadGrit - 0.3) * 0.7;
float roadDirt = smoothstep(0.3, 0.9, roadState.g * (0.5 + roadVariation * 1.0)) * roadWear.x;
diffuseColor.rgb = mix(diffuseColor.rgb, mix(roadDirtColor, vec3(0.42, 0.4, 0.37), 0.35) * (0.6 + roadSurfaceNoise * 0.5) * mix(1.0, 0.5, roadWetness), roadDirt * 0.7);
float roadCrumble = 0.0;
float roadEdgeReach = (roadAcross - ${(roadLayout.halfWidth - asphaltLook.crumble).toFixed(2)}) / ${asphaltLook.crumble.toFixed(2)};
if (roadEdgeReach > -1.3) {
  float roadEdgeRag = fieldVariationAt(roadPosition * 6.0 + vec2(91.0, 37.0));
  float roadEdgeFine = texture2D(fieldNoiseMap, (roadPosition * 3.3 + 0.5) / 128.0).r;
  roadCrumble = smoothstep(0.42, 0.62, roadEdgeReach + (roadEdgeRag - 0.5) * 1.3 + (roadEdgeFine - 0.5) * 0.45) * mix(0.55, 1.0, roadWear.z);
  float roadDust = smoothstep(-0.6, 1.0, roadEdgeReach + (roadEdgeRag - 0.5) * 1.2) * 0.3 * (1.0 - roadCrumble);
  vec3 roadShoulder = mix(roadGravelColor, roadDirtColor, 0.45 + (roadVariation - 0.5) * 0.5) * (0.5 + roadGrit * 0.55) * mix(1.0, 0.55, roadWetness);
  diffuseColor.rgb = mix(diffuseColor.rgb, roadShoulder, roadCrumble * 0.92 + roadDust);
}
float roadPuddle = smoothstep(roadPuddleLevel - 0.06, roadPuddleLevel + 0.1, roadState.r + roadHole * 0.3 + (roadVariation - 0.5) * 0.05);
diffuseColor.rgb *= mix(1.0, 0.3, roadPuddle);`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor *= 0.94 + roadVariation * 0.06;
roughnessFactor *= 1.0 - min(1.0, roadPolish) * 0.2 - min(1.0, roadOil) * 0.16 - roadRepair * 0.08;
roughnessFactor = mix(roughnessFactor, 0.42, roadTar * 0.8);
roughnessFactor = mix(roughnessFactor, 1.0, roadCrumble);
float surfaceWetness = smoothstep(0.25, 0.75, roadSurfaceNoise);
roughnessFactor = mix(roughnessFactor, mix(0.1, 0.46, surfaceWetness), roadWetness);
roughnessFactor = mix(roughnessFactor, mix(1.0, 0.5, roadWetness), roadDirt * 0.7);
roughnessFactor = mix(roughnessFactor, 0.02, roadPuddle);`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, roadPuddle));
float roadRelief = roadCrumble * (roadGrit - 0.6) * 0.008 - roadTar * 0.0015 - roadPit * 0.02 + roadPit * roadGrit * 0.012 - roadHole * ${roadConditionLayout.potholeDepth.toFixed(3)} + roadRim * roadSurfaceNoise * 0.006 - roadCrack * 0.0012;
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
float roadFilm = roadPuddle + roadWetness * (1.0 - roadPuddle) * (1.0 - roadDirt) * 0.5;
gl_FragColor.a = 1.0 + clamp((roadGlance * 1.5 + 0.3) * roadFilm, 0.0, 1.0);`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
material.specularColor = mix(material.specularColor, vec3(0.11), roadPuddle);`,
      )
    }
    this.material.customProgramCacheKey = () =>
      `asphalt-aged-tracks-oil-seals-block-cracks-crumbling-edge-${software ? 'plain' : 'full'}`
  }
  setCondition(
    wear: RoadWear,
    puddleLevel: number,
    raining: boolean,
    dirt: THREE.ColorRepresentation,
    sky: THREE.Color,
    gravel: THREE.ColorRepresentation = '#8f8d82',
  ) {
    this.uniforms.roadGravelColor.value.set(gravel)
    this.marking.wear.value = markingWear[wear]
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

import * as THREE from 'three'
import { sharpness } from './graphics'
import { groundLayout, groundOffsets } from './ground-grid'
import { landscapeProfiles } from './landscapes'
import { openLayout } from './open-grid'
import { type RoadSample, roadCoordinates, roadLayout } from './road'
import { loadGroundDetail, loadRockSurface } from './rock'
import { woodlandCoverage } from './woodland'
import { clamp, random, type Settings, shoreHeight, type World } from './world'

export function groundGeometry(
  world: World,
  start: number,
  base: THREE.Color,
  light: THREE.Color,
  rows: number = groundLayout.fullRows,
) {
  const steps = groundRows(world, start, base, light, rows, Number.POSITIVE_INFINITY)
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}

export class GroundWriter {
  count = 0
  span = 0.2
  private positions: number[] = []
  private normals: number[] = []
  private colors: number[] = []
  private uv: number[] = []
  private roadDistances: number[] = []
  private groveCover: number[] = []
  private bankHeights: number[] = []
  private color = new THREE.Color()
  private normal = new THREE.Vector3()
  private shore: THREE.Color
  private snow = new THREE.Color('#dae0dc')

  constructor(
    private world: World,
    private base: THREE.Color,
    private light: THREE.Color,
  ) {
    this.shore = new THREE.Color(world.settings.season === 'winter' ? '#dde3dc' : '#c5c1a3')
  }

  vertex(x: number, s: number, road: RoadSample, distance: number) {
    const world = this.world
    const settings = world.settings
    const profile = landscapeProfiles[settings.landscape]
    const elevation = world.height(x, s)
    this.positions.push(x, elevation, -s)
    const span = this.span
    const normal = this.normal
      .set(
        -(world.height(x + span, s) - world.height(x - span, s)) / (span * 2),
        1,
        (world.height(x, s + span) - world.height(x, s - span)) / (span * 2),
      )
      .normalize()
    this.normals.push(normal.x, normal.y, normal.z)
    const frame = Math.abs(distance) < 20 ? roadCoordinates(world, x, s) : null
    this.roadDistances.push(Math.abs(frame?.distance ?? distance) - roadLayout.halfWidth)
    this.bankHeights.push(elevation - (frame?.road.y ?? road.y))
    this.uv.push(x / 7, s / 7)
    const variation =
      0.32 + Math.sin(x * 0.038 + s * 0.017) * 0.14 + Math.cos(x * 0.08 - s * 0.08) * 0.055
    const color = this.color.copy(this.base).lerp(this.light, variation)
    if (elevation < shoreHeight && profile.shore)
      color.lerp(this.shore, clamp((shoreHeight - elevation) / 1.5, 0, 1))
    if (profile.snowLine !== null && elevation > profile.snowLine)
      color.lerp(this.snow, clamp((elevation - profile.snowLine) / 80, 0, 1))
    this.colors.push(color.r, color.g, color.b)
    let forest = 0
    if (profile.woodland && elevation > 0.7) {
      const grove = woodlandCoverage(x, s, settings.seed, settings.landscape)
      const verge = clamp((Math.abs(distance) - 45) / 30, 0, 1)
      const treeLine =
        profile.treeLine === null ? 1 : clamp((profile.treeLine - elevation) / 60, 0, 1)
      forest = grove * verge * treeLine
    }
    this.groveCover.push(forest)
    return this.count++
  }

  skirt(index: number, drop: number) {
    const at = index * 3
    this.positions.push(
      this.positions[at] ?? 0,
      (this.positions[at + 1] ?? 0) - drop,
      this.positions[at + 2] ?? 0,
    )
    this.normals.push(this.normals[at] ?? 0, this.normals[at + 1] ?? 1, this.normals[at + 2] ?? 0)
    this.colors.push(this.colors[at] ?? 0, this.colors[at + 1] ?? 0, this.colors[at + 2] ?? 0)
    this.uv.push(this.uv[index * 2] ?? 0, this.uv[index * 2 + 1] ?? 0)
    this.roadDistances.push(this.roadDistances[index] ?? 0)
    this.groveCover.push(this.groveCover[index] ?? 0)
    this.bankHeights.push(this.bankHeights[index] ?? 0)
    return this.count++
  }

  geometry(indices: number[]) {
    const ground = new THREE.BufferGeometry()
    ground.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    ground.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
    ground.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3))
    ground.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    ground.setAttribute('roadDistance', new THREE.Float32BufferAttribute(this.roadDistances, 1))
    ground.setAttribute('groveCover', new THREE.Float32BufferAttribute(this.groveCover, 1))
    ground.setAttribute('bankHeight', new THREE.Float32BufferAttribute(this.bankHeights, 1))
    ground.setIndex(indices)
    return ground
  }
}

export function* groundRows(
  world: World,
  start: number,
  base: THREE.Color,
  light: THREE.Color,
  rows: number,
  batch: number,
): Generator<undefined, THREE.BufferGeometry, undefined> {
  const writer = new GroundWriter(world, base, light)
  const indices: number[] = []
  const columns = groundOffsets.length
  for (let row = 0; row <= rows; row++) {
    if (row && row % batch === 0) yield
    const s = start + (row * groundLayout.tileLength) / rows
    const road = world.road(s)
    for (let col = 0; col < columns; col++) {
      const distance = groundOffsets[col] ?? 0
      writer.vertex(road.x + distance, s, road, distance)
      if (row < rows && col < columns - 1) {
        const n = row * columns + col
        indices.push(n, n + 1, n + columns, n + 1, n + columns + 1, n + columns)
      }
    }
  }
  return writer.geometry(indices)
}

export const rockFacing = { sharpness: 12, farScale: 0.17, farShare: 0.8, farFrom: 25, farTo: 140 }
export const stoneMean = 0.25
export const sandLook = { rippleFrequency: 44, rippleHeight: 0.006, rippleNear: 14, rippleFar: 48 }
export const groundBreakup = {
  scrub: [0.62, 0.66, 0.52],
  pavement: [0.74, 0.7, 0.66],
  frost: [0.86, 0.88, 0.9],
  winter: 0.45,
} as const
export const verge = {
  width: 0.5,
  rag: 0.7,
  ragScale: 0.85,
  fray: 0.3,
  frayScale: 3.7,
  tuft: 0.12,
  tuftScale: 13,
  grain: 0.6,
  grainScale: 1.9,
  stone: 0.34,
  stoneScale: 9,
  pebble: 0.9,
  pebbleScale: 0.42,
  tone: 0.74,
  sandLift: 0.3,
  apron: 1.5,
  wander: 0.8,
}
export const vergeReach =
  verge.width + verge.wander + (verge.rag + verge.fray + verge.tuft) / 2 + 0.09 + verge.apron

export function vergeStart(s: number) {
  return verge.wander * (0.5 + 0.5 * Math.sin(s * 0.9 + Math.sin(s * 0.23) * 2))
}

export function rockShares(x: number, y: number, z: number) {
  const length = Math.hypot(x, y, z) || 1
  const shares = [x, y, z].map((part) => Math.abs(part / length) ** rockFacing.sharpness)
  const total = shares.reduce((sum, share) => sum + share, 0) || 1
  return shares.map((share) => share / total)
}

export function groundTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Ground texture canvas is unavailable')
  const pixels = context.createImageData(256, 256)
  const rng = random(871)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = 222 + rng() * 33
    pixels.data.set([value, value, value, 255], i)
  }
  context.putImageData(pixels, 0, 0)
  for (let i = 0; i < 6500; i++) {
    const value = 165 + rng() * 65
    context.strokeStyle = `rgb(${value} ${value} ${value} / 0.18)`
    context.lineWidth = 0.4 + rng() * 0.6
    const x = rng() * 256,
      y = rng() * 256
    context.beginPath()
    context.moveTo(x, y)
    const angle = rng() * Math.PI * 2
    const length = 3 + rng() * 9
    const bend = (rng() - 0.5) * 5
    context.quadraticCurveTo(
      x + Math.cos(angle) * length * 0.5 - Math.sin(angle) * bend,
      y + Math.sin(angle) * length * 0.5 + Math.cos(angle) * bend,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length,
    )
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = sharpness(8)
  return texture
}
export const meadowNoise = `
uniform sampler2D fieldNoiseMap;
uniform sampler2D fieldDetailMap;
uniform float fieldDetail;
float fieldVariationAt(vec2 p) {
  return texture2D(fieldNoiseMap, (p * 0.007 + 0.5) / 128.0).r * 0.6
    + texture2D(fieldNoiseMap, (p * 0.037 + 0.5) / 128.0).r * 0.28
    + texture2D(fieldNoiseMap, (p * 0.17 + 0.5) / 128.0).r * 0.12;
}
float fieldMeadowAt(vec2 p) {
  return smoothstep(0.28, 0.68, fieldVariationAt(p * 0.35 + vec2(41.7, 93.2)));
}
`
function meadowNoiseTexture() {
  const pixels = new Uint8Array(128 * 128)
  const rng = random(941)
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(rng() * 256)
  const texture = new THREE.DataTexture(pixels, 128, 128, THREE.RedFormat)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}
function fieldUniforms(rock: ReturnType<typeof loadRockSurface>) {
  return {
    fieldNoiseMap: { value: meadowNoiseTexture() },
    fieldDetailMap: { value: loadGroundDetail() },
    fieldDetail: { value: 1 },
    fieldDryGrass: { value: new THREE.Color() },
    fieldDryness: { value: 0 },
    fieldMeadowShade: { value: new THREE.Color() },
    fieldRock: { value: new THREE.Color() },
    fieldSoil: { value: new THREE.Color() },
    fieldGravel: { value: new THREE.Color() },
    fieldScrubTint: { value: new THREE.Color() },
    fieldBreakup: { value: 1 },
    fieldSand: { value: 0 },
    fieldRockMap: { value: rock.normal },
    fieldRockColorMap: { value: rock.albedo },
    fieldRockLayers: { value: 2 },
    fieldStoneMap: { value: null as THREE.Texture | null },
  }
}

export class MeadowMaterial extends THREE.MeshStandardMaterial {
  rock: ReturnType<typeof loadRockSurface>
  fieldUniforms: ReturnType<typeof fieldUniforms>
  corridorSpan = { value: new THREE.Vector2(1, 0) }
  private open: boolean
  constructor(
    texture: THREE.Texture,
    settings: Settings,
    software: boolean,
    corridor?: MeadowMaterial,
  ) {
    super({
      map: texture,
      bumpMap: software ? null : texture,
      bumpScale: 0.02,
      vertexColors: true,
      roughness: 1,
    })
    this.open = corridor !== undefined
    this.rock = corridor?.rock ?? loadRockSurface()
    this.fieldUniforms = corridor?.fieldUniforms ?? fieldUniforms(this.rock)
    if (software) this.defines = { ...this.defines, FIELD_PLAIN: '' }
    if (this.open) this.defines = { ...this.defines, FIELD_OPEN: '' }
    this.normalMap = software ? null : this.fieldUniforms.fieldRockMap.value
    this.fieldUniforms.fieldRockLayers.value = software ? 1 : 2
    this.fieldUniforms.fieldDetail.value = software ? 0 : 1
    this.setAppearance(settings)
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.fieldUniforms, { corridorSpan: this.corridorSpan })
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float roadDistance;
attribute float groveCover;
attribute float bankHeight;
#ifdef FIELD_OPEN
attribute float corridorOffset;
varying float fieldCorridorOffset;
#endif
varying vec2 fieldPosition;
varying vec3 fieldNormal;
varying float fieldHeight;
varying float fieldBankHeight;
varying float fieldRoadDistance;
varying float fieldGroveCover;
varying float fieldSlope;`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
fieldPosition = (modelMatrix * vec4(position, 1.0)).xz;
fieldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
fieldHeight = (modelMatrix * vec4(position, 1.0)).y;
fieldBankHeight = bankHeight;
fieldRoadDistance = roadDistance;
fieldGroveCover = groveCover;
fieldSlope = clamp((1.0 - abs(fieldNormal.y)) * 2.0, 0.0, 1.0);
#ifdef FIELD_OPEN
fieldCorridorOffset = corridorOffset;
#endif`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec2 fieldPosition;
varying vec3 fieldNormal;
varying float fieldHeight;
varying float fieldBankHeight;
varying float fieldRoadDistance;
varying float fieldGroveCover;
varying float fieldSlope;
#ifdef FIELD_OPEN
varying float fieldCorridorOffset;
uniform vec2 corridorSpan;
#endif
uniform vec3 fieldDryGrass;
uniform float fieldDryness;
uniform vec3 fieldMeadowShade;
uniform vec3 fieldRock;
uniform vec3 fieldSoil;
uniform vec3 fieldGravel;
uniform vec3 fieldScrubTint;
uniform float fieldBreakup;
uniform float fieldSand;
uniform sampler2D fieldRockMap;
uniform sampler2D fieldRockColorMap;
uniform float fieldRockLayers;
${meadowNoise}
uniform sampler2D fieldStoneMap;
float stoneAt(vec2 uv) {
  return clamp(texture2D(fieldStoneMap, uv).g * ${(1 / stoneMean / 2).toFixed(3)}, 0.0, 1.0);
}
float fieldRockFar = 0.0;
vec3 rockMapAt(sampler2D surfaceMap, vec2 uv) {
  vec3 surface = texture2D(surfaceMap, uv).rgb;
  if (fieldRockLayers > 1.0) {
    if (fieldRockFar < 1.0) surface = mix(surface, texture2D(surfaceMap, uv * 2.13 + vec2(0.27, 0.69)).rgb, 0.35 * (1.0 - fieldRockFar));
    if (fieldRockFar > 0.0) surface = mix(surface, texture2D(surfaceMap, uv * ${rockFacing.farScale.toFixed(2)} + vec2(0.61, 0.13)).rgb, ${rockFacing.farShare.toFixed(2)} * fieldRockFar);
  }
  return surface;
}`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
#ifdef FIELD_OPEN
if (abs(fieldCorridorOffset) < ${(groundLayout.reach - openLayout.overlap).toFixed(1)} && -fieldPosition.y > corridorSpan.x && -fieldPosition.y < corridorSpan.y) discard;
#endif
float fieldVariation = fieldVariationAt(fieldPosition);
float dryBlend = smoothstep(0.35, 0.7, fieldVariation) * fieldDryness;
diffuseColor.rgb = mix(diffuseColor.rgb, fieldDryGrass * sampledDiffuseColor.rgb, dryBlend);
diffuseColor.rgb *= mix(vec3(1.0), fieldMeadowShade, fieldMeadowAt(fieldPosition));
diffuseColor.rgb *= 0.78 + fieldVariation * 0.4;
float fieldReach = length(vViewPosition);
float fieldClose = (1.0 - smoothstep(18.0, 80.0, fieldReach)) * fieldDetail;
float fieldFar = smoothstep(30.0, 90.0, fieldReach) * (1.0 - smoothstep(260.0, 520.0, fieldReach)) * fieldDetail;
#ifndef FIELD_PLAIN
if (fieldClose > 0.0) {
  float fieldGrain = texture2D(fieldDetailMap, fieldPosition * 0.42).g * 0.6 + texture2D(fieldDetailMap, fieldPosition * 0.11 + vec2(0.37, 0.61)).g * 0.4;
  diffuseColor.rgb *= mix(1.0, 0.45 + fieldGrain * 1.1, fieldClose * 0.75);
}
if (fieldFar > 0.0) {
  diffuseColor.rgb *= mix(1.0, 0.62 + texture2D(fieldDetailMap, fieldPosition * 0.031 + vec2(0.13, 0.71)).g * 0.76, fieldFar * 0.6);
}
#endif
float fieldDrift = fieldVariationAt(fieldPosition * 0.13 + vec2(17.3, 61.9));
diffuseColor.rgb *= mix(vec3(0.84, 0.9, 0.8), vec3(1.12, 1.07, 0.94), fieldDrift);
diffuseColor.rgb *= 0.93 + fieldVariationAt(fieldPosition * 11.0 + vec2(3.1, 8.7)) * 0.14;
float fieldLush = smoothstep(0.3, 0.7, fieldVariationAt(fieldPosition * 0.021 + vec2(140.2, 9.4)));
diffuseColor.rgb *= mix(vec3(1.08, 0.98, 0.8), vec3(0.9, 1.0, 0.93), fieldLush);
float fieldScree = 0.0;
float sandRelief = 0.0;
#ifndef FIELD_PLAIN
float fieldPatch = 1.0 - fieldDrift;
float fieldClump = texture2D(fieldNoiseMap, (fieldPosition * 0.011 + 0.5) / 128.0).r * 0.6
  + texture2D(fieldNoiseMap, (fieldPosition * 0.23 + vec2(31.5, 7.5)) / 128.0).r * 0.4;
float fieldTuft = fieldVariation;
float fieldScrub = smoothstep(0.5, 0.6, fieldPatch * 0.5 + fieldClump * 0.4 + fieldTuft * 0.1);
diffuseColor.rgb *= mix(vec3(1.0), fieldScrubTint, fieldScrub * fieldBreakup);
float fieldStraw = smoothstep(0.52, 0.64, (1.0 - fieldPatch) * 0.45 + fieldClump * 0.4 + (1.0 - fieldTuft) * 0.15);
diffuseColor.rgb = mix(diffuseColor.rgb, fieldDryGrass * sampledDiffuseColor.rgb * 0.92, fieldStraw * (0.2 + fieldDryness * 0.5) * fieldBreakup);
float fieldAltitude = smoothstep(30.0, 150.0, fieldHeight + (fieldPatch - 0.5) * 60.0);
diffuseColor.rgb = mix(diffuseColor.rgb, mix(fieldDryGrass, fieldSoil, 0.35) * sampledDiffuseColor.rgb * 0.85, fieldAltitude * 0.4 * fieldBreakup);
float fieldStep = fieldHeight * 5.5 + fieldClump * 7.0;
float fieldTerrace = smoothstep(0.55, 0.95, sin(fieldStep) * 0.5 + 0.5)
  * smoothstep(0.1, 0.22, fieldSlope) * (1.0 - smoothstep(0.45, 0.6, fieldSlope))
  * (1.0 - smoothstep(0.6, 1.6, fwidth(fieldStep))) * smoothstep(0.5, 0.64, fieldPatch);
diffuseColor.rgb *= 1.0 - fieldTerrace * 0.12 * fieldBreakup;
float fieldLoose = clamp((fieldClump * 0.6 + fieldPatch * 0.4 - 0.5) * 2.4 + 0.5, 0.0, 1.0);
fieldScree = smoothstep(0.0, 0.12, fieldSlope - mix(0.56, 0.2, fieldLoose)) * fieldBreakup;
#endif
float fieldWorn = fieldVariationAt(fieldPosition * 0.046 + vec2(71.3, 12.9)) * 0.72
  + fieldVariationAt(fieldPosition * 0.83 + vec2(5.1, 33.7)) * 0.28;
float fieldBare = smoothstep(0.6, 0.74, fieldWorn) * (1.0 - smoothstep(0.18, 0.42, fieldSlope)) * (1.0 - fieldLush * 0.6);
diffuseColor.rgb = mix(diffuseColor.rgb, fieldSoil * sampledDiffuseColor.rgb * 1.15, fieldBare * 0.72);
#ifndef FIELD_PLAIN
if (fieldSand > 0.0) {
  float sandNear = 1.0 - smoothstep(${sandLook.rippleNear.toFixed(1)}, ${sandLook.rippleFar.toFixed(1)}, fieldReach);
  float sandPhase = dot(fieldPosition, vec2(0.8, 0.6)) * ${sandLook.rippleFrequency.toFixed(1)}
    + fieldVariationAt(fieldPosition * 9.0 + vec2(3.0, 77.0)) * 6.0 + fieldClump * 9.0;
  float sandOpen = sandNear * (1.0 - fieldScrub) * (1.0 - smoothstep(0.2, 0.45, fieldSlope))
    * (1.0 - smoothstep(0.5, 1.8, fwidth(sandPhase))) * fieldSand;
  float sandCrest = sin(sandPhase) * 0.5 + 0.5;
  sandRelief = sandCrest * sandCrest * sandOpen;
  diffuseColor.rgb *= 1.0 - (1.0 - sandCrest) * sandOpen * 0.09;
  float sandLee = dot(normalize(fieldNormal.xz + vec2(1e-4)), vec2(0.8, 0.6)) * smoothstep(0.02, 0.2, fieldSlope);
  diffuseColor.rgb *= 1.0 + sandLee * 0.07 * fieldSand;
  float sandLitter = fieldScrub * (1.0 - smoothstep(60.0, 240.0, fieldReach)) * fieldSand;
  if (sandLitter > 0.0) diffuseColor.rgb *= mix(1.0, 0.55 + stoneAt(fieldPosition * 0.13) * 0.9, sandLitter * 0.85);
  float sandDrift = smoothstep(0.42, 0.68, fieldVariationAt(fieldPosition * 0.19 + vec2(91.0, 12.0)));
  diffuseColor.rgb *= mix(vec3(0.93, 0.91, 0.88), vec3(1.07, 1.05, 1.0), sandDrift) * fieldSand + (1.0 - fieldSand);
}
if (fieldScree > 0.0) {
  float screeGrain = texture2D(fieldDetailMap, fieldPosition * 0.19 + vec2(0.71, 0.23)).g;
  float screeStone = texture2D(fieldNoiseMap, (fieldPosition * 2.9 + vec2(3.5, 41.5)) / 128.0).r;
  float screeRubble = fieldReach < 220.0 ? stoneAt(fieldPosition * 0.07) : 0.5;
  vec3 screeTone = mix(fieldSoil, fieldRock, smoothstep(0.35, 0.75, screeStone) * 0.6) * sampledDiffuseColor.rgb * (0.5 + screeGrain * 0.45 + screeRubble * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, screeTone, fieldScree * (0.45 + screeGrain * 0.5));
}
#endif
diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, 0.87);
float rockBlend = smoothstep(0.24, 0.62, fieldSlope) * smoothstep(0.24, 0.66, fieldVariation);
float cutFace = smoothstep(0.06, 0.32, fieldSlope)
  * (1.0 - smoothstep(6.0, 13.0, fieldRoadDistance))
  * smoothstep(0.15, 1.8, fieldBankHeight);
float bankPatch = 0.0;
if (cutFace > 0.0) {
  bankPatch = fieldVariationAt(fieldPosition * 2.4 + vec2(19.1, 3.7));
  float grassPocket = (1.0 - smoothstep(0.3, 0.75, fieldSlope)) * smoothstep(0.25, 0.55, bankPatch);
  cutFace *= 1.0 - grassPocket * 0.88;
}
rockBlend = max(rockBlend, cutFace);
vec3 rockWeights = pow(abs(normalize(fieldNormal)), vec3(${rockFacing.sharpness.toFixed(1)}));
rockWeights /= dot(rockWeights, vec3(1.0));
vec2 rockUvX = vec2(0.0);
vec2 rockUvY = vec2(0.0);
vec2 rockUvZ = vec2(0.0);
if (rockBlend > 0.0) {
  fieldRockFar = smoothstep(${rockFacing.farFrom.toFixed(1)}, ${rockFacing.farTo.toFixed(1)}, fieldReach);
  float rockGrain = fieldVariationAt(fieldPosition * 80.0);
  float rockWarp = (fieldVariationAt(fieldPosition * 4.0) - 0.5) * 0.2;
  rockUvX = vec2(fieldPosition.y, fieldHeight) / 3.6 + rockWarp;
  rockUvY = fieldPosition / 3.6 + rockWarp;
  rockUvZ = vec2(fieldPosition.x, fieldHeight) / 3.6 + rockWarp;
  vec3 rockAlbedo = rockMapAt(fieldRockColorMap, rockUvX) * rockWeights.x
    + rockMapAt(fieldRockColorMap, rockUvY) * rockWeights.y
    + rockMapAt(fieldRockColorMap, rockUvZ) * rockWeights.z;
  float earthBlend = cutFace * (1.0 - smoothstep(0.3, 0.75, fieldSlope)) * bankPatch;
  vec3 rockColor = mix(fieldRock, fieldSoil, earthBlend) * rockAlbedo / vec3(0.2314, 0.1465, 0.0838) * (0.8 + rockGrain * 0.2);
  diffuseColor.rgb = mix(diffuseColor.rgb, rockColor * sampledDiffuseColor.rgb, rockBlend);
}
if (fieldRoadDistance < ${vergeReach.toFixed(2)}) {
#ifdef FIELD_PLAIN
  float gravelBlend = 1.0 - smoothstep(0.05, 0.85, fieldRoadDistance + (fieldVariation - 0.5) * 0.35);
  vec3 gravelTone = fieldGravel * sampledDiffuseColor.rgb * ${verge.tone.toFixed(2)};
#else
  float gravelAlong = -fieldPosition.y;
  float gravelWidth = ${verge.width.toFixed(2)} + ${verge.wander.toFixed(2)} * (0.5 + 0.5 * sin(gravelAlong * 0.9 + sin(gravelAlong * 0.23) * 2.0));
  float gravelRag = texture2D(fieldNoiseMap, (fieldPosition * ${verge.ragScale.toFixed(2)} + 0.5) / 128.0).r - 0.5;
  float gravelFray = texture2D(fieldNoiseMap, (fieldPosition * ${verge.frayScale.toFixed(2)} + 0.5) / 128.0).r - 0.5;
  float gravelTuft = texture2D(fieldNoiseMap, (fieldPosition * ${verge.tuftScale.toFixed(1)} + 0.5) / 128.0).r - 0.5;
  float gravelEdge = fieldRoadDistance + gravelRag * ${verge.rag.toFixed(2)} + gravelFray * ${verge.fray.toFixed(2)} + gravelTuft * ${verge.tuft.toFixed(2)} - gravelWidth;
  float gravelBlend = 1.0 - smoothstep(-0.07, 0.09, gravelEdge);
  float gravelGrain = texture2D(fieldDetailMap, fieldPosition * ${verge.grainScale.toFixed(2)}).g;
  float gravelStone = texture2D(fieldNoiseMap, (fieldPosition * ${verge.stoneScale.toFixed(1)} + 0.5) / 128.0).r;
  float gravelPebble = stoneAt(fieldPosition * ${verge.pebbleScale.toFixed(2)});
  float gravelDirt = smoothstep(0.35, 0.7, fieldVariationAt(fieldPosition * 3.1 + vec2(23.0, 5.0)));
  vec3 gravelTone = mix(fieldGravel * ${verge.tone.toFixed(2)}, fieldSoil * 0.8, 0.12 + gravelDirt * 0.55) * (1.0 + fieldSand * ${verge.sandLift.toFixed(2)}) * sampledDiffuseColor.rgb
    * (${(1 - verge.grain / 2).toFixed(2)} + gravelGrain * ${verge.grain.toFixed(2)})
    * (${(1 - verge.stone / 2).toFixed(2)} + gravelStone * ${verge.stone.toFixed(2)})
    * (${(1 - verge.pebble / 2).toFixed(2)} + gravelPebble * ${verge.pebble.toFixed(2)});
  float gravelApron = (1.0 - smoothstep(0.0, ${verge.apron.toFixed(2)}, gravelEdge))
    * smoothstep(0.32, 0.6, fieldVariationAt(fieldPosition * 5.3 + vec2(61.0, 17.0)) + gravelFray * 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, fieldSoil * sampledDiffuseColor.rgb * (0.62 + gravelGrain * 0.55), gravelApron * 0.6);
#endif
  diffuseColor.rgb = mix(diffuseColor.rgb, gravelTone, gravelBlend);
}
diffuseColor.rgb *= 1.0 - fieldGroveCover * (1.0 - smoothstep(0.4, 0.65, fieldSlope)) * 0.32;
float fieldHeightWidth = fwidth(fieldHeight);
if (fieldHeight < 1.4) {
  float shoreWet = (1.0 - smoothstep(0.04, 0.85 + fieldVariation * 0.5, fieldHeight)) * step(-0.4, fieldHeight);
  diffuseColor.rgb = mix(diffuseColor.rgb, fieldSoil * sampledDiffuseColor.rgb * 0.55, shoreWet * 0.7);
  float foamWidth = min(0.035, max(fieldHeightWidth * 1.5, 0.004) * (1.0 + fieldVariationAt(fieldPosition * 6.0 + vec2(2.9, 7.3))));
  float foamLine = (1.0 - smoothstep(0.0, foamWidth, abs(fieldHeight - foamWidth * 0.5))) * step(-0.4, fieldHeight);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.9), foamLine * 0.4);
}`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_BUMPMAP
normal = perturbNormalArb(-vViewPosition, normal, dHdxy_fwd(), faceDirection);
if (sandRelief > 0.0) {
  float sandHeight = sandRelief * ${sandLook.rippleHeight.toFixed(4)};
  normal = perturbNormalArb(-vViewPosition, normal, vec2(dFdx(sandHeight), dFdy(sandHeight)), faceDirection);
}
#endif
#ifdef USE_NORMALMAP_TANGENTSPACE
if (rockBlend > 0.0) {
  vec3 rockNormalX = getTangentFrame(-vViewPosition, nonPerturbedNormal, rockUvX) * (rockMapAt(fieldRockMap, rockUvX) * 2.0 - 1.0);
  vec3 rockNormalY = getTangentFrame(-vViewPosition, nonPerturbedNormal, rockUvY) * (rockMapAt(fieldRockMap, rockUvY) * 2.0 - 1.0);
  vec3 rockNormalZ = getTangentFrame(-vViewPosition, nonPerturbedNormal, rockUvZ) * (rockMapAt(fieldRockMap, rockUvZ) * 2.0 - 1.0);
  vec3 rockNormal = normalize(rockNormalX * rockWeights.x + rockNormalY * rockWeights.y + rockNormalZ * rockWeights.z);
  normal = normalize(mix(normal, rockNormal, rockBlend));
}
#endif`,
      )
    }
  }
  setAppearance(settings: Settings) {
    const winter = settings.season === 'winter',
      autumn = settings.season === 'autumn',
      field = landscapeProfiles[settings.landscape].field,
      sand = landscapeProfiles[settings.landscape].sand
    this.fieldUniforms.fieldDryGrass.value.set(
      winter ? '#d2dad4' : field ? field.dry : autumn ? '#b5a66b' : '#aaa66d',
    )
    this.fieldUniforms.fieldDryness.value = winter ? 0.08 : autumn ? 0.7 : (field?.dryness ?? 0.38)
    const shade = field?.shade
    this.fieldUniforms.fieldMeadowShade.value.setRGB(
      winter ? 0.87 : shade ? shade[0] : autumn ? 0.75 : 0.65,
      winter ? 0.92 : shade ? shade[1] : autumn ? 0.74 : 0.78,
      winter ? 0.94 : shade ? shade[2] : autumn ? 0.61 : 0.55,
    )
    this.fieldUniforms.fieldRock.value.set(winter ? '#aab2b0' : field ? field.rock : '#8c877a')
    this.fieldUniforms.fieldSoil.value.set(
      winter ? '#969b8e' : field ? field.soil : autumn ? '#8a7755' : '#807350',
    )
    this.fieldUniforms.fieldGravel.value.set(winter ? '#c1c9c6' : field ? field.gravel : '#a9a99b')
    this.fieldUniforms.fieldScrubTint.value.fromArray(
      winter ? groundBreakup.frost : sand ? groundBreakup.pavement : groundBreakup.scrub,
    )
    this.fieldUniforms.fieldBreakup.value = winter ? groundBreakup.winter : 1
    this.fieldUniforms.fieldSand.value = sand ? 1 : 0
  }
  override customProgramCacheKey() {
    return `triplanar-rock-road-cuts-varied-shore-drift-patched-scree-stony-gravel-verge-far-rock-rippled-sand${this.open ? '-open' : ''}`
  }
  override dispose() {
    super.dispose()
    if (this.open) return
    this.fieldUniforms.fieldNoiseMap.value.dispose()
    this.fieldUniforms.fieldDetailMap.value.dispose()
    this.fieldUniforms.fieldRockMap.value.dispose()
    this.fieldUniforms.fieldRockColorMap.value.dispose()
  }
}

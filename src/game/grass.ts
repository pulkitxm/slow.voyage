import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { sharpness } from './graphics'
import { random, type Season } from './world'

export const grassLook = {
  root: 0.55,
  tip: 1.12,
  gain: 1.08,
  keep: 0.82,
  rise: { low: 0.7, high: 1.5 },
  straw: 0.82,
  dry: { floor: 0.07, field: 0.85, sparse: 0.24 },
  verge: { reach: 1.8, low: 0.5 },
  slope: { steep: 0.65, level: 0.92, low: 0.6 },
  dead: { summer: '#8f7d52', autumn: '#96804f', winter: '#a39370' },
}

export function grassDead(season: Season) {
  return grassLook.dead[season]
}

export function vergeHeight(beyond: number) {
  const reach = Math.min(1, Math.max(0, beyond / grassLook.verge.reach))
  return grassLook.verge.low + (1 - grassLook.verge.low) * reach * reach * (3 - 2 * reach)
}

export function slopeHeight(level: number) {
  const { steep, level: flat, low } = grassLook.slope
  const reach = Math.min(1, Math.max(0, (level - steep) / (flat - steep)))
  return low + (1 - low) * reach
}

export const grassLighting = `#if NUM_DIR_LIGHTS > 0
float grassBacklight = pow(max(dot(-normal, directionalLights[0].direction), 0.0), 2.0);
float grassThrough = pow(max(dot(-normalize(vViewPosition), directionalLights[0].direction), 0.0), 4.0) * grassHeight;
float grassReach = dot(diffuseColor.rgb * directionalLights[0].color, vec3(1.0)) * RECIPROCAL_PI * 0.3;
float grassSunlit = clamp(dot(reflectedLight.directDiffuse, vec3(1.0)) / max(grassReach, 0.0001), 0.0, 1.0);
outgoingLight += diffuseColor.rgb * directionalLights[0].color * (0.04 + grassBacklight * 0.1 + grassThrough * 0.3) * mix(0.2, 1.0, grassSunlit);
outgoingLight += reflectedLight.indirectDiffuse * 0.7 * mix(0.4, 1.0, grassSunlit);
#endif
#include <opaque_fragment>`

export const grassVertexHead = `uniform float windTime;
varying vec3 fieldGrassField;
varying float fieldGrassVariation;
varying vec3 fieldGrassNormal;
varying float grassLush;
varying float grassHeight;
float grassCell(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float grassPatch(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(grassCell(cell), grassCell(cell + vec2(1.0, 0.0)), f.x), mix(grassCell(cell + vec2(0.0, 1.0)), grassCell(cell + vec2(1.0, 1.0)), f.x), f.y);
}`

export const grassVertexNormal = `mat3 grassInstance = mat3(instanceMatrix);
mat3 grassNormal = mat3(cross(grassInstance[1], grassInstance[2]), cross(grassInstance[2], grassInstance[0]), cross(grassInstance[0], grassInstance[1]));
transformedNormal = normalMatrix * grassNormal * objectNormal;
fieldGrassNormal = normalMatrix * grassNormal * vec3(0.0, 1.0, 0.0);`

export function grassVertexBody(full: number, end: number) {
  return `vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
fieldGrassField = vec3(fieldVariationAt(root.xz), fieldMeadowAt(root.xz), fieldVariationAt(root.xz * 0.13 + vec2(17.3, 61.9)));
fieldGrassVariation = fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453);
grassLush = clamp(grassPatch(root.xz * 0.29) * 0.6 + grassPatch(root.xz * 0.073 + vec2(13.7, 4.1)) * 0.6 - 0.1, 0.0, 1.0);
grassHeight = position.y * 2.0;
transformed.y *= mix(${grassLook.rise.low.toFixed(2)}, ${grassLook.rise.high.toFixed(2)}, grassLush) * mix(0.82, 1.18, fract(fieldGrassVariation * 5.37));
float wind = sin(root.x * 0.3 + root.z * 0.15 + windTime * 1.8);
transformed.xz += vec2(wind, wind * 0.6) * position.y * position.y * 0.18;
float grassDistance = length((viewMatrix * vec4(root, 1.0)).xyz);
transformed *= 1.0 - smoothstep(${full.toFixed(1)}, ${end.toFixed(1)}, grassDistance);`
}

export const grassFragmentHead = `varying vec3 fieldGrassField;
varying float fieldGrassVariation;
varying vec3 fieldGrassNormal;
varying float grassLush;
varying float grassHeight;
uniform vec3 fieldDryGrass;
uniform float fieldDryness;
uniform vec3 fieldMeadowShade;
uniform vec3 grassDead;`

export const grassFragmentNormal =
  'normal = normalize(mix(normal, normalize(fieldGrassNormal), 0.7));\nnonPerturbedNormal = normal;'

export const grassFragmentColor = `float bladeTone = sampledDiffuseColor.r;
float bladeId = sampledDiffuseColor.b;
vec3 tuftGreen = diffuse * vColor.rgb;
tuftGreen *= mix(vec3(1.0), fieldMeadowShade, fieldGrassField.y);
tuftGreen *= mix(vec3(0.84, 0.9, 0.8), vec3(1.12, 1.07, 0.94), fieldGrassField.z) * ${grassLook.gain.toFixed(2)};
tuftGreen *= mix(vec3(1.12, 1.03, 0.8), vec3(0.78, 0.93, 0.84), grassLush);
tuftGreen *= mix(vec3(0.93, 1.0, 0.92), vec3(1.08, 1.0, 0.84), fract(fieldGrassVariation * 7.31));
tuftGreen = mix(vec3(dot(tuftGreen, vec3(0.3, 0.59, 0.11))), tuftGreen, ${grassLook.keep.toFixed(2)});
float tuftDry = clamp(${grassLook.dry.floor.toFixed(2)} + smoothstep(0.35, 0.7, fieldGrassField.x) * fieldDryness * ${grassLook.dry.field.toFixed(2)} + (1.0 - grassLush) * ${grassLook.dry.sparse.toFixed(2)} * (0.4 + fieldDryness), 0.0, 0.94);
float bladeBlur = 0.07 + smoothstep(6.0, 34.0, length(vViewPosition)) * 0.5;
float bladeDry = smoothstep(-bladeBlur, bladeBlur, bladeId - (1.0 - tuftDry));
vec3 tuftStraw = mix(fieldDryGrass * ${grassLook.straw.toFixed(2)}, grassDead, smoothstep(0.86, 1.0, bladeId));
diffuseColor.rgb = mix(tuftGreen, tuftStraw, bladeDry) * bladeTone * mix(${grassLook.root.toFixed(2)}, ${grassLook.tip.toFixed(2)}, pow(clamp(grassHeight, 0.0, 1.0), 0.8));`

export function grassTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Grass texture canvas is unavailable')
  const rng = random(831)
  const blades = 116
  for (let blade = 0; blade < blades; blade++) {
    const stalk = blade >= blades - 9
    const baseX = 256 + (rng() - 0.5) * 390
    const tipX = clampPixel(baseX + (rng() - 0.5) * (stalk ? 70 : 190))
    const tipY = stalk ? 14 + rng() * 120 : blade < 60 ? 270 + rng() * 200 : 60 + rng() * 300
    const width = stalk ? 1.6 : 1.4 + rng() * 3.2
    const controlX = baseX + (tipX - baseX) * (0.1 + rng() * 0.35)
    const controlY = 512 - (512 - tipY) * 0.6
    const value = 196 + rng() * 44
    const id = stalk ? 255 : Math.floor(rng() * 256)
    const color = context.createLinearGradient(baseX, 512, tipX, tipY)
    color.addColorStop(0, `rgb(${value * 0.8} ${value * 0.8} ${id})`)
    color.addColorStop(0.4, `rgb(${value * 0.93} ${value * 0.93} ${id})`)
    color.addColorStop(1, `rgb(${value} ${value} ${id})`)
    context.fillStyle = color
    context.beginPath()
    context.moveTo(baseX - width * 0.5, 512)
    context.quadraticCurveTo(controlX - width, controlY, tipX, tipY)
    context.quadraticCurveTo(controlX + width, controlY, baseX + width * 0.5, 512)
    context.closePath()
    context.fill()
    if (stalk) {
      context.strokeStyle = `rgb(${value * 0.8} ${value * 0.8} 255)`
      context.lineWidth = 1.6
      for (let seed = 0; seed < 9; seed++) {
        context.beginPath()
        context.moveTo(tipX, tipY + seed * 3.4)
        context.lineTo(tipX + (seed % 2 ? 4.5 : -4.5), tipY + seed * 3.4 + 5)
        context.stroke()
      }
    }
  }
  const pixels = context.getImageData(0, 0, 512, 512)
  for (let index = 0; index < pixels.data.length; index += 4) {
    if (pixels.data[index + 3] === 0) pixels.data.set([214, 214, 128], index)
  }
  const texture = new THREE.DataTexture(pixels.data, 512, 512)
  texture.flipY = true
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = sharpness(8)
  texture.needsUpdate = true
  return texture
}

function clampPixel(value: number) {
  return Math.max(24, Math.min(488, value))
}

export function grassGeometry() {
  const cards: THREE.PlaneGeometry[] = []
  for (let side = 0; side < 3; side++) {
    const card = new THREE.PlaneGeometry(0.75, 0.5, 1, 3)
    card.translate(0, 0.25, 0)
    card.rotateY((side * Math.PI) / 3)
    const positions = card.getAttribute('position')
    card.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(positions.count * 3).fill(1), 3),
    )
    cards.push(card)
  }
  const geometry = mergeGeometries(cards)
  for (const card of cards) card.dispose()
  if (!geometry) throw new Error('Grass geometry could not be assembled')
  geometry.computeBoundingBox()
  return geometry
}

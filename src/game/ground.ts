import * as THREE from 'three'
import { roadCoordinates, roadLayout } from './road'
import { rockTexture } from './rock'
import { woodlandCoverage } from './woodland'
import { clamp, random, type Settings, type World } from './world'

const sideOffsets = [
  roadLayout.halfWidth,
  roadLayout.halfWidth + roadLayout.verge,
  4,
  4.5,
  5,
  ...Array.from({ length: 38 }, (_, index) => 5.5 + index * 0.5),
  ...Array.from({ length: 33 }, (_, index) => 26 + index * 2),
  130,
  190,
  270,
  380,
  520,
  700,
  900,
  1200,
  1600,
]
const groundOffsets = [...sideOffsets.map((offset) => -offset).reverse(), 0, ...sideOffsets]

export function groundGeometry(
  world: World,
  start: number,
  base: THREE.Color,
  light: THREE.Color,
  rows = 96,
) {
  const positions: number[] = [],
    indices: number[] = [],
    colors: number[] = [],
    normals: number[] = [],
    roadDistances: number[] = [],
    groveCover: number[] = [],
    bankHeights: number[] = [],
    uv: number[] = []
  const settings = world.settings
  const color = new THREE.Color()
  const shore = new THREE.Color(settings.season === 'winter' ? '#dde3dc' : '#c5c1a3')
  const snow = new THREE.Color('#dae0dc')
  const normal = new THREE.Vector3()
  for (let row = 0; row <= rows; row++) {
    const s = start + (row * 120) / rows
    const road = world.road(s)
    for (let col = 0; col < groundOffsets.length; col++) {
      const distance = groundOffsets[col] ?? 0
      const x = road.x + distance
      const elevation = world.height(x, s)
      positions.push(x, elevation, -s)
      normal
        .set(
          -(world.height(x + 0.2, s) - world.height(x - 0.2, s)) / 0.4,
          1,
          (world.height(x, s + 0.2) - world.height(x, s - 0.2)) / 0.4,
        )
        .normalize()
      normals.push(normal.x, normal.y, normal.z)
      const frame = Math.abs(distance) < 20 ? roadCoordinates(world, x, s) : null
      roadDistances.push(Math.abs(frame?.distance ?? distance) - roadLayout.halfWidth)
      bankHeights.push(elevation - (frame?.road.y ?? road.y))
      uv.push(x / 7, s / 7)
      const variation =
        0.32 + Math.sin(x * 0.038 + s * 0.017) * 0.14 + Math.cos(x * 0.08 - s * 0.08) * 0.055
      color.copy(base).lerp(light, variation)
      if (elevation < 1.2 && settings.landscape !== 'desert')
        color.lerp(shore, clamp((1.2 - elevation) / 1.5, 0, 1))
      if (settings.landscape === 'alpine' && elevation > 120)
        color.lerp(snow, clamp((elevation - 120) / 80, 0, 1))
      colors.push(color.r, color.g, color.b)
      let forest = 0
      if (settings.landscape !== 'desert' && elevation > 0.7) {
        const grove = woodlandCoverage(x, s, settings.seed, settings.landscape)
        const verge = clamp((Math.abs(distance) - 45) / 30, 0, 1)
        const treeLine = settings.landscape === 'alpine' ? clamp((220 - elevation) / 60, 0, 1) : 1
        forest = grove * verge * treeLine
      }
      groveCover.push(forest)
      if (row < rows && col < groundOffsets.length - 1) {
        const n = row * groundOffsets.length + col
        indices.push(
          n,
          n + 1,
          n + groundOffsets.length,
          n + 1,
          n + groundOffsets.length + 1,
          n + groundOffsets.length,
        )
      }
    }
  }
  const ground = new THREE.BufferGeometry()
  ground.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  ground.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  ground.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  ground.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  ground.setAttribute('roadDistance', new THREE.Float32BufferAttribute(roadDistances, 1))
  ground.setAttribute('groveCover', new THREE.Float32BufferAttribute(groveCover, 1))
  ground.setAttribute('bankHeight', new THREE.Float32BufferAttribute(bankHeights, 1))
  ground.setIndex(indices)
  return ground
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
  texture.anisotropy = 8
  return texture
}
export const meadowNoise = `
uniform sampler2D fieldNoiseMap;
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
export class MeadowMaterial extends THREE.MeshStandardMaterial {
  fieldUniforms = {
    fieldNoiseMap: { value: meadowNoiseTexture() },
    fieldDryGrass: { value: new THREE.Color() },
    fieldDryness: { value: 0 },
    fieldMeadowShade: { value: new THREE.Color() },
    fieldRock: { value: new THREE.Color() },
    fieldSoil: { value: new THREE.Color() },
    fieldGravel: { value: new THREE.Color() },
    fieldRockMap: { value: rockTexture() },
  }
  constructor(texture: THREE.Texture, settings: Settings) {
    super({ map: texture, bumpMap: texture, bumpScale: 0.02, vertexColors: true, roughness: 1 })
    this.normalMap = this.fieldUniforms.fieldRockMap.value
    this.setAppearance(settings)
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.fieldUniforms)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float roadDistance;
attribute float groveCover;
attribute float bankHeight;
varying vec2 fieldPosition;
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
fieldHeight = (modelMatrix * vec4(position, 1.0)).y;
fieldBankHeight = bankHeight;
fieldRoadDistance = roadDistance;
fieldGroveCover = groveCover;
fieldSlope = clamp((1.0 - abs(normalize((modelMatrix * vec4(normal, 0.0)).xyz).y)) * 2.0, 0.0, 1.0);`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec2 fieldPosition;
varying float fieldHeight;
varying float fieldBankHeight;
varying float fieldRoadDistance;
varying float fieldGroveCover;
varying float fieldSlope;
uniform vec3 fieldDryGrass;
uniform float fieldDryness;
uniform vec3 fieldMeadowShade;
uniform vec3 fieldRock;
uniform vec3 fieldSoil;
uniform vec3 fieldGravel;
uniform sampler2D fieldRockMap;
${meadowNoise}`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float fieldVariation = fieldVariationAt(fieldPosition);
float dryBlend = smoothstep(0.35, 0.7, fieldVariation) * fieldDryness;
diffuseColor.rgb = mix(diffuseColor.rgb, fieldDryGrass * sampledDiffuseColor.rgb, dryBlend);
diffuseColor.rgb *= mix(vec3(1.0), fieldMeadowShade, fieldMeadowAt(fieldPosition));
diffuseColor.rgb *= 0.78 + fieldVariation * 0.4;
float rockBlend = smoothstep(0.24, 0.62, fieldSlope) * smoothstep(0.24, 0.66, fieldVariation);
float cutFace = smoothstep(0.06, 0.32, fieldSlope)
  * (1.0 - smoothstep(6.0, 13.0, fieldRoadDistance))
  * smoothstep(0.15, 1.8, fieldBankHeight);
float bankPatch = fieldVariationAt(fieldPosition * 2.4 + vec2(19.1, 3.7));
float grassPocket = (1.0 - smoothstep(0.3, 0.75, fieldSlope)) * smoothstep(0.25, 0.55, bankPatch);
cutFace *= 1.0 - grassPocket * 0.88;
rockBlend = max(rockBlend, cutFace);
float rockGrain = fieldVariationAt(fieldPosition * 80.0);
vec2 rockUv = vec2(fieldPosition.y + fieldPosition.x * 0.2, fieldHeight) * 0.125;
rockUv += (fieldVariationAt(fieldPosition * 4.0) - 0.5) * 0.2;
vec4 rockSurface = mix(texture2D(fieldRockMap, rockUv), texture2D(fieldRockMap, rockUv * 2.13 + vec2(0.27, 0.69)), 0.35);
float earthBlend = cutFace * (1.0 - smoothstep(0.3, 0.75, fieldSlope)) * bankPatch;
vec3 rockColor = mix(fieldRock, fieldSoil, earthBlend) * rockSurface.a * (1.08 + rockGrain * 0.2);
diffuseColor.rgb = mix(diffuseColor.rgb, rockColor * sampledDiffuseColor.rgb, rockBlend);
float gravelBlend = 1.0 - smoothstep(0.05, 0.85, fieldRoadDistance + (fieldVariation - 0.5) * 0.35);
diffuseColor.rgb = mix(diffuseColor.rgb, fieldGravel * sampledDiffuseColor.rgb, gravelBlend);
diffuseColor.rgb *= 1.0 - fieldGroveCover * (1.0 - smoothstep(0.4, 0.65, fieldSlope)) * 0.32;`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `normal = perturbNormalArb(-vViewPosition, normal, dHdxy_fwd(), faceDirection);
vec3 rockNormal = normalize(getTangentFrame(-vViewPosition, nonPerturbedNormal, rockUv) * (rockSurface.rgb * 2.0 - 1.0));
normal = normalize(mix(normal, rockNormal, rockBlend));`,
      )
    }
  }
  setAppearance(settings: Settings) {
    const winter = settings.season === 'winter',
      autumn = settings.season === 'autumn',
      desert = settings.landscape === 'desert'
    this.fieldUniforms.fieldDryGrass.value.set(
      winter ? '#d2dad4' : desert ? '#c5ae7b' : autumn ? '#b5a66b' : '#aaa66d',
    )
    this.fieldUniforms.fieldDryness.value = winter ? 0.08 : autumn ? 0.7 : desert ? 0.24 : 0.38
    this.fieldUniforms.fieldMeadowShade.value.setRGB(
      winter ? 0.87 : desert ? 0.83 : autumn ? 0.75 : 0.65,
      winter ? 0.92 : desert ? 0.77 : autumn ? 0.74 : 0.78,
      winter ? 0.94 : desert ? 0.66 : autumn ? 0.61 : 0.55,
    )
    this.fieldUniforms.fieldRock.value.set(winter ? '#aab2b0' : desert ? '#9f8160' : '#8c877a')
    this.fieldUniforms.fieldSoil.value.set(
      winter ? '#969b8e' : desert ? '#a2855e' : autumn ? '#8a7755' : '#807350',
    )
    this.fieldUniforms.fieldGravel.value.set(winter ? '#c1c9c6' : desert ? '#b39a75' : '#a9a99b')
  }
  override customProgramCacheKey() {
    return 'vegetated-soil-road-cuts'
  }
  override dispose() {
    this.fieldUniforms.fieldNoiseMap.value.dispose()
    this.fieldUniforms.fieldRockMap.value.dispose()
    super.dispose()
  }
}

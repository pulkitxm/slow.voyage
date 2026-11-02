import * as THREE from 'three'
import { random, type Settings } from './world'

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
    context.strokeStyle = `rgb(${value} ${value} ${value} / 0.25)`
    context.lineWidth = 0.4 + rng() * 0.6
    const x = rng() * 256,
      y = rng() * 256
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + (rng() - 0.5) * 4, y - 1 - rng() * 4)
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
    fieldRock: { value: new THREE.Color() },
    fieldGravel: { value: new THREE.Color() },
  }
  constructor(texture: THREE.Texture, settings: Settings) {
    super({ map: texture, vertexColors: true, roughness: 1 })
    this.setAppearance(settings)
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.fieldUniforms)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float roadDistance;
attribute float groveCover;
varying vec2 fieldPosition;
varying float fieldRoadDistance;
varying float fieldGroveCover;
varying float fieldSlope;`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
fieldPosition = (modelMatrix * vec4(position, 1.0)).xz;
fieldRoadDistance = roadDistance;
fieldGroveCover = groveCover;
fieldSlope = clamp((1.0 - abs(normalize((modelMatrix * vec4(normal, 0.0)).xyz).y)) * 2.0, 0.0, 1.0);`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec2 fieldPosition;
varying float fieldRoadDistance;
varying float fieldGroveCover;
varying float fieldSlope;
uniform vec3 fieldDryGrass;
uniform float fieldDryness;
uniform vec3 fieldRock;
uniform vec3 fieldGravel;
${meadowNoise}`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float fieldVariation = fieldVariationAt(fieldPosition);
float dryBlend = smoothstep(0.35, 0.7, fieldVariation) * fieldDryness;
diffuseColor.rgb = mix(diffuseColor.rgb, fieldDryGrass * sampledDiffuseColor.rgb, dryBlend);
diffuseColor.rgb *= 0.78 + fieldVariation * 0.4;
float rockBlend = smoothstep(0.24, 0.62, fieldSlope) * smoothstep(0.24, 0.66, fieldVariation);
diffuseColor.rgb = mix(diffuseColor.rgb, fieldRock * sampledDiffuseColor.rgb * (0.8 + fieldVariation * 0.4), rockBlend);
float gravelBlend = 1.0 - smoothstep(0.05, 0.85, fieldRoadDistance + (fieldVariation - 0.5) * 0.35);
diffuseColor.rgb = mix(diffuseColor.rgb, fieldGravel * sampledDiffuseColor.rgb, gravelBlend);
diffuseColor.rgb *= 1.0 - fieldGroveCover * (1.0 - smoothstep(0.4, 0.65, fieldSlope)) * 0.32;`,
      )
    }
  }
  setAppearance(settings: Settings) {
    const winter = settings.season === 'winter',
      autumn = settings.season === 'autumn',
      desert = settings.landscape === 'desert'
    this.fieldUniforms.fieldDryGrass.value.set(
      winter ? '#d2dad4' : desert ? '#c5ae7b' : autumn ? '#b5a66b' : '#b9b875',
    )
    this.fieldUniforms.fieldDryness.value = winter ? 0.08 : autumn ? 0.65 : desert ? 0.2 : 0.18
    this.fieldUniforms.fieldRock.value.set(winter ? '#aab2b0' : desert ? '#9f8160' : '#8c877a')
    this.fieldUniforms.fieldGravel.value.set(winter ? '#c1c9c6' : desert ? '#b39a75' : '#a9a99b')
  }
  override customProgramCacheKey() {
    return 'textured-meadow-woodland-surface'
  }
  override dispose() {
    this.fieldUniforms.fieldNoiseMap.value.dispose()
    super.dispose()
  }
}

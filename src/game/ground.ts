import * as THREE from 'three'
import { random } from './world'

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
const noise = `
float fieldHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fieldNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fieldHash(i), fieldHash(i + vec2(1.0, 0.0)), f.x), mix(fieldHash(i + vec2(0.0, 1.0)), fieldHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`
export function meadowMaterial(texture: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    vertexColors: true,
    roughness: 1,
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec2 fieldPosition;',
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nfieldPosition = (modelMatrix * vec4(position, 1.0)).xz;',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\nvarying vec2 fieldPosition;\n${noise}`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\nfloat fieldVariation = fieldNoise(fieldPosition * 0.031) * 0.6 + fieldNoise(fieldPosition * 0.12) * 0.3 + fieldNoise(fieldPosition * 0.57) * 0.1;\ndiffuseColor.rgb *= 0.82 + fieldVariation * 0.32;',
    )
  }
  material.customProgramCacheKey = () => 'meadow-surface'
  return material
}

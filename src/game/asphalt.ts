import * as THREE from 'three'
import { random } from './world'

export function asphaltTexture() {
  const size = 256
  const cells = 16
  const rng = random(14)
  const patches = Float32Array.from({ length: cells * cells }, () => rng())
  const patch = (x: number, y: number) =>
    patches[((y + cells) % cells) * cells + ((x + cells) % cells)] ?? 0.5
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Asphalt texture canvas is unavailable')
  const pixels = context.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x * cells) / size
      const v = (y * cells) / size
      const column = Math.floor(u)
      const row = Math.floor(v)
      const blendX = (u - column) ** 2 * (3 - 2 * (u - column))
      const blendY = (v - row) ** 2 * (3 - 2 * (v - row))
      const lower = patch(column, row) * (1 - blendX) + patch(column + 1, row) * blendX
      const upper = patch(column, row + 1) * (1 - blendX) + patch(column + 1, row + 1) * blendX
      const aggregate = lower * (1 - blendY) + upper * blendY
      const tone = Math.round(136 + (rng() - 0.5) * 22 + (aggregate - 0.5) * 8)
      pixels.data.set([tone, tone, tone, 255], (y * size + x) * 4)
    }
  }
  context.putImageData(pixels, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(6, 80)
  texture.anisotropy = 8
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

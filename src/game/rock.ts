import * as THREE from 'three'
import { clamp, random } from './world'

const columns = 6
const rows = 8
const rng = random(35417)
const cells = Array.from({ length: columns * rows }, () => ({
  x: 0.05 + rng() * 0.9,
  y: 0.05 + rng() * 0.9,
  shade: rng(),
  tiltX: (rng() - 0.5) * 0.6,
  tiltY: (rng() - 0.5) * 0.6,
}))

export function rockSample(u: number, v: number) {
  const x = u * columns + Math.sin(v * Math.PI * 2) * 0.25
  const y = v * rows + Math.sin(u * Math.PI * 2) * 0.25
  const column = Math.floor(x)
  const row = Math.floor(y)
  let nearest = Infinity
  let next = Infinity
  let shade = 0
  let facet = 0
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const i = column + dx
      const j = row + dy
      const cell =
        cells[(((j % rows) + rows) % rows) * columns + (((i % columns) + columns) % columns)]
      if (!cell) continue
      const offsetX = x - i - cell.x
      const offsetY = y - j - cell.y
      const distance = offsetX * offsetX + offsetY * offsetY
      if (distance < nearest) {
        next = nearest
        nearest = distance
        shade = cell.shade
        facet = offsetX * cell.tiltX + offsetY * cell.tiltY
      } else if (distance < next) next = distance
    }
  }
  const edge = clamp((Math.sqrt(next) - Math.sqrt(nearest)) / 0.16, 0, 1)
  const layer = Math.sin((v * rows + Math.sin(u * Math.PI * 2) * 0.2) * Math.PI * 2) * 0.04
  return {
    tone: clamp(0.68 + shade * 0.16 + layer * 0.8 - (1 - edge) * 0.06, 0, 1),
    height: clamp(0.52 + facet * 0.8 + layer * 0.7 - (1 - edge) * 0.05, 0, 1),
  }
}

export function rockTexture() {
  const size = 256
  const heights = new Float32Array(size * size)
  const tones = new Float32Array(size * size)
  const pixels = new Uint8Array(size * size * 4)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const sample = rockSample(column / size, row / size)
      heights[row * size + column] = sample.height
      tones[row * size + column] = sample.tone
    }
  }
  const heightAt = (x: number, y: number) =>
    heights[((y + size) % size) * size + ((x + size) % size)] ?? 0
  const normal = new THREE.Vector3()
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const scale = (0.25 * size) / 16
      normal
        .set(
          -(heightAt(column + 1, row) - heightAt(column - 1, row)) * scale,
          -(heightAt(column, row + 1) - heightAt(column, row - 1)) * scale,
          1,
        )
        .normalize()
      pixels.set(
        [
          Math.round((normal.x * 0.5 + 0.5) * 255),
          Math.round((normal.y * 0.5 + 0.5) * 255),
          Math.round((normal.z * 0.5 + 0.5) * 255),
          Math.round((tones[row * size + column] ?? 0) * 255),
        ],
        (row * size + column) * 4,
      )
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.anisotropy = 8
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { random } from './world'

export function grassTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Grass texture canvas is unavailable')
  const rng = random(831)
  for (let blade = 0; blade < 96; blade++) {
    const baseX = 256 + (rng() - 0.5) * 380
    const tipX = clampPixel(baseX + (rng() - 0.5) * 180)
    const tipY = blade < 48 ? 280 + rng() * 190 : 35 + rng() * 310
    const width = 1.5 + rng() * 3.5
    const controlX = baseX + (tipX - baseX) * (0.1 + rng() * 0.35)
    const controlY = 512 - (512 - tipY) * 0.6
    const value = 204 + rng() * 32
    const color = context.createLinearGradient(baseX, 512, tipX, tipY)
    color.addColorStop(0, 'rgb(195 195 195)')
    color.addColorStop(0.35, `rgb(${value * 0.94} ${value * 0.94} ${value * 0.94})`)
    color.addColorStop(1, `rgb(${value} ${value} ${value})`)
    context.fillStyle = color
    context.beginPath()
    context.moveTo(baseX - width * 0.5, 512)
    context.quadraticCurveTo(controlX - width, controlY, tipX, tipY)
    context.quadraticCurveTo(controlX + width, controlY, baseX + width * 0.5, 512)
    context.closePath()
    context.fill()
    if (blade >= 92) {
      context.strokeStyle = `rgb(${value * 0.72} ${value * 0.72} ${value * 0.72})`
      context.lineWidth = 1.2
      for (let seed = 0; seed < 5; seed++) {
        context.beginPath()
        context.moveTo(tipX, tipY + seed * 3)
        context.lineTo(tipX + (seed % 2 ? 3 : -3), tipY + seed * 3 + 4)
        context.stroke()
      }
    }
  }
  const pixels = context.getImageData(0, 0, 512, 512)
  for (let index = 0; index < pixels.data.length; index += 4) {
    if (pixels.data[index + 3] === 0) pixels.data.set([220, 220, 220], index)
  }
  const texture = new THREE.DataTexture(pixels.data, 512, 512)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = true
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 8
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
    const colors = new Float32Array(positions.count * 3)
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const shade = 0.85 + (positions.getY(vertex) / 0.5) * 0.15
      colors.set([shade, shade, shade], vertex * 3)
    }
    card.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    cards.push(card)
  }
  const geometry = mergeGeometries(cards)
  for (const card of cards) card.dispose()
  if (!geometry) throw new Error('Grass geometry could not be assembled')
  geometry.computeBoundingBox()
  return geometry
}

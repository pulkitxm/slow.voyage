import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { random, type Season } from './world'

const atlasSize = 1024
const tileSize = atlasSize / 2
function canopy(
  context: CanvasRenderingContext2D,
  rng: () => number,
  season: Season,
  centers: { x: number; y: number; radius: number }[],
) {
  for (const center of centers) {
    for (let i = 0; i < 850; i++) {
      const angle = rng() * Math.PI * 2
      const radius = Math.sqrt(rng())
      const nx = Math.cos(angle) * radius
      const ny = Math.sin(angle) * radius
      const x = center.x + nx * center.radius
      const y = center.y + ny * center.radius * 0.85
      const shade = 0.25 - nx * 0.055 - ny * 0.085 + rng() * 0.1
      const hue = season === 'autumn' ? 24 + rng() * 28 : 72 + rng() * 30
      const saturation = season === 'autumn' ? 48 + rng() * 24 : 27 + rng() * 22
      context.fillStyle = `hsl(${hue} ${saturation}% ${shade * 100}%)`
      context.beginPath()
      context.ellipse(x, y, 2.5 + rng() * 3.5, 1.8 + rng() * 2.5, angle, 0, Math.PI * 2)
      context.fill()
    }
  }
}
function drawTree(context: CanvasRenderingContext2D, variant: number, season: Season) {
  const rng = random(324 + variant * 981)
  const centers: { x: number; y: number; radius: number }[] = []
  function branch(
    x: number,
    y: number,
    length: number,
    angle: number,
    width: number,
    depth: number,
  ) {
    const endX = x + Math.sin(angle) * length
    const endY = y - Math.cos(angle) * length
    context.strokeStyle = depth > 2 ? '#625e4b' : '#77715b'
    context.lineWidth = width
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(x, y)
    context.quadraticCurveTo(
      x + Math.sin(angle) * length * 0.3 + width * 0.3,
      y - length * 0.5,
      endX,
      endY,
    )
    context.stroke()
    if (depth === 0) {
      centers.push({ x: endX, y: endY, radius: 39 + rng() * 18 })
      return
    }
    branch(
      endX,
      endY,
      length * (0.65 + rng() * 0.06),
      angle - 0.48 - rng() * 0.35,
      width * 0.58,
      depth - 1,
    )
    branch(
      endX,
      endY,
      length * (0.65 + rng() * 0.06),
      angle + 0.48 + rng() * 0.35,
      width * 0.58,
      depth - 1,
    )
    if (depth > 1)
      branch(endX, endY, length * 0.8, angle + (rng() - 0.5) * 0.25, width * 0.54, depth - 1)
  }
  branch(256, 498, 143, (rng() - 0.5) * 0.14, 20 + variant * 1.5, 3)
  if (season !== 'winter') {
    centers.push(
      { x: 170, y: 255, radius: 80 },
      { x: 340, y: 245, radius: 90 },
      { x: 205, y: 165, radius: 84 },
      { x: 300, y: 155, radius: 88 },
      { x: 254, y: 236, radius: 95 },
    )
    canopy(context, rng, season, centers)
  } else {
    context.strokeStyle = '#e7ebe4'
    context.lineWidth = 2
    for (const center of centers) {
      context.beginPath()
      context.moveTo(center.x - 8, center.y - 1)
      context.lineTo(center.x + 5, center.y - 3)
      context.stroke()
    }
  }
}
export class Foliage {
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  treeMaterial: THREE.MeshStandardMaterial
  treeGeometries: THREE.BufferGeometry[] = []
  constructor(season: Season) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.canvas.height = atlasSize
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = 8
    this.treeMaterial = new THREE.MeshStandardMaterial({
      map: this.texture,
      side: THREE.DoubleSide,
      alphaTest: 0.46,
      alphaToCoverage: true,
      roughness: 1,
      emissive: '#657745',
      emissiveIntensity: 0.18,
    })
    for (let variant = 0; variant < 4; variant++) {
      const planes: THREE.BufferGeometry[] = []
      for (let side = 0; side < 3; side++) {
        const plane = new THREE.PlaneGeometry(1, 1)
        plane.translate(0, 0.5, 0)
        plane.rotateY((side * Math.PI) / 3)
        const uv = plane.getAttribute('uv')
        for (let i = 0; i < uv.count; i++)
          uv.setXY(
            i,
            uv.getX(i) * 0.5 + (variant % 2) * 0.5,
            uv.getY(i) * 0.5 + Math.floor(variant / 2) * 0.5,
          )
        planes.push(plane)
      }
      const merged = mergeGeometries(planes)
      if (!merged) throw new Error('Tree geometry could not be assembled')
      this.treeGeometries.push(merged)
      for (const plane of planes) plane.dispose()
    }
    this.update(season)
  }
  update(season: Season) {
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Foliage canvas is unavailable')
    context.clearRect(0, 0, atlasSize, atlasSize)
    for (let variant = 0; variant < 4; variant++) {
      context.save()
      context.translate((variant % 2) * tileSize, (1 - Math.floor(variant / 2)) * tileSize)
      drawTree(context, variant, season)
      context.restore()
    }
    this.texture.needsUpdate = true
  }
  dispose() {
    this.texture.dispose()
    this.treeMaterial.dispose()
    for (const geometry of this.treeGeometries) geometry.dispose()
  }
}

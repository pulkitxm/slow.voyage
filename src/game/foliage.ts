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
  if (variant >= 2) {
    context.strokeStyle = '#68634d'
    context.lineWidth = 5
    if (season === 'winter') {
      for (let i = 0; i < 12; i++) {
        const x = 90 + rng() * 330
        const y = 220 + rng() * 180
        context.beginPath()
        context.moveTo(256 + (rng() - 0.5) * 45, 503)
        context.quadraticCurveTo(256, 385, x, y)
        context.moveTo(x, y)
        context.lineTo(x + (rng() - 0.5) * 65, y - 20 - rng() * 45)
        context.stroke()
      }
      return
    }
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const x = 256 + Math.cos(angle) * (85 + rng() * 60)
      const y = 266 + Math.sin(angle) * (85 + rng() * 60)
      context.beginPath()
      context.moveTo(256, 320)
      context.quadraticCurveTo(256, 256, x, y)
      context.stroke()
      centers.push({ x, y, radius: 53 + rng() * 24 })
    }
    centers.push({ x: 256, y: 256, radius: 110 })
    canopy(context, rng, season, centers)
    return
  }
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
  branch(256, 498, 112, (rng() - 0.5) * 0.14, 20 + variant * 1.5, 3)
  if (season !== 'winter') {
    centers.push(
      { x: 170, y: 255, radius: 80 },
      { x: 340, y: 245, radius: 90 },
      { x: 205, y: 165, radius: 84 },
      { x: 300, y: 155, radius: 88 },
      { x: 254, y: 236, radius: 95 },
      { x: 170, y: 317, radius: 82 },
      { x: 328, y: 309, radius: 88 },
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
  winterShrubGeometries: THREE.BufferGeometry[] = []
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
      alphaToCoverage: false,
      roughness: 1,
      emissive: '#657745',
      emissiveIntensity: 0.18,
    })
    for (let variant = 0; variant < 6; variant++) {
      const planes: THREE.BufferGeometry[] = []
      const shrub = variant >= 2 && variant < 4
      const atlasVariant = variant >= 4 ? variant - 2 : variant
      const rng = random(635 + variant * 871)
      const count = shrub ? 8 : 3
      for (let side = 0; side < count; side++) {
        const plane = new THREE.PlaneGeometry(shrub ? 0.68 : 1, shrub ? 0.65 : 1)
        if (shrub) {
          const angle = side * 2.4
          const radius = side === 0 ? 0 : 0.16 + rng() * 0.06
          plane.rotateX((rng() - 0.5) * 0.7)
          plane.rotateY(angle + rng() * 0.7)
          plane.translate(Math.cos(angle) * radius, 0.3 + rng() * 0.24, Math.sin(angle) * radius)
        } else {
          plane.translate(0, 0.5, 0)
          plane.rotateY((side * Math.PI) / 3)
        }
        const uv = plane.getAttribute('uv')
        for (let i = 0; i < uv.count; i++)
          uv.setXY(
            i,
            uv.getX(i) * 0.5 + (atlasVariant % 2) * 0.5,
            uv.getY(i) * 0.5 + Math.floor(atlasVariant / 2) * 0.5,
          )
        planes.push(plane)
      }
      const merged = mergeGeometries(planes)
      if (!merged) throw new Error('Tree geometry could not be assembled')
      if (variant >= 4) this.winterShrubGeometries.push(merged)
      else this.treeGeometries.push(merged)
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
    for (const geometry of this.winterShrubGeometries) geometry.dispose()
  }
}

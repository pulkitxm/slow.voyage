import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { random, type Season } from './world'

const atlasColumns = 2
const atlasRows = 3
const tileSize = 512
function drawConifer(context: CanvasRenderingContext2D, season: Season) {
  const rng = random(5489)
  context.strokeStyle = '#514b3c'
  context.lineWidth = 9
  context.beginPath()
  context.moveTo(256, 503)
  context.lineTo(256, 48)
  context.stroke()
  for (let layer = 15; layer >= 0; layer--) {
    const y = 58 + layer * 25
    const width = (19 + layer * 9.7) * (0.76 + rng() * 0.36)
    const leftWidth = width * (0.85 + rng() * 0.3)
    const rightWidth = width * (0.85 + rng() * 0.3)
    const hue = season === 'winter' ? 142 : 118
    const lightness = 20 + rng() * 7
    context.fillStyle = `hsl(${hue} 24% ${lightness}%)`
    context.beginPath()
    context.moveTo(256, y - 18)
    context.lineTo(256 - leftWidth, y + 31)
    for (let i = 0; i <= 12; i++) {
      const fraction = i / 12
      context.lineTo(256 - leftWidth + fraction * (leftWidth + rightWidth), y + 23 + rng() * 15)
    }
    context.lineTo(256 + rightWidth, y + 31)
    context.closePath()
    context.fill()
    for (const side of [-1, 1]) {
      const branchWidth = side < 0 ? leftWidth : rightWidth
      for (let twig = 0; twig < 36; twig++) {
        const t = rng()
        const x = 256 + side * branchWidth * t
        const branchY = y + 20 * t + rng() * 12
        context.strokeStyle = `hsl(${hue + rng() * 12} ${22 + rng() * 13}% ${lightness + 3 + rng() * 10}%)`
        context.lineWidth = 2 + rng() * 2
        context.beginPath()
        context.moveTo(x - side * 8, branchY - 9)
        context.lineTo(x + side * 7, branchY + 8 + rng() * 8)
        context.stroke()
      }
      if (season === 'winter' && rng() < 0.45) {
        context.strokeStyle = '#cbd7d1'
        context.lineWidth = 2 + rng() * 2
        context.beginPath()
        context.moveTo(256 + side * width * 0.08, y + 1)
        context.lineTo(256 + side * width * 0.52, y + 10)
        context.stroke()
      }
    }
  }
}
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
  if (variant === 4) {
    drawConifer(context, season)
    return
  }
  if (variant === 5) {
    context.save()
    context.translate(256, 0)
    context.scale(0.58, 1)
    context.translate(-256, 0)
    drawTree(context, 1, season)
    context.restore()
    return
  }
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
    this.canvas.width = tileSize * atlasColumns
    this.canvas.height = tileSize * atlasRows
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
    this.treeMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying float foliageDistance;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nfoliageDistance = length(mvPosition.xyz);',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nvarying float foliageDistance;',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        '#ifdef USE_ALPHATEST\nfloat foliageAlpha = mix(alphaTest, 0.28, smoothstep(180.0, 650.0, foliageDistance));\nif (diffuseColor.a < foliageAlpha) discard;\n#endif',
      )
    }
    this.treeMaterial.customProgramCacheKey = () => 'seasonal-foliage-coverage'
    for (let variant = 0; variant < 8; variant++) {
      const planes: THREE.BufferGeometry[] = []
      const shrub = variant >= 2 && variant < 4
      const atlasVariant = variant >= 6 ? variant - 4 : variant
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
            (uv.getX(i) + (atlasVariant % atlasColumns)) / atlasColumns,
            (uv.getY(i) + Math.floor(atlasVariant / atlasColumns)) / atlasRows,
          )
        planes.push(plane)
      }
      const merged = mergeGeometries(planes)
      if (!merged) throw new Error('Tree geometry could not be assembled')
      if (variant >= 6) this.winterShrubGeometries.push(merged)
      else this.treeGeometries.push(merged)
      for (const plane of planes) plane.dispose()
    }
    this.update(season)
  }
  update(season: Season) {
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Foliage canvas is unavailable')
    context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    for (let variant = 0; variant < 6; variant++) {
      context.save()
      context.translate(
        (variant % atlasColumns) * tileSize,
        (atlasRows - 1 - Math.floor(variant / atlasColumns)) * tileSize,
      )
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

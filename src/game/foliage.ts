import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import broadleafUrl from '../assets/trees/broadleaf-a.webp'
import bareBroadleafUrl from '../assets/trees/broadleaf-a-bare.webp'
import spreadingUrl from '../assets/trees/broadleaf-b.webp'
import bareSpreadingUrl from '../assets/trees/broadleaf-b-bare.webp'
import bushUrl from '../assets/trees/bush-a.webp'
import bareBushUrl from '../assets/trees/bush-a-bare.webp'
import leafyBushUrl from '../assets/trees/bush-b.webp'
import bareLeafyBushUrl from '../assets/trees/bush-b-bare.webp'
import coniferUrl from '../assets/trees/conifer.webp'
import slenderUrl from '../assets/trees/slender.webp'
import bareSlenderUrl from '../assets/trees/slender-bare.webp'
import { sharpness } from './graphics'
import { random, type Season } from './world'

export const treePhotos = [
  broadleafUrl,
  spreadingUrl,
  bushUrl,
  leafyBushUrl,
  coniferUrl,
  slenderUrl,
] as const
export const evergreenTile = 4
export const bareTreePhotos = [
  bareBroadleafUrl,
  bareSpreadingUrl,
  bareBushUrl,
  bareLeafyBushUrl,
  null,
  bareSlenderUrl,
] as const
export const bareSnow = { edge: 0.5, body: 0.2 }
export const bareCrown = 0.45
export const treeVariety = { warm: 0.2, cool: 0.16, shade: 1.6, grove: 0.14 }
export const leafGrade = {
  flatten: 0.22,
  level: 0.085,
  keep: 0.88,
  tone: [1.25, 1.2, 1.3] as const,
  turned: [0.92, 1, 1.7] as const,
  bark: [0.32, 0.33, 0.35] as const,
  root: 0.5,
}
export const crownForms = {
  broad: [0.6, 0.24, 0.48],
  spreading: [0.66, 0.33, 0.45],
  shrub: [0.42, 0.42, 0.5],
  conifer: [0.4, 0.55, 0.36],
  slender: [0.56, 0.42, 0.18],
} as const
export const crownLight = {
  wrap: 0.45,
  under: 0.62,
  inside: 0.85,
  through: 0.8,
  glow: [1.15, 1, 0.45],
}
export const crownClearance = { hidden: 2.6, shown: 3 }
export const leafTint = { soft: 0.2, bark: 1.15 }
export const crownLayers = { depth: 0.55, rim: 0.5, ragged: 0.45, lean: 0.3 }
export const edgeOn = { hidden: 0.1, shown: 0.32 }
function vector(values: readonly number[]) {
  return `vec3(${values.map((value) => value.toFixed(3)).join(', ')})`
}
const crownShapes: Record<
  number,
  { count: number; low: number; high: number; reach: (level: number) => number }
> = {
  0: { count: 9, low: 0.42, high: 0.76, reach: () => 0.38 },
  1: { count: 10, low: 0.42, high: 0.88, reach: () => 0.39 },
  4: { count: 10, low: 0.2, high: 0.78, reach: (level) => 0.31 * ((0.92 - level) / 0.67) },
  5: { count: 6, low: 0.2, high: 0.86, reach: () => 0.15 },
}

export interface CrownCluster {
  x: number
  y: number
  z: number
  turn: number
  lean: number
  size: number
  u: number
  v: number
}

export function crownClusters(variant: number) {
  const shape = crownShapes[variant]
  const clusters: CrownCluster[] = []
  if (!shape) return clusters
  const rng = random(4177 + variant * 613)
  for (let index = 0; index < shape.count; index++) {
    const level = shape.low + ((index + 0.5) / shape.count) * (shape.high - shape.low)
    const reach = shape.reach(level)
    const turn = index * 2.399963 + Math.PI / 6 + (rng() - 0.5) * 0.3
    const size = Math.min(0.42, Math.max(0.16, reach * 1.15))
    const radius = reach * crownLayers.depth
    clusters.push({
      x: Math.cos(turn) * radius,
      y: level,
      z: Math.sin(turn) * radius,
      turn,
      lean: (rng() - 0.3) * crownLayers.lean,
      size,
      u: Math.min(0.98 - size / 2, Math.max(0.02 + size / 2, 0.5 + (rng() - 0.5) * reach * 0.5)),
      v: Math.min(0.98 - size / 2, Math.max(0.02 + size / 2, level)),
    })
  }
  return clusters
}

export function leafShare(red: number, green: number, blue: number) {
  const reach = Math.min(
    1,
    Math.max(
      0,
      (green - Math.max(red * 0.98, blue * 1.15)) / Math.max(green, 0.001) / leafTint.soft,
    ),
  )
  return reach * reach * (3 - 2 * reach)
}

export function crownShown(distance: number, width: number) {
  const { hidden, shown } = crownClearance
  const reach = Math.min(1, Math.max(0, (distance - width / 2 - hidden) / (shown - hidden)))
  return reach * reach * (3 - 2 * reach)
}

export function treeTint(color: THREE.Color, shade: number, warm: number, cool: number) {
  const sway = Math.abs(warm % 1) - 0.5
  const drift = Math.abs(cool % 1) - 0.5
  return color.setRGB(
    shade * (1 + sway * 2 * treeVariety.warm),
    shade,
    shade * (1 + drift * 2 * treeVariety.cool),
  )
}

export function treeShade(shade: number) {
  return Math.max(0.45, 1 + (shade - 1) * treeVariety.shade)
}

function groveLattice(column: number, row: number) {
  const value = Math.sin(column * 127.1 + row * 311.7) * 43758.5453
  return value - Math.floor(value)
}

export function groveCast(x: number, s: number, scale = 90) {
  const u = x / scale
  const v = s / scale
  const column = Math.floor(u)
  const row = Math.floor(v)
  const tx = (u - column) * (u - column) * (3 - 2 * (u - column))
  const ts = (v - row) * (v - row) * (3 - 2 * (v - row))
  const near = groveLattice(column, row) * (1 - tx) + groveLattice(column + 1, row) * tx
  const far = groveLattice(column, row + 1) * (1 - tx) + groveLattice(column + 1, row + 1) * tx
  return (near * (1 - ts) + far * ts) * 2 - 1
}

export function plantTint(color: THREE.Color, shade: number, x: number, s: number) {
  const grove = groveCast(x, s)
  const patch = groveCast(x + 517, s - 291, 23)
  treeTint(color, treeShade(shade) * (1 + grove * treeVariety.grove), x * 0.37, s * 0.53)
  color.r *= 1 + (grove * 0.6 + patch * 0.4) * treeVariety.warm * 0.6
  return color
}

export const evergreenTone = { kept: 0.25 }

export function evergreenRelief(tint: string | null, relief = new THREE.Color()) {
  if (!tint) return relief.setRGB(1, 1, 1)
  relief.set(tint)
  const level = (relief.r + relief.g + relief.b) / 3
  const ease = 1 - evergreenTone.kept
  return relief.setRGB(
    (level / Math.max(0.05, relief.r)) ** ease,
    (level / Math.max(0.05, relief.g)) ** ease,
    (level / Math.max(0.05, relief.b)) ** ease,
  )
}

export function leafy(red: number, green: number, blue: number) {
  return green > red * 0.98 && green > blue * 1.15
}

export function autumnLeaf(red: number, green: number, blue: number, mix: number) {
  if (!leafy(red, green, blue)) return [red, green, blue] as const
  const light = (0.3 * red + 0.59 * green + 0.11 * blue) * 1.18
  const warm = Math.min(1, Math.max(0, mix))
  const hue = [0.9 + 0.2 * warm, 0.7 - 0.15 * warm, 0.26 - 0.06 * warm] as const
  const weight = 0.3 * hue[0] + 0.59 * hue[1] + 0.11 * hue[2]
  return [
    Math.min(255, (light * hue[0]) / weight),
    Math.min(255, (light * hue[1]) / weight),
    Math.min(255, (light * hue[2]) / weight),
  ] as const
}

export function snowDusted(red: number, green: number, blue: number, cover: number) {
  const amount = Math.min(1, Math.max(0, cover)) * 0.55
  return [
    red + (226 - red) * amount,
    green + (233 - green) * amount,
    blue + (236 - blue) * amount,
  ] as const
}

function patch(x: number, y: number, grain = 3) {
  const value = Math.sin((x >> grain) * 127.1 + (y >> grain) * 311.7) * 43758.5453
  return value - Math.floor(value)
}

export const snowReach = 5

function drawPhoto(
  context: CanvasRenderingContext2D,
  photo: CanvasImageSource,
  left: number,
  top: number,
  variant: number,
  season: Season,
  tileSize: number,
  bare = false,
) {
  const reach = Math.max(1, Math.round((snowReach * tileSize) / atlasTile.full))
  context.drawImage(photo, left, top, tileSize, tileSize)
  if (season === 'summer') return
  const image = context.getImageData(left, top, tileSize, tileSize)
  const data = image.data
  for (let y = 0; y < tileSize; y++)
    for (let x = 0; x < tileSize; x++) {
      const index = (y * tileSize + x) * 4
      if ((data[index + 3] ?? 0) === 0) continue
      const red = data[index] ?? 0
      const green = data[index + 1] ?? 0
      const blue = data[index + 2] ?? 0
      const open = y < reach || (data[index + 3 - reach * tileSize * 4] ?? 0) < 60
      const colour =
        season === 'autumn'
          ? variant === evergreenTile
            ? ([red, green, blue] as const)
            : autumnLeaf(
                red,
                green,
                blue,
                patch(x + variant * 57, y, 6) * 0.7 + patch(x, y + variant * 31, 3) * 0.3,
              )
          : bare
            ? snowDusted(red, green, blue, open ? bareSnow.edge : patch(x, y) * bareSnow.body)
            : snowDusted(red, green, blue, open ? 1 : patch(x, y) * 0.45)
      data[index] = colour[0]
      data[index + 1] = colour[1]
      data[index + 2] = colour[2]
    }
  context.putImageData(image, left, top)
}

const atlasColumns = 2
const atlasRows = 3
export const atlasTile = { full: 768, coarse: 256 }

export function atlasShift(variant: number) {
  return [(variant % atlasColumns) / atlasColumns, Math.floor(variant / atlasColumns) / atlasRows]
}
const paintSize = 512
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
  const hue = season === 'autumn' ? 24 + rng() * 18 : 80 + rng() * 12
  for (const center of centers) {
    const phase = rng() * Math.PI * 2
    const lobes = 6 + Math.floor(rng() * 4)
    for (let lobe = 0; lobe < lobes; lobe++) {
      const angle = phase + (lobe / lobes) * Math.PI * 2
      const reach = center.radius * (0.35 + rng() * 0.35)
      const clusterX = center.x + Math.cos(angle) * reach
      const clusterY = center.y + Math.sin(angle) * reach * 0.85
      const radius = center.radius * (0.26 + rng() * 0.19)
      const light = 0.27 - Math.cos(angle) * 0.025 - Math.sin(angle) * 0.045
      for (let leaf = 0; leaf < 110; leaf++) {
        const direction = rng() * Math.PI * 2
        const distance = Math.sqrt(rng())
        const boundary = 1 + Math.sin(direction * 3 + phase) * 0.16
        const nx = Math.cos(direction) * distance
        const ny = Math.sin(direction) * distance
        const x = clusterX + nx * radius * boundary
        const y = clusterY + ny * radius * boundary * 0.8
        const shade = light - nx * 0.03 - ny * 0.055 + (rng() - 0.5) * 0.08
        const saturation = season === 'autumn' ? 51 + rng() * 16 : 30 + rng() * 13
        context.fillStyle = `hsl(${hue + rng() * 9} ${saturation}% ${shade * 100}%)`
        context.beginPath()
        context.ellipse(x, y, 2 + rng() * 3, 1.2 + rng() * 2.5, direction, 0, Math.PI * 2)
        context.fill()
      }
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
      centers.push({ x, y, radius: 42 + rng() * 27 })
    }
    centers.push({ x: 256, y: 280, radius: 80 })
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
      length * (0.56 + rng() * 0.2),
      angle - 0.4 - rng() * 0.5,
      width * 0.58,
      depth - 1,
    )
    branch(
      endX,
      endY,
      length * (0.56 + rng() * 0.2),
      angle + 0.4 + rng() * 0.5,
      width * 0.58,
      depth - 1,
    )
    if (depth > 1)
      branch(endX, endY, length * 0.8, angle + (rng() - 0.5) * 0.25, width * 0.54, depth - 1)
  }
  branch(256, 498, 112, (rng() - 0.5) * 0.14, 20 + variant * 1.5, 3)
  if (season !== 'winter') {
    centers.push(
      { x: 146 + variant * 8, y: 246 - variant * 18, radius: 65 },
      { x: 358 - variant * 12, y: 224 + variant * 16, radius: 68 },
      { x: 194 - variant * 8, y: 156 + variant * 20, radius: 74 },
      { x: 285 + variant * 14, y: 143 - variant * 6, radius: 71 },
      { x: 254, y: 222, radius: 58 },
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
  shadowMaterial: THREE.MeshDepthMaterial
  leafNormals = { value: 1 }
  treeGeometries: THREE.BufferGeometry[] = []
  distantTreeGeometries: THREE.BufferGeometry[] = []
  winterShrubGeometries: THREE.BufferGeometry[] = []
  photos: (HTMLImageElement | null)[] = treePhotos.map(() => null)
  bare: (HTMLImageElement | null)[] = bareTreePhotos.map(() => null)
  private bareLoading: Promise<void> | null = null
  ready: Promise<void>
  private season: Season
  private disposed = false
  tile: number
  constructor(season: Season, coarse = false) {
    this.tile = coarse ? atlasTile.coarse : atlasTile.full
    this.season = season
    this.ready = Promise.all(
      treePhotos.map(
        (url, index) =>
          new Promise<void>((resolve) => {
            const image = new Image()
            image.onload = () => {
              this.photos[index] = image
              resolve()
            }
            image.onerror = () => resolve()
            image.src = url
          }),
      ),
    ).then(() => {
      if (!this.disposed) this.update(this.season)
    })
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.tile * atlasColumns
    this.canvas.height = this.tile * atlasRows
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = sharpness(8)
    this.treeMaterial = new THREE.MeshStandardMaterial({
      map: this.texture,
      side: THREE.DoubleSide,
      alphaTest: 0.46,
      alphaToCoverage: false,
      roughness: 1,
    })
    this.treeMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.leafNormals = this.leafNormals
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nattribute vec2 cluster;\nattribute vec2 atlasShift;\nattribute float kind;\nvarying vec2 foliageCluster;\nvarying float foliageDistance;\nvarying float foliageClear;\nvarying vec3 foliageNormal;\nvarying vec2 foliageCrown;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvMapUv += atlasShift;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
float crownKind = kind + atlasShift.x * 2.0 + atlasShift.y * 6.0;
vec3 crownShape = crownKind < 0.5 ? ${vector(crownForms.broad)} : crownKind < 1.5 ? ${vector(crownForms.spreading)} : crownKind < 3.5 ? ${vector(crownForms.shrub)} : crownKind < 4.5 ? ${vector(crownForms.conifer)} : ${vector(crownForms.slender)};
vec3 crownUnit = vec3(position.x / crownShape.z, (position.y - crownShape.x) / crownShape.y, position.z / crownShape.z);
float crownSquash = crownShape.z / crownShape.y;
#ifdef USE_INSTANCING
mat3 crownInstance = mat3(instanceMatrix);
vec3 crownScale = vec3(length(crownInstance[0]), length(crownInstance[1]), length(crownInstance[2]));
crownSquash *= crownScale.x / crownScale.y;
#endif
vec3 crownNormal = vec3(crownUnit.x, crownUnit.y * crownSquash, crownUnit.z);
#ifdef USE_INSTANCING
crownNormal = mat3(crownInstance[0] / crownScale.x, crownInstance[1] / crownScale.y, crownInstance[2] / crownScale.z) * crownNormal;
#endif
foliageNormal = normalMatrix * crownNormal;
foliageCrown = vec2(crownUnit.y, crownSquash * crownSquash - 1.0);`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
foliageCluster = cluster;
foliageDistance = length(mvPosition.xyz);
#ifdef USE_INSTANCING
vec4 foliageRoot = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float foliageSpread = length(instanceMatrix[0].xyz) * 0.5;
#else
vec4 foliageRoot = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float foliageSpread = 0.5;
#endif
foliageClear = length(foliageRoot.xz) - foliageSpread;`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform float leafNormals;\nvarying vec2 foliageCluster;\nvarying float foliageDistance;\nvarying float foliageClear;\nvarying vec3 foliageNormal;\nvarying vec2 foliageCrown;',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
if (abs(dot(normal, normalize(vViewPosition))) < mix(${edgeOn.hidden.toFixed(2)}, ${edgeOn.shown.toFixed(2)}, foliageDither)) discard;
vec2 foliageUv = fract(vMapUv * vec2(2.0, 3.0));
float evergreen = step(2.0 / 3.0, vMapUv.y) * (1.0 - step(0.5, vMapUv.x));
float crownWeight = smoothstep(0.24, 0.48, foliageUv.y) * max(leafNormals, evergreen);
float crownRim = clamp(dot(foliageNormal, foliageNormal) - foliageCrown.x * foliageCrown.x * foliageCrown.y, 0.0, 1.0);
vec3 crownNormal = foliageNormal + normalize(vViewPosition) * (sqrt(1.0 - crownRim) + 0.05);
normal = normalize(mix(normal, normalize(crownNormal), crownWeight));
nonPerturbedNormal = normal;`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
#ifdef USE_MAP
float foliageLeaf = smoothstep(0.0, ${leafTint.soft.toFixed(2)}, (sampledDiffuseColor.g - max(sampledDiffuseColor.r * 0.98, sampledDiffuseColor.b * 1.15)) / max(sampledDiffuseColor.g, 0.001));
float foliageTurned = smoothstep(0.7, 0.88, 1.0 - sampledDiffuseColor.b / max(sampledDiffuseColor.r, 0.001)) * (1.0 - foliageLeaf);
float foliageSnow = smoothstep(0.08, 0.2, min(sampledDiffuseColor.r, min(sampledDiffuseColor.g, sampledDiffuseColor.b))) * (1.0 - smoothstep(1.0, 1.25, sampledDiffuseColor.r / max(sampledDiffuseColor.b, 0.001)));
vec3 foliageBark = diffuseColor.rgb / max(diffuse, vec3(0.001)) * ${leafTint.bark.toFixed(2)} * mix(${vector(leafGrade.bark)}, vec3(0.8), foliageSnow);
foliageBark *= mix(${leafGrade.root.toFixed(2)}, 1.0, smoothstep(0.0, 0.14, fract(vMapUv.y * 3.0)));
float foliageLevel = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
vec3 foliageGraded = diffuseColor.rgb * pow(foliageLevel / ${leafGrade.level.toFixed(2)} + 0.02, -${leafGrade.flatten.toFixed(2)});
foliageGraded = mix(vec3(dot(foliageGraded, vec3(0.3, 0.59, 0.11))), foliageGraded, ${leafGrade.keep.toFixed(2)});
foliageGraded *= mix(${vector(leafGrade.tone)}, ${vector(leafGrade.turned)}, foliageTurned);
#ifdef USE_COLOR
vec3 foliageCast = vColor.rgb / max(vColor.g, 0.001);
foliageGraded *= mix(vec3(1.0), foliageCast * foliageCast, foliageTurned);
#endif
diffuseColor.rgb = mix(foliageBark, foliageGraded, max(foliageLeaf, foliageTurned));
#endif`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `#ifdef USE_ALPHATEST\nfloat foliageAlpha = mix(alphaTest, 0.28, smoothstep(180.0, 650.0, foliageDistance));\nif (diffuseColor.a < foliageAlpha) discard;\n#endif\nfloat clusterRim = length(foliageCluster);\nif (clusterRim > 0.001) {\nfloat clusterEvergreen = step(2.0 / 3.0, vMapUv.y) * (1.0 - step(0.5, vMapUv.x));\nfloat clusterGrain = fract(sin(dot(floor(vMapUv * 380.0), vec2(12.9898, 78.233))) * 43758.5453);\nif (max(leafNormals, clusterEvergreen) < 0.5 || clusterRim > ${crownLayers.rim.toFixed(2)} + ${crownLayers.ragged.toFixed(2)} * clusterGrain) discard;\n}\nfloat foliageDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));\nif (smoothstep(${crownClearance.hidden.toFixed(1)}, ${crownClearance.shown.toFixed(1)}, foliageClear) < foliageDither) discard;`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#if NUM_DIR_LIGHTS > 0
vec3 foliageSun = directionalLights[0].direction;
float foliageWrap = clamp((dot(normal, foliageSun) + ${crownLight.wrap.toFixed(2)}) / ${(1 + crownLight.wrap).toFixed(2)}, 0.0, 1.0);
float foliageThrough = pow(max(dot(-normalize(vViewPosition), foliageSun), 0.0), 3.0) * (0.25 + 0.75 * crownRim);
float foliageOpen = mix(${crownLight.under.toFixed(2)}, 1.0, smoothstep(0.3, 0.85, foliageUv.y)) * mix(${crownLight.inside.toFixed(2)}, 1.0, crownRim);
vec3 foliageDirect = diffuseColor.rgb * directionalLights[0].color * RECIPROCAL_PI * (foliageWrap * foliageWrap * mix(0.75, 1.0, foliageOpen) + foliageThrough * ${crownLight.through.toFixed(2)} * ${vector(crownLight.glow)});
vec3 foliageLamps = max(reflectedLight.directDiffuse - diffuseColor.rgb * directionalLights[0].color * RECIPROCAL_PI * max(dot(normal, foliageSun), 0.0), vec3(0.0));
outgoingLight = mix(outgoingLight, foliageDirect + foliageLamps + reflectedLight.indirectDiffuse * foliageOpen + totalEmissiveRadiance, crownWeight);
#endif
#include <opaque_fragment>`,
      )
    }
    this.treeMaterial.customProgramCacheKey = () => 'seasonal-foliage-zenith-lit-sunlit-crown-snow'
    this.shadowMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: this.texture,
      alphaTest: 0.46,
      side: THREE.DoubleSide,
    })
    this.shadowMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 cluster;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nif (dot(cluster, cluster) > 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);',
        )
    }
    this.shadowMaterial.customProgramCacheKey = () => 'foliage-shadow-whole-crown'
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
        const mirrored = !shrub && side === 1
        for (let i = 0; i < uv.count; i++)
          uv.setXY(
            i,
            ((mirrored ? 1 - uv.getX(i) : uv.getX(i)) + (atlasVariant % atlasColumns)) /
              atlasColumns,
            (uv.getY(i) + Math.floor(atlasVariant / atlasColumns)) / atlasRows,
          )
        plane.setAttribute('cluster', new THREE.BufferAttribute(new Float32Array(8), 2))
        planes.push(plane)
      }
      for (const cluster of coarse || variant >= 6 ? [] : crownClusters(variant)) {
        const plane = new THREE.PlaneGeometry(cluster.size, cluster.size)
        plane.setAttribute(
          'cluster',
          new THREE.BufferAttribute(new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]), 2),
        )
        plane.rotateX(-cluster.lean)
        plane.rotateY(Math.PI / 2 - cluster.turn)
        plane.translate(cluster.x, cluster.y, cluster.z)
        const uv = plane.getAttribute('uv')
        for (let i = 0; i < uv.count; i++)
          uv.setXY(
            i,
            (cluster.u + (uv.getX(i) - 0.5) * cluster.size + (atlasVariant % atlasColumns)) /
              atlasColumns,
            (cluster.v +
              (uv.getY(i) - 0.5) * cluster.size +
              Math.floor(atlasVariant / atlasColumns)) /
              atlasRows,
          )
        planes.push(plane)
      }
      const merged = mergeGeometries(planes)
      if (!merged) throw new Error('Tree geometry could not be assembled')
      merged.setAttribute(
        'kind',
        new THREE.BufferAttribute(
          new Float32Array(merged.getAttribute('position').count).fill(atlasVariant),
          1,
        ),
      )
      if (variant >= 6) this.winterShrubGeometries.push(merged)
      else {
        this.treeGeometries.push(merged)
        const distant = new THREE.BufferGeometry()
        for (const [name, attribute] of Object.entries(merged.attributes))
          distant.setAttribute(name, attribute)
        distant.setIndex(merged.index)
        distant.setDrawRange(0, count * 6)
        this.distantTreeGeometries.push(distant)
      }
      for (const plane of planes) plane.dispose()
    }
    this.update(season)
  }
  loadBare() {
    this.bareLoading ??= Promise.all(
      bareTreePhotos.map(
        (url, index) =>
          new Promise<void>((resolve) => {
            if (!url) {
              resolve()
              return
            }
            const image = new Image()
            image.onload = () => {
              this.bare[index] = image
              resolve()
            }
            image.onerror = () => resolve()
            image.src = url
          }),
      ),
    ).then(() => {
      if (!this.disposed && this.season === 'winter') this.update(this.season)
    })
    return this.bareLoading
  }
  update(season: Season) {
    this.season = season
    if (season === 'winter') this.loadBare()
    this.leafNormals.value = season === 'winter' ? bareCrown : 1
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Foliage canvas is unavailable')
    context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    for (let variant = 0; variant < 6; variant++) {
      const tileSize = this.tile
      const left = (variant % atlasColumns) * tileSize
      const top = (atlasRows - 1 - Math.floor(variant / atlasColumns)) * tileSize
      const leafless = season === 'winter' && variant !== evergreenTile
      const photo = leafless ? this.bare[variant] : this.photos[variant]
      if (photo) {
        drawPhoto(context, photo, left, top, variant, season, tileSize, leafless)
        continue
      }
      context.save()
      context.translate(left, top)
      context.scale(tileSize / paintSize, tileSize / paintSize)
      drawTree(context, variant, season)
      context.restore()
    }
    this.texture.needsUpdate = true
  }
  dispose() {
    this.disposed = true
    this.texture.dispose()
    this.treeMaterial.dispose()
    this.shadowMaterial.dispose()
    for (const geometry of this.treeGeometries) geometry.dispose()
    for (const geometry of this.winterShrubGeometries) geometry.dispose()
  }
}

import { landmarksBetween } from './landmarks'
import { type LandscapeProfile, landscapeProfiles } from './landscapes'
import { roadCoordinates } from './road'
import { woodlandCoverage } from './woodland'
import { clamp, type Settings, shoreHeight, type World } from './world'

export const minimapLayout = {
  size: 188,
  radius: 82,
  range: 1600,
  carDrop: 0.22,
  cells: 96,
  cell: 48,
  refresh: 300,
  rowsPerStep: 6,
  roadSpan: 2600,
  roadStep: 24,
  guideDistance: 12,
} as const

export interface MapPose {
  x: number
  s: number
  yaw: number
}

type Tone = [number, number, number]

const landTones: Record<Settings['season'], { low: Tone; high: Tone; wood: Tone }> = {
  summer: { low: [122, 146, 82], high: [176, 189, 122], wood: [70, 104, 62] },
  autumn: { low: [160, 148, 92], high: [203, 186, 128], wood: [150, 98, 52] },
  winter: { low: [205, 215, 213], high: [241, 244, 240], wood: [112, 132, 122] },
}
const desertTones = { low: [196, 168, 120] as Tone, high: [226, 201, 152] as Tone }
const rockTone: Tone = [140, 140, 132]
const snowTone: Tone = [240, 243, 244]
const waterTones: Record<Settings['season'], Tone> = {
  summer: [94, 141, 168],
  autumn: [98, 132, 152],
  winter: [176, 199, 211],
}

function mix(a: Tone, b: Tone, t: number): Tone {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function terrainTone(
  settings: Settings,
  height: number,
  relief: number,
  woodland: number,
): Tone {
  if (height < shoreHeight) return waterTones[settings.season]
  const lift = clamp(relief / 90 + 0.5, 0, 1)
  const profile = landscapeProfiles[settings.landscape]
  if (profile.map && settings.season !== 'winter')
    return snowCapped(profile, mix(profile.map.low, profile.map.high, lift), height)
  if (profile.sand) return mix(desertTones.low, desertTones.high, lift)
  const tones = landTones[settings.season]
  let tone = mix(tones.low, tones.high, lift)
  tone = mix(tone, tones.wood, clamp(woodland, 0, 1) * 0.75)
  return snowCapped(profile, tone, height)
}

function snowCapped(profile: LandscapeProfile, tone: Tone, height: number) {
  if (profile.snowLine === null) return tone
  const rock = mix(tone, rockTone, clamp((height - profile.snowLine * 1.25) / 70, 0, 1))
  return mix(rock, snowTone, clamp((height - profile.snowLine * 1.25 - 65) / 40, 0, 1))
}

export function mapOffset(pose: MapPose, x: number, s: number) {
  const dx = x - pose.x
  const ds = s - pose.s
  const cos = Math.cos(pose.yaw)
  const sin = Math.sin(pose.yaw)
  return { right: dx * cos + ds * sin, forward: ds * cos - dx * sin }
}

export function roadGuide(world: World, pose: MapPose) {
  const frame = roadCoordinates(world, pose.x, pose.s)
  const offset = mapOffset(pose, frame.road.x, frame.s)
  return {
    s: frame.s,
    distance: Math.abs(frame.distance),
    angle: Math.atan2(offset.right, offset.forward),
  }
}

interface Raster {
  canvas: HTMLCanvasElement
  x: number
  s: number
}

interface RasterBuild {
  x: number
  s: number
  row: number
  heights: Float32Array
  woods: Float32Array
}

export class Minimap {
  private target: HTMLCanvasElement | null = null
  private context: CanvasRenderingContext2D | null = null
  private raster: Raster | null = null
  private build: RasterBuild | null = null
  private frame = 0
  dim = 1
  found = new Set<number>()
  private scale = 1

  constructor(private world: World) {}

  attach(canvas: HTMLCanvasElement | null) {
    this.target = canvas
    this.context = canvas?.getContext('2d') ?? null
    if (!canvas) return
    this.scale = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.height = Math.round(minimapLayout.size * this.scale)
  }

  invalidate() {
    this.raster = null
    this.build = null
  }

  update(pose: MapPose) {
    if (!this.context || !this.target) return
    this.advanceRaster(pose)
    if (this.frame++ % 2 === 0) this.draw(pose)
  }

  private advanceRaster(pose: MapPose) {
    const { cells, cell, refresh, rowsPerStep } = minimapLayout
    const span = cells * cell
    const stale =
      !this.raster ||
      Math.abs(this.raster.x + span / 2 - pose.x) > refresh ||
      Math.abs(this.raster.s + span / 2 - pose.s) > refresh
    if (stale && !this.build)
      this.build = {
        x: Math.round((pose.x - span / 2) / cell) * cell,
        s: Math.round((pose.s - span / 2) / cell) * cell,
        row: 0,
        heights: new Float32Array(cells * cells),
        woods: new Float32Array(cells * cells),
      }
    const build = this.build
    if (!build) return
    const settings = this.world.settings
    const rows = this.raster ? rowsPerStep : cells
    for (let step = 0; step < rows && build.row < cells; step++, build.row++) {
      const s = build.s + (cells - build.row - 0.5) * cell
      for (let column = 0; column < cells; column++) {
        const x = build.x + (column + 0.5) * cell
        const index = build.row * cells + column
        build.heights[index] = this.world.height(x, s)
        build.woods[index] = woodlandCoverage(x, s, settings.seed, settings.landscape)
      }
    }
    if (build.row < cells) return
    this.raster = { canvas: this.paint(build), x: build.x, s: build.s }
    this.build = null
  }

  private paint(build: RasterBuild) {
    const { cells } = minimapLayout
    const canvas = this.raster?.canvas ?? document.createElement('canvas')
    canvas.width = canvas.height = cells
    const context = canvas.getContext('2d')
    if (!context) return canvas
    const image = context.createImageData(cells, cells)
    const settings = this.world.settings
    let total = 0
    for (const height of build.heights) total += height
    const mean = total / build.heights.length
    for (let row = 0; row < cells; row++) {
      for (let column = 0; column < cells; column++) {
        const index = row * cells + column
        const height = build.heights[index] ?? 0
        const lit = build.heights[Math.max(row - 1, 0) * cells + Math.max(column - 1, 0)] ?? height
        const shade =
          height < shoreHeight
            ? 1
            : clamp(1 + ((height - lit) * 0.7) / minimapLayout.cell, 0.7, 1.22)
        const tone = terrainTone(settings, height, height - mean, build.woods[index] ?? 0)
        image.data[index * 4] = clamp(tone[0] * shade, 0, 255)
        image.data[index * 4 + 1] = clamp(tone[1] * shade, 0, 255)
        image.data[index * 4 + 2] = clamp(tone[2] * shade, 0, 255)
        image.data[index * 4 + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
    return canvas
  }

  private draw(pose: MapPose) {
    const context = this.context
    if (!context) return
    const { size, radius, range, carDrop, cells, cell, roadSpan, roadStep, guideDistance } =
      minimapLayout
    const center = size / 2
    const zoom = radius / range
    const carY = center + radius * carDrop
    context.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    context.clearRect(0, 0, size, size)
    context.save()
    context.beginPath()
    context.arc(center, center, radius, 0, Math.PI * 2)
    context.clip()
    context.fillStyle = '#26332c'
    context.fillRect(0, 0, size, size)
    context.translate(center, carY)
    context.rotate(pose.yaw)
    if (this.raster) {
      const span = cells * cell
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(
        this.raster.canvas,
        (this.raster.x - pose.x) * zoom,
        -(this.raster.s + span - pose.s) * zoom,
        span * zoom,
        span * zoom,
      )
    }
    if (this.dim < 0.99) {
      context.fillStyle = `rgba(12, 20, 28, ${(1 - this.dim).toFixed(3)})`
      context.fillRect(-size, -size, size * 2, size * 2)
    }
    const guide = roadGuide(this.world, pose)
    const first = Math.floor((guide.s - roadSpan) / roadStep) * roadStep
    context.beginPath()
    for (let s = first; s <= guide.s + roadSpan; s += roadStep) {
      const px = (this.world.road(s).x - pose.x) * zoom
      const py = -(s - pose.s) * zoom
      if (s === first) context.moveTo(px, py)
      else context.lineTo(px, py)
    }
    context.lineJoin = context.lineCap = 'round'
    context.strokeStyle = '#1d2822b8'
    context.lineWidth = 4.4
    context.stroke()
    context.strokeStyle = '#fbf8ec'
    context.lineWidth = 2
    context.stroke()
    for (const landmark of landmarksBetween(
      this.world,
      pose.s - range * 1.5,
      pose.s + range * 1.5,
    )) {
      const offset = { x: landmark.x - pose.x, s: landmark.s - pose.s }
      if (Math.hypot(offset.x, offset.s) > range * 1.5) continue
      const known = this.found.has(landmark.id)
      context.save()
      context.translate(offset.x * zoom, -offset.s * zoom)
      context.rotate(-pose.yaw + Math.PI / 4)
      context.fillStyle = known ? '#ffd98a' : '#fbf8ec'
      context.strokeStyle = '#1d2822'
      context.lineWidth = 1.3
      context.fillRect(-3.4, -3.4, 6.8, 6.8)
      context.strokeRect(-3.4, -3.4, 6.8, 6.8)
      if (!known) {
        context.fillStyle = '#1d2822'
        context.fillRect(-1.1, -1.1, 2.2, 2.2)
      }
      context.restore()
    }
    context.restore()

    context.beginPath()
    context.moveTo(center, carY - 8)
    context.lineTo(center + 5.5, carY + 6)
    context.lineTo(center, carY + 3)
    context.lineTo(center - 5.5, carY + 6)
    context.closePath()
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#1d2822'
    context.lineWidth = 1.4
    context.fill()
    context.stroke()

    context.beginPath()
    context.arc(center, center, radius + 0.5, 0, Math.PI * 2)
    context.strokeStyle = '#ffffff5c'
    context.lineWidth = 1
    context.stroke()
    const north = { x: -Math.sin(pose.yaw), y: -Math.cos(pose.yaw) }
    context.font = '600 9px Manrope, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#1d2822c2'
    context.beginPath()
    context.arc(center + north.x * (radius - 9), center + north.y * (radius - 9), 7, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#ffffff'
    context.fillText('N', center + north.x * (radius - 9), center + north.y * (radius - 8.5))

    if (guide.distance > guideDistance) {
      context.save()
      context.translate(center, center)
      context.rotate(guide.angle)
      context.beginPath()
      context.moveTo(0, -radius + 2)
      context.lineTo(7, -radius + 15)
      context.lineTo(-7, -radius + 15)
      context.closePath()
      context.fillStyle = '#ffd98a'
      context.strokeStyle = '#1d2822'
      context.lineWidth = 1.2
      context.fill()
      context.stroke()
      context.restore()
    }
  }
}

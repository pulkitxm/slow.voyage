import { worldLoop, wrapOffset } from './field'
import { lapLandmarks } from './landmarks'
import { type MapPose, terrainTone } from './minimap'
import { woodlandCoverage } from './woodland'
import { clamp, shoreHeight, type World } from './world'

export const worldMapLayout = { cell: 15, columnsPerStep: 28, roadStep: 30 } as const

export function mapPlace(x: number, s: number) {
  const along = ((s % worldLoop.length) + worldLoop.length) % worldLoop.length
  return {
    u: along / worldMapLayout.cell,
    v: (wrapOffset(x) + worldLoop.width / 2) / worldMapLayout.cell,
  }
}

export class WorldMap {
  private target: HTMLCanvasElement | null = null
  private context: CanvasRenderingContext2D | null = null
  private raster: HTMLCanvasElement | null = null
  private pixels: ImageData | null = null
  private column = 0
  private key = ''
  found = new Set<number>()
  dim = 1

  constructor(private world: World) {}

  get columns() {
    return worldLoop.length / worldMapLayout.cell
  }

  get rows() {
    return worldLoop.width / worldMapLayout.cell
  }

  get progress() {
    return this.column / this.columns
  }

  attach(canvas: HTMLCanvasElement | null) {
    this.target = canvas
    this.context = canvas?.getContext('2d') ?? null
    if (!canvas) return
    canvas.width = this.columns
    canvas.height = this.rows
  }

  private paint() {
    const { columns, rows } = this
    const settings = this.world.settings
    const key = `${settings.landscape}/${settings.roadMode}/${settings.seed}/${settings.season}`
    if (key !== this.key || !this.raster || !this.pixels) {
      this.key = key
      this.column = 0
      this.raster = this.raster ?? document.createElement('canvas')
      this.raster.width = columns
      this.raster.height = rows
      this.pixels = new ImageData(columns, rows)
    }
    if (this.column >= columns) return
    const { cell, columnsPerStep } = worldMapLayout
    const heights = new Float32Array(rows + 1)
    const last = Math.min(columns, this.column + columnsPerStep)
    for (; this.column < last; this.column++) {
      const s = (this.column + 0.5) * cell
      let total = 0
      for (let row = 0; row <= rows; row++) {
        heights[row] = this.world.height((row - 0.5) * cell - worldLoop.width / 2, s)
        total += heights[row] ?? 0
      }
      const mean = total / (rows + 1)
      for (let row = 0; row < rows; row++) {
        const height = heights[row + 1] ?? 0
        const lit = heights[row] ?? height
        const shade = height < shoreHeight ? 1 : clamp(1 + (height - lit) * 0.03, 0.72, 1.2)
        const x = (row + 0.5) * cell - worldLoop.width / 2
        const tone = terrainTone(
          settings,
          height,
          height - mean,
          woodlandCoverage(x, s, settings.seed, settings.landscape),
        )
        const index = (row * columns + this.column) * 4
        this.pixels.data[index] = clamp(tone[0] * shade, 0, 255)
        this.pixels.data[index + 1] = clamp(tone[1] * shade, 0, 255)
        this.pixels.data[index + 2] = clamp(tone[2] * shade, 0, 255)
        this.pixels.data[index + 3] = 255
      }
    }
    this.raster.getContext('2d')?.putImageData(this.pixels, 0, 0)
  }

  update(pose: MapPose) {
    const context = this.context
    if (!context || !this.target) return
    this.paint()
    const { columns, rows } = this
    const scale = 1 / worldMapLayout.cell
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.fillStyle = '#26332c'
    context.fillRect(0, 0, columns, rows)
    if (this.raster) context.drawImage(this.raster, 0, 0)
    if (this.dim < 0.99) {
      context.fillStyle = `rgba(12, 20, 28, ${((1 - this.dim) * 0.8).toFixed(3)})`
      context.fillRect(0, 0, columns, rows)
    }
    context.lineJoin = context.lineCap = 'round'
    for (const [width, style] of [
      [4.2, '#1d2822c9'],
      [1.9, '#fbf8ec'],
    ] as const) {
      context.beginPath()
      for (let s = 0; s <= worldLoop.length; s += worldMapLayout.roadStep) {
        const point = { u: s * scale, v: (this.world.road(s).x + worldLoop.width / 2) * scale }
        if (s === 0) context.moveTo(point.u, point.v)
        else context.lineTo(point.u, point.v)
      }
      context.lineWidth = width
      context.strokeStyle = style
      context.stroke()
    }
    const line = (this.world.road(0).x + worldLoop.width / 2) * scale
    context.fillStyle = '#fbf8ec'
    context.fillRect(0, line - 7, 2.4, 14)
    context.fillRect(columns - 2.4, line - 7, 2.4, 14)
    for (const landmark of lapLandmarks(this.world)) {
      const spot = mapPlace(landmark.x, landmark.s)
      const known = this.found.has(landmark.id)
      context.save()
      context.translate(spot.u, spot.v)
      context.rotate(Math.PI / 4)
      context.fillStyle = known ? '#ffd98a' : '#fbf8ec'
      context.strokeStyle = '#1d2822'
      context.lineWidth = 1.2
      context.fillRect(-3.2, -3.2, 6.4, 6.4)
      context.strokeRect(-3.2, -3.2, 6.4, 6.4)
      context.restore()
    }
    const car = mapPlace(pose.x, pose.s)
    context.save()
    context.translate(car.u, car.v)
    context.rotate(Math.PI / 2 - pose.yaw)
    context.beginPath()
    context.moveTo(0, -8)
    context.lineTo(5.5, 6)
    context.lineTo(0, 3)
    context.lineTo(-5.5, 6)
    context.closePath()
    context.fillStyle = '#ff6b4a'
    context.strokeStyle = '#ffffff'
    context.lineWidth = 1.5
    context.fill()
    context.stroke()
    context.restore()
  }
}

import { WebGLRenderer } from 'three'
import type { Settings } from './world'

function softwareRendering(context: WebGLRenderingContext | WebGL2RenderingContext | null) {
  const debug = context?.getExtension('WEBGL_debug_renderer_info')
  const name = context && debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : ''
  return /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(name)
}

export function createGraphicsRenderer(canvas: HTMLCanvasElement) {
  const probe = document
    .createElement('canvas')
    .getContext('webgl2', { powerPreference: 'high-performance' })
  const software = softwareRendering(probe)
  probe?.getExtension('WEBGL_lose_context')?.loseContext()
  return new WebGLRenderer({
    canvas,
    antialias: !software,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  })
}

export const shadowReach = { span: 150, texels: 1.4 }
export const textureDetail = { anisotropy: 8 }

export function sharpness(wanted: number) {
  return Math.max(1, Math.min(wanted, textureDetail.anisotropy))
}

export function shadowOffset(shadowSize: number) {
  return (shadowReach.span / shadowSize) * shadowReach.texels
}

export const ultraReach = { pixelRatio: 2, samples: 4, textureSize: 8192, probe: 1 / 45 }

export function graphicsBudget(renderer: WebGLRenderer, quality: Settings['quality']) {
  const software = softwareRendering(renderer.getContext())
  const full = quality !== 'low'
  const shadowSize = Math.min(
    renderer.capabilities.maxTextureSize,
    software ? (full ? 256 : 128) : full ? 4096 : 1024,
  )
  const cinematic =
    !software &&
    full &&
    (renderer.extensions.has('EXT_color_buffer_float') ||
      renderer.extensions.has('EXT_color_buffer_half_float'))
  const ultra =
    cinematic &&
    quality === 'ultra' &&
    renderer.capabilities.maxSamples >= ultraReach.samples &&
    renderer.capabilities.maxTextureSize >= ultraReach.textureSize
  return {
    software,
    cinematic,
    ultra,
    detail: software || !full ? ('low' as const) : ('high' as const),
    pixelRatio: software
      ? full
        ? 0.5
        : 0.375
      : Math.min(devicePixelRatio, ultra ? ultraReach.pixelRatio : full ? 1.7 : 1),
    shadowSize,
    anisotropy: software ? 1 : 8,
    shadowRadius: software ? 1 : 2.5,
    shadowBias: software ? -0.00015 : -0.000025,
    shadowNormalBias: software ? 0.05 : shadowOffset(shadowSize),
  }
}

export class GpuClock {
  private extension: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
  private spare: WebGLQuery[] = []
  private waiting: WebGLQuery[] = []
  private running: WebGLQuery | null = null

  constructor(private context: WebGL2RenderingContext) {
    this.extension = context.getExtension('EXT_disjoint_timer_query_webgl2')
  }

  begin() {
    if (!this.extension || this.running || this.waiting.length >= 6) return
    this.running = this.spare.pop() ?? this.context.createQuery()
    if (this.running) this.context.beginQuery(this.extension.TIME_ELAPSED_EXT, this.running)
  }

  end() {
    if (!this.extension || !this.running) return
    this.context.endQuery(this.extension.TIME_ELAPSED_EXT)
    this.waiting.push(this.running)
    this.running = null
  }

  read() {
    const query = this.waiting[0]
    const { context, extension } = this
    if (!query || !extension) return 0
    if (!context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) return 0
    const elapsed = Number(context.getQueryParameter(query, context.QUERY_RESULT)) / 1e9
    this.waiting.shift()
    this.spare.push(query)
    return context.getParameter(extension.GPU_DISJOINT_EXT) ? 0 : elapsed
  }

  dispose() {
    if (this.running) this.end()
    for (const query of [...this.waiting, ...this.spare]) this.context.deleteQuery(query)
    this.waiting.length = this.spare.length = 0
  }
}

export const cinemaRelief = {
  frame: 1 / 40,
  cappedFrame: 1 / 30,
  steadyJitter: 0.0015,
  patience: 3,
  scales: [1, 0.82, 0.68],
  grace: 4,
  longestCounted: 0.1,
  comfortable: 1 / 50,
  recovery: 12,
}

export type StrainVerdict = 'lower' | 'raise' | null

export class StrainGauge {
  strain = 0
  ease = 0
  grace = 0
  lowered = 0

  hold(seconds = cinemaRelief.grace) {
    this.grace = Math.max(this.grace, seconds)
    this.strain = 0
    this.ease = 0
  }

  step(elapsed: number, strained: boolean, busy: boolean, scale: number): StrainVerdict {
    const counted = Math.min(elapsed, cinemaRelief.longestCounted)
    if (busy) {
      this.strain = this.ease = 0
      return null
    }
    if (this.grace > 0) {
      this.grace = Math.max(0, this.grace - counted)
      this.strain = this.ease = 0
      return null
    }
    this.strain = Math.max(
      0,
      Math.min(cinemaRelief.patience, this.strain + (strained ? counted : -counted)),
    )
    if (this.strain >= cinemaRelief.patience) {
      this.strain = this.ease = 0
      this.lowered++
      return 'lower'
    }
    if (scale > 0 && !strained && elapsed < cinemaRelief.comfortable) this.ease += elapsed
    else this.ease = 0
    if (this.ease >= cinemaRelief.recovery * 2 ** Math.max(0, this.lowered - 1)) {
      this.ease = 0
      return 'raise'
    }
    return null
  }
}
export const renderPace = { idle: 46, panel: 400 }

export function renderWait(paused: boolean, softwarePanel: boolean) {
  return paused ? renderPace.idle : softwarePanel ? renderPace.panel : 0
}

export const softwareRelief = {
  frame: 0.25,
  patience: 4,
  scales: [1, 0.75, 0.56, 0.42],
  comfortable: 0.11,
  recovery: 40,
}

export class SoftwareGauge {
  slow = 0
  easy = 0

  step(elapsed: number, busy: boolean, scale: number): StrainVerdict {
    if (busy) {
      this.slow = this.easy = 0
      return null
    }
    if (elapsed > softwareRelief.frame) {
      this.slow++
      this.easy = 0
    } else {
      this.slow = 0
      this.easy = elapsed < softwareRelief.comfortable ? this.easy + 1 : 0
    }
    if (this.slow >= softwareRelief.patience) {
      this.slow = 0
      return scale < softwareRelief.scales.length - 1 ? 'lower' : null
    }
    if (this.easy >= softwareRelief.recovery) {
      this.easy = 0
      return scale > 0 ? 'raise' : null
    }
    return null
  }
}

export function displayCapped(pace: number, jitter: number) {
  return Math.abs(pace - cinemaRelief.cappedFrame) < 0.002 && jitter < cinemaRelief.steadyJitter
}

export function frameStrained(elapsed: number, pace: number, jitter: number) {
  return elapsed > cinemaRelief.frame && !displayCapped(pace, jitter)
}

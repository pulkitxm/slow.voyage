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

export function graphicsBudget(renderer: WebGLRenderer, quality: Settings['quality']) {
  const software = softwareRendering(renderer.getContext())
  return {
    software,
    detail: software ? ('low' as const) : quality,
    pixelRatio: software
      ? quality === 'high'
        ? 0.5
        : 0.375
      : Math.min(devicePixelRatio, quality === 'high' ? 1.7 : 1),
    shadowSize: software ? (quality === 'high' ? 256 : 128) : quality === 'high' ? 2048 : 1024,
    shadowRadius: software ? 1 : 0.45,
    shadowBias: software ? -0.00015 : -0.000025,
    shadowNormalBias: software ? 0.05 : 0.012,
  }
}

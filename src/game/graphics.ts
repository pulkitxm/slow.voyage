import type { WebGLRenderer } from 'three'
import type { Settings } from './world'

export function graphicsBudget(renderer: WebGLRenderer, quality: Settings['quality']) {
  const context = renderer.getContext()
  const debug = context.getExtension('WEBGL_debug_renderer_info')
  const name = debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : ''
  const software = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(name)
  return {
    software,
    detail: software ? ('low' as const) : quality,
    pixelRatio: software
      ? quality === 'high'
        ? 0.4
        : 0.3
      : Math.min(devicePixelRatio, quality === 'high' ? 1.7 : 1),
    shadowSize: software ? (quality === 'high' ? 256 : 128) : quality === 'high' ? 2048 : 1024,
  }
}

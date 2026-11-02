import type { WebGLRenderer } from 'three'
import type { Settings } from './world'

export function graphicsBudget(renderer: WebGLRenderer, quality: Settings['quality']) {
  const context = renderer.getContext()
  const debug = context.getExtension('WEBGL_debug_renderer_info')
  const name = debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : ''
  const software = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(name)
  return {
    pixelRatio: software
      ? quality === 'high'
        ? 0.7
        : 0.5
      : Math.min(devicePixelRatio, quality === 'high' ? 1.7 : 1),
    shadowSize: software ? (quality === 'high' ? 512 : 256) : quality === 'high' ? 2048 : 1024,
  }
}

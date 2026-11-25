declare module 'n8ao' {
  import type { Pass } from 'postprocessing'
  import type { Camera, Color, Scene } from 'three'

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    autoDetectTransparency: boolean
    depthMipAtlas: { dispose(): void }
    configuration: {
      aoSamples: number
      aoRadius: number
      denoiseSamples: number
      denoiseRadius: number
      denoiseIterations: number
      distanceFalloff: number
      intensity: number
      color: Color
      gammaCorrection: boolean
      screenSpaceRadius: boolean
      halfRes: boolean
      depthAwareUpsampling: boolean
      transparencyAware: boolean
    }
  }
}

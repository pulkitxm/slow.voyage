import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js'

export class SoftwareAntialias {
  texture: THREE.FramebufferTexture | null = null
  size = new THREE.Vector2()
  uniforms = THREE.UniformsUtils.clone(FXAAShader.uniforms)
  material = new THREE.ShaderMaterial({
    ...FXAAShader,
    uniforms: this.uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  quad = new FullScreenQuad(this.material)

  render(renderer: THREE.WebGLRenderer) {
    renderer.getDrawingBufferSize(this.size)
    const { x: width, y: height } = this.size
    if (width === 0 || height === 0) return
    if (
      !this.texture ||
      this.texture.image.width !== width ||
      this.texture.image.height !== height
    ) {
      this.texture?.dispose()
      this.texture = new THREE.FramebufferTexture(width, height)
      this.texture.colorSpace = THREE.NoColorSpace
      this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter
      this.uniforms.tDiffuse.value = this.texture
      this.uniforms.resolution.value.set(1 / width, 1 / height)
    }
    const reset = renderer.info.autoReset
    renderer.info.autoReset = false
    try {
      renderer.copyFramebufferToTexture(this.texture)
      this.quad.render(renderer)
    } finally {
      renderer.info.autoReset = reset
    }
  }

  dispose() {
    this.texture?.dispose()
    this.material.dispose()
    this.quad.dispose()
  }
}

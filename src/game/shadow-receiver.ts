import { type Material, ShaderChunk } from 'three'

export function receiveUnbiasedShadows(material: Material) {
  const compile = material.onBeforeCompile
  const key = material.customProgramCacheKey()
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <shadowmap_vertex>',
      ShaderChunk.shadowmap_vertex.replaceAll('.shadowNormalBias', '.shadowNormalBias * 0.0'),
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      ShaderChunk.lights_fragment_begin
        .replaceAll('.shadowBias', '.shadowBias * 0.0')
        .replaceAll('.shadowNormalBias', '.shadowNormalBias * 0.0'),
    )
  }
  material.customProgramCacheKey = () => `${key}-unbiased-receiver`
}

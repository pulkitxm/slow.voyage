import * as THREE from 'three'
import { meadowNoise } from './ground'
import { guardrailAt, type RoadSample, roadLayout, roadPoint } from './road'

export const railProfile: readonly (readonly [height: number, offset: number])[] = [
  [0.43, 0.085],
  [0.455, 0.06],
  [0.488, 0.014],
  [0.515, 0],
  [0.542, 0.014],
  [0.575, 0.055],
  [0.605, 0.075],
  [0.635, 0.055],
  [0.668, 0.014],
  [0.695, 0],
  [0.722, 0.014],
  [0.755, 0.06],
  [0.78, 0.085],
]

export const railLook = {
  color: '#a2a6a8',
  metalness: 0.86,
  roughness: 0.58,
  reflection: 0.6,
  recessShade: 0.3,
  postShade: 0.78,
  post: { width: 0.07, height: 0.82, depth: 0.11 },
  terminal: { reach: 2.6, sink: 0.47, flare: 0.25 },
}

interface RailWorld {
  road(s: number): RoadSample
  guardrail(s: number, side: number): boolean
}

function beam(
  near: RoadSample,
  nearS: number,
  far: RoadSample,
  farS: number,
  offset: number,
  side: number,
  flare: number,
  sink: number,
  flip: boolean,
) {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const deepest = Math.max(...railProfile.map((point) => point[1]))
  for (const [index, [height, recess]] of railProfile.entries()) {
    const a = roadPoint(near, nearS, offset + side * recess)
    const b = roadPoint(far, farS, offset + side * (recess + flare))
    positions.push(a.x, near.y + height, -a.s, b.x, far.y + height - sink, -b.s)
    const shade = 1 - (recess / deepest) * railLook.recessShade
    colors.push(shade, shade, shade, shade, shade, shade)
    if (index === railProfile.length - 1) continue
    const n = index * 2
    if (flip) indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2)
    else indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function guardRails(world: RailWorld, start: number, length: number) {
  const parts: THREE.BufferGeometry[] = []
  const span = roadLayout.railSegmentLength
  const { post, terminal } = railLook
  for (const side of [-1, 1]) {
    const offset = side * roadLayout.railOffset
    for (let s = start; s < start + length; s += span) {
      if (!guardrailAt(world, s, side)) continue
      const near = world.road(s)
      const far = world.road(s + span)
      parts.push(beam(near, s, far, s + span, offset, side, 0, 0, side < 0))
      for (const [open, anchor, along, reach] of [
        [!guardrailAt(world, s - span, side), near, s, -terminal.reach],
        [!guardrailAt(world, s + span, side), far, s + span, terminal.reach],
      ] as const) {
        if (!open) continue
        parts.push(
          beam(
            anchor,
            along,
            world.road(along + reach),
            along + reach,
            offset,
            side,
            terminal.flare,
            terminal.sink,
            reach > 0 !== side > 0,
          ),
        )
      }
      const upright = new THREE.BoxGeometry(post.width, post.height, post.depth)
      upright.deleteAttribute('uv')
      const shades = new Float32Array(upright.getAttribute('position').count * 3).fill(
        railLook.postShade,
      )
      upright.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3))
      const point = roadPoint(near, s, offset + side * (0.085 + post.depth / 2))
      upright.rotateY(near.yaw)
      upright.translate(point.x, near.y + post.height / 2 - 0.03, -point.s)
      parts.push(upright)
    }
  }
  return parts
}

export function guardRailMaterial(noise: THREE.IUniform) {
  const material = new THREE.MeshStandardMaterial({
    color: railLook.color,
    metalness: railLook.metalness,
    roughness: railLook.roughness,
    side: THREE.DoubleSide,
    vertexColors: true,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fieldNoiseMap = noise
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 railPosition;',
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nrailPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 railPosition;
${meadowNoise}`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
float railAlong = railPosition.x * 0.6 + railPosition.z;
float railSpangle = texture2D(fieldNoiseMap, (vec2(railAlong * 19.0, railPosition.y * 23.0) + 0.5) / 128.0).r;
float railCloud = fieldVariationAt(vec2(railAlong, railPosition.y * 2.0) * 21.0 + vec2(5.0, 31.0));
float railStreak = texture2D(fieldNoiseMap, (vec2(railAlong * 27.0, railPosition.y * 2.3) + 0.5) / 128.0).r;
float railGrime = smoothstep(0.5, 0.95, railStreak * 0.6 + railCloud * 0.5) * 0.55;
float railRust = smoothstep(0.74, 0.82, fieldVariationAt(vec2(railAlong, railPosition.y * 4.0) * 3.3 + vec2(71.0, 3.0))) * smoothstep(0.45, 0.8, railSpangle);
diffuseColor.rgb *= 0.84 + railSpangle * 0.12 + railCloud * 0.14;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.21, 0.19, 0.16), railGrime);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.14, 0.07), railRust * 0.8);`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + (railSpangle - 0.5) * 0.24 + (railCloud - 0.5) * 0.2 + railGrime * 0.5 + railRust * 0.4, 0.2, 1.0);`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
metalnessFactor *= (1.0 - railGrime * 1.2) * (1.0 - railRust);
metalnessFactor = max(metalnessFactor, 0.0);`,
    )
  }
  material.customProgramCacheKey = () => 'galvanised-rail-spangle-grime'
  return material
}

import * as THREE from 'three'
import { atmosphereProfile } from './atmosphere'
import { random, type Settings } from './world'

export class Precipitation {
  origin = { value: new THREE.Vector3() }
  time = { value: 0 }
  rain: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>
  snow: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  constructor(scene: THREE.Scene) {
    const rng = random(7021)
    const rainPositions: number[] = [],
      snowPositions: number[] = [],
      tips: number[] = []
    for (let i = 0; i < 1800; i++) {
      const position = [rng() * 64, rng() * 32, rng() * 64]
      rainPositions.push(...position, ...position)
      tips.push(0, 1)
      snowPositions.push(...position)
    }
    const rainGeometry = new THREE.BufferGeometry()
    rainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rainPositions, 3))
    rainGeometry.setAttribute('fallTip', new THREE.Float32BufferAttribute(tips, 1))
    const snowGeometry = new THREE.BufferGeometry()
    snowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(snowPositions, 3))
    const rainMaterial = new THREE.LineBasicMaterial({
      color: '#c2d5df',
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      fog: true,
    })
    const snowMaterial = new THREE.PointsMaterial({
      color: '#eff5f5',
      size: 0.075,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: true,
    })
    for (const [material, snow] of [
      [rainMaterial, false],
      [snowMaterial, true],
    ] as const) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.weatherOrigin = this.origin
        shader.uniforms.weatherTime = this.time
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
uniform vec3 weatherOrigin;
uniform float weatherTime;
${snow ? '' : 'attribute float fallTip;'} `,
        )
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
transformed = mod(position + vec3(${snow ? '1.0, -1.6, 0.3' : '1.5, -18.0, 0.5'}) * weatherTime - weatherOrigin, vec3(64.0, 32.0, 64.0)) + weatherOrigin - vec3(32.0, 16.0, 32.0);
${snow ? 'transformed.x += sin(position.x + weatherTime * 0.8) * 0.5;' : 'transformed += vec3(-0.1, 1.2, -0.03) * fallTip;'} `,
        )
        if (snow)
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_particle_fragment>',
            `#include <map_particle_fragment>
float flakeRadius = length(gl_PointCoord - vec2(0.5));
diffuseColor.a *= 1.0 - smoothstep(0.2, 0.5, flakeRadius);`,
          )
      }
      material.customProgramCacheKey = () => (snow ? 'world-snowfall' : 'world-rainfall')
    }
    this.rain = new THREE.LineSegments(rainGeometry, rainMaterial)
    this.snow = new THREE.Points(snowGeometry, snowMaterial)
    this.rain.frustumCulled = this.snow.frustumCulled = false
    this.rain.visible = this.snow.visible = false
    scene.add(this.rain, this.snow)
  }
  setAppearance(settings: Settings) {
    const profile = atmosphereProfile(settings)
    this.rain.visible = profile.wet
    this.snow.visible = profile.snow
    this.rain.material.color.set(settings.daylight === 'night' ? '#839aaa' : '#c2d5df')
    const count = settings.quality === 'low' ? 600 : 1800
    this.rain.geometry.setDrawRange(0, count * 2)
    this.snow.geometry.setDrawRange(0, count)
  }
  update(x: number, y: number, s: number, time: number) {
    this.origin.value.set(x, y + 8, -s)
    this.time.value = time
  }
  dispose() {
    for (const mesh of [this.rain, this.snow]) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  }
}

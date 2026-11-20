import * as THREE from 'three'
import type { AtmosphereProfile } from './atmosphere'
import { random, type Settings } from './world'

export const precipitationLayout = {
  particles: 3600,
  drops: 20000,
  calm: 0.85,
  longest: 0.95,
  fall: [1.5, -18, 0.5],
  exposure: 1 / 42,
} as const

export class Precipitation {
  origin = { value: new THREE.Vector3() }
  time = { value: 0 }
  streak = { value: new THREE.Vector3(0, -0.6, 0) }
  pixel = { value: 0.001 }
  rain: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  snow: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  constructor(scene: THREE.Scene) {
    const rng = random(7021)
    const snowPositions: number[] = []
    for (let i = 0; i < precipitationLayout.particles; i++)
      snowPositions.push(rng() * 64, rng() * 32, rng() * 64)
    const drops = precipitationLayout.drops
    const rainPositions = new Float32Array(drops * 12)
    const corners = new Float32Array(drops * 12)
    const indices = new Uint32Array(drops * 6)
    for (let i = 0; i < drops; i++) {
      const position = [rng() * 64, rng() * 32, rng() * 64]
      const seed = rng()
      for (const [corner, [across, along]] of [
        [-1, 0],
        [1, 0],
        [-1, 1],
        [1, 1],
      ].entries()) {
        rainPositions.set(position, (i * 4 + corner) * 3)
        corners.set([across ?? 0, along ?? 0, seed], (i * 4 + corner) * 3)
      }
      indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6)
    }
    const rainGeometry = new THREE.BufferGeometry()
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3))
    rainGeometry.setAttribute('fallCorner', new THREE.BufferAttribute(corners, 3))
    rainGeometry.setIndex(new THREE.BufferAttribute(indices, 1))
    const snowGeometry = new THREE.BufferGeometry()
    snowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(snowPositions, 3))
    const rainMaterial = new THREE.MeshBasicMaterial({
      color: '#c2d5df',
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
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
    const [fallX, fallY, fallZ] = precipitationLayout.fall
    const fall = `vec3(${fallX.toFixed(1)}, ${fallY.toFixed(1)}, ${fallZ.toFixed(1)})`
    for (const [material, snow] of [
      [rainMaterial, false],
      [snowMaterial, true],
    ] as const) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.weatherOrigin = this.origin
        shader.uniforms.weatherTime = this.time
        shader.uniforms.rainStreak = this.streak
        shader.uniforms.rainPixel = this.pixel
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
uniform vec3 weatherOrigin;
uniform float weatherTime;
${snow ? '' : 'uniform vec3 rainStreak;\nuniform float rainPixel;\nattribute vec3 fallCorner;\nvarying vec3 rainShape;'} `,
        )
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          snow
            ? `#include <begin_vertex>
transformed = mod(position + vec3(1.0, -1.6, 0.3) * weatherTime - weatherOrigin, vec3(64.0, 32.0, 64.0)) + weatherOrigin - vec3(32.0, 16.0, 32.0);
transformed.x += sin(position.x + weatherTime * 0.8) * 0.5;`
            : `vec3 rainCentre = mod(position + ${fall} * weatherTime - weatherOrigin, vec3(64.0, 32.0, 64.0)) + weatherOrigin - vec3(32.0, 16.0, 32.0);
vec3 rainTail = rainStreak * (0.55 + fallCorner.z * 0.9);
rainTail.xz += vec2(sin(fallCorner.z * 91.7), cos(fallCorner.z * 57.3)) * length(rainStreak) * 0.16;
vec3 rainToward = cameraPosition - rainCentre;
float rainReach = length(rainToward);
vec3 rainAcross = normalize(cross(rainTail, rainToward));
float rainWidth = max(0.003, rainReach * rainPixel * 0.8);
vec3 transformed = rainCentre - rainTail * fallCorner.y + rainAcross * fallCorner.x * rainWidth;
rainShape = vec3(fallCorner.xy, (0.45 + fallCorner.z * 0.55) * min(1.0, 0.0045 / (rainReach * rainPixel) + 0.35) * smoothstep(1.2, 4.0, rainReach));`,
        )
        if (snow)
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_particle_fragment>',
            `#include <map_particle_fragment>
float flakeRadius = length(gl_PointCoord - vec2(0.5));
diffuseColor.a *= 1.0 - smoothstep(0.2, 0.5, flakeRadius);`,
          )
        else
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 rainShape;')
            .replace(
              '#include <color_fragment>',
              `#include <color_fragment>
diffuseColor.a *= (1.0 - rainShape.x * rainShape.x) * (1.0 - rainShape.y) * (0.35 + rainShape.y * 2.6) * rainShape.z;`,
            )
      }
      material.customProgramCacheKey = () => (snow ? 'world-snowfall' : 'world-rain-streaks')
    }
    this.rain = new THREE.Mesh(rainGeometry, rainMaterial)
    this.snow = new THREE.Points(snowGeometry, snowMaterial)
    this.rain.frustumCulled = this.snow.frustumCulled = false
    this.rain.visible = this.snow.visible = false
    scene.add(this.rain, this.snow)
  }
  setAppearance(settings: Settings, profile: AtmosphereProfile) {
    this.rain.visible = profile.wet
    this.snow.visible = profile.snow
    this.rain.material.color
      .set('#c2d5df')
      .multiplyScalar(Math.max(0.16, Math.min(1, profile.ambient / 2.4) ** 1.4))
    const share =
      (profile.downpour > 0.5 ? 1 : precipitationLayout.calm) / (settings.quality === 'low' ? 3 : 1)
    this.rain.geometry.setDrawRange(0, Math.round(precipitationLayout.drops * share) * 6)
    this.snow.geometry.setDrawRange(0, Math.round(precipitationLayout.particles * share))
  }
  update(camera: THREE.PerspectiveCamera, height: number, time: number, drift: THREE.Vector3) {
    const [fallX, fallY, fallZ] = precipitationLayout.fall
    this.origin.value.copy(camera.position)
    this.origin.value.y += 5
    this.time.value = time
    this.streak.value
      .set(fallX - drift.x, fallY - drift.y, fallZ - drift.z)
      .multiplyScalar(precipitationLayout.exposure)
      .clampLength(0, precipitationLayout.longest)
    this.pixel.value = (Math.tan((camera.fov * Math.PI) / 360) * 2 * 0.8) / Math.max(1, height)
  }
  dispose() {
    for (const mesh of [this.rain, this.snow]) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  }
}

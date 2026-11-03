import * as THREE from 'three'
import { type atmosphereProfile, sunDirection } from './atmosphere'
import type { Daylight } from './world'

export class Water {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  constructor(scene: THREE.Scene) {
    const material = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog ?? {},
        {
          time: { value: 0 },
          deepColor: { value: new THREE.Color('#7595a7') },
          skyColor: { value: new THREE.Color('#dce7e8') },
          frozen: { value: 0 },
          sunDirection: { value: new THREE.Vector3(0, 1, 0) },
          sunColor: { value: new THREE.Color() },
          glitter: { value: 0 },
        },
      ]),
      vertexShader: `
#include <fog_pars_vertex>
varying vec3 waterPosition;
void main() {
  waterPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
#include <fog_pars_fragment>
uniform float time;
uniform float frozen;
uniform vec3 deepColor;
uniform vec3 skyColor;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float glitter;
varying vec3 waterPosition;
void main() {
  vec2 p = waterPosition.xz;
  float a = sin(p.x * 0.32 + p.y * 0.26 + time * 0.9);
  float b = sin(p.x * 1.2 - p.y * 0.8 + time * 0.6);
  float c = sin(p.x * 3.1 + p.y * 2.3 - time * 1.4);
  float liquid = 1.0 - frozen;
  vec3 normal = normalize(vec3((a * 0.08 + b * 0.035 + c * 0.012) * liquid, 1.0, (cos(p.y * 0.22 + time) * 0.06 + b * 0.025 + c * 0.012) * liquid));
  vec3 viewDirection = normalize(cameraPosition - waterPosition);
  float fresnel = 0.03 + 0.97 * pow(1.0 - max(0.0, dot(normal, viewDirection)), 5.0);
  vec3 color = mix(deepColor, skyColor, fresnel * mix(0.72, 0.86, frozen));
  float sparkle = pow(max(0.0, dot(reflect(-sunDirection, normal), viewDirection)), 220.0);
  color += sunColor * sparkle * glitter * liquid;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), material)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.y = 0
    scene.add(this.mesh)
  }
  update(x: number, s: number, time: number) {
    this.mesh.position.x = x
    this.mesh.position.z = -s
    if (this.mesh.material.uniforms.time) this.mesh.material.uniforms.time.value = time
  }
  setAppearance(
    daylight: Daylight,
    winter: boolean,
    profile: ReturnType<typeof atmosphereProfile>,
  ) {
    const colors =
      daylight === 'night'
        ? ['#132639', '#2b3f52']
        : daylight === 'sunset'
          ? ['#53687a', '#e8bc98']
          : ['#4f8098', '#d8e8ea']
    this.mesh.material.uniforms.sunDirection?.value.copy(sunDirection(profile.sunHeight))
    this.mesh.material.uniforms.sunColor?.value.set(profile.sun)
    if (this.mesh.material.uniforms.glitter)
      this.mesh.material.uniforms.glitter.value = profile.sunGlow * 1.5
    this.mesh.material.uniforms.deepColor?.value.set(
      winter ? (daylight === 'night' ? '#4e647c' : '#b7c8cd') : colors[0],
    )
    this.mesh.material.uniforms.skyColor?.value.set(colors[1])
    if (this.mesh.material.uniforms.frozen)
      this.mesh.material.uniforms.frozen.value = winter ? 1 : 0
  }
  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}

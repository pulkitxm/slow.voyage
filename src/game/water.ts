import * as THREE from 'three'
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
varying vec3 waterPosition;
void main() {
  vec2 p = waterPosition.xz;
  float a = sin(p.x * 0.32 + p.y * 0.26 + time * 0.9);
  float b = sin(p.x * 1.2 - p.y * 0.8 + time * 0.6);
  vec3 normal = normalize(vec3((a * 0.06 + b * 0.025) * (1.0 - frozen), 1.0, (cos(p.y * 0.22 + time) * 0.05 + b * 0.02) * (1.0 - frozen)));
  vec3 viewDirection = normalize(cameraPosition - waterPosition);
  float reflection = pow(1.0 - max(0.0, dot(normal, viewDirection)), 3.0);
  vec3 color = mix(deepColor, skyColor, reflection * 0.86);
  float sparkle = pow(max(0.0, dot(reflect(normalize(vec3(0.4, -0.7, 0.5)), normal), viewDirection)), 160.0);
  color += vec3(sparkle * 0.2 * (1.0 - frozen));
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
  setAppearance(daylight: Daylight, winter: boolean) {
    const colors =
      daylight === 'night'
        ? ['#172d43', '#283a4a']
        : daylight === 'sunset'
          ? ['#7d8f99', '#e3c3a7']
          : ['#7399af', '#e0ecec']
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

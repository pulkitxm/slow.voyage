import * as THREE from 'three'
import { type AtmosphereProfile, sunDirection } from './atmosphere'

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
          horizonColor: { value: new THREE.Color('#dce7e8') },
          zenithColor: { value: new THREE.Color('#9fbcd0') },
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
uniform vec3 horizonColor;
uniform vec3 zenithColor;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float glitter;
varying vec3 waterPosition;
vec2 rippleHash(vec2 cell) {
  vec3 h = fract(vec3(mod(cell.xyx, 512.0)) * vec3(0.1031, 0.103, 0.0973));
  h += dot(h, h.yzx + 33.33);
  return fract((h.xx + h.yz) * h.zy) * 2.0 - 1.0;
}
vec3 rippleNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = rippleHash(cell);
  vec2 gb = rippleHash(cell + vec2(1.0, 0.0));
  vec2 gc = rippleHash(cell + vec2(0.0, 1.0));
  vec2 gd = rippleHash(cell + vec2(1.0, 1.0));
  float va = dot(ga, f);
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0, 1.0));
  float value = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd);
  vec2 slope = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
    + du * (u.yx * (va - vb - vc + vd) + vec2(vb, vc) - va);
  return vec3(value, slope);
}
vec2 rippleOctave(vec2 p, float scale, float angle, vec2 drift) {
  float c = cos(angle);
  float s = sin(angle);
  vec2 q = mat2(c, -s, s, c) * p * scale + drift * mod(time, 2048.0);
  float calm = 1.0 - smoothstep(0.35, 1.0, length(fwidth(q)));
  vec2 slope = rippleNoise(q).yz;
  return mat2(c, s, -s, c) * slope * calm;
}
void main() {
  vec2 p = waterPosition.xz;
  float liquid = 1.0 - frozen;
  vec2 tilt = rippleOctave(p, 0.045, 0.3, vec2(0.05, 0.03)) * 1.0
    + rippleOctave(p, 0.21, 1.7, vec2(-0.12, 0.08)) * 0.6
    + rippleOctave(p, 0.93, 2.9, vec2(0.31, -0.22)) * 0.35
    + rippleOctave(p, 3.7, 4.4, vec2(-0.6, 0.45)) * 0.18;
  tilt *= liquid;
  vec3 normal = normalize(vec3(tilt.x * 0.09, 1.0, tilt.y * 0.09));
  vec3 viewDirection = normalize(cameraPosition - waterPosition);
  float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec3 bounce = reflect(-viewDirection, normal);
  vec3 skyline = mix(horizonColor, zenithColor, smoothstep(0.02, 0.45, bounce.y));
  skyline = mix(skyline, skyColor, 0.25);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  vec3 body = deepColor * (0.55 + 0.45 * facing);
  vec3 color = mix(body, skyline, fresnel * mix(1.0, 0.86, frozen));
  float glint = clamp(dot(bounce, sunDirection), 0.0, 1.0);
  color += sunColor * (pow(glint, 400.0) * 3.0 + pow(glint, 40.0) * 0.12) * glitter * liquid;
  float mirror = liquid * clamp(0.15 + fresnel * 0.85, 0.0, 0.92);
  gl_FragColor = vec4(color, 1.0 + mirror);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000, 80, 80), material)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.y = 0
    scene.add(this.mesh)
  }
  update(x: number, s: number, time: number) {
    this.mesh.position.x = x
    this.mesh.position.z = -s
    if (this.mesh.material.uniforms.time) this.mesh.material.uniforms.time.value = time
  }
  setAppearance(winter: boolean, profile: AtmosphereProfile) {
    this.mesh.material.uniforms.sunDirection?.value.copy(sunDirection(profile.sunHeight))
    this.mesh.material.uniforms.sunColor?.value.set(profile.sun)
    if (this.mesh.material.uniforms.glitter)
      this.mesh.material.uniforms.glitter.value = profile.sunGlow * 1.5
    this.mesh.material.uniforms.deepColor?.value.set(winter ? profile.frozenWater : profile.water)
    this.mesh.material.uniforms.skyColor?.value.set(profile.waterSky)
    this.mesh.material.uniforms.horizonColor?.value.set(profile.horizon)
    this.mesh.material.uniforms.zenithColor?.value.set(profile.sky)
    if (this.mesh.material.uniforms.frozen)
      this.mesh.material.uniforms.frozen.value = winter ? 1 : 0
  }
  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}

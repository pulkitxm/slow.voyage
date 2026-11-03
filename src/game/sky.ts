import * as THREE from 'three'
import { type atmosphereProfile, sunDirection } from './atmosphere'

export class ScenicSky extends THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  constructor() {
    super(
      new THREE.SphereGeometry(2800, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          top: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() },
          clouds: { value: 0 },
          cloudColor: { value: new THREE.Color() },
          haze: { value: 0 },
          time: { value: 0 },
          sunDirection: { value: new THREE.Vector3(0, 1, 0) },
          sunColor: { value: new THREE.Color() },
          sunGlow: { value: 0 },
          stars: { value: 0 },
        },
        vertexShader: `
varying vec3 direction;
void main() {
  direction = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: `
varying vec3 direction;
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 cloudColor;
uniform float clouds;
uniform float haze;
uniform float time;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float sunGlow;
uniform float stars;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float starField(vec3 ray) {
  vec3 grid = ray * 180.0;
  vec3 cell = floor(grid);
  float seed = hash3(cell);
  float lit = step(0.996, seed);
  float core = smoothstep(0.42, 0.0, length(fract(grid) - 0.5));
  float twinkle = 0.65 + 0.35 * sin(time * (1.2 + seed * 2.0) + seed * 60.0);
  return lit * core * twinkle * (0.5 + fract(seed * 977.0) * 0.8);
}
float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 fraction = fract(p);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), fraction.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), fraction.x),
    fraction.y
  );
}
float cloudField(vec2 p) {
  return noise(p) * 0.55 + noise(p * 2.3) * 0.28 + noise(p * 5.0) * 0.17;
}
void main() {
  vec3 ray = normalize(direction);
  float height = max(ray.y, 0.0);
  vec3 color = mix(horizon, top, pow(height, 0.45));
  float facing = max(dot(ray, sunDirection), 0.0);
  vec3 halo = sunColor * (pow(facing, 6.0) * 0.18 + pow(facing, 48.0) * 0.35) * sunGlow;
  float disc = smoothstep(0.99955, 0.9998, facing);
  color += halo;
  color += vec3(starField(ray)) * stars * smoothstep(0.04, 0.3, height);
  color = mix(color, sunColor * 1.6 + vec3(0.25), disc * step(0.0, ray.y));
  vec2 wind = vec2(time * 0.0015, time * 0.0005);
  vec2 position = ray.xz / max(0.16, ray.y) * 0.8 + wind;
  vec2 masses = vec2(ray.x * 4.0 + ray.z * 2.0, ray.y * 6.0 + ray.z) + wind;
  float warp = noise(masses * 0.7);
  float field = mix(cloudField(position), cloudField(masses + vec2(warp, warp * 0.5)), 0.65);
  float cloud = smoothstep(mix(0.68, 0.27, clouds), mix(0.88, 0.72, clouds), field);
  cloud *= smoothstep(0.025, 0.2, height);
  color = mix(color, cloudColor + halo * 1.5, cloud * 0.82);
  color = mix(color, horizon, haze * (1.0 - smoothstep(0.25, 0.9, height)));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`,
      }),
    )
    this.frustumCulled = false
  }

  setAppearance(profile: ReturnType<typeof atmosphereProfile>) {
    this.material.uniforms.top?.value.set(profile.sky)
    this.material.uniforms.horizon?.value.set(profile.horizon)
    this.material.uniforms.cloudColor?.value.set(profile.cloudColor)
    if (this.material.uniforms.clouds) this.material.uniforms.clouds.value = profile.clouds
    this.material.uniforms.sunDirection?.value.copy(sunDirection(profile.sunHeight))
    this.material.uniforms.sunColor?.value.set(profile.sun)
    if (this.material.uniforms.sunGlow) this.material.uniforms.sunGlow.value = profile.sunGlow
    if (this.material.uniforms.stars) this.material.uniforms.stars.value = profile.stars
    if (this.material.uniforms.haze)
      this.material.uniforms.haze.value = Math.max(0, Math.min(1, (profile.fog - 0.0032) / 0.0048))
  }
}

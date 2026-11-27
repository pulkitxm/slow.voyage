import * as THREE from 'three'
import { type AtmosphereProfile, sunDirection } from './atmosphere'
import { undevelop } from './film'

export const skyLook = {
  sunDisc: 48,
  sunReach: 0.9999,
  moonReach: 0.9997,
  moonSize: 0.0245,
  moonLevel: 1.9,
  cloudLift: 1,
  cloudShade: 0.5,
}

export class ScenicSky extends THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  constructor(lean = false) {
    super(
      new THREE.SphereGeometry(2800, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        defines: lean ? { LEAN_SKY: 1 } : {},
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
          moon: { value: 0 },
          solid: { value: 1 },
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
uniform float moon;
uniform float solid;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float starLayer(vec3 ray, float scale, float cut, float size) {
  vec3 grid = ray * scale;
  vec3 cell = floor(grid);
  float seed = hash3(cell);
  vec3 shift = vec3(hash3(cell + 11.0), hash3(cell + 23.0), hash3(cell + 37.0)) - 0.5;
  float core = smoothstep(size, 0.0, length(fract(grid) - 0.5 - shift * 0.5));
  float twinkle = 0.75 + 0.25 * sin(time * (1.2 + seed * 2.0) + seed * 60.0);
  float bright = fract(seed * 977.0);
  return step(cut, seed) * core * twinkle * (0.18 + bright * bright * bright * 1.5);
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
const mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
float billow(vec2 p) {
  float total = noise(p) * 0.5;
  p = turn * p * 2.03;
  total += noise(p) * 0.25;
  p = turn * p * 2.01;
  total += noise(p) * 0.125;
  p = turn * p * 2.02;
  total += noise(p) * 0.0625;
  return total / 0.9375;
}
float wisp(vec2 p) {
  float total = noise(p) * 0.6;
  p = turn * p * 2.4;
  total += noise(p) * 0.4;
  return total;
}
float cloudShape(vec2 p, vec2 wind) {
  float mass = billow(p * 0.6 + wind);
  #ifdef LEAN_SKY
    return mass * 0.74 + 0.13;
  #else
    float detail = wisp(p * 2.6 + wind * 2.3 + mass * 1.4);
    return mass * 0.74 + detail * 0.26;
  #endif
}
void main() {
  vec3 ray = normalize(direction);
  float height = max(ray.y, 0.0);
  float facing = max(dot(ray, sunDirection), 0.0);
  float rise = 1.0 - height;
  float low = rise * rise * rise * rise * rise;
  float sunLow = 1.0 - clamp(sunDirection.y * 2.4, 0.0, 1.0);
  float along = dot(normalize(ray.xz + vec2(1e-5)), normalize(sunDirection.xz + vec2(1e-5)));
  float away = (0.5 - 0.5 * along) * sunLow * (1.0 - moon) * smoothstep(0.02, 0.2, height);
  along = max(along, 0.0);
  vec3 rim = mix(horizon, top, away * 0.6);
  vec3 color = mix(top, rim, low);
  color = mix(color, mix(top, rim, 0.5), rise * rise * 0.3);
  float band = along * along * along * exp(-height * 7.0) * sunLow;
  float close = facing * facing;
  close *= close;
  float near = pow(facing, 48.0);
  float shown = max(1.0 - smoothstep(0.0, 0.3, moon), smoothstep(0.7, 1.0, moon));
  vec3 halo = sunColor * sunGlow * (close * facing * 0.2 + (near * 0.55 + pow(facing, 420.0) * 2.4) * shown + band * 0.75);
  color += halo * (1.0 - moon * 0.6);
  if (stars > 0.0) {
    float field = starLayer(ray, 150.0, 0.985, 0.3) + starLayer(ray, 70.0, 0.992, 0.2) * 1.6;
    vec3 tint = mix(vec3(1.0, 0.86, 0.72), vec3(0.78, 0.88, 1.0), hash3(floor(ray * 150.0) + 5.0));
    color += tint * field * stars * smoothstep(0.02, 0.28, height) * (1.0 - near);
  }
  vec2 wind = vec2(time * 0.0016, time * 0.0006);
  vec2 plane = ray.xz / (max(ray.y, 0.0) + 0.14) * 1.25;
  float cut = mix(0.7, 0.33, clouds);
  float soft = mix(0.06, 0.24, clouds);
  float shape = cloudShape(plane, wind);
  float cover = smoothstep(cut, cut + soft, shape) * smoothstep(0.015, 0.16, height);
  if (cover > 0.001) {
    vec2 toward = normalize(sunDirection.xz + vec2(1e-5)) * (0.5 - sunDirection.y * 0.3);
    #ifdef LEAN_SKY
      float behind = 0.5;
    #else
      float behind = smoothstep(cut, cut + soft, cloudShape(plane + toward * 0.55, wind));
    #endif
    float core = smoothstep(cut + soft * 0.4, cut + soft * 2.4, shape);
    float lit = (1.0 - core * ${skyLook.cloudShade.toFixed(2)}) * (1.0 - behind * 0.3) * mix(1.0, 0.62 + shape * 0.55, clouds * clouds);
    vec3 shade = mix(top, cloudColor, 0.55) * 0.6;
    vec3 body = mix(shade, cloudColor * ${skyLook.cloudLift.toFixed(2)}, lit);
    body += halo * (0.35 + (1.0 - core) * 1.4);
    body = mix(body, horizon, low * 0.85);
    color = mix(color, body, cover * 0.94);
  }
  float reach = mix(${skyLook.sunReach.toFixed(5)}, ${skyLook.moonReach.toFixed(5)}, moon);
  float disc = smoothstep(reach, reach + (1.0 - reach) * 0.45, facing) * step(0.0, ray.y) * (1.0 - cover * 0.92);
  if (disc > 0.0) {
    vec3 face = sunColor * ${skyLook.sunDisc.toFixed(1)};
    if (moon > 0.5) {
      vec3 across = normalize(cross(sunDirection, vec3(0.0, 1.0, 0.0)));
      vec3 upward = cross(across, sunDirection);
      vec2 spot = vec2(dot(ray, across), dot(ray, upward)) / ${skyLook.moonSize.toFixed(4)};
      float limb = sqrt(max(1.0 - dot(spot, spot), 0.0));
      float seas = noise(spot * 2.1 + 7.3) * 0.6 + noise(spot * 4.7 + 2.1) * 0.4;
      face = sunColor * ${skyLook.moonLevel.toFixed(2)} * (0.5 + 0.5 * limb) * mix(1.0, 0.5, smoothstep(0.46, 0.66, seas));
    }
    color = mix(color, face, disc * shown);
  }
  color = mix(color, horizon, haze * (1.0 - smoothstep(0.25, 0.9, height)));
  gl_FragColor = vec4(min(color, vec3(64.0)), solid);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
      }),
    )
    this.frustumCulled = false
  }

  setAppearance(profile: AtmosphereProfile) {
    const uniforms = this.material.uniforms
    for (const [name, shown] of [
      ['top', profile.sky],
      ['horizon', profile.horizon],
      ['cloudColor', profile.cloudColor],
    ] as const) {
      const color = uniforms[name]?.value
      if (color instanceof THREE.Color) undevelop(color.set(shown), profile.exposure)
    }
    if (uniforms.clouds) uniforms.clouds.value = profile.clouds
    uniforms.sunDirection?.value.copy(sunDirection(profile.sunHeight))
    uniforms.sunColor?.value.set(profile.sun)
    if (uniforms.sunGlow) uniforms.sunGlow.value = profile.sunGlow
    if (uniforms.stars) uniforms.stars.value = profile.stars
    if (uniforms.moon) uniforms.moon.value = profile.moon
    if (uniforms.haze)
      uniforms.haze.value = Math.max(0, Math.min(1, (profile.fog - 0.0032) / 0.0048))
  }
}

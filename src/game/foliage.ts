import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { random, type Season } from './world'

const atlasColumns = 2
const atlasRows = 3
const tileSize = 512
function drawConifer(context: CanvasRenderingContext2D, season: Season) {
  const rng = random(5489)
  context.strokeStyle = '#514b3c'
  context.lineWidth = 9
  context.beginPath()
  context.moveTo(256, 503)
  context.lineTo(256, 48)
  context.stroke()
  for (let layer = 15; layer >= 0; layer--) {
    const y = 58 + layer * 25
    const width = (19 + layer * 9.7) * (0.76 + rng() * 0.36)
    const leftWidth = width * (0.85 + rng() * 0.3)
    const rightWidth = width * (0.85 + rng() * 0.3)
    const hue = season === 'winter' ? 142 : 118
    const lightness = 20 + rng() * 7
    context.fillStyle = `hsl(${hue} 24% ${lightness}%)`
    context.beginPath()
    context.moveTo(256, y - 18)
    context.lineTo(256 - leftWidth, y + 31)
    for (let i = 0; i <= 12; i++) {
      const fraction = i / 12
      context.lineTo(256 - leftWidth + fraction * (leftWidth + rightWidth), y + 23 + rng() * 15)
    }
    context.lineTo(256 + rightWidth, y + 31)
    context.closePath()
    context.fill()
    for (const side of [-1, 1]) {
      const branchWidth = side < 0 ? leftWidth : rightWidth
      for (let twig = 0; twig < 36; twig++) {
        const t = rng()
        const x = 256 + side * branchWidth * t
        const branchY = y + 20 * t + rng() * 12
        context.strokeStyle = `hsl(${hue + rng() * 12} ${22 + rng() * 13}% ${lightness + 3 + rng() * 10}%)`
        context.lineWidth = 2 + rng() * 2
        context.beginPath()
        context.moveTo(x - side * 8, branchY - 9)
        context.lineTo(x + side * 7, branchY + 8 + rng() * 8)
        context.stroke()
      }
      if (season === 'winter' && rng() < 0.45) {
        context.strokeStyle = '#cbd7d1'
        context.lineWidth = 2 + rng() * 2
        context.beginPath()
        context.moveTo(256 + side * width * 0.08, y + 1)
        context.lineTo(256 + side * width * 0.52, y + 10)
        context.stroke()
      }
    }
  }
}
function canopy(
  context: CanvasRenderingContext2D,
  rng: () => number,
  season: Season,
  centers: { x: number; y: number; radius: number }[],
) {
  const hue = season === 'autumn' ? 24 + rng() * 18 : 80 + rng() * 12
  for (const center of centers) {
    const phase = rng() * Math.PI * 2
    const lobes = 6 + Math.floor(rng() * 4)
    for (let lobe = 0; lobe < lobes; lobe++) {
      const angle = phase + (lobe / lobes) * Math.PI * 2
      const reach = center.radius * (0.35 + rng() * 0.35)
      const clusterX = center.x + Math.cos(angle) * reach
      const clusterY = center.y + Math.sin(angle) * reach * 0.85
      const radius = center.radius * (0.26 + rng() * 0.19)
      const light = 0.27 - Math.cos(angle) * 0.025 - Math.sin(angle) * 0.045
      for (let leaf = 0; leaf < 110; leaf++) {
        const direction = rng() * Math.PI * 2
        const distance = Math.sqrt(rng())
        const boundary = 1 + Math.sin(direction * 3 + phase) * 0.16
        const nx = Math.cos(direction) * distance
        const ny = Math.sin(direction) * distance
        const x = clusterX + nx * radius * boundary
        const y = clusterY + ny * radius * boundary * 0.8
        const shade = light - nx * 0.03 - ny * 0.055 + (rng() - 0.5) * 0.08
        const saturation = season === 'autumn' ? 51 + rng() * 16 : 30 + rng() * 13
        context.fillStyle = `hsl(${hue + rng() * 9} ${saturation}% ${shade * 100}%)`
        context.beginPath()
        context.ellipse(x, y, 2 + rng() * 3, 1.2 + rng() * 2.5, direction, 0, Math.PI * 2)
        context.fill()
      }
    }
  }
}
function drawTree(context: CanvasRenderingContext2D, variant: number, season: Season) {
  if (variant === 4) {
    drawConifer(context, season)
    return
  }
  if (variant === 5) {
    context.save()
    context.translate(256, 0)
    context.scale(0.58, 1)
    context.translate(-256, 0)
    drawTree(context, 1, season)
    context.restore()
    return
  }
  const rng = random(324 + variant * 981)
  const centers: { x: number; y: number; radius: number }[] = []
  if (variant >= 2) {
    context.strokeStyle = '#68634d'
    context.lineWidth = 5
    if (season === 'winter') {
      for (let i = 0; i < 12; i++) {
        const x = 90 + rng() * 330
        const y = 220 + rng() * 180
        context.beginPath()
        context.moveTo(256 + (rng() - 0.5) * 45, 503)
        context.quadraticCurveTo(256, 385, x, y)
        context.moveTo(x, y)
        context.lineTo(x + (rng() - 0.5) * 65, y - 20 - rng() * 45)
        context.stroke()
      }
      return
    }
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const x = 256 + Math.cos(angle) * (85 + rng() * 60)
      const y = 266 + Math.sin(angle) * (85 + rng() * 60)
      context.beginPath()
      context.moveTo(256, 320)
      context.quadraticCurveTo(256, 256, x, y)
      context.stroke()
      centers.push({ x, y, radius: 42 + rng() * 27 })
    }
    centers.push({ x: 256, y: 280, radius: 80 })
    canopy(context, rng, season, centers)
    return
  }
  function branch(
    x: number,
    y: number,
    length: number,
    angle: number,
    width: number,
    depth: number,
  ) {
    const endX = x + Math.sin(angle) * length
    const endY = y - Math.cos(angle) * length
    context.strokeStyle = depth > 2 ? '#625e4b' : '#77715b'
    context.lineWidth = width
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(x, y)
    context.quadraticCurveTo(
      x + Math.sin(angle) * length * 0.3 + width * 0.3,
      y - length * 0.5,
      endX,
      endY,
    )
    context.stroke()
    if (depth === 0) {
      centers.push({ x: endX, y: endY, radius: 39 + rng() * 18 })
      return
    }
    branch(
      endX,
      endY,
      length * (0.56 + rng() * 0.2),
      angle - 0.4 - rng() * 0.5,
      width * 0.58,
      depth - 1,
    )
    branch(
      endX,
      endY,
      length * (0.56 + rng() * 0.2),
      angle + 0.4 + rng() * 0.5,
      width * 0.58,
      depth - 1,
    )
    if (depth > 1)
      branch(endX, endY, length * 0.8, angle + (rng() - 0.5) * 0.25, width * 0.54, depth - 1)
  }
  branch(256, 498, 112, (rng() - 0.5) * 0.14, 20 + variant * 1.5, 3)
  if (season !== 'winter') {
    centers.push(
      { x: 146 + variant * 8, y: 246 - variant * 18, radius: 65 },
      { x: 358 - variant * 12, y: 224 + variant * 16, radius: 68 },
      { x: 194 - variant * 8, y: 156 + variant * 20, radius: 74 },
      { x: 285 + variant * 14, y: 143 - variant * 6, radius: 71 },
      { x: 254, y: 222, radius: 58 },
    )
    canopy(context, rng, season, centers)
  } else {
    context.strokeStyle = '#e7ebe4'
    context.lineWidth = 2
    for (const center of centers) {
      context.beginPath()
      context.moveTo(center.x - 8, center.y - 1)
      context.lineTo(center.x + 5, center.y - 3)
      context.stroke()
    }
  }
}
export class Foliage {
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  treeMaterial: THREE.MeshStandardMaterial
  leafNormals = { value: 1 }
  treeGeometries: THREE.BufferGeometry[] = []
  winterShrubGeometries: THREE.BufferGeometry[] = []
  constructor(season: Season) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = tileSize * atlasColumns
    this.canvas.height = tileSize * atlasRows
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = 8
    this.treeMaterial = new THREE.MeshStandardMaterial({
      map: this.texture,
      side: THREE.DoubleSide,
      alphaTest: 0.46,
      alphaToCoverage: false,
      roughness: 1,
    })
    this.treeMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.leafNormals = this.leafNormals
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying float foliageDistance;\nvarying vec3 foliageNormal;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
vec3 crownNormal = vec3(position.x * 2.4, (position.y - 0.62) * 1.8, position.z * 2.4);
#ifdef USE_INSTANCING
mat3 crownInstance = mat3(instanceMatrix);
crownNormal /= vec3(dot(crownInstance[0], crownInstance[0]), dot(crownInstance[1], crownInstance[1]), dot(crownInstance[2], crownInstance[2]));
crownNormal = crownInstance * crownNormal;
#endif
foliageNormal = normalMatrix * crownNormal;`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nfoliageDistance = length(mvPosition.xyz);',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform float leafNormals;\nvarying float foliageDistance;\nvarying vec3 foliageNormal;',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
vec2 foliageUv = fract(vMapUv * vec2(2.0, 3.0));
float evergreen = step(2.0 / 3.0, vMapUv.y) * (1.0 - step(0.5, vMapUv.x));
float crownWeight = smoothstep(0.24, 0.48, foliageUv.y) * max(leafNormals, evergreen);
vec3 crownNormal = foliageNormal;
crownNormal.z = abs(crownNormal.z) + 0.35 * length(crownNormal) + 0.001;
normal = normalize(mix(normal, normalize(crownNormal), crownWeight));
nonPerturbedNormal = normal;`,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        '#ifdef USE_ALPHATEST\nfloat foliageAlpha = mix(alphaTest, 0.28, smoothstep(180.0, 650.0, foliageDistance));\nif (diffuseColor.a < foliageAlpha) discard;\n#endif\nfloat foliageDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));\nif (smoothstep(1.2, 3.2, foliageDistance) < foliageDither) discard;',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#if NUM_DIR_LIGHTS > 0
float foliageBacklight = pow(max(dot(-normal, directionalLights[0].direction), 0.0), 2.0);
outgoingLight += diffuseColor.rgb * directionalLights[0].color * (0.04 + foliageBacklight * 0.12) * crownWeight;
#endif
#include <opaque_fragment>`,
      )
    }
    this.treeMaterial.customProgramCacheKey = () => 'seasonal-foliage-volume'
    for (let variant = 0; variant < 8; variant++) {
      const planes: THREE.BufferGeometry[] = []
      const shrub = variant >= 2 && variant < 4
      const atlasVariant = variant >= 6 ? variant - 4 : variant
      const rng = random(635 + variant * 871)
      const count = shrub ? 8 : 3
      for (let side = 0; side < count; side++) {
        const plane = new THREE.PlaneGeometry(shrub ? 0.68 : 1, shrub ? 0.65 : 1)
        if (shrub) {
          const angle = side * 2.4
          const radius = side === 0 ? 0 : 0.16 + rng() * 0.06
          plane.rotateX((rng() - 0.5) * 0.7)
          plane.rotateY(angle + rng() * 0.7)
          plane.translate(Math.cos(angle) * radius, 0.3 + rng() * 0.24, Math.sin(angle) * radius)
        } else {
          plane.translate(0, 0.5, 0)
          plane.rotateY((side * Math.PI) / 3)
        }
        const uv = plane.getAttribute('uv')
        for (let i = 0; i < uv.count; i++)
          uv.setXY(
            i,
            (uv.getX(i) + (atlasVariant % atlasColumns)) / atlasColumns,
            (uv.getY(i) + Math.floor(atlasVariant / atlasColumns)) / atlasRows,
          )
        planes.push(plane)
      }
      const merged = mergeGeometries(planes)
      if (!merged) throw new Error('Tree geometry could not be assembled')
      if (variant >= 6) this.winterShrubGeometries.push(merged)
      else this.treeGeometries.push(merged)
      for (const plane of planes) plane.dispose()
    }
    this.update(season)
  }
  update(season: Season) {
    this.leafNormals.value = season === 'winter' ? 0 : 1
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Foliage canvas is unavailable')
    context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    for (let variant = 0; variant < 6; variant++) {
      context.save()
      context.translate(
        (variant % atlasColumns) * tileSize,
        (atlasRows - 1 - Math.floor(variant / atlasColumns)) * tileSize,
      )
      drawTree(context, variant, season)
      context.restore()
    }
    this.texture.needsUpdate = true
  }
  dispose() {
    this.texture.dispose()
    this.treeMaterial.dispose()
    for (const geometry of this.treeGeometries) geometry.dispose()
    for (const geometry of this.winterShrubGeometries) geometry.dispose()
  }
}

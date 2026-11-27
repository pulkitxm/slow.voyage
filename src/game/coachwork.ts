import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import hatchbackUrl from '../assets/models/cars/hatchback.glb?url'
import pickupUrl from '../assets/models/cars/pickup.glb?url'
import roadsterUrl from '../assets/models/cars/roadster.glb?url'
import supercarUrl from '../assets/models/cars/supercar.glb?url'
import touringUrl from '../assets/models/cars/touring.glb?url'
import { type BodyChoice, bodyFor, type CarBody, retireBody } from './car-bodies'
import type { VehicleModel } from './model'
import { glassFace, reflectSkyline } from './skyline'
import { vehicleMetrics } from './vehicles'
import type { Vehicle } from './world'

interface Coachwork {
  url: string
  wheel: RegExp
  front: RegExp
  paint: string[]
  body?: CarBody
}

export const lensGlow = { tail: 0.32, head: 0.22 }

export const coachworks: Partial<Record<Vehicle, Coachwork>> = {
  touring: { url: touringUrl, wheel: /^Wheel_[FR][LR]$/, front: /_F[LR]$/, paint: ['body'] },
  roadster: { url: roadsterUrl, wheel: /^Wheel_[FR][LR]$/, front: /_F[LR]$/, paint: ['body'] },
  hatchback: { url: hatchbackUrl, wheel: /^Wheel_[FR][LR]$/, front: /_F[LR]$/, paint: ['body'] },
  supercar: { url: supercarUrl, wheel: /^Wheel_[FR][LR]$/, front: /_F[LR]$/, paint: ['body'] },
  pickup: { url: pickupUrl, wheel: /^Wheel_[FR][LR]$/, front: /_F[LR]$/, paint: ['body'] },
}

let bodyFiles: Map<string, string> | null = null

export function bodyUrl(id: string) {
  if (!bodyFiles) {
    let found: Record<string, string> = {}
    try {
      found = import.meta.glob<string>('../assets/models/cars/bodies/*.glb', {
        query: '?url',
        import: 'default',
        eager: true,
      })
    } catch {}
    bodyFiles = new Map(
      Object.entries(found).map(([path, url]) => [
        path.slice(path.lastIndexOf('/') + 1).replace(/\.glb$/, ''),
        url,
      ]),
    )
  }
  return bodyFiles.get(id)
}

export function coachworkFor(settings: BodyChoice): Coachwork | undefined {
  const body = bodyFor(settings)
  const url = body && bodyUrl(body.id)
  if (body && url)
    return { url, wheel: /^Wheel_[FR][LR]$/, front: /_F[LR]$/, paint: ['body'], body }
  return coachworks[settings.vehicle]
}

let loader: GLTFLoader | null = null

function lampSpots(shell: THREE.Object3D, frame: THREE.Object3D, name: RegExp) {
  const toFrame = frame.matrixWorld.clone().invert()
  const point = new THREE.Vector3()
  const sides = [new THREE.Vector3(), new THREE.Vector3()]
  const counts = [0, 0]
  shell.traverse((part) => {
    if (!(part instanceof THREE.Mesh) || !name.test(part.name)) return
    const placement = toFrame.clone().multiply(part.matrixWorld)
    const position = part.geometry.getAttribute('position')
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(placement)
      const side = point.x < 0 ? 0 : 1
      sides[side]?.add(point)
      counts[side] = (counts[side] ?? 0) + 1
    }
  })
  if (!counts[0] || !counts[1]) return null
  return sides.map((sum, side) => sum.divideScalar(counts[side] ?? 1).toArray()) as [
    number,
    number,
    number,
  ][]
}

export function plateText(id: string) {
  let seed = 2166136261
  for (const letter of id) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ'
  const pick = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed
  }
  const letter = () => letters[pick() % letters.length] ?? 'S'
  return `${letter()}${letter()} ${String(10 + (pick() % 90))} ${letter()}${letter()}${letter()}`
}

function plateFace(text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#f3f2ea'
  context.fillRect(0, 0, 512, 128)
  context.strokeStyle = '#1b1d1e'
  context.lineWidth = 6
  context.strokeRect(7, 7, 498, 114)
  context.fillStyle = '#1f4f9a'
  context.fillRect(10, 10, 44, 108)
  context.fillStyle = '#16181a'
  context.font = '700 86px "DM Sans", "Manrope", Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 282, 68, 420)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.flipY = false
  return texture
}

function shadePaint(model: VehicleModel, shell: THREE.Object3D) {
  let shaded = false
  shell.traverse((part) => {
    if (part instanceof THREE.Mesh && part.material === model.body)
      shaded ||= part.geometry.hasAttribute('color')
  })
  for (const spin of model.wheels)
    spin.traverse((part) => {
      if (part instanceof THREE.Mesh && part.material === model.body)
        shaded ||= part.geometry.hasAttribute('color')
    })
  if (!shaded) return
  model.group.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return
    const paints = Array.isArray(part.material) ? part.material : [part.material]
    if (!paints.includes(model.body) || part.geometry.hasAttribute('color')) return
    const count = part.geometry.getAttribute('position').count
    part.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3),
    )
  })
  model.body.vertexColors = true
  model.body.needsUpdate = true
}

export function dressVehicle(
  model: VehicleModel,
  settings: BodyChoice,
  onReady?: () => void,
  onMissing?: () => void,
) {
  const vehicle = settings.vehicle
  const chosen = bodyFor(settings)
  if (chosen && !bodyUrl(chosen.id)) {
    retireBody(chosen.id)
    queueMicrotask(() => onMissing?.())
    return false
  }
  const spec = coachworkFor(settings)
  const exterior = model.exterior
  if (!spec || !exterior) return false
  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  let cancelled = false
  const owned = new Set<THREE.Material>()
  const retire = model.dispose.bind(model)
  model.dispose = () => {
    cancelled = true
    for (const material of owned) {
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) value.dispose()
      material.dispose()
    }
    retire()
  }
  loader.load(
    spec.url,
    (file) => {
      if (cancelled) return
      const metrics = vehicleMetrics[vehicle]
      const shell = file.scene
      const generated: THREE.Mesh[] = []
      exterior.traverse((part) => {
        if (part instanceof THREE.Mesh) generated.push(part)
      })
      exterior.add(shell)
      shell.updateMatrixWorld(true)
      const wheels: { node: THREE.Object3D; centre: THREE.Vector3; hub: number }[] = []
      shell.traverse((part) => {
        if (!spec.wheel.test(part.name) || !spec.front.test(part.name)) return
        const partner = shell.getObjectByName(part.name.replace(/F(?=[LR]$)/, 'R'))
        if (!partner || !part.parent) return
        const facing = partner.getWorldQuaternion(new THREE.Quaternion())
        const frame = part.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
        part.quaternion.copy(frame.multiply(facing))
      })
      shell.updateMatrixWorld(true)
      shell.traverse((part) => {
        if (!spec.wheel.test(part.name)) return
        const box = new THREE.Box3().setFromObject(part)
        const hub = box.getCenter(new THREE.Vector3())
        wheels.push({ node: part, centre: exterior.worldToLocal(hub.clone()), hub: hub.y })
      })
      const fronts = wheels.filter((wheel) => spec.front.test(wheel.node.name))
      const rears = wheels.filter((wheel) => !spec.front.test(wheel.node.name))
      if (wheels.length !== model.wheels.length || !fronts.length || !rears.length) {
        exterior.remove(shell)
        if (spec.body) {
          retireBody(spec.body.id)
          onMissing?.()
        }
        return
      }
      const mean = (list: typeof wheels) =>
        list
          .reduce((sum, wheel) => sum.add(wheel.centre), new THREE.Vector3())
          .divideScalar(list.length)
      const front = mean(fronts)
      const rear = mean(rears)
      const span = Math.hypot(front.x - rear.x, front.z - rear.z)
      const scale = (spec.body?.wheelbase ?? metrics.wheelbase) / Math.max(0.01, span)
      const nose = Math.sign(model.headlightPositions[0]?.[2] ?? -1) || -1
      const turn = (nose > 0 ? 0 : Math.PI) - Math.atan2(front.x - rear.x, front.z - rear.z)
      const lowest = new THREE.Box3().setFromObject(shell).min.y
      const hubs = wheels.reduce((sum, wheel) => sum + wheel.hub, 0) / wheels.length
      const radius = (hubs - lowest) / (exterior.getWorldScale(new THREE.Vector3()).y || 1)
      const middle = front.clone().add(rear).multiplyScalar(0.5)
      shell.scale.multiplyScalar(scale)
      shell.rotation.y += turn
      shell.position.set(0, 0, 0)
      shell.updateMatrixWorld(true)
      const placed = middle
        .clone()
        .multiplyScalar(scale)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), turn)
      shell.position.set(-placed.x, radius * scale - placed.y, -placed.z)
      shell.updateMatrixWorld(true)
      for (const wheel of wheels) {
        const box = new THREE.Box3().setFromObject(wheel.node)
        const centre = box.getCenter(new THREE.Vector3())
        let nearest = 0
        let gap = Number.POSITIVE_INFINITY
        for (const [index, spin] of model.wheels.entries()) {
          const distance = spin.getWorldPosition(new THREE.Vector3()).distanceTo(centre)
          if (distance < gap) {
            gap = distance
            nearest = index
          }
        }
        const spin = model.wheels[nearest]
        if (!spin) continue
        const holder = new THREE.Group()
        spin.add(holder)
        holder.updateMatrixWorld(true)
        holder.attach(wheel.node)
        wheel.node.position.sub(holder.worldToLocal(centre.clone()))
        if (!spec.body) holder.scale.setScalar(metrics.wheelRadius / Math.max(0.01, radius * scale))
      }
      shell.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) return
        part.castShadow = true
        part.receiveShadow = true
        const dress = (material: THREE.Material) => {
          if (spec.paint.includes(material.name)) return model.body
          if (owned.has(material)) return material
          owned.add(material)
          if (material instanceof THREE.MeshStandardMaterial) {
            if (/^Plate/.test(part.name) && part.geometry.hasAttribute('uv')) {
              material.map = plateFace(plateText(spec.body?.id ?? vehicle))
              material.color.set('#ffffff')
              material.roughness = 0.42
            } else if (material.metalness >= 0.5 && !material.transparent) {
              const shine = material.color.getHSL({ h: 0, s: 0, l: 0 }).l
              material.roughness = Math.max(material.roughness, 0.16)
              reflectSkyline(material, 0.5 + 1.3 * shine, 0.25 + 0.5 * material.metalness)
            } else if (material.name === 'cover') {
              material.opacity = 0.22
              material.roughness = 0.07
              material.depthWrite = false
              reflectSkyline(material, 3, 0.16)
            } else if (/^lens/.test(material.name)) {
              material.roughness = Math.min(material.roughness, 0.12)
              reflectSkyline(material, 1.2, 0.08)
            }
          }
          if (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) {
            material.transmission = 0
            material.transparent = true
            material.opacity = 0.42
            material.color.set('#20262b')
            material.roughness = 0.08
            reflectSkyline(material, 1 / material.opacity, glassFace.floor)
          } else if (
            material instanceof THREE.MeshStandardMaterial &&
            material.transparent &&
            /glass/i.test(material.name)
          ) {
            if (spec.body) {
              material.opacity = 0.74
              material.roughness = 0.07
              reflectSkyline(material, 1.1, 0.07)
            } else {
              material.opacity = Math.max(material.opacity, glassFace.opacity)
              reflectSkyline(material, 1 / material.opacity, glassFace.floor)
            }
          }
          return material
        }
        part.material = Array.isArray(part.material)
          ? part.material.map(dress)
          : dress(part.material)
      })
      for (const spin of model.wheels)
        spin.traverse((part) => {
          if (!(part instanceof THREE.Mesh)) return
          part.castShadow = true
          if (!Array.isArray(part.material)) owned.add(part.material)
        })
      const tails: THREE.MeshStandardMaterial[] = []
      const heads: THREE.MeshStandardMaterial[] = []
      shell.traverse((part) => {
        if (!(part instanceof THREE.Mesh) || Array.isArray(part.material)) return
        const rear = /tail|stop|brake/i.test(part.name)
        const lamp = /headlight/i.test(part.name)
        if ((!rear && !lamp) || !(part.material instanceof THREE.MeshStandardMaterial)) return
        const glow = part.material.clone()
        owned.add(glow)
        glow.emissive.set(rear ? '#ff2a1a' : '#fff1d6')
        glow.emissiveMap = glow.map
        glow.emissiveIntensity = 0
        part.material = glow
        ;(rear ? tails : heads).push(glow)
      })
      model.group.updateMatrixWorld(true)
      const headSpots = lampSpots(shell, model.group, /^Headlights/)
      const tailSpots = lampSpots(shell, model.group, /^Taillights/)
      if (headSpots) model.headlightPositions = headSpots
      else if (spec.body) {
        const reach = nose * (spec.body.wheelbase / 2 + spec.body.frontOverhang - 0.45)
        model.headlightPositions = [-1, 1].map((side) => [side * 0.12, 0.38, reach])
      }
      if (tailSpots) model.tailLightPositions = tailSpots
      const drive = model.update.bind(model)
      model.update = (wheelStates, braking, night, speed) => {
        drive(wheelStates, braking, night, speed)
        for (const glow of tails)
          glow.emissiveIntensity = braking ? 3.2 : night ? 0.9 : lensGlow.tail
        for (const glow of heads) glow.emissiveIntensity = night ? 2.4 : lensGlow.head
      }
      for (const mesh of generated) mesh.visible = false
      shadePaint(model, shell)
      onReady?.()
    },
    undefined,
    () => {
      if (cancelled) return
      if (spec.body) {
        retireBody(spec.body.id)
        onMissing?.()
      } else onReady?.()
    },
  )
  return true
}

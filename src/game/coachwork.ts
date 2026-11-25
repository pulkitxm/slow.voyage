import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import hatchbackUrl from '../assets/models/cars/hatchback.glb?url'
import pickupUrl from '../assets/models/cars/pickup.glb?url'
import supercarUrl from '../assets/models/cars/supercar.glb?url'
import touringUrl from '../assets/models/cars/touring.glb?url'
import type { VehicleModel } from './model'
import { glassFace, reflectSkyline } from './skyline'
import { vehicleMetrics } from './vehicles'
import type { Vehicle } from './world'

interface Coachwork {
  url: string
  wheel: RegExp
  front: RegExp
  paint: string[]
}

export const lensGlow = { tail: 0.32, head: 0.22 }

export const coachworks: Partial<Record<Vehicle, Coachwork>> = {
  touring: { url: touringUrl, wheel: /^Wheel_[FR][LR]$/, front: /_F[LR]$/, paint: ['body'] },
  hatchback: { url: hatchbackUrl, wheel: /^Wheel_[FR][LR]$/, front: /_F[LR]$/, paint: ['body'] },
  supercar: { url: supercarUrl, wheel: /^Wheel_[FR][LR]$/, front: /_F[LR]$/, paint: ['body'] },
  pickup: { url: pickupUrl, wheel: /^Wheel_[FR][LR]$/, front: /_F[LR]$/, paint: ['body'] },
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

export function dressVehicle(model: VehicleModel, vehicle: Vehicle, onReady?: () => void) {
  const spec = coachworks[vehicle]
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
        return
      }
      const mean = (list: typeof wheels) =>
        list
          .reduce((sum, wheel) => sum.add(wheel.centre), new THREE.Vector3())
          .divideScalar(list.length)
      const front = mean(fronts)
      const rear = mean(rears)
      const span = Math.hypot(front.x - rear.x, front.z - rear.z)
      const scale = metrics.wheelbase / Math.max(0.01, span)
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
        holder.scale.setScalar(metrics.wheelRadius / Math.max(0.01, radius * scale))
      }
      shell.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) return
        part.castShadow = true
        part.receiveShadow = true
        const dress = (material: THREE.Material) => {
          if (spec.paint.includes(material.name)) return model.body
          if (owned.has(material)) return material
          owned.add(material)
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
            material.opacity = Math.max(material.opacity, glassFace.opacity)
            reflectSkyline(material, 1 / material.opacity, glassFace.floor)
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
      if (tailSpots) model.tailLightPositions = tailSpots
      const drive = model.update.bind(model)
      model.update = (wheelStates, braking, night, speed) => {
        drive(wheelStates, braking, night, speed)
        for (const glow of tails)
          glow.emissiveIntensity = braking ? 3.2 : night ? 0.9 : lensGlow.tail
        for (const glow of heads) glow.emissiveIntensity = night ? 2.4 : lensGlow.head
      }
      for (const mesh of generated) mesh.visible = false
      onReady?.()
    },
    undefined,
    () => {
      if (!cancelled) onReady?.()
    },
  )
  return true
}

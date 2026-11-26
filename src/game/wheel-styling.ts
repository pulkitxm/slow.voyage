import * as THREE from 'three'
import type { VehicleModel } from './model'
import { fitRim, measureTyre, rimMaterial } from './rims'
import type { RimFinish, WheelStyle } from './styling'
import type { Vehicle } from './world'

const finishes = new Map<RimFinish, THREE.MeshStandardMaterial>()

function finishMaterial(finish: RimFinish) {
  let material = finishes.get(finish)
  if (!material) {
    material = rimMaterial(finish)
    finishes.set(finish, material)
  }
  return material
}

export function restyles(vehicle: Vehicle) {
  return vehicle !== 'motorcycle' && vehicle !== 'bus'
}

function isTyre(mesh: THREE.Mesh) {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  return /tyre|tire/i.test(material?.name ?? '')
}

export function styleWheel(
  model: VehicleModel,
  index: number,
  style: WheelStyle,
  finish: RimFinish,
) {
  const spin = model.wheels[index]
  if (!spin) return
  for (const fitted of spin.children.filter((child) => child.name === 'fitted-rim'))
    fitted.removeFromParent()
  spin.traverse((part) => {
    if (!(part instanceof THREE.Mesh) || isTyre(part)) return
    if (part.userData.factoryVisible === undefined) part.userData.factoryVisible = part.visible
    part.visible = style === 'factory' && part.userData.factoryVisible === true
  })
  if (style === 'factory') return
  const fit = measureTyre(spin, isTyre)
  if (!fit) return
  const holder = spin.parent ?? spin
  const outward = Math.sign(holder.position.x) || 1
  spin.add(fitRim(style, fit, outward, finishMaterial(finish)))
}

export function styleWheels(
  model: VehicleModel,
  vehicle: Vehicle,
  style: WheelStyle,
  finish: RimFinish,
) {
  if (!restyles(vehicle)) return
  for (let index = 0; index < model.wheels.length; index++) styleWheel(model, index, style, finish)
}

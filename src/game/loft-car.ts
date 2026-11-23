import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createCarWheel } from './car-wheel'
import { createLoftBody, type LoftMaterial, projectOntoHull } from './loft-body'
import { createLoftCabin } from './loft-cabin'
import { type DetailMaterial, isLoftVehicle, loftVehicles } from './loft-vehicles'
import { batchUntexturedMeshes } from './mesh-batch'
import { glassFace, reflectSkyline } from './skyline'
import type { WheelState } from './suspension'
import { vehicleMetrics } from './vehicles'
import type { Settings } from './world'

export class LoftCarModel {
  group = new THREE.Group()
  exterior = new THREE.Group()
  firstPerson: THREE.Group
  cabin: ReturnType<typeof createLoftCabin>
  wheels: THREE.Group[] = []
  wheelPivots: THREE.Group[] = []
  materials: THREE.Material[] = []
  body: THREE.MeshStandardMaterial
  brake = new THREE.MeshStandardMaterial({
    color: '#8c1a14',
    emissive: '#ff3424',
    emissiveIntensity: 0.02,
  })
  lights = new THREE.MeshStandardMaterial({
    color: '#c9d0cb',
    emissive: '#fff2cc',
    emissiveIntensity: 0.12,
  })
  exteriorVisible = true
  wheelRadius: number
  headlightPositions: [number, number, number][]
  constructor(settings: Settings, software = false) {
    const id = settings.vehicle
    if (!isLoftVehicle(id)) throw new Error(`${id} has no lofted body`)
    const spec = loftVehicles[id]
    const dimensions = vehicleMetrics[id]
    this.wheelRadius = dimensions.wheelRadius
    this.body = new THREE.MeshPhysicalMaterial({
      color: settings.color,
      metalness: 0.08,
      roughness: 0.52,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 0.8,
    })
    reflectSkyline(this.body)
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#33383d',
      metalness: 0.2,
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.3,
    })
    reflectSkyline(glass, 1, glassFace.solid)
    const black = new THREE.MeshStandardMaterial({ color: '#222724', roughness: 0.7 })
    const chrome = new THREE.MeshStandardMaterial({
      color: '#bec5c0',
      metalness: 0.8,
      roughness: 0.3,
    })
    const tire = new THREE.MeshStandardMaterial({ color: '#232422', roughness: 0.95 })
    const wheelWell = new THREE.MeshStandardMaterial({ color: '#151a18', roughness: 1 })
    const plate = new THREE.MeshStandardMaterial({ color: '#edebdb', roughness: 0.5 })
    this.materials = [
      this.body,
      this.brake,
      this.lights,
      glass,
      black,
      chrome,
      tire,
      wheelWell,
      plate,
    ]
    const surfaces: Record<LoftMaterial, THREE.Material> = {
      paint: this.body,
      glass,
      trim: black,
      well: wheelWell,
    }
    const details: Record<DetailMaterial, THREE.Material> = {
      paint: this.body,
      glass,
      trim: black,
      metal: chrome,
      brake: this.brake,
      lights: this.lights,
      plate,
    }
    this.headlightPositions = [-1, 1].map((side) => [
      side * spec.headlights[0],
      spec.headlights[1],
      spec.headlights[2],
    ])
    const loft = createLoftBody(spec.body)
    const paint = loft.surfaces.find((surface) => surface.material === 'paint')
    if (!paint) throw new Error('Lofted body has no paint')
    this.cabin = createLoftCabin(
      spec,
      Math.ceil((dimensions.maxSpeed * 3.6 + 10) / 40) * 40,
      paint.geometry,
      this.body,
      black,
      software,
    )
    this.materials.push(...this.cabin.materials)
    this.firstPerson = this.cabin.group
    for (const surface of loft.surfaces)
      this.exterior.add(new THREE.Mesh(surface.geometry, surfaces[surface.material]))
    for (const decal of spec.decals)
      for (const side of decal.mirror ? [1, -1] : [1])
        this.exterior.add(
          new THREE.Mesh(
            projectOntoHull(
              loft.hull,
              decal.axis === 'z' ? decal.outline.map(([x, y]) => [x * side, y]) : decal.outline,
              decal.axis,
              decal.axis === 'x' ? decal.direction * side : decal.direction,
              decal.lift,
            ),
            details[decal.material],
          ),
        )
    loft.hull.dispose()
    for (const part of spec.parts)
      for (const side of part.mirror ? [1, -1] : [1]) {
        const mesh = new THREE.Mesh(
          part.shape === 'box'
            ? new RoundedBoxGeometry(...part.size, 2, Math.min(...part.size) * 0.3)
            : new THREE.CylinderGeometry(...part.size, 16),
          details[part.material],
        )
        mesh.position.set(part.position[0] * side, part.position[1], part.position[2])
        if (part.rotation)
          mesh.rotation.set(part.rotation[0], part.rotation[1] * side, part.rotation[2] * side)
        this.exterior.add(mesh)
      }
    for (const z of [dimensions.wheelbase / 2, -dimensions.wheelbase / 2])
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group(),
          spin = createCarWheel(id, tire, chrome, black, spec.spokes)
        pivot.position.set(side * dimensions.trackWidth * 0.5, this.wheelRadius, z)
        pivot.add(spin)
        batchUntexturedMeshes(spin)
        this.wheels.push(spin)
        this.wheelPivots.push(pivot)
        this.exterior.add(pivot)
      }
    batchUntexturedMeshes(this.exterior, this.wheelPivots)
    this.group.add(this.exterior, this.firstPerson)
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = object.material !== glass
        object.receiveShadow = true
      }
    })
  }
  setExteriorVisible(visible: boolean) {
    if (this.exteriorVisible === visible) return
    this.exteriorVisible = visible
    this.exterior.visible = visible
    this.firstPerson.visible = !visible
  }
  update(wheels: readonly WheelState[], braking: boolean, night: boolean, speed: number) {
    const steering = wheels.find((wheel) => wheel.front)?.steering ?? 0
    this.cabin.update(speed, steering, night)
    for (let i = 0; i < wheels.length; i++) {
      const state = wheels[i],
        pivot = this.wheelPivots[i],
        wheel = this.wheels[i]
      if (!state || !pivot || !wheel) continue
      pivot.position.y = this.wheelRadius + state.offset
      pivot.rotation.y = state.steering
      wheel.rotation.x = state.rotation
    }
    this.brake.emissiveIntensity = braking ? 3 : night ? 0.8 : 0.02
    this.lights.emissiveIntensity = night ? 4 : 0.12
  }
  dispose() {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose()
    })
    for (const material of this.materials) material.dispose()
  }
}

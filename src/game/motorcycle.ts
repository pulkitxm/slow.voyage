import * as THREE from 'three'
import { createBonnet } from './bonnet'
import type { WheelState } from './suspension'
import { vehicleMetrics } from './vehicles'
import type { Settings } from './world'

export class MotorcycleModel {
  group = new THREE.Group()
  exterior = new THREE.Group()
  firstPerson: THREE.Group
  bonnet: ReturnType<typeof createBonnet>
  body: THREE.MeshStandardMaterial
  glass = new THREE.MeshPhongMaterial({ color: '#666b77', specular: '#222222', shininess: 30 })
  rubber = new THREE.MeshStandardMaterial({ color: '#1c211f', roughness: 0.95 })
  trim = new THREE.MeshStandardMaterial({ color: '#313937', metalness: 0.5, roughness: 0.4 })
  metal = new THREE.MeshStandardMaterial({ color: '#aeb9b6', metalness: 0.8, roughness: 0.28 })
  brake = new THREE.MeshStandardMaterial({
    color: '#411410',
    emissive: '#ff3424',
    emissiveIntensity: 0.02,
  })
  lamp = new THREE.MeshStandardMaterial({
    color: '#fff7de',
    emissive: '#fff2cc',
    emissiveIntensity: 0.5,
  })
  headlightPositions: [number, number, number][] = [[0, 0.61, -1.33]]
  wheels: THREE.Group[] = []
  wheelPivots: THREE.Group[] = []
  exteriorVisible = true
  constructor(settings: Settings, software = false) {
    this.body = new THREE.MeshStandardMaterial({
      color: settings.color,
      metalness: 0,
      roughness: 0.5,
    })
    const rings: [number, number, number, number][] = [
      [1.28, 0.15, 0.44, 0.87],
      [1.15, 0.2, 0.27, 1.12],
      [0.82, 0.28, 0.18, 1.26],
      [0.4, 0.34, 0.16, 1.4],
      [0, 0.378, 0.17, 1.415],
      [-0.45, 0.36, 0.19, 1.34],
      [-0.91, 0.3, 0.24, 1.12],
      [-1.2, 0.22, 0.36, 0.85],
      [-1.335, 0.075, 0.51, 0.66],
    ]
    const positions: number[] = []
    for (const [z, width, bottom, top] of rings) {
      const belt = Math.min(0.78, bottom + (top - bottom) * 0.53)
      const shoulder = bottom + (top - bottom) * 0.84
      positions.push(
        -width * 0.5,
        bottom,
        z,
        width * 0.5,
        bottom,
        z,
        width,
        belt,
        z,
        width * 0.86,
        shoulder,
        z,
        width * 0.46,
        top,
        z,
        -width * 0.46,
        top,
        z,
        -width * 0.86,
        shoulder,
        z,
        -width,
        belt,
        z,
      )
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const indices: number[] = []
    for (let r = 0; r < rings.length - 1; r++) {
      for (let band = 0; band < 8; band++) {
        const a = r * 8 + band,
          b = r * 8 + ((band + 1) % 8)
        const start = indices.length
        indices.push(a, a + 8, b, b, a + 8, b + 8)
        const window = r >= 3 && r <= 6 && [2, 3, 5, 6].includes(band)
        const dark = band === 0 || (r < 3 && band >= 2 && band <= 6)
        geometry.addGroup(start, 6, window ? 1 : dark ? 2 : 0)
      }
    }
    const capStart = indices.length
    for (let i = 1; i < 7; i++) {
      indices.push(0, i, i + 1)
      const end = (rings.length - 1) * 8
      indices.push(end, end + i + 1, end + i)
    }
    geometry.addGroup(capStart, indices.length - capStart, 0)
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    this.exterior.add(new THREE.Mesh(geometry, [this.body, this.glass, this.trim]))
    const box = (
      size: [number, number, number],
      position: [number, number, number],
      material: THREE.Material,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
      mesh.position.set(...position)
      this.exterior.add(mesh)
      return mesh
    }
    box([0.31, 0.13, 0.025], [0, 0.98, 1.218], this.brake)
    box([0.4, 0.1, 0.035], [0, 0.61, -1.324], this.lamp)
    for (const side of [-1, 1]) {
      box([0.018, 0.027, 0.15], [side * 0.363, 0.77, -0.2], this.metal)
      box([0.025, 0.11, 0.035], [side * 0.344, 0.83, -0.64], this.trim)
    }
    const metrics = vehicleMetrics.motorcycle
    for (const z of [metrics.wheelbase * 0.5, -metrics.wheelbase * 0.5]) {
      const pivot = new THREE.Group()
      pivot.position.set(0, metrics.wheelRadius, z)
      const spin = new THREE.Group()
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.2215, 0.0385, 10, 32), this.rubber)
      tire.rotation.y = Math.PI * 0.5
      spin.add(tire)
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.07, 24), this.trim)
      rim.rotation.z = Math.PI * 0.5
      spin.add(rim)
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.023, 0.37), this.metal)
        spoke.rotation.x = (i * Math.PI) / 6
        spin.add(spoke)
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.09, 12), this.metal)
      hub.rotation.z = Math.PI * 0.5
      spin.add(hub)
      pivot.add(spin)
      this.wheels.push(spin)
      this.wheelPivots.push(pivot)
      this.exterior.add(pivot)
    }
    this.bonnet = createBonnet(settings.vehicle, this.body, this.trim, software)
    this.firstPerson = this.bonnet.group
    this.group.add(this.exterior, this.firstPerson)
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = Array.isArray(object.material) || !object.material.transparent
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
    this.bonnet.update(speed, wheels.find((wheel) => wheel.front)?.steering ?? 0, night)
    for (let i = 0; i < wheels.length; i++) {
      const state = wheels[i],
        pivot = this.wheelPivots[i],
        wheel = this.wheels[i]
      if (!state || !pivot || !wheel) continue
      pivot.position.y = vehicleMetrics.motorcycle.wheelRadius + state.offset
      pivot.rotation.y = state.steering
      wheel.rotation.x = state.rotation
    }
    this.brake.emissiveIntensity = braking ? 3 : night ? 0.8 : 0.02
    this.lamp.emissiveIntensity = night ? 4 : 0.5
  }
  dispose() {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose()
    })
    for (const material of [
      this.body,
      this.glass,
      this.rubber,
      this.trim,
      this.metal,
      this.brake,
      this.lamp,
      ...this.bonnet.materials,
    ])
      material.dispose()
  }
}

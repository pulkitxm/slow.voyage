import * as THREE from 'three'
import { vehicleMetrics } from './vehicles'
import type { Settings, Vehicle } from './world'

function shell(rings: [number, number, number, number][], material: THREE.Material) {
  const p: number[] = [],
    indices: number[] = []
  for (const [y, width, back, front] of rings) {
    const c = 0.12
    p.push(
      -width + c,
      y,
      back,
      width - c,
      y,
      back,
      width,
      y,
      back - c,
      width,
      y,
      front + c,
      width - c,
      y,
      front,
      -width + c,
      y,
      front,
      -width,
      y,
      front + c,
      -width,
      y,
      back - c,
    )
  }
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < 8; i++) {
      const a = r * 8 + i,
        b = r * 8 + ((i + 1) % 8)
      indices.push(a, b, a + 8, b, b + 8, a + 8)
    }
  const end = (rings.length - 1) * 8
  for (let i = 1; i < 7; i++) indices.push(end, end + i, end + i + 1)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}
export class CarModel {
  group = new THREE.Group()
  wheels: THREE.Group[] = []
  frontWheels: THREE.Group[] = []
  materials: THREE.Material[] = []
  body: THREE.MeshStandardMaterial
  brake = new THREE.MeshStandardMaterial({
    color: '#841c18',
    emissive: '#ff3424',
    emissiveIntensity: 0.3,
  })
  lights = new THREE.MeshStandardMaterial({
    color: '#fff7de',
    emissive: '#fff2cc',
    emissiveIntensity: 0.4,
  })
  wheelSpin = 0
  wheelbase: number
  constructor(settings: Settings) {
    this.wheelbase = vehicleMetrics[settings.vehicle].wheelbase
    this.body = new THREE.MeshStandardMaterial({
      color: settings.color,
      metalness: 0.22,
      roughness: 0.31,
    })
    const glass = new THREE.MeshStandardMaterial({
      color: '#324849',
      metalness: 0.3,
      roughness: 0.18,
    })
    const black = new THREE.MeshStandardMaterial({ color: '#222724', roughness: 0.7 })
    const chrome = new THREE.MeshStandardMaterial({
      color: '#bec5c0',
      metalness: 0.8,
      roughness: 0.3,
    })
    const tire = new THREE.MeshStandardMaterial({ color: '#232422', roughness: 0.95 })
    const plate = new THREE.MeshStandardMaterial({ color: '#edebdb', roughness: 0.5 })
    this.materials = [this.body, this.brake, this.lights, glass, black, chrome, tire, plate]
    const isBus = settings.vehicle === 'bus',
      isRoadster = settings.vehicle === 'roadster'
    const width = isBus ? 1.18 : 0.94,
      back = isBus ? 3.3 : 2.23,
      front = isBus ? -3.3 : -2.23
    this.group.add(
      shell(
        [
          [0.38, width - 0.1, back - 0.06, front + 0.08],
          [0.6, width, back, front],
          [0.96, width - 0.02, back - 0.06, front + 0.1],
          [1.08, width - 0.09, back - 0.15, front + 0.22],
        ],
        this.body,
      ),
    )
    const box = (
      size: [number, number, number],
      position: [number, number, number],
      material: THREE.Material,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
      mesh.position.set(...position)
      this.group.add(mesh)
      return mesh
    }
    if (isBus) {
      box([2.28, 1.75, 6.3], [0, 1.85, 0], this.body)
      box([2.06, 0.94, 0.025], [0, 2.03, -3.17], glass)
      box([2.0, 0.8, 0.025], [0, 2.0, 3.17], glass)
      for (const side of [-1, 1])
        for (let i = 0; i < 5; i++)
          box([0.025, 0.87, 0.94], [side * 1.145, 2.02, -2.25 + i * 1.1], glass)
      box([2.3, 0.1, 6.32], [0, 2.76, 0], chrome)
    } else {
      const cabin = shell(
        [
          [1.065, 0.83, 1.13, -1.18],
          [isRoadster ? 1.48 : 1.66, 0.68, 0.58, -0.65],
        ],
        glass,
      )
      this.group.add(cabin)
      if (!isRoadster)
        this.group.add(
          shell(
            [
              [1.64, 0.7, 0.61, -0.68],
              [1.69, 0.64, 0.55, -0.62],
            ],
            this.body,
          ),
        )
      else box([1.4, 0.2, 0.86], [0, 1.33, 0.45], black)
      for (const side of [-1, 1]) {
        const pillar = box([0.065, 0.59, 0.065], [side * 0.75, 1.36, -0.92], this.body)
        pillar.rotation.x = 0.75
        const rear = box([0.11, 0.72, 0.07], [side * 0.76, 1.34, 0.87], this.body)
        rear.rotation.x = -0.68
        box([0.05, 0.54, 0.075], [side * 0.77, 1.35, 0.08], black)
        box([0.18, 0.12, 0.28], [side * 1.01, 1.13, -0.73], this.body)
        box([0.028, 0.035, 0.2], [side * 0.935, 1.0, 0.25], chrome)
      }
    }
    box([width * 1.8, 0.17, 0.06], [0, 0.55, back + 0.005], black)
    box([width * 1.7, 0.2, 0.04], [0, 0.56, front - 0.005], black)
    box([0.44, 0.13, 0.025], [0, 0.73, back + 0.02], plate)
    for (const side of [-1, 1]) {
      box([0.52, 0.13, 0.04], [side * (width - 0.33), 0.94, back - 0.035], this.brake)
      box([0.54, 0.09, 0.035], [side * (width - 0.33), 0.94, front + 0.06], this.lights)
    }
    const axles = [this.wheelbase / 2, -this.wheelbase / 2]
    for (const z of axles)
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group(),
          spin = new THREE.Group()
        pivot.position.set(side * (width - 0.025), 0.38, z)
        pivot.add(spin)
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 24), tire)
        wheel.rotation.z = Math.PI / 2
        spin.add(wheel)
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.25, 20), black)
        rim.rotation.z = Math.PI / 2
        spin.add(rim)
        for (let i = 0; i < 5; i++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.4), chrome)
          spoke.rotation.x = (i * Math.PI) / 5
          spin.add(spoke)
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.27, 12), chrome)
        hub.rotation.z = Math.PI / 2
        spin.add(hub)
        this.wheels.push(spin)
        if (z < 0) this.frontWheels.push(pivot)
        this.group.add(pivot)
      }
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
  }
  update(speed: number, steering: number, braking: boolean, night: boolean, dt: number) {
    this.wheelSpin -= (speed * dt) / 0.36
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelSpin
    for (const pivot of this.frontWheels) {
      const radius = Math.abs(steering) < 0.0001 ? Infinity : this.wheelbase / Math.tan(steering)
      pivot.rotation.y = Math.atan(this.wheelbase / (radius + pivot.position.x))
    }
    this.brake.emissiveIntensity = braking ? 3 : night ? 0.8 : 0.15
    this.lights.emissiveIntensity = night ? 4 : 0.5
  }
  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    for (const m of this.materials) m.dispose()
  }
}
export const vehicleNames: Record<Vehicle, string> = {
  touring: 'Grand tourer',
  roadster: 'Roadster',
  bus: 'Wanderer bus',
}

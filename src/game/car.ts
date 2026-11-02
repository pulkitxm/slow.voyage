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
    color: '#260e0c',
    emissive: '#ff3424',
    emissiveIntensity: 0.02,
  })
  lights = new THREE.MeshStandardMaterial({
    color: '#fff7de',
    emissive: '#fff2cc',
    emissiveIntensity: 0.4,
  })
  exteriorVisible = true
  wheelSpin = 0
  wheelbase: number
  wheelRadius: number
  constructor(settings: Settings) {
    const dimensions = vehicleMetrics[settings.vehicle]
    this.wheelbase = dimensions.wheelbase
    this.wheelRadius = dimensions.wheelRadius
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
    const width = isBus ? 1.18 : 0.823,
      back = isBus ? 3.3 : 2.02,
      front = isBus ? -3.3 : -2.06
    this.group.add(
      shell(
        isBus
          ? [
              [0.38, width - 0.1, back - 0.06, front + 0.08],
              [0.6, width, back, front],
              [0.96, width - 0.02, back - 0.06, front + 0.1],
              [1.08, width - 0.09, back - 0.15, front + 0.22],
            ]
          : [
              [0.24, width - 0.12, back - 0.1, front + 0.12],
              [0.48, width - 0.025, back, front],
              [0.79, width, back - 0.015, front + 0.04],
              [0.88, width - 0.09, back - 0.08, front + 0.19],
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
          [0.88, 0.712, 1.55, -0.85],
          [isRoadster ? 1.17 : 1.22, 0.55, 1.05, -0.04],
        ],
        glass,
      )
      this.group.add(cabin)
      if (!isRoadster)
        this.group.add(
          shell(
            [
              [1.205, 0.575, 1.07, -0.06],
              [1.23, 0.545, 1.025, -0.01],
            ],
            this.body,
          ),
        )
      else box([1.15, 0.12, 0.7], [0, 1.02, 0.76], black)
      const upright = new THREE.Vector3(0, 1, 0)
      const pillar = (start: THREE.Vector3, end: THREE.Vector3, width: number) => {
        const vector = end.clone().sub(start)
        const mesh = box([width, vector.length(), width], [0, 0, 0], this.body)
        mesh.position.copy(start).lerp(end, 0.5)
        mesh.quaternion.setFromUnitVectors(upright, vector.normalize())
      }
      for (const side of [-1, 1]) {
        pillar(
          new THREE.Vector3(side * 0.7, 0.89, -0.84),
          new THREE.Vector3(side * 0.55, 1.215, -0.035),
          0.045,
        )
        pillar(
          new THREE.Vector3(side * 0.7, 0.89, 1.54),
          new THREE.Vector3(side * 0.55, 1.215, 1.05),
          0.055,
        )
        box([0.03, 0.27, 0.045], [side * 0.63, 1.04, 0.56], black)
        box([0.085, 0.085, 0.2], [side * 0.78, 0.89, -0.58], this.body)
        box([0.022, 0.025, 0.14], [side * 0.817, 0.84, 0.47], chrome)
      }
    }
    const rearPanel = (points: [number, number][], material: THREE.Material, depth = 0.03) => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          points.flatMap(([x, y]) => {
            const rear =
              y >= 0.79
                ? back - 0.015 - ((y - 0.79) / 0.09) * 0.065
                : y >= 0.48
                  ? back - ((y - 0.48) / 0.31) * 0.015
                  : back - ((0.48 - y) / 0.24) * 0.1
            return [x, y, rear + depth]
          }),
          3,
        ),
      )
      let area = 0
      for (let i = 0; i < points.length; i++) {
        const current = points[i],
          next = points[(i + 1) % points.length]
        if (current && next) area += current[0] * next[1] - next[0] * current[1]
      }
      geometry.setIndex(area > 0 ? [0, 1, 2, 0, 2, 3] : [2, 1, 0, 3, 2, 0])
      geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, material)
      this.group.add(mesh)
    }
    if (isBus) {
      box([width * 1.8, 0.17, 0.06], [0, 0.55, back + 0.005], black)
      box([0.44, 0.13, 0.025], [0, 0.73, back + 0.02], plate)
    } else
      rearPanel(
        [
          [-0.72, 0.23],
          [0.72, 0.23],
          [0.65, 0.52],
          [-0.65, 0.52],
        ],
        black,
        0.035,
      )
    box([width * 1.7, 0.14, 0.04], [0, 0.42, front - 0.005], black)
    for (const side of [-1, 1]) {
      if (isBus) box([0.52, 0.13, 0.04], [side * (width - 0.33), 0.94, back - 0.035], this.brake)
      else {
        rearPanel(
          [
            [side * 0.29, 0.86],
            [side * 0.75, 0.86],
            [side * 0.71, 0.735],
            [side * 0.345, 0.735],
          ],
          black,
        )
        rearPanel(
          [
            [side * 0.33, 0.826],
            [side * 0.715, 0.826],
            [side * 0.695, 0.795],
            [side * 0.35, 0.795],
          ],
          this.brake,
          0.04,
        )
      }
      box(
        [0.45, 0.07, 0.035],
        [side * (width - 0.27), isBus ? 0.94 : 0.77, front + 0.06],
        this.lights,
      )
    }
    const axles = [this.wheelbase / 2, -this.wheelbase / 2]
    for (const z of axles)
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group(),
          spin = new THREE.Group()
        pivot.position.set(side * dimensions.trackWidth * 0.5, this.wheelRadius, z)
        pivot.add(spin)
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.2, 24),
          tire,
        )
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
  setExteriorVisible(visible: boolean) {
    if (this.exteriorVisible === visible) return
    this.exteriorVisible = visible
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.visible = visible
    })
  }
  update(speed: number, steering: number, braking: boolean, night: boolean, dt: number) {
    this.wheelSpin -= (speed * dt) / this.wheelRadius
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelSpin
    for (const pivot of this.frontWheels) {
      const radius = Math.abs(steering) < 0.0001 ? Infinity : this.wheelbase / Math.tan(steering)
      pivot.rotation.y = Math.atan(this.wheelbase / (radius + pivot.position.x))
    }
    this.brake.emissiveIntensity = braking ? 3 : night ? 0.8 : 0.02
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

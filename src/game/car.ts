import * as THREE from 'three'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import { createBonnet } from './bonnet'
import { createBusBody } from './bus-body'
import { busLayout } from './bus-layout'
import { carFrontDepth, carRearDepth, carSurface, createCarBody } from './car-body'
import { createCarCabin } from './car-cabin'
import { batchUntexturedMeshes } from './mesh-batch'
import type { WheelState } from './suspension'
import { vehicleMetrics } from './vehicles'
import type { Settings } from './world'

export class CarModel {
  group = new THREE.Group()
  exterior = new THREE.Group()
  firstPerson: THREE.Group
  bonnet: ReturnType<typeof createBonnet>
  wheels: THREE.Group[] = []
  wheelPivots: THREE.Group[] = []
  materials: THREE.Material[] = []
  body: THREE.MeshStandardMaterial
  brake = new THREE.MeshStandardMaterial({
    color: '#260e0c',
    emissive: '#ff3424',
    emissiveIntensity: 0.02,
  })
  lights = new THREE.MeshStandardMaterial({
    color: '#a9b2ad',
    emissive: '#fff2cc',
    emissiveIntensity: 0.12,
  })
  exteriorVisible = true
  wheelbase: number
  wheelRadius: number
  headlightPositions: [number, number, number][]
  cabinSteering: THREE.Object3D | undefined
  constructor(settings: Settings) {
    const dimensions = vehicleMetrics[settings.vehicle]
    this.wheelbase = dimensions.wheelbase
    this.wheelRadius = dimensions.wheelRadius
    this.body = new THREE.MeshPhysicalMaterial({
      color: settings.color,
      metalness: 0.12,
      roughness: 0.32,
      clearcoat: 0.8,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.9,
    })
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#6b6d70',
      metalness: 0,
      roughness: 0.18,
      clearcoat: 0.5,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.45,
      side: THREE.DoubleSide,
    })
    const black = new THREE.MeshStandardMaterial({ color: '#222724', roughness: 0.7 })
    const upholstery = new THREE.MeshStandardMaterial({ color: '#463e34', roughness: 0.94 })
    const diffuser = new THREE.MeshStandardMaterial({ color: '#303432', roughness: 0.88 })
    const chrome = new THREE.MeshStandardMaterial({
      color: '#bec5c0',
      metalness: 0.8,
      roughness: 0.3,
    })
    const tire = new THREE.MeshStandardMaterial({ color: '#232422', roughness: 0.95 })
    const wheelWell = new THREE.MeshStandardMaterial({
      color: '#151a18',
      roughness: 1,
      side: THREE.DoubleSide,
    })
    const plate = new THREE.MeshStandardMaterial({ color: '#edebdb', roughness: 0.5 })
    this.materials = [
      this.body,
      this.brake,
      this.lights,
      glass,
      black,
      upholstery,
      diffuser,
      chrome,
      tire,
      wheelWell,
      plate,
    ]
    const isBus = settings.vehicle === 'bus',
      isRoadster = settings.vehicle === 'roadster'
    this.headlightPositions = [-1, 1].map((side) =>
      isBus
        ? [side * busLayout.headlights.x, busLayout.headlights.y, busLayout.headlights.z]
        : [side * 0.553, 0.77, -2.06],
    )
    if (isBus) {
      this.exterior.add(
        createBusBody({
          paint: this.body,
          glass,
          trim: black,
          metal: chrome,
          well: wheelWell,
          brake: this.brake,
          lights: this.lights,
          plate,
        }),
      )
    } else {
      this.exterior.add(
        createCarBody(this.wheelbase, this.wheelRadius, this.body, black, wheelWell),
      )
      const cabin = createCarCabin(isRoadster, this.body, glass, black, upholstery)
      this.exterior.add(cabin)
      this.cabinSteering = cabin.getObjectByName('exterior-steering-wheel')
    }
    if (!isBus) {
      const rearSurface = (y: number, x: number) => carRearDepth(y, x, this.wheelbase)
      const endPanel = (
        points: [number, number][],
        material: THREE.Material,
        direction = 1,
        depth = 0.018,
      ) => {
        const mesh = carSurface(
          points.map(([x, y]) => [x, y, 0]),
          [0, 0, direction],
          material,
        )
        const geometry = new TessellateModifier(0.12, 5).modify(mesh.geometry)
        mesh.geometry.dispose()
        const positions = geometry.getAttribute('position')
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i),
            y = positions.getY(i)
          positions.setZ(
            i,
            (direction > 0 ? rearSurface(y, x) : carFrontDepth(y)) + direction * depth,
          )
        }
        geometry.computeVertexNormals()
        mesh.geometry = geometry
        this.exterior.add(mesh)
      }
      {
        const rows = [
          [0.38, 0.56],
          [0.44, 0.68],
          [0.5, 0.705],
          [0.56, 0.71],
          [0.65, 0.62],
        ] as const
        const geometry = new THREE.BufferGeometry()
        const fractions = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            rows.flatMap(([y, width]) =>
              fractions.flatMap((fraction) => {
                const x = width * fraction
                return [x, y, rearSurface(y, x) + 0.014]
              }),
            ),
            3,
          ),
        )
        const indices: number[] = []
        for (let i = 0; i < rows.length - 1; i++) {
          for (let j = 0; j < fractions.length - 1; j++) {
            const n = i * fractions.length + j,
              next = n + fractions.length
            indices.push(n, n + 1, next, n + 1, next + 1, next)
          }
        }
        geometry.setIndex(indices)
        geometry.computeVertexNormals()
        this.exterior.add(new THREE.Mesh(geometry, diffuser))
      }
      endPanel(
        [
          [-0.65, 0.25],
          [0.65, 0.25],
          [0.56, 0.43],
          [-0.56, 0.43],
        ],
        black,
        -1,
      )
      for (const side of [-1, 1]) {
        endPanel(
          [
            [side * 0.29, 0.856],
            [side * 0.75, 0.856],
            [side * 0.72, 0.786],
            [side * 0.325, 0.786],
          ],
          black,
        )
        endPanel(
          [
            [side * 0.32, 0.839],
            [side * 0.728, 0.839],
            [side * 0.71, 0.814],
            [side * 0.335, 0.814],
          ],
          this.brake,
          1,
          0.021,
        )
        endPanel(
          [
            [side * 0.31, 0.815],
            [side * 0.73, 0.815],
            [side * 0.72, 0.763],
            [side * 0.33, 0.763],
          ],
          black,
          -1,
        )
        endPanel(
          [
            [side * 0.335, 0.802],
            [side * 0.708, 0.802],
            [side * 0.701, 0.773],
            [side * 0.346, 0.773],
          ],
          this.lights,
          -1,
          0.021,
        )
      }
    }
    const axles = [this.wheelbase / 2, -this.wheelbase / 2]
    for (const z of axles)
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group(),
          spin = new THREE.Group()
        pivot.position.set(side * dimensions.trackWidth * 0.5, this.wheelRadius, z)
        pivot.add(spin)
        const wheel = new THREE.Mesh(
          new THREE.TorusGeometry(this.wheelRadius - 0.054, 0.054, 12, 32),
          tire,
        )
        wheel.rotation.y = Math.PI / 2
        wheel.scale.z = 1.7
        spin.add(wheel)
        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.235, 0.235, 0.16, 24, 1, true),
          chrome,
        )
        rim.rotation.z = Math.PI / 2
        spin.add(rim)
        for (const face of [-1, 1]) {
          const lip = new THREE.Mesh(new THREE.TorusGeometry(0.224, 0.011, 8, 24), chrome)
          lip.rotation.y = Math.PI / 2
          lip.position.x = face * 0.085
          spin.add(lip)
        }
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 24), black)
        disc.rotation.z = Math.PI / 2
        spin.add(disc)
        for (let i = 0; i < 5; i++) {
          const shape = new THREE.Shape()
          shape.moveTo(-0.035, 0.055)
          shape.lineTo(0.035, 0.055)
          shape.lineTo(0.1, 0.222)
          shape.lineTo(-0.055, 0.222)
          shape.closePath()
          const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 0.17,
            steps: 1,
            bevelEnabled: true,
            bevelSize: 0.004,
            bevelThickness: 0.004,
            bevelSegments: 1,
          })
          geometry.translate(0, 0, -0.085)
          geometry.rotateY(Math.PI / 2)
          const spoke = new THREE.Mesh(geometry, chrome)
          spoke.rotation.x = (i * Math.PI * 2) / 5
          spin.add(spoke)
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.195, 16), chrome)
        hub.rotation.z = Math.PI / 2
        spin.add(hub)
        batchUntexturedMeshes(spin)
        this.wheels.push(spin)
        this.wheelPivots.push(pivot)
        this.exterior.add(pivot)
      }
    if (this.cabinSteering instanceof THREE.Group) batchUntexturedMeshes(this.cabinSteering)
    batchUntexturedMeshes(this.exterior, [
      ...this.wheelPivots,
      ...(this.cabinSteering ? [this.cabinSteering] : []),
    ])
    this.bonnet = createBonnet(settings.vehicle, this.body, black)
    this.materials.push(...this.bonnet.materials)
    this.firstPerson = this.bonnet.group
    this.group.add(this.exterior, this.firstPerson)
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = o.material !== glass
        o.receiveShadow = true
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
    this.bonnet.update(speed, steering, night)
    if (this.cabinSteering) this.cabinSteering.rotation.z = steering * 2.2
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
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    for (const m of this.materials) m.dispose()
  }
}

import * as THREE from 'three'
import { carSurface } from './car-body'
import { createCarCanopy } from './car-canopy'

type Point = [number, number, number]

export function createCarCabin(
  open: boolean,
  paint: THREE.Material,
  glass: THREE.Material,
  trim: THREE.Material,
  upholstery: THREE.Material,
) {
  const group = new THREE.Group()
  group.name = 'cabin'
  const box = (size: Point, position: Point, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...position)
    group.add(mesh)
    return mesh
  }
  const glazing = (bottom: Point, top: Point, normal: Point) => {
    const frame: Point[] = [
      [-bottom[0], bottom[1], bottom[2]],
      bottom,
      top,
      [-top[0], top[1], top[2]],
    ]
    const row = (t: number, side: number): Point => [
      side * (THREE.MathUtils.lerp(bottom[0], top[0], t) - 0.027),
      THREE.MathUtils.lerp(bottom[1], top[1], t),
      THREE.MathUtils.lerp(bottom[2], top[2], t),
    ]
    const pane = [row(0.05, -1), row(0.05, 1), row(0.95, 1), row(0.95, -1)]
    group.add(carSurface(pane, normal, glass))
    const outward = new THREE.Vector3(0, bottom[2] - top[2], top[1] - bottom[1]).normalize()
    if (outward.dot(new THREE.Vector3(...normal)) < 0) outward.negate()
    const inner = (point: Point): Point => [
      point[0] - outward.x * 0.016,
      point[1] - outward.y * 0.016,
      point[2] - outward.z * 0.016,
    ]
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4
      const a = frame[i],
        b = frame[next],
        c = pane[next],
        d = pane[i]
      if (a && b && c && d) {
        group.add(carSurface([a, b, c, d], normal, paint))
        if (open) {
          group.add(
            carSurface(
              [inner(a), inner(b), inner(c), inner(d)],
              [0, -normal[1], -normal[2]],
              paint,
            ),
          )
          const edgeNormal: Point = [
            (a[0] + b[0]) / 2,
            (a[1] + b[1] - bottom[1] - top[1]) / 2,
            (a[2] + b[2] - bottom[2] - top[2]) / 2,
          ]
          group.add(carSurface([a, b, inner(b), inner(a)], edgeNormal, paint))
          group.add(
            carSurface(
              [d, c, inner(c), inner(d)],
              edgeNormal.map((value) => -value) as Point,
              paint,
            ),
          )
        }
      }
    }
  }
  if (open) glazing([0.71, 0.894, -0.95], [0.555, 1.22, -0.19], [0, 1, -1])
  else group.add(createCarCanopy(paint, glass, trim))
  for (const side of [-1, 1]) {
    box([0.12, 0.075, 0.22], [side * 0.78, 0.91, -0.64], paint)
    box([0.012, 0.052, 0.14], [side * 0.844, 0.91, -0.62], glass)
    box([0.022, 0.02, 0.13], [side * 0.806, 0.82, 0.15], trim)
    box([0.43, 0.11, 0.56], [side * 0.34, 0.435, -0.02], upholstery)
    const back = box([0.43, 0.51, 0.11], [side * 0.34, 0.72, 0.31], upholstery)
    back.rotation.x = 0.12
    box([0.24, 0.17, 0.095], [side * 0.34, 1.035, 0.365], upholstery)
  }
  box([1.24, 0.15, 0.2], [0, 0.765, -0.61], trim)
  box([0.15, 0.16, 0.65], [0, 0.41, -0.17], trim)
  const shifter = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.1, 8), trim)
  shifter.position.set(0, 0.54, -0.12)
  group.add(shifter)
  const steering = new THREE.Group()
  steering.name = 'exterior-steering-wheel'
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.014, 8, 24), trim)
  steering.add(rim)
  for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.115, 0.02), trim)
    spoke.position.set(Math.sin(angle) * 0.047, Math.cos(angle) * 0.047, 0)
    spoke.rotation.z = -angle
    steering.add(spoke)
  }
  const column = new THREE.Group()
  column.position.set(-0.34, 0.82, -0.39)
  column.rotation.x = -0.35
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 10), trim)
  shaft.rotation.x = Math.PI / 2
  shaft.position.z = -0.11
  column.add(shaft)
  column.add(steering)
  group.add(column)
  return group
}

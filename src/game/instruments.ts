import * as THREE from 'three'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import typeface from './instrument-typeface.json'

const font = new FontLoader().parse(typeface)

export function createInstrumentMaterials() {
  const face = new THREE.MeshStandardMaterial({ color: '#101a16', roughness: 0.88 })
  const ring = new THREE.MeshStandardMaterial({
    color: '#8d9891',
    metalness: 0.65,
    roughness: 0.45,
  })
  const markings = new THREE.MeshStandardMaterial({
    color: '#e0e8d7',
    emissive: '#a3c8b3',
    emissiveIntensity: 0.15,
    roughness: 0.9,
  })
  const pointer = new THREE.MeshStandardMaterial({
    color: '#f2b66d',
    emissive: '#e89e58',
    emissiveIntensity: 0.2,
    roughness: 0.7,
  })
  return {
    face,
    ring,
    markings,
    pointer,
    materials: [face, ring, markings, pointer],
    setNight(night: boolean) {
      markings.emissiveIntensity = night ? 0.8 : 0.15
      pointer.emissiveIntensity = night ? 0.8 : 0.2
    },
  }
}

export function createSpeedometer(
  radius: number,
  maximumKmH: number,
  theme: ReturnType<typeof createInstrumentMaterials>,
) {
  const group = new THREE.Group()
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.004, 48), theme.face)
  group.add(disc)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.035, 8, 48), theme.ring)
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.003
  group.add(rim)
  const label = (text: string, x: number, z: number, size: number) => {
    const geometry = new THREE.ShapeGeometry(font.generateShapes(text, size), 3)
    geometry.computeBoundingBox()
    const center = geometry.boundingBox?.getCenter(new THREE.Vector3())
    if (!center) throw new Error('Instrument label has no bounds')
    geometry.translate(-center.x, -center.y, 0)
    geometry.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geometry, theme.markings)
    mesh.position.set(x, 0.005, z)
    group.add(mesh)
  }
  const divisions = maximumKmH / 20
  for (let i = 0; i <= divisions * 4; i++) {
    const angle = (-2 / 3 + (i / (divisions * 4)) * (4 / 3)) * Math.PI
    const major = i % 4 === 0
    const mark = new THREE.Mesh(
      new THREE.BoxGeometry(radius * (major ? 0.03 : 0.016), 0.002, radius * (major ? 0.14 : 0.07)),
      theme.markings,
    )
    mark.position.set(Math.sin(angle) * radius * 0.85, 0.004, -Math.cos(angle) * radius * 0.85)
    mark.rotation.y = -angle
    group.add(mark)
    if (major && (maximumKmH <= 160 || i % 8 === 0 || i === divisions * 4))
      label(
        String((i / 4) * 20),
        Math.sin(angle) * radius * 0.59,
        -Math.cos(angle) * radius * 0.59,
        radius * 0.145,
      )
  }
  label('km/h', 0, radius * 0.34, radius * 0.11)
  const needle = new THREE.Group()
  needle.name = 'speed-needle'
  needle.position.y = 0.008
  const pointer = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 0.03, 0.002, radius * 0.8),
    theme.pointer,
  )
  pointer.position.z = -radius * 0.3
  needle.add(pointer)
  group.add(needle)
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.07, radius * 0.07, 0.006, 16),
    theme.ring,
  )
  hub.position.y = 0.009
  group.add(hub)
  return {
    group,
    needle,
    update(speed: number) {
      needle.rotation.y =
        (2 / 3 - (Math.min((Math.abs(speed) * 3.6) / maximumKmH, 1) * 4) / 3) * Math.PI
    },
  }
}

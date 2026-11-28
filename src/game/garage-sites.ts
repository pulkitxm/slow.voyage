import * as THREE from 'three'
import type { Trunk } from './collision'
import { buildGarage, type GarageMaterials, garageMaterials } from './garage-building'
import type { BayRig } from './garage-rig'
import { stepDoor } from './garage-rig'
import { type Garage, type GarageFrame, garageLayout, garagesNear } from './garages'
import type { World } from './world'

export const garageStreaming = { reach: 650, keep: 800 } as const

interface Built {
  garage: Garage
  group: THREE.Group
  trunks: Trunk[]
  frame: GarageFrame
  rig: BayRig
}

export class GarageSites {
  materials: GarageMaterials = garageMaterials()
  built = new Map<number, Built>()
  constructor(
    private scene: THREE.Scene,
    private world: World,
  ) {}
  refresh() {
    for (const site of this.built.values()) this.retire(site)
    this.built.clear()
  }
  update(s: number, dark: number, dt = 0) {
    for (const site of this.built.values()) stepDoor(site.rig, dt)
    for (const garage of garagesNear(this.world, s, garageStreaming.reach)) {
      if (Math.abs(garage.s - s) > garageStreaming.reach || this.built.has(garage.id)) continue
      const made = buildGarage(this.world, garage, this.materials)
      this.scene.add(made.group)
      this.built.set(garage.id, { garage, ...made })
    }
    for (const [id, site] of this.built)
      if (Math.abs(site.garage.s - s) > garageStreaming.keep) {
        this.retire(site)
        this.built.delete(id)
      }
    const { glass, glow, sign, pool } = this.materials
    glass.emissiveIntensity = dark * 0.9
    glow.emissiveIntensity = 0.6 + dark * 2.4
    sign.emissiveIntensity = 0.15 + dark * 1.1
    pool.opacity = dark * 0.16
  }
  site(garage: Garage) {
    return this.built.get(garage.id) ?? null
  }
  *trunksNear(s: number) {
    for (const site of this.built.values())
      if (Math.abs(site.garage.s - s) < garageLayout.clearing + 30) yield* site.trunks
  }
  private retire(site: Built) {
    site.group.removeFromParent()
    site.group.traverse((part) => {
      if (part instanceof THREE.Mesh) part.geometry.dispose()
    })
  }
  dispose() {
    this.refresh()
    const { body, glass, glow, sign, pool } = this.materials
    sign.map?.dispose()
    for (const material of [body, glass, glow, sign, pool]) material.dispose()
  }
}

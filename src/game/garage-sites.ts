import * as THREE from 'three'
import type { Trunk } from './collision'
import { worldLoop } from './field'
import { buildGarage, type GarageMaterials, garageMaterials } from './garage-building'
import { type Garage, type GarageFrame, garageLayout, lapGarages } from './garages'
import type { World } from './world'

export const garageStreaming = { reach: 650, keep: 800 } as const

interface Built {
  garage: Garage
  lap: number
  group: THREE.Group
  trunks: Trunk[]
  frame: GarageFrame
}

export class GarageSites {
  materials: GarageMaterials = garageMaterials()
  built = new Map<string, Built>()
  constructor(
    private scene: THREE.Scene,
    private world: World,
  ) {}
  refresh() {
    for (const site of this.built.values()) this.retire(site)
    this.built.clear()
  }
  update(s: number, dark: number) {
    const lap = Math.floor(s / worldLoop.length) * worldLoop.length
    for (const garage of lapGarages(this.world))
      for (const offset of [-worldLoop.length, 0, worldLoop.length]) {
        const along = garage.s + lap + offset
        if (Math.abs(along - s) > garageStreaming.reach) continue
        const key = `${garage.id}:${lap + offset}`
        if (this.built.has(key)) continue
        const made = buildGarage(this.world, garage, lap + offset, this.materials)
        this.scene.add(made.group)
        this.built.set(key, { garage, lap: lap + offset, ...made })
      }
    for (const [key, site] of this.built)
      if (Math.abs(site.garage.s + site.lap - s) > garageStreaming.keep) {
        this.retire(site)
        this.built.delete(key)
      }
    const { glass, glow, sign, pool } = this.materials
    glass.emissiveIntensity = dark * 0.9
    glow.emissiveIntensity = 0.6 + dark * 2.4
    sign.emissiveIntensity = 0.15 + dark * 1.1
    pool.opacity = dark * 0.16
  }
  site(garage: Garage, s: number) {
    let nearest: Built | null = null
    for (const site of this.built.values())
      if (
        site.garage.id === garage.id &&
        (!nearest ||
          Math.abs(site.garage.s + site.lap - s) < Math.abs(nearest.garage.s + nearest.lap - s))
      )
        nearest = site
    return nearest
  }
  *trunksNear(s: number) {
    for (const site of this.built.values())
      if (Math.abs(site.garage.s + site.lap - s) < garageLayout.clearing + 30) yield* site.trunks
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

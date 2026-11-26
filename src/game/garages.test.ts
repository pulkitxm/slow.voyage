import { describe, expect, it } from 'bun:test'
import { worldLoop } from './field'
import {
  garageClearing,
  garageFrame,
  garageLayout,
  garageOffset,
  garagePoint,
  lapGarages,
  nearestGarage,
} from './garages'
import { landscapeIds } from './landscapes'
import { guardrailAt, roadLayout } from './road'
import { defaults, shoreHeight, World } from './world'

describe('roadside garages', () => {
  it('places a few garages around every landscape on flat, unrailed ground', () => {
    for (const landscape of landscapeIds) {
      const world = new World({ ...defaults, landscape })
      const garages = lapGarages(world)
      expect(garages.length).toBeGreaterThanOrEqual(2)
      expect(garages.length).toBeLessThanOrEqual(garageLayout.count)
      for (const garage of garages) {
        expect(garage.s).toBeGreaterThanOrEqual(0)
        expect(garage.s).toBeLessThan(worldLoop.length)
        expect(garage.floor).toBeGreaterThan(shoreHeight)
        expect(garage.floor - world.road(garage.s).y).toBeLessThanOrEqual(garageLayout.rise + 0.1)
        for (let along = -25; along <= 25; along += 5)
          expect(guardrailAt(world, garage.s + along, garage.side)).toBe(false)
      }
    }
  })
  it('is the same garage list for the same road and seed', () => {
    const one = lapGarages(new World({ ...defaults, seed: 1234 }))
    const two = lapGarages(new World({ ...defaults, seed: 1234 }))
    expect(two).toEqual(one)
  })
  it('clears scenery on the forecourt but never on the road or the far side', () => {
    const world = new World(defaults)
    const garage = lapGarages(world)[0]
    if (!garage) throw new Error('No garage')
    const frame = garageFrame(world, garage)
    const yard = garagePoint(frame, 0, 8)
    expect(garageClearing(world, yard.x, yard.s)).toBe(true)
    const lap = garagePoint(frame, 0, 8)
    expect(garageClearing(world, lap.x, lap.s + worldLoop.length)).toBe(true)
    const road = world.road(garage.s)
    expect(garageClearing(world, road.x, garage.s)).toBe(false)
    const opposite = garagePoint({ ...frame, side: frame.side === 1 ? -1 : 1 }, 0, 8)
    expect(garageClearing(world, opposite.x, opposite.s)).toBe(false)
    expect(garageClearing(world, yard.x, yard.s + garageLayout.clearing + 40)).toBe(false)
  })
  it('finds the nearest garage across the lap seam', () => {
    const world = new World(defaults)
    const garage = lapGarages(world)[0]
    if (!garage) throw new Error('No garage')
    const found = nearestGarage(
      world,
      world.road(garage.s - 20).x,
      garage.s - 20 + worldLoop.length,
    )
    expect(found?.garage.id).toBe(garage.id)
    expect(found?.along).toBeCloseTo(20, 5)
    expect(garageOffset(garage, garage.s + worldLoop.length * 3)).toBeCloseTo(0, 5)
    expect(roadLayout.halfWidth).toBeLessThan(garageLayout.front)
  })
})

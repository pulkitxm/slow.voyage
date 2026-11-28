import { describe, expect, it } from 'bun:test'
import {
  garageClearing,
  garageFrame,
  garageLayout,
  garagePoint,
  garagesNear,
  nearestGarage,
  stretchGarage,
} from './garages'
import { landscapeIds } from './landscapes'
import { guardrailAt, roadLayout } from './road'
import { defaults, shoreHeight, World } from './world'

describe('roadside garages', () => {
  it('places garages along every landscape on flat, unrailed ground', () => {
    for (const landscape of landscapeIds) {
      const world = new World({ ...defaults, landscape })
      const garages = garagesNear(world, 6000, 6000)
      expect(garages.length).toBeGreaterThanOrEqual(2)
      for (const garage of garages) {
        const stretch = Math.floor(garage.s / garageLayout.stretch)
        expect(garage.id).toBe(stretch)
        expect(garage.floor).toBeGreaterThan(shoreHeight)
        expect(garage.floor - world.road(garage.s).y).toBeLessThanOrEqual(garageLayout.rise + 0.1)
        for (let along = -25; along <= 25; along += 5)
          expect(guardrailAt(world, garage.s + along, garage.side)).toBe(false)
      }
    }
  })
  it('keeps finding garages far along the endless road and behind the start', () => {
    const world = new World(defaults)
    expect(garagesNear(world, 240000, 6000).length).toBeGreaterThanOrEqual(2)
    expect(garagesNear(world, -9000, 6000).length).toBeGreaterThanOrEqual(2)
  })
  it('is the same garage for the same road, seed and stretch', () => {
    const one = stretchGarage(new World({ ...defaults, seed: 1234 }), 7)
    const two = stretchGarage(new World({ ...defaults, seed: 1234 }), 7)
    expect(two).toEqual(one)
  })
  it('clears scenery on the forecourt but never on the road or the far side', () => {
    const world = new World(defaults)
    const garage = garagesNear(world, 6000, 6000)[0]
    if (!garage) throw new Error('No garage')
    const frame = garageFrame(world, garage)
    const yard = garagePoint(frame, 0, 8)
    expect(garageClearing(world, yard.x, yard.s)).toBe(true)
    const road = world.road(garage.s)
    expect(garageClearing(world, road.x, garage.s)).toBe(false)
    const opposite = garagePoint({ ...frame, side: frame.side === 1 ? -1 : 1 }, 0, 8)
    expect(garageClearing(world, opposite.x, opposite.s)).toBe(false)
    expect(garageClearing(world, yard.x, yard.s + garageLayout.clearing + 40)).toBe(false)
  })
  it('finds the nearest garage and how far ahead it is', () => {
    const world = new World(defaults)
    const garage = garagesNear(world, 6000, 6000)[0]
    if (!garage) throw new Error('No garage')
    const found = nearestGarage(world, world.road(garage.s - 20).x, garage.s - 20)
    expect(found?.garage.id).toBe(garage.id)
    expect(found?.along).toBeCloseTo(20, 5)
    expect(roadLayout.halfWidth).toBeLessThan(garageLayout.front)
  })
})

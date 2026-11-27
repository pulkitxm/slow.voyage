import { describe, expect, test } from 'bun:test'
import { brakeHeat, brakeShare, brakeSpecs, brakeTypes, heatBrakes, vehicleBrakes } from './brakes'

describe('brakes', () => {
  test('stronger brake types bite harder and fade less', () => {
    const order = ['drum', 'disc', 'vented', 'sport', 'ceramic', 'carbon'] as const
    expect([...brakeTypes]).toEqual([...order])
    for (const [index, type] of order.entries()) {
      const next = order[index + 1]
      if (!next) continue
      expect(brakeSpecs[next].grip).toBeGreaterThan(brakeSpecs[type].grip)
      expect(brakeSpecs[next].fade).toBeLessThanOrEqual(brakeSpecs[type].fade)
    }
  })

  test('hard stops heat the brakes and rest cools them', () => {
    let heat = 0
    for (let step = 0; step < 300; step++) heat = heatBrakes(heat, 10, 40, 1 / 60)
    expect(heat).toBeGreaterThan(brakeHeat.fadeFrom)
    let cooled = heat
    for (let step = 0; step < 60 * 60; step++) cooled = heatBrakes(cooled, 0, 30, 1 / 60)
    expect(cooled).toBeLessThan(heat * 0.1)
    expect(heatBrakes(0.3, 0, 0, 1)).toBeLessThan(0.3)
  })

  test('drums fade when hot, ceramics barely do', () => {
    expect(brakeShare('drum', 0)).toBe(1)
    expect(brakeShare('drum', 2)).toBeCloseTo(1 - brakeSpecs.drum.fade, 5)
    expect(brakeShare('ceramic', 2)).toBeGreaterThan(0.9)
    expect(brakeShare('drum', 2)).toBeLessThan(brakeShare('vented', 2))
  })

  test('carbon racing brakes need heat to bite fully', () => {
    expect(brakeShare('carbon', 0)).toBeCloseTo(brakeSpecs.carbon.cold, 5)
    expect(brakeShare('carbon', brakeHeat.warmBy)).toBe(1)
    expect(brakeShare('carbon', 2)).toBe(1)
  })

  test('every game vehicle has a brake type', () => {
    for (const type of Object.values(vehicleBrakes)) expect(brakeTypes).toContain(type)
  })
})

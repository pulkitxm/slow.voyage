import { expect, test } from 'bun:test'
import { worldLoop } from './field'
import { mapPlace, worldMapLayout } from './world-map'

test('map places wrap along the lap and across the side seam', () => {
  const cell = worldMapLayout.cell
  expect(mapPlace(0, 0)).toEqual({ u: 0, v: worldLoop.width / 2 / cell })
  expect(mapPlace(0, worldLoop.length * 3 + 450).u).toBeCloseTo(450 / cell, 9)
  expect(mapPlace(0, -150).u).toBeCloseTo((worldLoop.length - 150) / cell, 9)
  expect(mapPlace(worldLoop.width / 2 + 30, 0).v).toBeCloseTo(30 / cell, 9)
  expect(mapPlace(-worldLoop.width / 2 - 30, 0).v).toBeCloseTo((worldLoop.width - 30) / cell, 9)
  expect(worldLoop.length % cell).toBe(0)
  expect(worldLoop.width % cell).toBe(0)
})

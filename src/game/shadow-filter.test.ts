import { expect, test } from 'bun:test'
import { ShaderChunk } from 'three'
import { planeFittedShadows, planeSlope, shadowPlane } from './shadow-filter'

const original = ShaderChunk.shadowmap_pars_fragment

test('every soft shadow sample follows the slope of the surface it lands on', () => {
  const fitted = planeFittedShadows(original)
  expect(fitted).not.toBe(original)
  expect(fitted.match(/planeShadow\( shadowMap, shadowCoord\.xyz, vogelDiskSample/g)).toHaveLength(
    5,
  )
  expect(fitted).not.toMatch(/vogelDiskSample\( \d, 5, phi \) \* radius, shadowCoord\.z \)/)
  expect(fitted).toContain('dFdx( shadowCoord.xyz )')
})

test('the other shadow filters are left as three ships them', () => {
  const fitted = planeFittedShadows(original)
  const tail = (chunk: string) => chunk.slice(chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )'))
  expect(tail(fitted)).toBe(tail(original))
  expect(planeFittedShadows(fitted)).toBe(fitted)
})

test('the fitted slope reproduces the depth of a tilted panel at any offset', () => {
  const tilt = { u: 0.37, v: -0.82 }
  const depth = (u: number, v: number) => 0.4 + tilt.u * u + tilt.v * v
  const step = (u: number, v: number): [number, number, number] => [u, v, depth(u, v) - depth(0, 0)]
  const slope = planeSlope(step(0.003, 0.001), step(-0.0007, 0.0021))
  expect(slope[0]).toBeCloseTo(tilt.u, 9)
  expect(slope[1]).toBeCloseTo(tilt.v, 9)
  for (const reach of [
    { u: 0.002, v: 0.001 },
    { u: -0.0015, v: 0.0024 },
  ]) {
    expect(depth(0, 0) + slope[0] * reach.u + slope[1] * reach.v).toBeCloseTo(
      depth(reach.u, reach.v),
      9,
    )
  }
})

test('a panel seen edge on from the light falls back to no slope instead of blowing up', () => {
  expect(planeSlope([0.002, 0.001, 0.3], [0.004, 0.002, 0.1])).toEqual([0, 0])
  expect(shadowPlane.limit).toBeLessThan(0.02)
})

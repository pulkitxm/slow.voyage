import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { grassGeometry } from './grass'
import { groundGeometry } from './ground'
import { groundLayout } from './ground-grid'
import { GroundSampler } from './ground-sample'
import { RoamingMeadow, roamingLayout } from './roaming-meadow'
import { defaults, World } from './world'

function fixture() {
  const world = new World({ ...defaults })
  const samplers = new Map<number, GroundSampler>()
  const geometries: THREE.BufferGeometry[] = []
  const sampler = (s: number) => {
    const id = Math.floor(s / groundLayout.tileLength)
    let found = samplers.get(id)
    if (!found) {
      const geometry = groundGeometry(
        world,
        id * groundLayout.tileLength,
        new THREE.Color(),
        new THREE.Color(),
      )
      geometries.push(geometry)
      found = new GroundSampler(geometry, id * groundLayout.tileLength, groundLayout.fullRows)
      samplers.set(id, found)
    }
    return found
  }
  const blade = grassGeometry()
  const material = new THREE.MeshBasicMaterial()
  const meadow = new RoamingMeadow(blade, material, 6000, world, sampler, {
    base: new THREE.Color('#7b9145'),
    light: new THREE.Color('#afbd70'),
  })
  const settle = (x: number, s: number) => {
    for (let frame = 0; frame < 20; frame++) meadow.update(x, s)
  }
  const blades = () => {
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const result: THREE.Vector3[] = []
    for (let index = 0; index < meadow.mesh.count; index++) {
      meadow.mesh.getMatrixAt(index, matrix)
      if (matrix.elements[0] === 0 && matrix.elements[5] === 0) continue
      result.push(position.setFromMatrixPosition(matrix).clone())
    }
    return result
  }
  const dispose = () => {
    meadow.dispose()
    blade.dispose()
    material.dispose()
    for (const geometry of geometries) geometry.dispose()
  }
  return { world, meadow, sampler, settle, blades, dispose }
}

test('roaming meadow fills open country around the car and sits on the rendered ground', () => {
  const { world, sampler, settle, blades, dispose } = fixture()
  const s = 900
  const x = world.road(s).x - 220
  settle(x, s)
  const placed = blades()
  expect(placed.length).toBeGreaterThan(2000)
  const reach = (roamingLayout.span / 2 + 1) * roamingLayout.cell
  for (const blade of placed) {
    const bladeS = -blade.z
    expect(Math.abs(blade.x - x)).toBeLessThan(reach)
    expect(Math.abs(bladeS - s)).toBeLessThan(reach)
    const ground = sampler(bladeS)?.sample(blade.x, bladeS) ?? Number.NaN
    expect(blade.y).toBeCloseTo(ground - 0.025, 4)
  }
  dispose()
})

test('roaming meadow leaves the roadside band to the road tiles', () => {
  const { world, settle, blades, dispose } = fixture()
  for (const s of [0, 450, 900]) {
    settle(world.road(s).x, s)
    for (const blade of blades())
      expect(Math.abs(blade.x - world.road(-blade.z).x)).toBeGreaterThanOrEqual(
        roamingLayout.roadsideStart,
      )
  }
  dispose()
})

test('roaming meadow is deterministic and only rebuilds cells entering the window', () => {
  const { world, meadow, settle, blades, dispose } = fixture()
  const s = 905
  const x = world.road(s).x - 205
  settle(x, s)
  const before = blades()
    .map((blade) => `${blade.x.toFixed(3)},${blade.z.toFixed(3)}`)
    .sort()
  const updates: number[] = []
  const original = meadow.mesh.setMatrixAt.bind(meadow.mesh)
  meadow.mesh.setMatrixAt = (index, matrix) => {
    updates.push(index)
    return original(index, matrix)
  }
  meadow.update(x + roamingLayout.cell, s)
  const perCell = Math.floor(6000 / (roamingLayout.span * roamingLayout.span))
  expect(updates.length).toBe(perCell * roamingLayout.span)
  meadow.mesh.setMatrixAt = original
  settle(x, s)
  const after = blades()
    .map((blade) => `${blade.x.toFixed(3)},${blade.z.toFixed(3)}`)
    .sort()
  expect(after).toEqual(before)
  dispose()
})

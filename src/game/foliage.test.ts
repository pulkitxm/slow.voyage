import { expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  autumnLeaf,
  evergreenTile,
  leafy,
  snowDusted,
  treePhotos,
  treeTint,
  treeVariety,
} from './foliage'

const light = (colour: readonly number[]) =>
  0.3 * (colour[0] ?? 0) + 0.59 * (colour[1] ?? 0) + 0.11 * (colour[2] ?? 0)

test('every tree tile has a photographed tree and the conifer keeps its own tile', () => {
  expect(treePhotos.length).toBe(6)
  expect(new Set(treePhotos).size).toBe(6)
  for (const url of treePhotos) expect(url).toMatch(/\.webp$/)
  expect(treePhotos[evergreenTile]).toContain('conifer')
})

test('only green foliage counts as leaf, never bark or shadowed wood', () => {
  expect(leafy(70, 110, 40)).toBe(true)
  expect(leafy(40, 60, 30)).toBe(true)
  expect(leafy(120, 100, 80)).toBe(false)
  expect(leafy(90, 85, 80)).toBe(false)
  expect(leafy(60, 70, 68)).toBe(false)
})

test('autumn turns leaves from yellow to rust at about the same brightness and leaves bark alone', () => {
  const bark = autumnLeaf(120, 100, 80, 0.5)
  expect(bark).toEqual([120, 100, 80])
  for (const mix of [0, 0.5, 1]) {
    const turned = autumnLeaf(70, 110, 40, mix)
    expect(turned[0]).toBeGreaterThan(turned[1])
    expect(turned[1]).toBeGreaterThan(turned[2])
    expect(light(turned) / light([70, 110, 40])).toBeGreaterThan(1)
    expect(light(turned) / light([70, 110, 40])).toBeLessThan(1.3)
  }
  const yellow = autumnLeaf(70, 110, 40, 0)
  const rust = autumnLeaf(70, 110, 40, 1)
  expect(rust[0] / rust[1]).toBeGreaterThan((yellow[0] / yellow[1]) * 1.5)
})

test('snow lightens needles in proportion to its cover and never darkens them', () => {
  expect(snowDusted(40, 70, 40, 0)).toEqual([40, 70, 40])
  const light = snowDusted(40, 70, 40, 0.3)
  const heavy = snowDusted(40, 70, 40, 1)
  for (const channel of [0, 1, 2]) {
    expect(light[channel] ?? 0).toBeGreaterThan([40, 70, 40][channel] ?? 0)
    expect(heavy[channel] ?? 0).toBeGreaterThan(light[channel] ?? 0)
    expect(heavy[channel] ?? 0).toBeLessThan(240)
  }
  expect(snowDusted(40, 70, 40, 5)).toEqual(heavy)
})

test('each tree takes its own slight warm or cool cast around its shade', () => {
  const color = new THREE.Color()
  const hues = new Set<string>()
  for (let tree = 0; tree < 40; tree++) {
    treeTint(color, 1, tree * 0.137, tree * 0.291)
    expect(color.g).toBe(1)
    expect(Math.abs(color.r - 1)).toBeLessThanOrEqual(treeVariety.warm + 1e-9)
    expect(Math.abs(color.b - 1)).toBeLessThanOrEqual(treeVariety.cool + 1e-9)
    hues.add(`${color.r.toFixed(2)}/${color.b.toFixed(2)}`)
  }
  expect(hues.size).toBeGreaterThan(20)
  expect(treeTint(color, 0.5, 0.5, 0.5).g).toBe(0.5)
})

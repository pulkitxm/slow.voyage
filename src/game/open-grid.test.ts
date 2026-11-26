import { expect, test } from 'bun:test'
import {
  chooseShown,
  nodeContains,
  nodeDistance,
  nodeKey,
  nodeSize,
  type OpenNode,
  openLayout,
  openSurface,
  parentNode,
  selectNodes,
} from './open-grid'
import { random } from './world'

function covering(nodes: OpenNode[], x: number, s: number) {
  return nodes.filter((node) => {
    const size = nodeSize(node.level)
    return (
      x >= node.column * size &&
      x < (node.column + 1) * size &&
      s >= node.row * size &&
      s < (node.row + 1) * size
    )
  })
}

test('chosen ground nodes cover everything within reach exactly once, wherever the car is', () => {
  const rng = random(11)
  for (const [x, s] of [
    [0, 0],
    [31.9, 64],
    [-5120, 77000.5],
    [912345.6, -40960],
  ] as const) {
    const nodes = selectNodes(x, s)
    expect(new Set(nodes.map(nodeKey)).size).toBe(nodes.length)
    for (let sample = 0; sample < 400; sample++) {
      const angle = rng() * Math.PI * 2
      const radius = rng() * (openLayout.reach - 1)
      const over = covering(nodes, x + Math.cos(angle) * radius, s + Math.sin(angle) * radius)
      expect(over.length).toBe(1)
    }
  }
})

test('the finest ground sits under the car and detail falls away with distance', () => {
  const nodes = selectNodes(1000.5, 5000.5)
  const under = covering(nodes, 1000.5, 5000.5)[0]
  expect(under?.level).toBe(0)
  for (const node of nodes) {
    const distance = nodeDistance(node, 1000.5, 5000.5)
    if (node.level > 0)
      expect(distance).toBeGreaterThanOrEqual(nodeSize(node.level) * openLayout.detail)
    expect(distance).toBeLessThanOrEqual(openLayout.reach)
  }
  const levels = new Set(nodes.map((node) => node.level))
  expect(levels.size).toBe(openLayout.levels)
  expect(nodes.length).toBeLessThan(260)
})

test('moving a short way keeps most of the chosen nodes', () => {
  const before = new Set(selectNodes(300, 900).map(nodeKey))
  const after = selectNodes(302, 903).map(nodeKey)
  const kept = after.filter((key) => before.has(key)).length
  expect(kept / after.length).toBeGreaterThan(0.9)
})

test('parents contain their children and nothing else', () => {
  const child = { level: 1, column: -3, row: 7 }
  const parent = parentNode(child)
  expect(parent).toEqual({ level: 2, column: -2, row: 3 })
  expect(nodeContains(parent, child)).toBe(true)
  expect(nodeContains(child, parent)).toBe(false)
  expect(nodeContains(parent, { level: 1, column: -5, row: 7 })).toBe(false)
  expect(nodeContains(parent, { level: 0, column: -5, row: 14 })).toBe(true)
})

test('the open surface follows the two metre grid triangles', () => {
  const plane = { height: (x: number, s: number) => 3 + x * 0.25 - s * 0.5 }
  for (const [x, s] of [
    [0.3, 0.4],
    [1.7, 1.9],
    [-3.2, 100.1],
    [5000.9, -7.7],
  ] as const) {
    const surface = openSurface(plane, x, s)
    expect(surface.height).toBeCloseTo(plane.height(x, s), 4)
    expect(surface.slopeX).toBeCloseTo(0.25, 5)
    expect(surface.slopeS).toBeCloseTo(-0.5, 5)
  }
  const bumpy = { height: (x: number, s: number) => Math.sin(x * 0.3) * 2 + Math.cos(s * 0.21) * 3 }
  const step = openLayout.leaf / openLayout.cells
  for (const [column, row] of [
    [0, 0],
    [4, -9],
    [-120, 33],
  ] as const) {
    const x = column * step
    const s = row * step
    expect(openSurface(bumpy, x, s).height).toBeCloseTo(bumpy.height(x, s), 4)
    for (const [dx, ds] of [
      [1e-6, 0.7],
      [0.7, 1e-6],
      [1, 1],
    ] as const) {
      const here = openSurface(bumpy, x + dx, s + ds).height
      const across = openSurface(bumpy, x + dx - 2e-6 * Math.sign(dx - 0.5), s + ds).height
      expect(Math.abs(here - across)).toBeLessThan(1e-3)
    }
  }
})

function built(nodes: OpenNode[]) {
  return new Map(nodes.map((node) => [nodeKey(node), node]))
}

test('ground that is not ready yet is covered by what was already showing', () => {
  const parent = { level: 2, column: 0, row: 0 }
  const children = [0, 1, 2, 3].map((index) => ({
    level: 1,
    column: index % 2,
    row: Math.floor(index / 2),
  }))
  const waiting = chooseShown(children, built([parent, ...children.slice(0, 3)]), new Set())
  expect([...waiting.show]).toEqual([nodeKey(parent)])
  expect(waiting.build).toEqual(children.slice(3))
  const ready = chooseShown(children, built([parent, ...children]), waiting.show)
  expect([...ready.show].sort()).toEqual(children.map(nodeKey).sort())
  expect(ready.build).toEqual([])
  const merging = chooseShown([parent], built(children), ready.show)
  expect([...merging.show].sort()).toEqual(children.map(nodeKey).sort())
  expect(merging.build).toEqual([parent])
  const merged = chooseShown([parent], built([parent, ...children]), merging.show)
  expect([...merged.show]).toEqual([nodeKey(parent)])
})

test('a drive never shows overlapping ground or leaves a gap once nodes are built', () => {
  let shown = new Set<string>()
  const ready = new Map<string, OpenNode>()
  const rng = random(5)
  let x = 0
  let s = 0
  for (let frame = 0; frame < 1500; frame++) {
    x += (rng() - 0.3) * 3
    s += 1.5
    const wanted = selectNodes(x, s)
    const { show, build } = chooseShown(wanted, ready, shown)
    for (const node of build.slice(0, 2)) ready.set(nodeKey(node), node)
    const nodes = [...show].map((key) => ready.get(key)).filter((node) => node !== undefined)
    for (const a of nodes)
      for (const b of nodes) if (a !== b) expect(nodeContains(a, b)).toBe(false)
    if (frame > 150) {
      const over = covering(nodes, x, s)
      expect(over.length).toBe(1)
    }
    shown = show
  }
})

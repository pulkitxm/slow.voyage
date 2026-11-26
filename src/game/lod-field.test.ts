import { expect, test } from 'bun:test'
import { LodField } from './lod-field'
import { nodeKey, type OpenNode } from './open-grid'

const layout = { leaf: 64, levels: 3, detail: 1.2, reach: 400 }

function field() {
  const live = new Map<string, { node: OpenNode; visible: boolean }>()
  let started = 0
  const lod = new LodField<string>(
    layout,
    function* (node) {
      started++
      yield
      yield
      const key = nodeKey(node)
      live.set(key, { node, visible: false })
      return key
    },
    (key, visible) => {
      const entry = live.get(key)
      if (entry) entry.visible = visible
    },
    (key) => {
      live.delete(key)
    },
  )
  return { lod, live, builds: () => started }
}

test('a field builds what is wanted, nearest first, and shows it on the next update', () => {
  const { lod, live } = field()
  lod.update(10, 10)
  expect(lod.pending).toBeGreaterThan(10)
  expect(lod.work(performance.now() - 1)).toBe(false)
  expect(live.size).toBe(0)
  expect(lod.work(Number.POSITIVE_INFINITY)).toBe(true)
  expect(live.size).toBe(lod.pending)
  expect([...live.values()].some((entry) => entry.visible)).toBe(false)
  expect(lod.at(10, 10)).toBe(null)
  lod.update(10, 10)
  expect(lod.pending).toBe(0)
  expect([...live.values()].every((entry) => entry.visible)).toBe(true)
  expect(lod.at(10, 10)).toBe(nodeKey({ level: 0, column: 0, row: 0 }))
  expect([...lod.visible(0)].length).toBeGreaterThan(3)
  expect([...lod.visible()].length).toBe(live.size)
})

test('a build that takes several steps resumes where it stopped', () => {
  const { lod, live, builds } = field()
  lod.update(0, 0)
  const wanted = lod.pending
  let rounds = 0
  while (!lod.work(performance.now() - 1)) rounds++
  expect(rounds).toBeGreaterThanOrEqual(wanted)
  expect(builds()).toBe(wanted)
  expect(live.size).toBe(wanted)
})

test('ground left behind is dropped after a short wait and the rest is kept', () => {
  const { lod, live } = field()
  lod.linger = 5
  lod.update(0, 0)
  lod.work(Number.POSITIVE_INFINITY)
  lod.update(0, 0)
  const first = new Set(live.keys())
  for (let frame = 0; frame < 12; frame++) {
    lod.update(5000, 0)
    lod.work(Number.POSITIVE_INFINITY)
  }
  for (const key of first) expect(live.has(key)).toBe(false)
  expect(live.size).toBeGreaterThan(10)
  expect([...live.values()].every((entry) => entry.visible)).toBe(true)
  const settled = live.size
  for (let frame = 0; frame < 12; frame++) {
    lod.update(5000, 0)
    lod.work(Number.POSITIVE_INFINITY)
  }
  expect(live.size).toBe(settled)
  lod.clear()
  expect(live.size).toBe(0)
  expect(lod.pending).toBe(0)
})

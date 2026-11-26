export interface GridLayout {
  leaf: number
  levels: number
  detail: number
  reach: number
}

export const openLayout = {
  cells: 32,
  leaf: 64,
  levels: 5,
  detail: 1.2,
  reach: 2600,
  overlap: 3,
} as const

export interface OpenNode {
  level: number
  column: number
  row: number
}

export function nodeSize(level: number, leaf: number = openLayout.leaf) {
  return leaf * 2 ** level
}

export function nodeKey(node: OpenNode) {
  return `${node.level}/${node.column}/${node.row}`
}

export function nodeDistance(node: OpenNode, x: number, s: number, leaf: number = openLayout.leaf) {
  const size = nodeSize(node.level, leaf)
  const left = node.column * size
  const near = node.row * size
  const dx = Math.max(left - x, 0, x - left - size)
  const ds = Math.max(near - s, 0, s - near - size)
  return Math.hypot(dx, ds)
}

export function parentNode(node: OpenNode): OpenNode {
  return {
    level: node.level + 1,
    column: Math.floor(node.column / 2),
    row: Math.floor(node.row / 2),
  }
}

export function nodeContains(outer: OpenNode, inner: OpenNode) {
  if (inner.level >= outer.level) return false
  const shift = 2 ** (outer.level - inner.level)
  return (
    Math.floor(inner.column / shift) === outer.column && Math.floor(inner.row / shift) === outer.row
  )
}

export function selectNodes(x: number, s: number, layout: GridLayout = openLayout) {
  const { leaf, levels, detail, reach } = layout
  const chosen: OpenNode[] = []
  const top = levels - 1
  const size = nodeSize(top, leaf)
  const visit = (node: OpenNode) => {
    const distance = nodeDistance(node, x, s, leaf)
    if (distance > reach) return
    if (node.level === 0 || distance >= nodeSize(node.level, leaf) * detail) {
      chosen.push(node)
      return
    }
    for (let row = 0; row < 2; row++)
      for (let column = 0; column < 2; column++)
        visit({ level: node.level - 1, column: node.column * 2 + column, row: node.row * 2 + row })
  }
  for (let row = Math.floor((s - reach) / size); row <= Math.floor((s + reach) / size); row++)
    for (
      let column = Math.floor((x - reach) / size);
      column <= Math.floor((x + reach) / size);
      column++
    )
      visit({ level: top, column, row })
  return chosen
}

interface HeightField {
  height(x: number, s: number): number
}

export function openSurface(field: HeightField, x: number, s: number) {
  const step = openLayout.leaf / openLayout.cells
  const column = Math.floor(x / step)
  const row = Math.floor(s / step)
  const x0 = column * step
  const s0 = row * step
  const u = (x - x0) / step
  const v = (s - s0) / step
  const hB = Math.fround(field.height(x0 + step, s0))
  const hC = Math.fround(field.height(x0, s0 + step))
  if (u + v <= 1) {
    const hA = Math.fround(field.height(x0, s0))
    return {
      height: hA + (hB - hA) * u + (hC - hA) * v,
      slopeX: (hB - hA) / step,
      slopeS: (hC - hA) / step,
    }
  }
  const hD = Math.fround(field.height(x0 + step, s0 + step))
  return {
    height: hD + (hC - hD) * (1 - u) + (hB - hD) * (1 - v),
    slopeX: (hD - hC) / step,
    slopeS: (hD - hB) / step,
  }
}

export interface Showing {
  show: Set<string>
  build: OpenNode[]
}

export function chooseShown(
  wanted: OpenNode[],
  built: Map<string, OpenNode>,
  shown: Set<string>,
  levels: number = openLayout.levels,
): Showing {
  const show = new Set<string>()
  const build: OpenNode[] = []
  const holding: OpenNode[] = []
  for (const node of wanted) {
    const key = nodeKey(node)
    if (built.has(key)) {
      show.add(key)
      continue
    }
    build.push(node)
    let ancestor = parentNode(node)
    let held = false
    while (ancestor.level < levels) {
      if (built.has(nodeKey(ancestor))) {
        show.add(nodeKey(ancestor))
        holding.push(ancestor)
        held = true
        break
      }
      ancestor = parentNode(ancestor)
    }
    if (held) continue
    for (const candidate of shown) {
      const inner = built.get(candidate)
      if (inner && nodeContains(node, inner)) show.add(candidate)
    }
  }
  if (holding.length)
    for (const key of [...show]) {
      const node = built.get(key)
      if (node && holding.some((outer) => nodeContains(outer, node))) show.delete(key)
    }
  return { show, build }
}

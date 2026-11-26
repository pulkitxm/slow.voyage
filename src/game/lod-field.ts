import {
  chooseShown,
  type GridLayout,
  nodeDistance,
  nodeKey,
  nodeSize,
  type OpenNode,
  selectNodes,
} from './open-grid'

interface Tile<T> {
  node: OpenNode
  item: T
  idle: number
}

interface Build<T> {
  node: OpenNode
  steps: Generator<undefined, T, undefined>
}

export class LodField<T> {
  private tiles = new Map<string, Tile<T>>()
  private nodes = new Map<string, OpenNode>()
  private shown = new Set<string>()
  private builds = new Map<string, Build<T>>()
  private queue: OpenNode[] = []
  linger = 90

  constructor(
    public layout: GridLayout,
    private make: (node: OpenNode) => Generator<undefined, T, undefined>,
    private show: (item: T, visible: boolean) => void,
    private drop: (item: T) => void,
  ) {}

  get pending() {
    return this.queue.length
  }

  update(x: number, s: number) {
    const wanted = selectNodes(x, s, this.layout)
    const { show, build } = chooseShown(wanted, this.nodes, this.shown, this.layout.levels)
    const wantedKeys = new Set(wanted.map(nodeKey))
    for (const [key, tile] of this.tiles) {
      this.show(tile.item, show.has(key))
      if (show.has(key) || wantedKeys.has(key)) tile.idle = 0
      else if (++tile.idle > this.linger) this.remove(key, tile)
    }
    for (const key of this.builds.keys()) if (!wantedKeys.has(key)) this.builds.delete(key)
    this.shown = show
    const leaf = this.layout.leaf
    const urgency = (node: OpenNode) =>
      nodeDistance(node, x, s, leaf) / nodeSize(node.level, leaf) + node.level * 0.01
    this.queue = build.sort((a, b) => urgency(a) - urgency(b))
  }

  work(deadline: number) {
    for (const node of this.queue) {
      const key = nodeKey(node)
      if (this.tiles.has(key)) continue
      let build = this.builds.get(key)
      if (!build) {
        build = { node, steps: this.make(node) }
        this.builds.set(key, build)
      }
      for (;;) {
        const step = build.steps.next()
        if (step.done) {
          this.tiles.set(key, { node, item: step.value, idle: 0 })
          this.nodes.set(key, node)
          this.builds.delete(key)
          this.show(step.value, false)
          break
        }
        if (performance.now() >= deadline) return false
      }
      if (performance.now() >= deadline) return false
    }
    return true
  }

  *visible(level?: number) {
    for (const key of this.shown) {
      const tile = this.tiles.get(key)
      if (tile && (level === undefined || tile.node.level === level)) yield tile
    }
  }

  at(x: number, s: number, level = 0) {
    const size = nodeSize(level, this.layout.leaf)
    const key = nodeKey({ level, column: Math.floor(x / size), row: Math.floor(s / size) })
    return this.shown.has(key) ? (this.tiles.get(key)?.item ?? null) : null
  }

  private remove(key: string, tile: Tile<T>) {
    this.drop(tile.item)
    this.tiles.delete(key)
    this.nodes.delete(key)
  }

  clear() {
    for (const [key, tile] of this.tiles) this.remove(key, tile)
    this.builds.clear()
    this.shown.clear()
    this.queue = []
  }
}

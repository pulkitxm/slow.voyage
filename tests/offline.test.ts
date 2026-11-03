import { beforeAll, expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'

interface RequestLike {
  method: string
  url: string
  mode: string
}
interface WorkerEvent {
  request?: RequestLike
  waitUntil?: (promise: Promise<unknown>) => void
  respondWith?: (promise: Promise<Response>) => void
}
const handlers = new Map<string, (event: WorkerEvent) => void>()
const stores = new Map<string, Map<string, Response>>()
const origin = 'https://roads.example'
let claimed = false
let activated = false
const key = (request: string | RequestLike) =>
  new URL(typeof request === 'string' ? request : request.url, origin).pathname
async function lifecycle(type: string) {
  let pending: Promise<unknown> | undefined
  const handler = handlers.get(type)
  if (!handler) throw new Error(`Missing ${type} handler`)
  handler({
    waitUntil: (promise) => {
      pending = promise
    },
  })
  await pending
}
async function request(path: string, mode = 'cors', method = 'GET') {
  let pending: Promise<Response> | undefined
  const handler = handlers.get('fetch')
  if (!handler) throw new Error('Missing fetch handler')
  handler({
    request: { url: new URL(path, origin).href, method, mode },
    respondWith: (promise) => {
      pending = promise
    },
  })
  return pending
}
beforeAll(async () => {
  stores.set('slow-voyage-obsolete', new Map())
  stores.set('unrelated-cache', new Map())
  const source = await Bun.file('dist/client/sw.js').text()
  runInNewContext(source, {
    self: {
      location: { origin },
      addEventListener: (type: string, handler: (event: WorkerEvent) => void) =>
        handlers.set(type, handler),
      skipWaiting: async () => {
        activated = true
      },
      clients: {
        claim: async () => {
          claimed = true
        },
      },
    },
    caches: {
      keys: async () => Array.from(stores.keys()),
      delete: async (name: string) => stores.delete(name),
      open: async (name: string) => {
        let store = stores.get(name)
        if (!store) {
          store = new Map()
          stores.set(name, store)
        }
        const cache = store
        return {
          addAll: async (paths: string[]) => {
            for (const path of paths) {
              const file = Bun.file(`dist/client${path}`)
              if (!(await file.exists())) throw new Error(`Missing precache asset: ${path}`)
              cache.set(path, new Response(await file.arrayBuffer()))
            }
          },
          match: async (value: string | RequestLike) => cache.get(key(value))?.clone(),
        }
      },
    },
    fetch: async () => {
      throw new Error('Origin is offline')
    },
    URL,
    Response,
  })
  await lifecycle('install')
  await lifecycle('activate')
})
test('installs all production assets before taking control', () => {
  expect(activated).toBe(true)
  expect(claimed).toBe(true)
  const cache = Array.from(stores.entries()).find(([name]) => name.startsWith('slow-voyage-'))?.[1]
  expect(cache?.has('/index.html')).toBe(true)
  expect(cache?.has('/manifest.webmanifest')).toBe(true)
  expect(cache?.size).toBeGreaterThan(5)
})
test('reloads the application shell while the origin is offline', async () => {
  const response = await request('/', 'navigate')
  expect(response?.status).toBe(200)
  expect(await response?.text()).toContain('slow.voyage')
})
test('serves a cached script without a network connection', async () => {
  const cache = Array.from(stores.entries()).find(([name]) => name.startsWith('slow-voyage-'))?.[1]
  const path = Array.from(cache?.keys() ?? []).find((path) => path.endsWith('.js'))
  if (!path) throw new Error('No production script was precached')
  const response = await request(path)
  expect(response?.status).toBe(200)
  expect((await response?.text())?.length).toBeGreaterThan(100)
})
test('removes obsolete game caches and preserves unrelated storage', () => {
  expect(stores.has('slow-voyage-obsolete')).toBe(false)
  expect(stores.has('unrelated-cache')).toBe(true)
})
test('leaves external and non-GET requests untouched', async () => {
  expect(await request('https://external.example/')).toBeUndefined()
  expect(await request('/submit', 'cors', 'POST')).toBeUndefined()
})

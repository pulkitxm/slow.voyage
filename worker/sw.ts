declare const __CACHE_NAME__: string
declare const __ASSET_URLS__: string[]

const worker = self as unknown as ServiceWorkerGlobalScope
worker.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(__CACHE_NAME__)
      .then((cache) => cache.addAll(__ASSET_URLS__))
      .then(() => worker.skipWaiting()),
  )
})
worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('slowroads-') && key !== __CACHE_NAME__)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => worker.clients.claim()),
  )
})
worker.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== worker.location.origin) return
  event.respondWith(
    (async () => {
      const cache = await caches.open(__CACHE_NAME__)
      const cached = await cache.match(request)
      if (cached) return cached
      try {
        return await fetch(request)
      } catch {
        return request.mode === 'navigate'
          ? ((await cache.match('/index.html')) ?? Response.error())
          : Response.error()
      }
    })(),
  )
})

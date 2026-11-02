import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export function reviewFiles(): Plugin {
  return {
    name: 'local-review-files',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__review', (request, response, next) => {
        const match =
          /^\/([A-Za-z0-9_-]+)\/(?:(index\.html|[A-Za-z0-9_-]+\.(?:png|mp4|json)))?$/.exec(
            new URL(request.url ?? '/', 'http://localhost').pathname,
          )
        if (!match?.[1] || !['GET', 'HEAD'].includes(request.method ?? '')) {
          next()
          return
        }
        const file = Bun.file(
          resolve(server.config.root, '.review', match[1], match[2] ?? 'index.html'),
        )
        void (async () => {
          if (!(await file.exists())) {
            response.statusCode = 404
            response.end('Capture not found')
            return
          }
          response.setHeader('Content-Type', file.type)
          response.setHeader('Content-Length', file.size)
          response.setHeader('Cache-Control', 'no-store')
          response.end(
            request.method === 'HEAD' ? undefined : Buffer.from(await file.arrayBuffer()),
          )
        })().catch(next)
      })
    },
  }
}

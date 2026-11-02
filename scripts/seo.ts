import { rm } from 'node:fs/promises'
import { loadEnv } from 'vite'
import { createSiteSeo } from '../src/seo'

const environment = loadEnv('production', process.cwd(), 'VITE_')
const seo = createSiteSeo(environment.VITE_SITE_URL)
await Bun.write('dist/client/robots.txt', seo.robots)
if (seo.sitemap) await Bun.write('dist/client/sitemap.xml', seo.sitemap)
else await rm('dist/client/sitemap.xml', { force: true })
console.log(
  seo.origin ? `Public metadata prepared for ${seo.origin}` : 'Local preview metadata prepared',
)

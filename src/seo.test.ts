import { expect, test } from 'bun:test'
import { createSiteSeo, publicOrigin, site } from './seo'

test('local metadata remains unindexed without inventing a canonical public URL', () => {
  const seo = createSiteSeo()
  expect(seo.origin).toBeNull()
  expect(seo.links).toEqual([])
  expect(seo.sitemap).toBeNull()
  expect(seo.meta).toContainEqual({ name: 'robots', content: 'noindex, nofollow' })
  expect(seo.meta.some((entry) => 'property' in entry && entry.property === 'og:url')).toBe(false)
  expect(seo.robots).not.toContain('Sitemap:')
  expect(JSON.stringify(seo)).not.toContain('slowroads.io')
})

test('a configured public origin aligns canonical, sharing, structured data and sitemap URLs', () => {
  const seo = createSiteSeo('https://driving.example/')
  const url = 'https://driving.example/'
  const image = 'https://driving.example/og-image.jpg'
  expect(seo.links).toEqual([{ rel: 'canonical', href: url }])
  expect(seo.meta).toContainEqual({ property: 'og:url', content: url })
  expect(seo.meta).toContainEqual({ property: 'og:image', content: image })
  expect(seo.meta).toContainEqual({ name: 'twitter:image', content: image })
  expect(seo.meta).toContainEqual({
    name: 'robots',
    content: 'index, follow, max-image-preview:large',
  })
  expect(seo.structuredData).toMatchObject({ url, image, mainEntityOfPage: url })
  expect(seo.sitemap).toContain(`<loc>${url}</loc>`)
  expect(seo.robots).toContain(`Sitemap: ${url}sitemap.xml`)
  expect(seo.robots).toContain('Disallow: /__review/')
})

test.each([
  'http://driving.example',
  'https://localhost',
  'https://game.localhost',
  'https://game.local',
  'https://127.0.0.1',
  'https://192.168.1.50',
  'https://[::1]',
  'https://user:secret@driving.example',
  'https://driving.example:3002',
  'https://driving.example/game',
  'https://driving.example/?preview=1',
  'https://driving.example/#drive',
  'not a URL',
])('rejects an unsuitable public origin: %s', (value) => {
  expect(() => publicOrigin(value)).toThrow()
})

test('the social image dimensions match the shipped JPEG and the original icon sizes are available', async () => {
  const bytes = new Uint8Array(await Bun.file(`public${site.image}`).arrayBuffer())
  let width = 0
  let height = 0
  for (let offset = 2; offset + 8 < bytes.length; ) {
    if (bytes[offset] !== 0xff) throw new Error('Invalid JPEG marker')
    const marker = bytes[offset + 1]
    const size = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
    if (marker === 0xc0 || marker === 0xc2) {
      height = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0)
      width = ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0)
      break
    }
    offset += size + 2
  }
  expect({ width, height }).toEqual({ width: site.imageWidth, height: site.imageHeight })
  expect(bytes.length).toBeLessThan(300000)
  const manifest = await Bun.file('public/manifest.webmanifest').json()
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(
      (entry: { sizes: string }) => entry.sizes === `${size}x${size}`,
    )
    expect(icon).toBeDefined()
    const data = new DataView(await Bun.file(`public${icon.src}`).arrayBuffer())
    expect(data.getUint32(16)).toBe(size)
    expect(data.getUint32(20)).toBe(size)
  }
})

import type { MetaHTMLAttributes } from 'react'

export const site = {
  name: 'Slow Roads',
  title: 'Slow Roads | Endless Scenic Driving Game',
  description:
    'Explore an endless road in your browser. Drive four vehicles through changing landscapes, seasons and weather, with offline play after the first complete load.',
  image: '/og-image.jpg',
  imageAlt:
    'Promotional artwork of a white touring car on a winding highland road at sunset, with the Slow Roads title.',
  imageWidth: 1200,
  imageHeight: 630,
}

export function publicOrigin(value: string | undefined) {
  if (!value?.trim()) return null
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.hostname.includes('.') ||
    /^\d+(?:\.\d+){3}$/.test(url.hostname) ||
    url.hostname.endsWith('.localhost') ||
    url.hostname.endsWith('.local')
  )
    throw new Error(
      'VITE_SITE_URL must be a public HTTPS origin without a path, port or credentials.',
    )
  return url.origin
}

export function createSiteSeo(value?: string) {
  const origin = publicOrigin(value)
  const url = origin ? `${origin}/` : null
  const image = origin ? `${origin}${site.image}` : site.image
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': ['VideoGame', 'WebApplication'],
    name: site.name,
    description: site.description,
    inLanguage: 'en',
    genre: ['Driving', 'Simulation'],
    gamePlatform: 'Web browser',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    browserRequirements: 'JavaScript, WebGL and a modern browser are required.',
    isAccessibleForFree: true,
    numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 1 },
    ...(url ? { url, image, mainEntityOfPage: url } : {}),
  }
  const meta: MetaHTMLAttributes<HTMLMetaElement>[] = [
    { title: site.title },
    { name: 'description', content: site.description },
    {
      name: 'robots',
      content: origin ? 'index, follow, max-image-preview:large' : 'noindex, nofollow',
    },
    { name: 'application-name', content: site.name },
    { property: 'og:type', content: 'website' },
    { property: 'og:locale', content: 'en_US' },
    { property: 'og:site_name', content: site.name },
    { property: 'og:title', content: site.title },
    { property: 'og:description', content: site.description },
    { property: 'og:image', content: image },
    ...(origin ? [{ property: 'og:image:secure_url', content: image }] : []),
    { property: 'og:image:type', content: 'image/jpeg' },
    { property: 'og:image:width', content: String(site.imageWidth) },
    { property: 'og:image:height', content: String(site.imageHeight) },
    { property: 'og:image:alt', content: site.imageAlt },
    ...(url ? [{ property: 'og:url', content: url }] : []),
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: site.title },
    { name: 'twitter:description', content: site.description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:image:alt', content: site.imageAlt },
  ]
  return {
    origin,
    meta,
    structuredData,
    links: url ? [{ rel: 'canonical', href: url }] : [],
    robots: `User-agent: *\nAllow: /\nDisallow: /__review/\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}`,
    sitemap: url
      ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url}</loc></url></urlset>\n`
      : null,
  }
}

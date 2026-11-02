import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { createSiteSeo } from '../seo'
import styles from '../styles.css?url'

const seo = createSiteSeo(import.meta.env.PROD ? import.meta.env.VITE_SITE_URL : undefined)

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#73856d' },
      ...seo.meta,
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      ...seo.links,
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(seo.structuredData).replaceAll('<', '\\u003c'),
      },
    ],
  }),
  component: Outlet,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

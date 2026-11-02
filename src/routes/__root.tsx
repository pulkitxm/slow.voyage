import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import styles from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }, { title: 'Slow Roads | A little further, a little slower' }, { name: 'theme-color', content: '#73856d' }, { name: 'description', content: 'Take the long way home. An endless drive through quiet, changing landscapes.' }],
    links: [{ rel: 'stylesheet', href: styles }, { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' }, { rel: 'manifest', href: '/manifest.webmanifest' }],
  }),
  component: () => <html lang="en"><head><HeadContent /></head><body><Outlet /><Scripts /></body></html>,
})

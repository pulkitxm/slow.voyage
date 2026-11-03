# Search and sharing metadata

The page includes a descriptive title, a search description, OpenGraph and Twitter
large-image metadata, and structured data describing a free single-player browser
driving game. Metadata is present in the prerendered HTML, without waiting for the
game renderer. No ratings, player counts, publisher identity, or official status
are claimed.

`public/og-image.jpg` is the 1200 by 630 social card. It is an autodrive gameplay
capture of the alpine landscape in autumn from the cinematic camera, with the
interface hidden and the slow.voyage title overlaid. Its alternative text says so. The SVG road icon also
has 192- and 512-pixel PNG versions and a 180-pixel Apple touch icon. All these
assets are local and included in the production offline cache.

Development always uses `noindex, nofollow`. Production builds without a public
origin do the same and omit canonical links, public page URLs, and the sitemap.
The application does not use the official game's domain as its own identity.

`VITE_SITE_URL` optionally supplies the public HTTPS origin, such as
`https://driving.example`. Keep it empty for local work. The `Pages` workflow
sets it to `https://slow.voyage`. The value must contain
only a hostname and an optional trailing slash, without a port, path, credentials,
query, or fragment. Use a domain the project is authorized to publish under.

When this value is set for `bun run build`, the canonical URL, social image URLs,
structured data, generated `robots.txt`, and generated `sitemap.xml` share the same
origin. Rebuild when changing it. This configures artifacts only and does not
deploy anything. Local development, checkpoint commits, and previews remain local.

`robots.txt` permits crawling so crawlers can read page indexing directives, and
excludes the local review path. The `noindex` meta directive controls indexing in
local builds. The public build's sitemap contains only the root game page.

Run `bun test src/seo.test.ts` to check origin validation, local indexing behavior,
public URL consistency, image dimensions, and raster icon sizes. After a build,
inspect `dist/client/index.html`, `dist/client/robots.txt`, and the optional
`dist/client/sitemap.xml`. External search indexing and social preview caches
cannot be verified until a public origin is available and publishing is authorized.

References: [OpenGraph protocol](https://ogp.me/),
[Google indexing directives](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag),
and [Google JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

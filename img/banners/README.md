# WEB 2 homepage banners

Place your own promotional artwork in this directory using these exact filenames:

- `banner-01.webp` — complete gaming PC
- `banner-02.webp` — graphics cards
- `banner-03.webp` — CPUs and motherboards
- `banner-04.webp` — RAM and NVMe storage
- `banner-05.webp` — gaming accessories

Recommended export size: **1600 × 420 px** or a similar 3.5:1–4:1 desktop ratio. The carousel uses `object-fit: cover`, so keep important artwork away from the extreme edges and allow a mobile crop around the left/centre portion. Headline, description, badge, and CTA are accessible HTML; leave visual breathing room on the right for the Persian copy and do not bake prices into images.

Original local SVG placeholders ship as `banner-placeholder-01.svg` through `banner-placeholder-05.svg`. They contain no external resources, product prices, or borrowed branding. The carousel uses these safe local illustrations until the matching WebP files are supplied, and falls back again if a supplied banner fails to load.

After adding or replacing your WebP files, run:

```powershell
node scripts/sync-storefront-banners.cjs
npm run build:assets
```

The sync step enables only local banners that actually exist, so missing WebP files do not cause failed requests or delay the first visible placeholder.

Only the first banner receives eager/high-priority loading. Other banners are loaded lazily; do not add preloads for all five banners.

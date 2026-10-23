# WEB 2 SEO operations

## Production configuration

Set `APP_ORIGIN` to the exact public HTTPS origin, for example `https://YOUR_DOMAIN`, in the server environment. Use the same canonical host in the Nginx redirect configuration. Production startup rejects a missing or non-HTTPS origin. Request `Host` and forwarded host headers never supply sitemap, canonical, or social URLs. Reload PM2 after changing the environment or application files.

The public discovery endpoints are `APP_ORIGIN/robots.txt` and `APP_ORIGIN/sitemap.xml`. The sitemap lists the homepage, product catalog, active categories, and active products. It uses real product timestamps when available. It is cached for 30 seconds and refreshed immediately when the storage epoch changes. Missing, inactive, and deleted products return HTTP 404 and are omitted.

## Page metadata and indexing

`lib/seo.cjs` renders public titles, descriptions, canonical URLs, Open Graph and X card tags, visible product data, and JSON-LD from the trusted product store. Product schema publishes real name, description, category, optional brand and image, price in IRR converted from the store's toman amount, and stock availability. It publishes no ratings or reviews. Organization schema includes only the store name and URL. Breadcrumb schema follows visible navigation.

Product links use stable IDs at `/product.html?id=ID`. Tracking and filter query parameters are excluded from canonical URLs. Catalog pagination uses a fixed page size and each valid page has its own canonical URL and next/previous links. Private pages and APIs have `noindex`; authentication remains server-enforced. `robots.txt` disallows private areas but provides no access control. Server-rendered content and metadata are also available without JavaScript.

## Search Console

1. Verify control of the real domain in Google Search Console. DNS verification covers the domain property. For URL-prefix HTML-file verification, place the genuine Google-supplied `google…html` file in the application public root and confirm the exact HTTPS URL returns its original contents. Do not commit the file or a fabricated token. Nginx must proxy that path to this application.
2. Add the verified HTTPS property, submit `https://YOUR_DOMAIN/sitemap.xml`, and confirm `robots.txt` is accessible at the same host.
3. Inspect the homepage, a category, and a current product URL in Search Console. Request indexing when appropriate. After adding or updating a product, verify its HTTP 200 response, canonical, description, JSON-LD, and sitemap entry. Confirm an inactive product gives 404 and disappears from the sitemap.

No Google Analytics, Tag Manager, or advertising scripts are required for indexing or installed by this phase.

## Release checklist

- [ ] HTTPS domain and canonical Nginx redirects match `APP_ORIGIN`.
- [ ] `/robots.txt` and `/sitemap.xml` return 200 on the production host.
- [ ] Sitemap includes active products and excludes inactive/deleted products and private paths.
- [ ] Representative product title, description, price, stock, canonical, Open Graph image, and JSON-LD match the live catalog.
- [ ] Cart, checkout, profile, admin, and API responses remain `noindex`; protected routes still enforce access.
- [ ] Missing products return 404; home, category, catalog, and product pages work on mobile.
- [ ] Compare production LCP, CLS, and INP to the pre-release baseline after deployment.

Run `node --require ./tests/helpers/isolated-environment.cjs --test tests/seo.test.cjs` locally, then the relevant project regression suites. This phase adds no dependency, so `npm install` or `npm ci` is needed only when preparing a fresh release environment from the existing lockfile.

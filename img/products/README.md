# Local product images

Product records use `image: "/img/products/your-product-slug.webp"`. Existing valid
local artwork is preserved. Product images are served locally; external URLs and
logos are not used as product pictures.

Put approved individual product renders in this directory. Prefer square images
around 640 × 640 pixels, ideally at or below 150 KB, with the product large and
centered on a clean neutral or cream background. Include no text, website card,
wishlist heart, stock badge or other UI in the image. The website supplies those
elements. WebP is preferred; PNG, JPG/JPEG and AVIF are also discovered.

## Assigning an image

The simplest automatic assignment uses the stable existing product ID:

```text
img/products/product-205.webp
img/products/product-207.webp
```

The API and server-rendered pages discover these files without rewriting the
catalog or changing product IDs. Existing custom local product images take
precedence. The filename lookup order is WebP, PNG, JPG, JPEG, then AVIF.

For custom slugs, set the product's `image` field to an existing local image, or
create an optional `img/products/manifest.json` mapping product IDs to paths:

```json
{
  "205": "/img/products/ram-ddr5-32gb.webp",
  "207": "/img/products/palit-rtx-4060-dual.webp"
}
```

Use only correct product/type mappings. The example paths describe files to
supply; they are not included product photos. Unknown or missing files are never
served as broken image URLs. The manifest is read on resolution, so adding files
or mappings does not require a server restart. Reload an already-open browser
page to request the updated product data; server-rendered page caches refresh
within 30 seconds.

## Exact product-type fallbacks

When no product-specific image exists, an approved matching type image may use
one of these filenames (the same supported extensions apply):

| Product type | Fallback basename |
| --- | --- |
| CPU | `cpu` |
| Motherboard | `motherboard` |
| RAM | `ram` |
| Graphics card | `gpu` |
| NVMe SSD | `nvme-ssd` |
| Generic internal SSD | `ssd` |
| External SSD | `external-ssd` |
| Power supply | `psu` |
| CPU cooler | `cpu-cooler` |
| Case fan | `case-fan` |
| Laptop cooling pad | `laptop-cooler` |
| Laptop cooling stand | `laptop-cooling-stand` |
| Empty gaming case | `gaming-case` |
| Complete assembled gaming PC | `complete-gaming-pc` |
| Standard gaming controller | `gaming-controller` |
| Mobile gaming controller | `mobile-controller` |
| Arcade controller | `arcade-controller` |
| Keyboard | `keyboard` |
| Mouse | `mouse` |
| Headset | `headset` |
| Monitor | `monitor` |
| Gaming chair | `gaming-chair` |
| Microphone | `microphone` |
| Webcam | `webcam` |
| Mouse/desk pad | `mousepad` |
| Speaker | `speaker` |
| Soundbar | `soundbar` |
| USB hub | `usb-hub` |

For example, a case fan does not use a CPU cooler photo, an external SSD does not
use an NVMe photo, a monitor does not use a GPU photo, and an empty case does not
use a complete PC photo. Broad accessory/component categories and unrecognized
types keep the existing safe illustrated/icon fallback. A verified image in the
product's explicit `image` field always wins over a type fallback.

Valid legacy and new admin image uploads remain supported. The backend validates
their file signature and 700 KB limit, then stores a local
`upload-<sha256>.<extension>` file in this directory. Existing local files are not
overwritten. Product responses contain the selected `image` plus `imageFallback`
when an existing matching type image can recover from a failed product image.

## Auditing and optional seed synchronization

Run a read-only report of every shipped product ID/name and missing image:

```text
node scripts/audit-product-images.cjs
node scripts/audit-product-images.cjs --json
node scripts/audit-product-images.cjs --json --seed exported-catalog.json
```

`docs/product-image-audit.json` contains the checked-in audit snapshot. At the
time of this change, all 83 shipped products still need supplied product photos;
the existing SVG illustrations remain safe fallbacks.

The sync command is also read-only by default:

```text
node scripts/sync-product-images.cjs
node scripts/sync-product-images.cjs --json
node scripts/sync-product-images.cjs --write
```

Only explicit `--write` updates `data.json` image fields, and only where a real
local asset exists. It preserves IDs, names, prices, stock and missing-image
entries. It does not modify live SQLite data. Runtime image discovery already
works for both shipped and existing SQLite products without running this command
or applying a schema migration. Audit exported live catalogs with `--seed` when
they differ from the shipped seed.

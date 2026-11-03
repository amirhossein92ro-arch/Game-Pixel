'use strict';
// Enable only existing local WebP files. Missing artwork keeps its shipped SVG fallback.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'index.html');
const before = fs.readFileSync(filename, 'utf8');
let available = 0;
const after = before.replace(/<source\b[^>]*\bdata-banner-source="(\/img\/banners\/banner-0[1-5]\.webp)"[^>]*>/g, (tag, image) => {
    const local = path.join(root, image.slice(1));
    const clean = tag.replace(/\s+srcset="[^"]*"/g, '');
    if (!fs.existsSync(local) || !fs.statSync(local).isFile()) return clean;
    available += 1;
    return clean.replace(/>$/, ` srcset="${image}">`);
});
if (after !== before) fs.writeFileSync(filename, after);
console.log(`Homepage banners: ${available}/5 local WebP files enabled; remaining slides use local SVG artwork.`);

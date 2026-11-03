'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createResolver} = require('../lib/product-images.cjs');
const imagePaths = require('../js/product-images.js');
const {atomicWriteJson} = require('../lib/atomic-file.cjs');
const {state} = require('../lib/storage-validation.cjs');

function report(products, resolver) {
    return products.map(product => {
        const resolved = resolver.resolve(product);
        const available = !!resolved.image && !imagePaths.isPlaceholder(resolved.image);
        return {id:String(product.id),name:product.name,type:imagePaths.type(product),image:resolved.image,
            imageFallback:resolved.imageFallback,missing:!available,expected:imagePaths.productCandidates(product)[0] || 'Set an explicit local image or manifest mapping'};
    });
}
function main(args = process.argv.slice(2)) {
    const root = path.resolve(__dirname, '..');
    const allowed = new Set(['--write','--json']);
    if (args.some(arg => !allowed.has(arg))) throw Error('Usage: node scripts/sync-product-images.cjs [--write] [--json]');
    const filename = path.join(root, 'data.json');
    const original = fs.readFileSync(filename, 'utf8');
    const data = JSON.parse(original.replace(/^\uFEFF/, ''));
    state(data);
    const resolver = createResolver({root, materializeUploads:false});
    const rows = report(data.products || [], resolver);
    let updated = 0;
    // Default is read-only. Explicit --write changes only image fields for assets
    // that actually exist. IDs, pricing, inventory and missing images stay intact.
    if (args.includes('--write')) {
        const byId = new Map(rows.filter(row => !row.missing).map(row => [row.id, row]));
        data.products = data.products.map(product => {
            const row = byId.get(String(product.id));
            if (!row || product.image === row.image) return product;
            updated++;
            return {...product, image:row.image};
        });
        if (updated) atomicWriteJson(filename, data, state, {expectedContents:original});
    }
    const summary = {products:rows.length,available:rows.filter(row => !row.missing).length,missing:rows.filter(row => row.missing).length,updated,rows};
    if (args.includes('--json')) console.log(JSON.stringify(summary, null, 2));
    else {
        console.log(`Product images: ${summary.available}/${summary.products} available; ${summary.missing} missing; ${updated} seed fields updated.`);
        for (const row of rows.filter(row => row.missing)) console.log(`${row.id} | ${row.name} | expected ${row.expected}`);
    }
    return summary;
}
if (require.main === module) {
    try {main();} catch (error) {console.error(error.message);process.exitCode = 1;}
}
module.exports = {report, main};

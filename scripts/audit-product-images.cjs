'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createResolver} = require('../lib/product-images.cjs');
const {report} = require('./sync-product-images.cjs');

function main(args = process.argv.slice(2)) {
    const root = path.resolve(__dirname, '..');
    let filename = path.join(root, 'data.json');
    let json = false;
    for (let index = 0; index < args.length; index++) {
        if (args[index] === '--json') json = true;
        else if (args[index] === '--seed' && args[index + 1]) filename = path.resolve(args[++index]);
        else throw Error('Usage: node scripts/audit-product-images.cjs [--json] [--seed exported-catalog.json]');
    }
    const data = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
    const products = Array.isArray(data) ? data : data.products;
    if (!Array.isArray(products)) throw Error('Catalog must contain a products array.');
    const rows = report(products, createResolver({root, materializeUploads:false}));
    const result = {products:rows.length,available:rows.filter(row => !row.missing).length,missing:rows.filter(row => row.missing).length,rows};
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
        console.log(`Product images: ${result.available}/${result.products} available; ${result.missing} missing.`);
        for (const row of rows.filter(row => row.missing)) console.log(`${row.id} | ${row.name} | expected ${row.expected}`);
    }
    return result;
}
if (require.main === module) {
    try {main();} catch (error) {console.error(error.message);process.exitCode = 1;}
}
module.exports = {main};

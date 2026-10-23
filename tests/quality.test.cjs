const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('active pages expose responsive, favicon and SEO directives', () => {
    const publicPages = ['index.html', 'product.html'];
    const privatePages = ['cart.html', 'checkout.html', 'profile.html', 'admin.html'];
    for (const file of [...publicPages, ...privatePages]) {
        const html = read(file);
        assert.match(html, /<meta\s+name="viewport"/i, `${file}: viewport`);
        assert.match(html, /<link\s+rel="icon"[^>]+favicon\.svg/i, `${file}: favicon`);
        assert.match(html, /<title>[^<]+<\/title>/i, `${file}: title`);
        assert.match(html, /<meta\s+name="description"/i, `${file}: description`);
    }
    for (const file of publicPages) assert.match(read(file), /<link\s+rel="canonical"/i, `${file}: canonical`);
    for (const file of privatePages) assert.match(read(file), /<meta\s+name="robots"\s+content="noindex,nofollow"/i, `${file}: robots`);
});

test('mobile breakpoints, reduced motion and bounded navigation overlay are present', () => {
    const css = read('style.css');
    const script = read('script.js');
    assert.match(css, /@media\s*\(max-width:\s*768px\)/i);
    assert.match(css, /@media\s*\(max-width:\s*480px\)/i);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
    assert.match(css, /\.page-transition-overlay/);
    assert.match(script, /pageshow/);
    assert.match(script, /setTimeout\([^]*?80\)/);
});

test('product data is valid and incomplete media remains recoverable', () => {
    const data = JSON.parse(read('data.json'));
    assert.ok(Array.isArray(data.products) && data.products.length > 0);
    for (const product of data.products) {
        assert.ok(String(product.id || '').trim(), 'product id');
        assert.ok(String(product.name || '').trim(), `product ${product.id}: name`);
        assert.ok(Number.isFinite(Number(product.price)), `product ${product.id}: price`);
    }
    const script = read('script.js');
    assert.match(script, /getProductImage/i);
    assert.match(script, /fallbackApplied/i);
});

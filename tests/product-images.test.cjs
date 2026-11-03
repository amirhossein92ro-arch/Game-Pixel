'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const vm = require('node:vm');
const {spawn} = require('node:child_process');
const {JSDOM, VirtualConsole} = require('jsdom');

const root = path.resolve(__dirname, '..');
const images = require('../js/product-images.js');
const {createResolver, uploaded} = require('../lib/product-images.cjs');
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64');

function temporaryRoot(t, beforeCleanup) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'web2-product-images-'));
    t.after(async () => {
        if (beforeCleanup) await beforeCleanup();
        const resolved = fs.realpathSync(folder);
        assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
        assert.ok(path.basename(resolved).startsWith('web2-product-images-'));
        fs.rmSync(resolved, {recursive:true, force:true, maxRetries:5, retryDelay:100});
    });
    return folder;
}

function asset(folder, filename, content = pixel) {
    const target = path.join(folder, filename);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.writeFileSync(target, content);
}

function page(t, file = 'index.html', search = '') {
    const errors = [];
    const dom = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'), {
        url:'http://localhost/' + file + search,
        runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:new VirtualConsole()
    });
    const w = dom.window;
    w.addEventListener('error', event => errors.push(event.message));
    for (const filename of ['js/safe-url.js', 'js/product-images.js', 'js/product-pricing.js', 'script.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, filename), 'utf8'), dom.getInternalVMContext(), {filename});
    }
    const run = code => vm.runInContext(code, dom.getInternalVMContext());
    run('initializeStore.initialized=true;');
    t.after(() => w.close());
    return {dom, w, run, errors};
}

test('image values normalize to local files and reject remote, traversal and malformed inputs', () => {
    for (const [value, expected] of [
        ['img/products/ram-ddr5-rgb-32gb.webp', '/img/products/ram-ddr5-rgb-32gb.webp'],
        ['/img/products/gpu.png', '/img/products/gpu.png'],
        ['img/custom-product.jpg', '/img/custom-product.jpg'],
        ['img/products/custom-mark.svg', '/img/products/custom-mark.svg']
    ]) assert.equal(images.local(value), expected);
    for (const value of [undefined, null, false, 15, {}, [], '', 'https://example.invalid/ram.webp',
        'http://example.invalid/ram.webp', '//example.invalid/ram.webp', 'data:image/png;base64,AAAA',
        '/img/../.env', 'img/products/../../secret.png', '/img/products/%2e%2e/private.png',
        '/img/products/.hidden.png', '/img/products/x.png?download=1', 'img\\products\\x.png',
        'javascript:alert(1)', 'img/products/x.png#fragment', 'img/products/x.png" onerror="alert(1)',
        '/img/products/x.html', '/img/products/x\n.png']) {
        assert.equal(images.local(value), '', String(value));
    }
});

test('type fallbacks distinguish hardware types and never infer unrelated images for broad categories', () => {
    const types = [
        [{category:'رم', name:'DDR5 32GB'}, 'ram'],
        [{category:'کارت گرافیک', name:'GPU'}, 'gpu'],
        [{category:'پردازنده', name:'CPU'}, 'cpu'],
        [{category:'مادربرد', name:'Mainboard'}, 'motherboard'],
        [{category:'SSD و حافظه', name:'NVMe SSD'}, 'nvme-ssd'],
        [{category:'SSD و حافظه', name:'External SSD'}, 'external-ssd'],
        [{category:'پاور', name:'850W'}, 'psu'],
        [{category:'خنک‌کننده', name:'CPU cooler'}, 'cpu-cooler'],
        [{category:'کیس', name:'Gaming case'}, 'gaming-case'],
        [{category:'دسته بازی', name:'Controller'}, 'gaming-controller'],
        [{category:'سیستم کامل گیمینگ', name:'Complete PC'}, 'complete-gaming-pc'],
        [{category:'خنک‌کننده', name:'Case fan 120mm'}, 'case-fan'],
        [{category:'خنک‌کننده', name:'Laptop cooler'}, 'laptop-cooler'],
        [{category:'دسته بازی', name:'Mobile controller'}, 'mobile-controller']
    ];
    for (const [product, type] of types) {
        assert.equal(images.type(product), type);
        assert.ok(images.categoryCandidates(product).includes('/img/products/' + type + '.webp'));
    }
    for (const category of ['__proto__', 'constructor', 'قطعات کامپیوتر', 'Unknown']) {
        assert.equal(images.type({category, name:'Generic product'}), '');
        assert.deepEqual(images.categoryCandidates({category, name:'Generic product'}), []);
    }
    assert.ok(images.isPlaceholder('img/hardware/gpu.svg'));
    assert.ok(images.isPlaceholder('/img/products/controller.svg'));
    assert.equal(images.isPlaceholder('/img/products/custom-product.svg'), false);
    assert.deepEqual(images.productCandidates({id:'../../secret'}), []);
});

test('resolver prioritizes preserved product images, stable IDs and exact type assets over legacy icons', t => {
    const folder = temporaryRoot(t);
    asset(folder, 'img/product-placeholder.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    asset(folder, 'img/hardware/ram.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    asset(folder, 'img/products/custom-ram.png');
    asset(folder, 'img/products/product-ram-101.png');
    asset(folder, 'img/products/ram.png');
    const resolver = createResolver({root:folder});
    const product = {id:'ram-101', category:'رم', name:'DDR5 RAM', image:'img/products/custom-ram.png'};
    assert.deepEqual(resolver.resolve(product), {
        image:'/img/products/custom-ram.png', imageFallback:'/img/products/ram.png'
    });
    assert.deepEqual(resolver.resolve({...product, image:'img/hardware/ram.svg'}), {
        image:'/img/products/product-ram-101.png', imageFallback:'/img/products/ram.png'
    });
    assert.deepEqual(resolver.resolve({...product, id:'ram-102', image:'img/products/missing.png'}), {
        image:'/img/products/ram.png', imageFallback:''
    });
    assert.equal(resolver.exists('/img/products/missing.png'), '');
    assert.equal(resolver.exists('/img/products/../ram.webp'), '');
    assert.equal(resolver.exists('https://example.invalid/x.png'), '');
    assert.equal(resolver.exists('/img/products/custom-ram.png'), '/img/products/custom-ram.png');
    const unknown = resolver.resolve({id:'unknown', category:'Unknown', image:'https://example.invalid/ram.webp'});
    assert.equal(unknown.image, '/img/product-placeholder.svg');
    assert.equal(unknown.imageFallback, '');
});

test('manifest mappings attach provided product renders by stable ID without replacing existing custom files', t => {
    const folder = temporaryRoot(t);
    asset(folder, 'img/product-placeholder.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    asset(folder, 'img/products/ram-model-32gb.png');
    asset(folder, 'img/products/previous-custom.png');
    asset(folder, 'img/products/manifest.json', JSON.stringify({
        'provided-product':'/img/products/ram-model-32gb.png',
        'missing-product':'/img/products/not-provided.png',
        'unsafe-product':'https://example.invalid/product.png'
    }));
    const resolver = createResolver({root:folder});
    assert.equal(resolver.resolve({id:'provided-product'}).image, '/img/products/ram-model-32gb.png');
    assert.equal(resolver.resolve({id:'provided-product', image:'img/products/previous-custom.png'}).image,
        '/img/products/previous-custom.png');
    for (const id of ['missing-product', 'unsafe-product', 'constructor', '__proto__']) {
        assert.equal(resolver.resolve({id}).image, '/img/product-placeholder.svg');
    }
});

test('resolver keeps existing artwork safe when real files have not yet been supplied', t => {
    const folder = temporaryRoot(t);
    asset(folder, 'img/product-placeholder.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    asset(folder, 'img/hardware/cpu.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const resolver = createResolver({root:folder});
    assert.deepEqual(resolver.resolve({id:'cpu-1', category:'پردازنده', image:'img/hardware/cpu.svg'}), {
        image:'/img/hardware/cpu.svg', imageFallback:''
    });
    for (const image of [undefined, null, {}, ['bad'], '/img/products/missing.png', 'javascript:alert(1)']) {
        const result = resolver.resolve({id:'unknown', category:'Unknown', image});
        assert.equal(result.image, '/img/product-placeholder.svg');
        assert.equal(result.imageFallback, '');
    }
});

test('legacy admin uploads become verified local files without overwriting assets or allowing remote images', t => {
    const folder = temporaryRoot(t);
    asset(folder, 'img/product-placeholder.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const data = 'data:image/png;base64,' + pixel.toString('base64');
    const resolver = createResolver({root:folder});
    assert.equal(uploaded(data).extension, 'png');
    assert.equal(resolver.materialize('https://example.invalid/product.png'), '');
    const oversized = Buffer.alloc(700001);
    pixel.copy(oversized, 0, 0, 8);
    for (const value of ['data:image/png;base64,AAAA', data.replace('image/png', 'image/jpeg'),
        'data:image/png;base64,' + oversized.toString('base64'),
        'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64')]) {
        assert.equal(uploaded(value), null);
        assert.equal(resolver.materialize(value), '');
    }
    const local = resolver.materialize(data);
    assert.match(local, /^\/img\/products\/upload-[0-9a-f]{64}\.png$/);
    assert.equal(resolver.materialize(data), local, 'repeated uploads use the same local file');
    assert.deepEqual(fs.readFileSync(path.join(folder, local.slice(1))), pixel);
    assert.equal(resolver.resolve({id:'uploaded', image:data}).image, local);
    const files = fs.readdirSync(path.join(folder, 'img/products'));
    assert.equal(files.length, 1);
    // A mismatched file must be left untouched, and never advertised as the upload.
    fs.writeFileSync(path.join(folder, local.slice(1)), 'changed asset');
    assert.equal(resolver.materialize(data), '');
    assert.equal(fs.readFileSync(path.join(folder, local.slice(1)), 'utf8'), 'changed asset');
    const readOnlyFolder = temporaryRoot(t);
    const readOnly = createResolver({root:readOnlyFolder, materializeUploads:false});
    assert.equal(readOnly.materialize(data), '');
    assert.equal(fs.existsSync(path.join(readOnlyFolder, 'img/products')), false);
});

test('cards and product detail use the same normalized image without losing product controls', t => {
    const p = page(t, 'product.html', '?id=ram-101');
    p.w.imageProduct = {
        id:'ram-101', name:'DDR5 RAM 32GB', brand:'Store brand', price:2500000, stock:4,
        category:'رم', image:'/img/products/ram-ddr5-rgb-32gb.webp', imageFallback:'/img/products/ram.webp',
        features:['32 GB DDR5'], rating:4.8, reviews:10, status:'active', icon:'fa-memory'
    };
    p.run('products=[normalizeProduct(imageProduct)];productsSource="api";productsLoaded=true;productsLoading=false;');
    assert.equal(p.run('products[0].image'), '/img/products/ram-ddr5-rgb-32gb.webp');
    assert.equal(p.run('products[0].imageFallback'), '/img/products/ram.webp');
    const holder = p.w.document.createElement('div');
    holder.innerHTML = p.run('createProductCard(products[0])');
    const card = holder.querySelector('.product-card');
    const image = card.querySelector('.product-art img');
    assert.equal(image.getAttribute('src'), p.run('products[0].image'));
    assert.equal(image.getAttribute('alt'), 'DDR5 RAM 32GB');
    assert.equal(image.getAttribute('loading'), 'lazy');
    assert.equal(image.getAttribute('decoding'), 'async');
    assert.equal(image.getAttribute('width'), '640');
    assert.equal(image.getAttribute('height'), '640');
    assert.equal(image.dataset.imageFallback, '/img/products/ram.webp');
    assert.ok(card.querySelector('[data-wishlist-product="ram-101"]'));
    assert.ok(card.querySelector('.stock-label'));
    assert.ok(card.querySelector('.product-price strong').textContent.trim());
    assert.ok(card.querySelector('a[href="/product.html?id=ram-101"]'));
    assert.ok(card.querySelector('[data-add-to-cart="ram-101"]'));
    p.run('renderProductDetail()');
    const detail = p.w.document.querySelector('.detail-visual img');
    assert.equal(detail.getAttribute('src'), image.getAttribute('src'));
    assert.equal(detail.getAttribute('loading'), 'eager');
    assert.equal(detail.getAttribute('fetchpriority'), 'high');
    assert.equal(detail.getAttribute('decoding'), 'async');
    assert.equal(detail.dataset.imageFallback, image.dataset.imageFallback);
    assert.ok(p.w.document.querySelector('.detail-buttons [data-add-to-cart="ram-101"]'));
    assert.deepEqual(p.errors, []);
});

test('missing and malformed frontend fields render safely, and runtime failures end at an icon without looping', t => {
    const p = page(t);
    p.w.productInput = {id:'fallback', name:'GPU fallback', category:'کارت گرافیک', price:100, stock:1, icon:'fa-microchip'};
    for (const value of [null, undefined, {}, [], 'javascript:alert(1)', 'https://example.invalid/product.png', '/img/../secret.png']) {
        p.w.imageValue = value;
        const normalized = p.run('normalizeProduct({...productInput,image:imageValue})');
        assert.ok(!/^https?:|javascript:|data:/.test(normalized.image));
        const markup = p.run('productImageMarkup(normalizeProduct({...productInput,image:imageValue}))');
        assert.doesNotMatch(markup, /onerror\s*=|<script/);
    }
    p.w.document.body.insertAdjacentHTML('beforeend', p.run('productImageMarkup({...productInput,image:"/img/products/gpu-specific.webp",imageFallback:"/img/products/gpu.webp"})'));
    p.run('setupProductImageFallback()');
    const image = p.w.document.body.lastElementChild.previousElementSibling;
    assert.equal(image.tagName, 'IMG');
    image.dispatchEvent(new p.w.Event('error'));
    assert.equal(image.dataset.fallbackApplied, 'true');
    assert.equal(image.getAttribute('src'), '/img/products/gpu.webp');
    image.dispatchEvent(new p.w.Event('error'));
    assert.equal(image.getAttribute('src'), '/img/product-placeholder.svg');
    image.dispatchEvent(new p.w.Event('error'));
    assert.equal(image.hidden, true);
    const terminal = image.getAttribute('src');
    image.dispatchEvent(new p.w.Event('error'));
    assert.equal(image.hidden, true);
    assert.equal(image.getAttribute('src'), terminal);
    assert.ok(image.nextElementSibling.classList.contains('product-image-fallback'));
    assert.deepEqual(p.errors, []);
});

test('product API and server rendered pages agree on local images and safely expose missing assets', async t => {
    let child;
    const folder = temporaryRoot(t, async () => {
        if (child && child.exitCode === null && child.signalCode === null) {
            const exited = new Promise(resolve => child.once('exit', resolve));
            child.kill();
            await exited;
        }
    });
    const seed = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
    const product = (id, image, category = 'Image regression category') => ({
        id, name:'Image regression ' + id, price:123000, stock:3, status:'active', category,
        image, icon:'fa-memory', brand:'Store', features:['Product feature']
    });
    const rows = [
        product('image-existing', '/img/social/mouse.png', 'موس گیمینگ'),
        product('image-missing', '/img/products/definitely-absent-image-regression.webp'),
        product('image-unsafe', 'https://example.invalid/product.png'),
        product('image-legacy', 'img/hardware/ram.svg', 'رم')
    ];
    seed.products = [...seed.products, ...rows];
    const seedFile = path.join(folder, 'seed.json');
    fs.writeFileSync(seedFile, JSON.stringify(seed));
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const base = 'http://127.0.0.1:' + port;
    child = spawn(process.execPath, ['server.js'], {
        cwd:root, windowsHide:true, env:{...process.env, NODE_ENV:'test', HOST:'127.0.0.1', PORT:String(port),
            APP_ORIGIN:base, DATABASE_PATH:path.join(folder, 'store.sqlite'), SEED_DATA_PATH:seedFile,
            ADMIN_PASSWORD:'Image-regression-password-2026!', ADMIN_TOTP_SECRET:'', SMS_PROVIDER:'mock', PAYMENT_MODE:'test'},
        stdio:['ignore', 'pipe', 'pipe']
    });
    let diagnostics = '';
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Product image server startup timeout: ' + diagnostics)), 20000);
        child.stderr.on('data', data => diagnostics += data);
        child.once('exit', code => {clearTimeout(timer); reject(Error('Image server exited ' + code + ': ' + diagnostics));});
        child.stdout.on('data', data => {if (String(data).includes('Server is running')) {clearTimeout(timer); resolve();}});
    });
    const listing = await (await fetch(base + '/api/products?page=1&pageSize=100&view=summary')).json();
    for (const row of rows) {
        const response = await fetch(base + '/api/products/' + row.id);
        assert.equal(response.status, 200);
        const actual = await response.json();
        const expected = row.id === 'image-existing' ? '/img/social/mouse.png'
            : row.id === 'image-legacy' ? '/img/hardware/ram.svg' : '/img/product-placeholder.svg';
        assert.equal(actual.image, expected, row.id);
        assert.equal(actual.imageFallback, '');
        const summary = listing.items.find(item => item.id === row.id);
        assert.ok(summary, row.id + ' remains in the catalog');
        assert.equal(summary.image, actual.image);
        assert.equal(summary.imageFallback, actual.imageFallback);
        const imgResponse = await fetch(base + actual.image);
        assert.equal(imgResponse.status, 200, actual.image);
        assert.match(imgResponse.headers.get('Content-Type'), /^image\//);
        const detailResponse = await fetch(base + '/product.html?id=' + row.id);
        assert.equal(detailResponse.status, 200);
        const dom = new JSDOM(await detailResponse.text());
        const image = dom.window.document.querySelector('.detail-visual img.product-image');
        assert.ok(image, row.id);
        assert.equal(image.getAttribute('src'), actual.image);
        assert.equal(image.getAttribute('loading'), 'eager');
        assert.equal(image.getAttribute('width'), '640');
        assert.equal(image.getAttribute('height'), '640');
        dom.window.close();
    }
});

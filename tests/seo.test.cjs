'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {spawn} = require('node:child_process');
const {JSDOM, VirtualConsole} = require('jsdom');
const {configuredOrigin, categoryName, categoryPath, productPath} = require('../lib/seo.cjs');
const root = path.resolve(__dirname, '..');

test('SEO origins are configuration-only and invalid production origins fail closed', () => {
    assert.equal(configuredOrigin({APP_ORIGIN:' https://store.example.test/ ', NODE_ENV:'production'}), 'https://store.example.test');
    assert.equal(configuredOrigin({PORT:'3011'}), 'http://localhost:3011');
    for (const origin of ['http://store.example.test','https://u:p@store.example.test','https://store.example.test/path','https://store.example.test/?x=y','https://store.example.test/#hash']) {
        assert.throws(() => configuredOrigin({APP_ORIGIN:origin, NODE_ENV:'production'}));
    }
    assert.throws(() => configuredOrigin({NODE_ENV:'production'}));
    assert.equal(categoryName('__proto__'), '__proto__');
});

test('storefront SEO, dynamic discovery and private indexing protections over real HTTP', async t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'web2-seo-'));
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const origin = 'https://store.example.test', base = `http://127.0.0.1:${port}`;
    const password = 'Unique SEO test password 2026!';
    const child = spawn(process.execPath,['server.js'], {cwd:root, windowsHide:true, env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:origin,ALLOWED_ORIGINS:'',TRUST_PROXY:'',DATABASE_PATH:path.join(temp,'store.sqlite'),SEED_DATA_PATH:path.join(root,'data.json'),ADMIN_USERNAME:'seo-admin',ADMIN_PASSWORD:password,ADMIN_TOTP_SECRET:'',CAPTCHA_TEST_MODE:'true',SMS_PROVIDER:'mock',PAYMENT_MODE:'test'},stdio:['ignore','pipe','pipe']});
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
            const done = new Promise(resolve => child.once('exit',resolve)); child.kill(); await done;
        }
        const resolved = fs.realpathSync(temp);
        if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) || !path.basename(resolved).startsWith('web2-seo-')) throw Error('Unsafe SEO test cleanup.');
        fs.rmSync(resolved,{recursive:true,force:true});
    });
    let errors = '';
    await new Promise((resolve,reject) => {
        const timer = setTimeout(() => reject(Error('SEO server startup timeout: ' + errors)),20000);
        child.stderr.on('data',data => errors += data);
        child.once('exit',code => {clearTimeout(timer);reject(Error('SEO server exited: ' + code + ' ' + errors));});
        child.stdout.on('data',data => {if(String(data).includes('Server is running')) {clearTimeout(timer);resolve();}});
    });
    const get = (url, options) => fetch(base + url, options);
    const publicCatalog = await (await get('/api/products')).json();
    const product = publicCatalog.find(p => p.stock > 0), category = categoryName(product.category);
    const parse = html => new JSDOM(html).window.document;
    const meta = (doc, name) => doc.querySelector(`meta[name="${name}"],meta[property="${name}"]`)?.content;
    const graph = doc => JSON.parse(doc.querySelector('#seo-structured-data').textContent)['@graph'];
    const publicRoutes = ['/', '/products', ...[...new Set(publicCatalog.map(p => categoryName(p.category)))].map(categoryPath), ...publicCatalog.map(p => productPath(p.id))];
    const pages = new Map();
    const socialPaths = new Set();

    await t.test('every public page has unique server-rendered metadata, H1, RTL content and parseable JSON-LD', async () => {
        const titles = new Set(), descriptions = new Set();
        for (const route of publicRoutes) {
            const response = await get(route), html = await response.text(), doc = parse(html);
            pages.set(route,{response,html,doc});
            assert.equal(response.status,200,route);
            assert.match(response.headers.get('Content-Type'),/text\/html; charset=utf-8/i);
            assert.equal(response.headers.get('X-Robots-Tag'),'index, follow');
            assert.equal(doc.documentElement.lang,'fa'); assert.equal(doc.documentElement.dir,'rtl');
            assert.equal(doc.querySelectorAll('title').length,1); assert.equal(doc.querySelectorAll('meta[name="description"]').length,1);
            assert.ok(!titles.has(doc.title),'duplicate title: ' + doc.title); titles.add(doc.title);
            const description = meta(doc,'description'); assert.ok(description && description.length <= 160);
            assert.ok(!descriptions.has(description),'duplicate description: ' + route); descriptions.add(description);
            assert.equal(doc.querySelectorAll('link[rel="canonical"]').length,1);
            assert.equal(doc.querySelector('link[rel="canonical"]').href,origin + route);
            assert.equal(meta(doc,'robots'),'index,follow');
            assert.equal(doc.querySelectorAll('main').length,1); assert.equal(doc.querySelectorAll('h1').length,1,route);
            assert.ok(doc.querySelector('main h1').textContent.trim());
            assert.ok(doc.querySelector('header nav')); assert.ok(doc.querySelector('footer'));
            assert.ok(graph(doc).length);
            for (const img of doc.querySelectorAll('img')) {
                assert.ok(img.hasAttribute('alt')); assert.ok(img.alt.trim());
                if (img.closest('.product-art')) assert.equal(img.getAttribute('loading'),'lazy');
            }
            for (const tag of ['og:title','og:description','og:type','og:url','og:image','og:site_name','twitter:card','twitter:title','twitter:description','twitter:image']) assert.ok(meta(doc,tag),route + ': ' + tag);
            assert.equal(meta(doc,'og:title'),doc.title); assert.equal(meta(doc,'twitter:title'),doc.title);
            assert.equal(meta(doc,'og:description'),description); assert.equal(meta(doc,'twitter:description'),description);
            assert.equal(meta(doc,'og:url'),origin + route); assert.equal(meta(doc,'twitter:card'),'summary_large_image');
            assert.equal(meta(doc,'og:image'),meta(doc,'twitter:image')); socialPaths.add(new URL(meta(doc,'og:image')).pathname);
            const data = doc.querySelector('#seo-structured-data').textContent;
            const hash = crypto.createHash('sha256').update(data).digest('base64');
            const csp = response.headers.get('Content-Security-Policy');
            assert.ok(csp.includes(`'sha256-${hash}'`)); assert.doesNotMatch(csp.split('script-src ')[1].split(';')[0],/unsafe-inline|unsafe-eval/);
            assert.ok(csp.includes("script-src-attr 'none'"));
        }
        assert.equal(pages.get('/').doc.title,'WEB 2 | فروشگاه تجهیزات گیمینگ');
        assert.deepEqual(graph(pages.get('/').doc).map(s => s['@type']),['Organization','WebSite']);
    });
    await t.test('product schema and visible prices use the trusted API data with honest stock and no fabricated reviews', () => {
        for (const p of publicCatalog) {
            const {doc} = pages.get(productPath(p.id)), schema = graph(doc).find(s => s['@type'] === 'Product');
            assert.equal(doc.title,p.name + ' | WEB 2'); assert.equal(doc.querySelector('h1').textContent,p.name);
            assert.ok(meta(doc,'description').startsWith(p.name));
            assert.equal(schema.name,p.name); assert.equal(schema.sku,String(p.id));
            if (p.brand) assert.equal(schema.brand.name,p.brand);
            else assert.equal(schema.brand,undefined);
            assert.equal(schema.description,(p.description || p.shortDescription).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
            const price = Math.round(p.price * (100 - Math.min(99,Math.max(0,Number(p.discount) || 0))) / 100);
            assert.equal(schema.offers.price,price * 10); assert.equal(schema.offers.priceCurrency,'IRR');
            assert.equal(schema.offers.availability,'https://schema.org/' + (p.stock > 0 ? 'InStock' : 'OutOfStock'));
            assert.ok(doc.querySelector('.detail-price').textContent.includes(new Intl.NumberFormat('fa-IR').format(price) + ' تومان'));
            assert.equal(schema.review,undefined); assert.equal(schema.aggregateRating,undefined); assert.equal(schema.rating,undefined);
            const trail = graph(doc).find(s => s['@type'] === 'BreadcrumbList').itemListElement;
            assert.deepEqual(trail.map(i => i.name),['خانه','محصولات',categoryName(p.category),p.name]);
            assert.equal(trail[1].item,origin + '/products');
            assert.equal(trail[2].item,origin + categoryPath(p.category));
        }
    });
    await t.test('all social cards use live local PNG/JPEG/WebP files and support HEAD', async () => {
        for (const image of socialPaths) {
            const response = await get(image), buffer = Buffer.from(await response.arrayBuffer());
            assert.equal(response.status,200,image); assert.match(response.headers.get('Content-Type'),/image\/(?:png|jpeg|webp)/);
            assert.equal(buffer.toString('hex',0,8),'89504e470d0a1a0a');
            assert.equal(buffer.readUInt32BE(16),1200); assert.equal(buffer.readUInt32BE(20),630);
            const head = await get(image,{method:'HEAD'}); assert.equal(head.status,200); assert.equal((await head.text()).length,0);
        }
    });
    await t.test('sitemap and robots expose only canonical public URLs; no private data leaks into discovery', async () => {
        const response = await get('/sitemap.xml'); assert.equal(response.status,200);
        assert.match(response.headers.get('Content-Type'),/application\/xml; charset=utf-8/i);
        const sitemap = new JSDOM(await response.text(),{contentType:'application/xml'}).window.document;
        assert.equal(sitemap.documentElement.namespaceURI,'http://www.sitemaps.org/schemas/sitemap/0.9');
        const locations = [...sitemap.querySelectorAll('loc')].map(el => el.textContent);
        assert.deepEqual(new Set(locations),new Set(publicRoutes.map(route => origin + route)));
        assert.equal(new Set(locations).size,locations.length);
        for (const location of locations) assert.doesNotMatch(new URL(location).pathname,/admin|profile|account|auth|cart|checkout|api|backup/i);
        const robots = await get('/robots.txt'), text = await robots.text();
        assert.equal(robots.status,200); assert.match(robots.headers.get('Content-Type'),/text\/plain; charset=utf-8/i);
        assert.ok(text.includes('Allow: /\n')); assert.ok(text.includes('Sitemap: ' + origin + '/sitemap.xml'));
        for (const route of ['/admin','/api/','/profile','/account','/auth','/cart','/checkout','/backup','/.backup','/.git','/.env','/var/']) assert.ok(text.includes('Disallow: ' + route + '\n'));
        for (const [route,{doc}] of pages) {
            if (!route.includes('product.html')) {
                const links = [...doc.querySelectorAll('#productGrid a.product-card-link')];
                assert.ok(links.length); for (const link of links) assert.ok(publicRoutes.includes(link.getAttribute('href')));
                assert.ok(doc.querySelector('a[href^="/categories/"]'));
            }
        }
        assert.equal(pages.get('/products').doc.querySelectorAll('#productGrid .product-card').length,publicCatalog.length);
    });
    await t.test('an operator-supplied Search Console HTML verification file is served only from the public root', async () => {
        const filename = 'google' + crypto.randomBytes(12).toString('hex') + '.html';
        const content = 'google-site-verification: ' + filename;
        const file = path.join(root,filename);
        fs.writeFileSync(file,content,{flag:'wx'});
        try {
            const response = await get('/'+filename);
            assert.equal(response.status,200);
            assert.match(response.headers.get('Content-Type'),/text\/html; charset=utf-8/i);
            assert.equal(await response.text(),content);
            assert.equal((await get('/google'+'x'.repeat(80)+'.html')).status,404);
        } finally {fs.unlinkSync(file);}
    });
    await t.test('canonical URLs ignore tracking/host headers; aliases and trailing slashes converge', async () => {
        for (const route of ['/product?id=' + product.id + '&utm_source=test','/product.html?utm_source=test&id=' + product.id]) {
            const doc = parse(await (await get(route,{headers:{Host:'evil.invalid','X-Forwarded-Host':'evil.invalid','X-Forwarded-Proto':'http'}})).text());
            assert.equal(doc.querySelector('link[rel="canonical"]').href,origin + productPath(product.id));
            assert.equal(meta(doc,'og:url'),origin + productPath(product.id));
        }
        for (const route of ['/index','/index.html','/index.html/','/products/','/categories/' + encodeURIComponent(category) + '/']) {
            const response = await get(route,{redirect:'manual'}); assert.equal(response.status,308,route);
        }
        const home = parse(await (await get('/?utm_campaign=test')).text()); assert.equal(home.querySelector('link[rel="canonical"]').href,origin + '/');
        const sized = parse(await (await get('/products?pageSize=1&utm_source=test')).text());
        assert.equal(sized.querySelector('link[rel="canonical"]').href,origin + '/products');
        assert.equal(sized.querySelectorAll('#productGrid .product-card').length,publicCatalog.length);
        const etag = pages.get('/products').response.headers.get('ETag'); assert.ok(etag);
        // Explicit revalidation avoids fetch's default conditional-request no-store mode.
        const response = await get('/products',{cache:'no-cache',headers:{'If-None-Match':etag}}); assert.equal(response.status,304);
    });
    await t.test('private documents, auth flows, APIs and denials send noindex and retain access controls', async () => {
        for (const route of ['/cart','/cart.html','/checkout','/checkout.html','/profile','/profile.html','/admin-login','/admin-login.html']) {
            const response = await get(route), doc = parse(await response.text());
            assert.equal(response.status,200,route); assert.equal(meta(doc,'robots'),'noindex,nofollow');
            assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');
            assert.equal(response.headers.get('Cache-Control'),'no-store'); assert.match(response.headers.get('Vary'),/Cookie/);
            assert.equal(doc.querySelector('link[rel="canonical"]'),null);
        }
        assert.equal(pages.get('/').doc.querySelectorAll('h1').length,1);
        const checkout = parse(await (await get('/checkout.html')).text()); assert.equal(checkout.querySelectorAll('h1').length,1);
        const admin = await get('/admin',{redirect:'manual'}); assert.equal(admin.status,302); assert.equal(admin.headers.get('Location'),'/admin-login'); assert.equal(admin.headers.get('X-Robots-Tag'),'noindex, nofollow');
        for (const route of ['/api/products','/api/users/me','/api/orders','/api/admin/products','/api/auth/session','/api/not-found']) assert.equal((await get(route)).headers.get('X-Robots-Tag'),'noindex, nofollow');
        for (const route of ['/.env','/.git/config','/.backup-final/index.html','/var/web2.sqlite','/server.js','/admin.html']) {
            const response = await get(route); assert.equal(response.status,404,route); assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');
        }
        assert.equal((await get('/api/admin/products')).status,401);
    });
    await t.test('missing and malformed product/category paths return a real, useful 404 without resurrecting cached products', async () => {
        for (const route of ['/product.html','/product.html?id=absent','/product.html?id=1&id=2','/product.html?id[x]=1','/categories/absent','/missing-page','/forgot-password','/reset-password']) {
            const response = await get(route), doc = parse(await response.text());
            assert.equal(response.status,404,route); assert.equal(meta(doc,'robots'),'noindex,nofollow');
            assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow'); assert.equal(doc.querySelectorAll('h1').length,1);
            assert.ok(doc.querySelector('a[href="/products"]')); assert.equal(doc.querySelector('script[src*="script.js"]'),null);
            assert.equal(doc.querySelector('link[rel="canonical"]'),null); assert.equal(doc.querySelector('#seo-structured-data'),null);
        }
        const api = await get('/api/products/absent'); assert.equal(api.status,404); assert.match(api.headers.get('Content-Type'),/application\/json/);
    });
    await t.test('progressive enhancement preserves SSR content and server metadata while filters/cart still work', async () => {
        const source = fs.readFileSync(path.join(root,'script.js'),'utf8');
        for (const route of [productPath(product.id), categoryPath(category)]) {
            const {html} = pages.get(route), dom = new JSDOM(html,{url:base + route,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
            try {
                const w = dom.window, run = code => vm.runInContext(code,dom.getInternalVMContext());
                w.fetch = async(url,options) => fetch(new URL(url,base),options);
                run(source); run('initializeStore.initialized=true');
                const before = w.document.querySelector('main h1').textContent;
                const canonical = w.document.querySelector('link[rel="canonical"]').href;
                const prerendered = w.document.querySelector('#productGrid')?.innerHTML;
                run('renderHomeDiscovery();renderProducts()');
                if (prerendered) assert.equal(w.document.querySelector('#productGrid').innerHTML,prerendered);
                if (route.startsWith('/product')) {run('productsLoading=true;renderProductDetail()');assert.equal(w.document.querySelector('main h1').textContent,before);}
                await run('loadProductsFromApi()'); run('renderHomeDiscovery();renderProducts();setupProductControls();setupGlobalActions();setupAuthUI();setupProductImageFallback()');
                assert.equal(w.document.querySelector('link[rel="canonical"]').href,canonical);
                assert.equal(w.document.querySelector('main h1').textContent,before);
                assert.equal(w.document.title,pages.get(route).doc.title);
                for (const image of w.document.querySelectorAll('img.product-image')) assert.equal(new URL(image.src).pathname.startsWith('/img/'),true);
                for (const link of w.document.querySelectorAll('.product-card-link')) assert.equal(new URL(link.href).pathname,'/product.html');
                assert.equal(new URL(w.document.querySelector('#authForm a').href).pathname,'/profile.html');
                const brokenImage = w.document.querySelector('img.product-image'); brokenImage.dispatchEvent(new w.Event('error'));
                assert.equal(new URL(brokenImage.src).pathname,'/img/product-placeholder.svg');
                if (route.startsWith('/categories/')) {
                    assert.equal(w.document.querySelector('#categoryFilter').value,category);
                    assert.equal(w.document.querySelectorAll('#productGrid .product-card').length,publicCatalog.filter(p => categoryName(p.category) === category).length);
                    w.document.querySelector('#productSearch').value='definitely-no-such-product';run('renderProducts()'); assert.equal(w.document.querySelectorAll('#productGrid .product-card').length,0);
                    w.document.querySelector('#clearProductFilters').click(); assert.equal(w.document.querySelector('#categoryFilter').value,category);
                } else {
                    run('getCurrentUser=()=>({id:"seo-ui-user"})'); w.document.querySelector('[data-add-to-cart]').click(); assert.equal(run('getCart()[0].id'),String(product.id));
                }
            } finally {dom.window.close();}
        }
    });
    let cookie = '', csrf = '';
    const adminRequest = async(route,method='GET',body) => {
        if(body&&['PUT','DELETE'].includes(method)&&/^\/api\/admin\/products\/[^/]+$/.test(route)&&body.revision===undefined){const current=await adminRequest(route);if(current.response.status===200)body={...body,revision:current.data.revision};}
        const response = await get(route,{method,headers:{Origin:origin,...(cookie ? {Cookie:cookie} : {}),'Content-Type':'application/json',...(csrf ? {'X-CSRF-Token':csrf} : {})},body:JSON.stringify(body)});
        const data = response.status === 204 ? null : await response.json();
        if (response.headers.getSetCookie().length) cookie=response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
        if (data?.csrfToken) csrf=data.csrfToken;
        return {response,data};
    };
    await t.test('admin changes automatically refresh sitemap/schema; inactive/deleted products disappear and unsafe fields stay inert', async () => {
        const login = await adminRequest('/api/admin/login','POST',{username:'seo-admin',password,captchaToken:'test-valid-captcha'}); assert.equal(login.response.status,200);
        const admin = await get('/admin',{headers:{Cookie:cookie}}), adminDoc = parse(await admin.text());
        assert.equal(admin.status,200); assert.equal(meta(adminDoc,'robots'),'noindex,nofollow'); assert.equal(admin.headers.get('X-Robots-Tag'),'noindex, nofollow');
        const replacementTokens = "$& $` $'";
        const name = 'محصول آزمایشی "</title><script>window.seoInjected=true</script> ' + replacementTokens, newCategory = 'دسته آزمایشی & ویژه ' + replacementTokens;
        const payload = {name,brand:'TEST BRAND',category:newCategory,price:234567,discount:25,stock:0,status:'active',image:'img/products/absent.png',shortDescription:'توضیح اختصاصی "</script><img src=x onerror=alert(1)> ' + replacementTokens,description:'توضیح محصول <script>unsafe()</script> ' + replacementTokens,features:['ویژگی <img src=x> ' + replacementTokens]};
        const created = await adminRequest('/api/admin/products','POST',payload); assert.equal(created.response.status,201);
        const url = productPath(created.data.id);
        const discoveryURLs = async () => [...new JSDOM(await (await get('/sitemap.xml')).text(),{contentType:'application/xml'}).window.document.querySelectorAll('loc')].map(el => el.textContent);
        let sitemap = await discoveryURLs(); assert.ok(sitemap.includes(origin + url)); assert.ok(sitemap.includes(origin + categoryPath(newCategory)));
        let doc = parse(await (await get(url)).text()), schema = graph(doc).find(s => s['@type'] === 'Product');
        assert.equal(doc.querySelector('h1').textContent,name); assert.equal(doc.querySelectorAll('title').length,1); assert.equal(doc.querySelectorAll('img[src="x"]').length,0);
        assert.equal(doc.title,name + ' | WEB 2'); assert.equal(meta(doc,'og:title'),doc.title); assert.equal(doc.querySelectorAll('main').length,1);
        assert.equal(doc.querySelector('.detail-intro').textContent,payload.description); assert.equal(doc.querySelector('.detail-features span').textContent,payload.features[0]);
        assert.equal(doc.querySelectorAll('script:not([src]):not([type="application/ld+json"])').length,0); assert.equal(schema.name,name);
        assert.equal(schema.offers.price,Math.round(234567 * .75) * 10); assert.equal(schema.offers.availability,'https://schema.org/OutOfStock'); assert.equal(schema.image,undefined);
        assert.equal(meta(doc,'og:image'),origin + '/img/social/store.png');
        const categoryDoc = parse(await (await get(categoryPath(newCategory))).text()); assert.equal(categoryDoc.querySelector('h1').textContent,newCategory);
        assert.equal(categoryDoc.querySelector('body').dataset.category,newCategory); assert.equal(categoryDoc.querySelector('.product-card h3').textContent,name);
        for (const route of ['/', '/products']) {
            const listing = parse(await (await get(route)).text());
            assert.equal([...listing.querySelectorAll('.product-card h3')].find(el => el.textContent === name)?.textContent,name);
            assert.equal(listing.querySelectorAll('main').length,1); assert.equal(listing.querySelectorAll('title').length,1);
        }
        assert.equal((await get(new URL(meta(doc,'og:image')).pathname)).status,200);
        const update = await adminRequest('/api/admin/products/' + created.data.id,'PUT',{price:345678,discount:10,stock:3}); assert.equal(update.response.status,200);
        doc=parse(await (await get(url)).text()); schema=graph(doc).find(s => s['@type'] === 'Product'); assert.equal(schema.offers.price,Math.round(345678 * .9) * 10); assert.equal(schema.offers.availability,'https://schema.org/InStock');
        assert.equal((await adminRequest('/api/admin/products/' + created.data.id,'PUT',{status:'inactive'})).response.status,200);
        assert.equal((await get(url)).status,404); sitemap=await discoveryURLs(); assert.ok(!sitemap.includes(origin + url)); assert.ok(!sitemap.includes(origin + categoryPath(newCategory)));
        assert.equal((await adminRequest('/api/admin/products/' + created.data.id,'DELETE',{confirm:true,confirmationPhrase:'DELETE'})).response.status,204);
        assert.equal((await get(url)).status,404);
    });
    await t.test('checkout quote matches public schema currency conversion and public HTML never includes account data', async () => {
        cookie='';csrf='';
        const register=await adminRequest('/api/auth/register','POST',{name:'SEO private canary 92741',email:'seo-private-canary-92741@example.invalid',phone:'09129998321',password,captchaToken:'test-valid-captcha'}); assert.equal(register.response.status,201);
        const quote=await adminRequest('/api/checkout/quote','POST',{items:[{id:String(product.id),quantity:1}]}); assert.equal(quote.response.status,200);
        const schema=graph(pages.get(productPath(product.id)).doc).find(s => s['@type'] === 'Product'); assert.equal(schema.offers.price,quote.data.items[0].unitPrice * 10);
        const publicResponse=await get('/',{headers:{Cookie:cookie}}), html=await publicResponse.text(); assert.doesNotMatch(html,/SEO private canary|seo-private-canary/);
        assert.equal(publicResponse.headers.get('Vary'),null);
        assert.equal((await adminRequest('/api/admin/products','POST',{name:'forbidden'})).response.status,403);
        const missingCsrf=await get('/api/checkout',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:'{}'}); assert.equal(missingCsrf.status,403);
    });
});

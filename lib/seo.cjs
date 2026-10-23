'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const {pageQuery}=require('./listing.cjs');
const path = require('node:path');
const crypto = require('node:crypto');
const safeURL = require('../js/safe-url.js');

const SITE_NAME = 'WEB 2';
const HOME_TITLE = 'WEB 2 | فروشگاه تجهیزات گیمینگ';
const HOME_DESCRIPTION = 'WEB 2؛ فروشگاه تجهیزات گیمینگ برای بررسی کیبورد، موس، هدست و لوازم ستاپ؛ مشاهده مشخصات، قیمت و موجودی محصولات.';
// Keep the public taxonomy identical to normalizeProductCategory in script.js.
const CATEGORY_ALIASES = Object.freeze({
    'هدست گیمینگ':'هدست', 'مانیتور گیمینگ':'مانیتور', 'کنترلر گیمینگ':'دسته بازی',
    'وبکم':'تجهیزات استریم', 'حافظه گیمینگ':'قطعات کامپیوتر', 'خنک‌کننده':'قطعات کامپیوتر',
    'گیمینگ':'لوازم جانبی گیمینگ', 'اسپیکر گیمینگ':'لوازم جانبی گیمینگ',
    'موسپد گیمینگ':'لوازم جانبی گیمینگ', 'هاب و تجهیزات USB':'لوازم جانبی گیمینگ', 'لوازم ستاپ':'لوازم جانبی گیمینگ'
});
const categoryName = value => {
    const name = String(value || 'لوازم جانبی گیمینگ').trim();
    return Object.hasOwn(CATEGORY_ALIASES,name) ? CATEGORY_ALIASES[name] : name;
};
const categoryPath = name => '/categories/' + encodeURIComponent(categoryName(name));
const productPath = id => '/product.html?id=' + encodeURIComponent(String(id));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plainText = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const shorten = (value, max = 160) => {
    const text = plainText(value);
    return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
};
function productDescription(product) {
    const intro = `${product.name}؛ ${categoryName(product.category)}.`;
    return shorten(`${intro} ${product.shortDescription || product.description || 'مشاهده مشخصات، قیمت و موجودی در WEB 2.'}`);
}
function unitPrice(product) {
    const percent = Number.isFinite(Number(product.discount)) ? Math.min(99, Math.max(0, Number(product.discount))) : 0;
    const price = Math.round(product.price * (100 - percent) / 100);
    return Number.isSafeInteger(product.price) && product.price > 0 && Number.isSafeInteger(price) && price > 0 ? price : null;
}
function jsonLD(value) {
    // JSON in a script data block must never be able to close the element.
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
function configuredOrigin(env = process.env) {
    const input = env.APP_ORIGIN || `http://localhost:${env.PORT || 3000}`;
    const url = new URL(input.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash
        || env.NODE_ENV === 'production' && (!env.APP_ORIGIN || url.protocol !== 'https:')) throw Error('SEO requires a valid APP_ORIGIN; production requires HTTPS.');
    return url.origin;
}

function installSeo(app, {store, root, origin = configuredOrigin()}) {
    const templates = Object.fromEntries(['index.html','product.html','catalog.html','404.html'].map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
    const absolute = relative => new URL(relative, origin + '/').href;
    const imageRoot = fs.realpathSync(path.join(root, 'img'));
    const imageReads=new Map();
    async function localImage(value) {
        if (!safeURL.image(value, {allowData:false}) || !value.startsWith('img/')) return '';
        if(imageReads.has(value))return imageReads.get(value);
        const task=(async()=>{try {
            const filename = await fsp.realpath(path.join(root, value));
            const relative = path.relative(imageRoot, filename);
            return relative && !relative.startsWith('..') && !path.isAbsolute(relative) && (await fsp.stat(filename)).isFile() ? '/' + value : '';
        } catch { return ''; }})();
        // Share concurrent checks only. Revalidate real paths on the next render.
        if(imageReads.size<1000)imageReads.set(value,task);
        try{return await task;}finally{if(imageReads.get(value)===task)imageReads.delete(value);}
    }
    async function displayImage(product) {
        const image = safeURL.image(product.image);
        return image?.startsWith('https://') || image?.startsWith('data:') ? image : (await localImage(image)) || '/img/product-placeholder.svg';
    }
    async function socialImage(product) {
        const local = await localImage(product?.image || '');
        // SVG/data URLs are poorly supported by social crawlers. The shipped PNGs
        // are raster copies of the existing artwork, not invented product photos.
        if (local && /\.(?:png|jpe?g|webp)$/i.test(local)) return local;
        const raster = local && await localImage('img/social/' + path.basename(local, path.extname(local)) + '.png');
        return raster || '/img/social/store.png';
    }
    const activeProducts = () => store.list('products').filter(product => product.status === 'active' && !product.deletedAt);
    const categories = products => [...new Set(products.map(p => categoryName(p.category)))];
    const numberFormatter = new Intl.NumberFormat('fa-IR');
    const formatNumber = number => numberFormatter.format(number);
    const formatPrice = number => `${formatNumber(number)} تومان`;
    const icon = product => /^fa-[a-z0-9-]+$/i.test(product.icon || '') ? product.icon : 'fa-gamepad';
    const accent = product => /^#[a-f0-9]{6}$/i.test(product.accent || '') ? product.accent : '#00d4ff';
    const stockLabel = product => !Number.isSafeInteger(product.stock) || product.stock < 1 ? 'ناموجود' : product.stock <= 3 ? 'موجودی محدود' : 'موجود';
    async function cards(products, compact = false) {
        return (await Promise.all(products.map(async p => `<article class="product-card${compact ? ' product-card-compact' : ''}" style="--accent:${accent(p)};--accent-soft:${accent(p)}18;--accent-soft-strong:${accent(p)}66">
            <button class="wishlist-heart" type="button" data-wishlist-product="${escapeHTML(p.id)}" aria-label="افزودن به علاقه‌مندی‌ها" aria-pressed="false"><span data-wishlist-icon aria-hidden="true">♡</span></button>
            <a class="product-card-link" href="${escapeHTML(productPath(p.id))}" aria-label="مشاهده مشخصات ${escapeHTML(p.name)}">
                <div class="product-art"><span class="product-tag stock-label${p.stock > 0 ? '' : ' out-of-stock'}">${stockLabel(p)}</span><img class="product-card-image product-image" src="${escapeHTML(await displayImage(p))}" alt="${escapeHTML(p.name)}" width="480" height="360" loading="lazy" decoding="async"><i class="fa-solid ${icon(p)} product-image-fallback" aria-hidden="true"></i></div>
                <div class="product-body"><span class="product-brand">${escapeHTML(p.brand)}</span><span class="product-category">${escapeHTML(categoryName(p.category))}</span><h3>${escapeHTML(p.name)}</h3><p class="product-description">${escapeHTML(p.features?.[0] || p.shortDescription || p.description)}</p>
                    <div class="product-footer"><span class="product-price"><span>قیمت</span>${Number(p.discount) > 0 ? `<del class="product-old-price">${formatPrice(p.price)}</del>` : ''}<strong>${unitPrice(p) === null ? 'قیمت در دسترس نیست' : formatPrice(unitPrice(p))}</strong></span><span class="view-product">مشاهده مشخصات <i class="fa-solid fa-arrow-left" aria-hidden="true"></i></span></div>
                </div>
            </a><div class="product-card-actions"><button class="primary-button card-add-button" type="button" data-add-to-cart="${escapeHTML(p.id)}" aria-label="افزودن ${escapeHTML(p.name)} به سبد خرید"${p.stock > 0 && unitPrice(p) !== null ? '' : ' disabled'}><i class="fa-solid fa-cart-plus" aria-hidden="true"></i> ${p.stock > 0 ? 'افزودن به سبد' : 'ناموجود'}</button></div></article>`))).join('');
    }
    function categoryLinks(products, limit = Infinity) {
        return categories(products).slice(0, limit).map(name => {
            const members = products.filter(p => categoryName(p.category) === name), first = members[0];
            return `<a class="category-card" href="${escapeHTML(categoryPath(name))}" data-category-select="${escapeHTML(name)}" style="--category-accent:${accent(first)}"><span><i class="fa-solid ${icon(first)}" aria-hidden="true"></i></span><strong>${escapeHTML(name)}</strong><small>${formatNumber(members.length)} محصول</small></a>`;
        }).join('');
    }
    function breadcrumbs(items) {
        return {'@type':'BreadcrumbList', itemListElement:items.map(([name, url], i) => ({'@type':'ListItem',position:i + 1,name,item:absolute(url)}))};
    }
    async function metadata({title, description, url, product, graph = [], index = true}) {
        const image = absolute(await socialImage(product));
        const tags = `<title>${escapeHTML(title)}</title>
    <meta name="description" content="${escapeHTML(description)}">
    <meta name="robots" content="${index ? 'index,follow' : 'noindex,nofollow'}">
    ${url ? `<link rel="canonical" href="${escapeHTML(absolute(url))}">` : ''}
    <meta property="og:locale" content="fa_IR">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:type" content="${product ? 'product' : 'website'}">
    <meta property="og:title" content="${escapeHTML(title)}">
    <meta property="og:description" content="${escapeHTML(description)}">
    ${url ? `<meta property="og:url" content="${escapeHTML(absolute(url))}">` : ''}
    <meta property="og:image" content="${escapeHTML(image)}">
    <meta property="og:image:alt" content="${escapeHTML(product?.name || 'WEB 2؛ تجهیزات گیمینگ')}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHTML(title)}">
    <meta name="twitter:description" content="${escapeHTML(description)}">
    <meta name="twitter:image" content="${escapeHTML(image)}">
    <meta name="twitter:image:alt" content="${escapeHTML(product?.name || 'WEB 2؛ تجهیزات گیمینگ')}">`;
        const json = graph.length ? jsonLD({'@context':'https://schema.org','@graph':graph}) : '';
        return {tags:tags + (json ? `\n    <script id="seo-structured-data" type="application/ld+json">${json}</script>` : ''), json};
    }
    const pages=new Map(),inFlight=new Map();let pageBytes=0,epoch='';
    const currentEpoch=()=>store.epoch();
    function deliver(res,entry){
        if(entry.hash)res.set('Content-Security-Policy',String(res.get('Content-Security-Policy')).replace(/script-src ([^;]+)/,match=>match+` 'sha256-${entry.hash}'`));
        return res.status(entry.status).set('Cache-Control','no-cache').set('X-Robots-Tag',entry.index===false?'noindex, nofollow':'index, follow').type('html').send(entry.body);
    }
    function pageRoute(paths,handler){app.get(paths,(req,res,next)=>{Promise.resolve().then(async()=>{
        const version=currentEpoch();if(version!==epoch){pages.clear();pageBytes=0;epoch=version;}
        const key=JSON.stringify([req.path,req.query.id??'',req.query.page??'1',req.query.pageSize??'100']);
        const cached=pages.get(key);if(cached&&cached.expires>Date.now())return deliver(res,cached);
        const pending=inFlight.get(key);if(pending&&pending.version===version){const entry=await pending.promise;if(currentEpoch()===version&&entry)return deliver(res,entry);}
        let finish;const promise=new Promise(resolve=>finish=resolve);
        const task={version,promise};if(inFlight.size<64)inFlight.set(key,task);
        res.locals.seoCache={key,version,entry:null};
        try{return await handler(req,res);}finally{finish(res.locals.seoCache.entry);if(inFlight.get(key)===task)inFlight.delete(key);}
    }).catch(next);});}
    async function send(res, file, info, transform = html => html, status = 200) {
        const {tags, json} = await metadata(info);
        const template = templates[file].replace(/<title>[^]*?<\/title>\s*|<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>\s*|<link\b[^>]*rel="canonical"[^>]*>\s*/gi, '');
        // Replacer functions keep product text such as $&, $` and $' literal.
        const html = transform(template).replace('</head>', () => tags + '\n</head>');
        const entry={body:Buffer.from(html),hash:json?crypto.createHash('sha256').update(json).digest('base64'):null,status,index:info.index,expires:Date.now()+30000};
        const cache=res.locals.seoCache;
        if(cache){cache.entry=entry;if(cache.version===currentEpoch()&&entry.body.length<=2*1024*1024){
            const previous=pages.get(cache.key);if(previous){pageBytes-=previous.body.length;pages.delete(cache.key);}
            while(pages.size>=32||pageBytes+entry.body.length>8*1024*1024){const key=pages.keys().next().value,old=pages.get(key);if(!old)break;pageBytes-=old.body.length;pages.delete(key);}
            pages.set(cache.key,entry);pageBytes+=entry.body.length;
        }}
        return deliver(res,entry);
    }

    function notFound(_req, res) {
        return send(res, '404.html', {title:'صفحه پیدا نشد | WEB 2',description:'این صفحه یا محصول در فروشگاه WEB 2 در دسترس نیست؛ از فهرست محصولات استفاده کنید.',index:false}, html => html, 404);
    }
    app.get('/robots.txt', (_req, res) => {
        const blocked = ['/admin','/api/','/profile','/account','/auth','/login','/register','/forgot-password','/reset-password','/password-reset','/orders','/cart','/checkout','/.env','/.git','/.backup','/backup','/backups','/var/','/logs/','/log/','/lib/','/backend/','/gaming-store/','/gaming-ecommerce/','/node_modules/','/deploy/','/docs/','/scripts/','/tests/','/.runtime/','/data.json'];
        res.set('Cache-Control','no-cache').type('text/plain').send('User-agent: *\nAllow: /\n' + blocked.map(p => 'Disallow: ' + p).join('\n') + '\n\nSitemap: ' + absolute('/sitemap.xml') + '\n');
    });
    let sitemapCache = null;
    app.get('/sitemap.xml', (_req, res) => {
        const version = currentEpoch();
        if (sitemapCache?.version === version && sitemapCache.expires > Date.now()) {
            return res.set('Cache-Control','no-cache').type('application/xml').send(sitemapCache.xml);
        }
        const products = activeProducts();
        const entries = [{url:'/'},{url:'/products'}, ...categories(products).map(name => ({url:categoryPath(name)})), ...products.map(p => ({url:productPath(p.id),lastmod:p.updatedAt || p.createdAt}))];
        const xml = entries.map(entry => {
            const date = typeof entry.lastmod === 'string' ? new Date(entry.lastmod) : null;
            const lastmod = date && Number.isFinite(date.getTime()) && date.getTime() <= Date.now() ? `<lastmod>${date.toISOString()}</lastmod>` : '';
            return `<url><loc>${escapeHTML(absolute(entry.url))}</loc>${lastmod}</url>`;
        }).join('\n');
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xml}\n</urlset>\n`;
        sitemapCache = {version,expires:Date.now()+30000,xml:body};
        return res.set('Cache-Control','no-cache').type('application/xml').send(body);
    });
    app.get(['/index','/index.html'], (req,res) => res.redirect(308, '/' + (req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '')));
    pageRoute('/', async (_req,res) => {
        const products = activeProducts();
        const featured=await cards(products.filter(p=>p.featured).slice(0,4),true),grid=await cards(products.slice(0,100));
        const organization = {'@type':'Organization','@id':absolute('/#organization'),name:SITE_NAME,url:absolute('/')};
        const website = {'@type':'WebSite','@id':absolute('/#website'),name:SITE_NAME,url:absolute('/'),inLanguage:'fa-IR',publisher:{'@id':organization['@id']}};
        return send(res,'index.html',{title:HOME_TITLE,description:HOME_DESCRIPTION,url:'/',graph:[organization,website]}, html => html
            .replace('<body data-page="home">','<body data-page="home" data-server-seo="true">')
            .replace('<strong id="homeProductCount">—</strong>', () => `<strong id="homeProductCount">${formatNumber(products.length)}</strong>`)
            .replace('<!-- SEO:CATEGORIES -->', () => categoryLinks(products,8))
            .replace('<!-- SEO:FEATURED -->', () => featured)
            .replace('<!-- SEO:PRODUCTS -->', () => grid+(products.length>100?'<a class="secondary-button" href="/products">مشاهده همه محصولات</a>':'')));
    });
    pageRoute(['/products','/categories/:category'], async (req,res) => {
        const products = activeProducts();
        const category = req.params.category ? categoryName(req.params.category) : '';
        if (category && !categories(products).includes(category)) return notFound(req,res);
        // The public listing has one fixed page size. A query parameter must not
        // change the products shown under the same canonical page URL.
        pageQuery(req.query,100); // preserve validation of supplied pagination values
        const {page,pageSize,offset}=pageQuery({page:req.query.page},100);
        const baseURL=category?categoryPath(category):'/products';
        const url=baseURL+(page>1?'?page='+page:'');
        if (req.path !== baseURL) return res.redirect(308, url);
        const selected = category ? products.filter(p => categoryName(p.category) === category) : products;
        const selectedPages=Math.ceil(selected.length/pageSize);if(page>Math.max(1,selectedPages))return notFound(req,res);
        const grid=await cards(selected.slice(offset,offset+pageSize));
        const pagination=selectedPages>1?`<nav class="catalog-pagination" aria-label="صفحه‌بندی محصولات">${page>1?`<a class="secondary-button" rel="prev" href="${escapeHTML(baseURL+(page>2?'?page='+(page-1):''))}">قبلی</a>`:''}<span>${formatNumber(page)} / ${formatNumber(selectedPages)}</span>${page<selectedPages?`<a class="secondary-button" rel="next" href="${escapeHTML(baseURL+'?page='+(page+1))}">بعدی</a>`:''}</nav>`:'';
        const heading = category || 'محصولات گیمینگ';
        const description = category ? shorten(`خرید و بررسی ${category} در WEB 2؛ مقایسه مشخصات، قیمت و موجودی ${category} برای انتخاب تجهیزات مناسب ستاپ شما.`) : 'فهرست محصولات WEB 2؛ بررسی و مقایسه تجهیزات گیمینگ، دسته‌بندی‌ها، قیمت و موجودی کیبورد، موس، هدست و لوازم ستاپ.';
        const trail = [['خانه','/'],['محصولات','/products'],...(category ? [[category,url]] : [])];
        return send(res,'catalog.html',{title:`${heading} | WEB 2`,description,url,graph:[breadcrumbs(trail)]}, html => html
            .replace('data-category=""', () => `data-category="${escapeHTML(category)}"`)
            .replace('<!-- SEO:HEADING -->', () => escapeHTML(heading))
            .replace('<!-- SEO:DESCRIPTION -->', () => escapeHTML(description))
            .replace('<!-- SEO:BREADCRUMB -->', () => category ? `<i class="fa-solid fa-angle-left" aria-hidden="true"></i><span aria-current="page">${escapeHTML(category)}</span>` : '')
            .replace('<!-- SEO:CATEGORIES -->', () => categoryLinks(products))
            .replace('<!-- SEO:OPTIONS -->', () => categories(products).map(name => `<option value="${escapeHTML(name)}"${category === name ? ' selected' : ''}>${escapeHTML(name)}</option>`).join(''))
            .replace('<!-- SEO:PRODUCTS -->', () => grid+pagination));
    });
    pageRoute(['/product','/product.html'], async (req,res) => {
        const id = req.query.id;
        const product = typeof id === 'string' && id.length <= 200 ? store.get('products',id) : null;
        if (!product||product.status!=='active'||product.deletedAt) return notFound(req,res);
        const url = productPath(product.id), category = categoryName(product.category), price = unitPrice(product);
        if (req.path.endsWith('/')) return res.redirect(308,url);
        const schema = {'@type':'Product','@id':absolute(url + '#product'),url:absolute(url),name:product.name,description:plainText(product.description || product.shortDescription),sku:String(product.id),category};
        const actualImage = await localImage(product.image || '');
        if (actualImage) schema.image = absolute(await socialImage(product));
        else if (safeURL.image(product.image, {allowData:false})?.startsWith('https://')) schema.image = product.image;
        if (product.brand) schema.brand = {'@type':'Brand',name:product.brand};
        // Stored/displayed prices are integer toman; this app's currency contract
        // is 1 toman = 10 IRR. Checkout uses toman, ISO metadata uses IRR.
        if (price !== null && Number.isSafeInteger(price * 10)) {
            schema.offers = {'@type':'Offer',url:absolute(url),price:price * 10,priceCurrency:'IRR'};
            if (Number.isSafeInteger(product.stock) && product.stock >= 0) schema.offers.availability = 'https://schema.org/' + (product.stock > 0 ? 'InStock' : 'OutOfStock');
        }
        // Seed/admin rating fields are not verified customer reviews: never emit them.
        const trail = [['خانه','/'],['محصولات','/products'],[category,categoryPath(category)],[product.name,url]];
        const inStock = Number.isSafeInteger(product.stock) && product.stock > 0;
        const detail = `<article class="product-detail-grid" style="--accent:${accent(product)};--accent-soft:${accent(product)}18;--accent-soft-strong:${accent(product)}66">
            <div class="detail-visual"><img class="product-detail-image product-image" src="${escapeHTML(await displayImage(product))}" alt="${escapeHTML(product.name)}" width="480" height="360" loading="eager" fetchpriority="high" decoding="async"><i class="fa-solid ${icon(product)} product-image-fallback" aria-hidden="true"></i><span class="detail-stock-badge ${inStock ? '' : 'out-of-stock'}">${inStock ? `${formatNumber(product.stock)} عدد موجود` : 'ناموجود'}</span></div>
            <div class="detail-info"><span class="detail-brand">${escapeHTML(product.brand)} / <a href="${escapeHTML(categoryPath(category))}">${escapeHTML(category)}</a></span><h1 class="rgb-text">${escapeHTML(product.name)}</h1>
                <div class="detail-purchase"><span class="detail-price"><span>قیمت محصول</span><strong>${price === null ? 'قیمت در دسترس نیست' : formatPrice(price)}</strong></span><span class="detail-stock-badge ${inStock ? '' : 'out-of-stock'}">${stockLabel(product)}</span></div>
                <div class="detail-buttons"><button class="primary-button" type="button" data-add-to-cart="${escapeHTML(product.id)}"${inStock && price !== null ? '' : ' disabled'}><i class="fa-solid fa-cart-plus" aria-hidden="true"></i> ${inStock ? 'افزودن به سبد خرید' : 'ناموجود'}</button><button class="secondary-button wishlist-detail" type="button" data-wishlist-product="${escapeHTML(product.id)}" aria-label="افزودن به علاقه‌مندی‌ها" aria-pressed="false"><i class="fa-solid fa-heart" aria-hidden="true"></i> علاقه‌مندی</button></div>
                <p class="purchase-note">هزینه ارسال در سبد و بررسی سفارش نمایش داده می‌شود. سفارش این نسخه آزمایشی است و وجهی دریافت نمی‌شود.</p>
                ${product.features?.length ? '<h2 class="detail-section-title">ویژگی‌های اصلی</h2>' : ''}<ul class="detail-features">${(Array.isArray(product.features) ? product.features : []).map(feature => `<li><i class="fa-solid fa-check" aria-hidden="true"></i><span>${escapeHTML(feature)}</span></li>`).join('')}</ul>
                <h2 class="detail-section-title">توضیحات محصول</h2><p class="detail-intro">${escapeHTML(product.description || product.shortDescription)}</p>
                <div class="detail-meta">${product.guarantee ? `<span>ضمانت درج‌شده در کاتالوگ: ${escapeHTML(product.guarantee)}</span>` : ''}<a href="/profile.html?section=support">پرسش درباره محصول و شرایط ضمانت</a><a href="/products">بازگشت به محصولات</a></div>
            </div></article>`;
        return send(res,'product.html',{title:`${product.name} | WEB 2`,description:productDescription(product),url,product,graph:[schema,breadcrumbs(trail)]}, html => html
            .replace('<body data-page="product">','<body data-page="product" data-server-seo="true">')
            .replace('aria-busy="true"','aria-busy="false" data-server-rendered="true"')
            .replace('<!-- SEO:DETAIL -->', () => detail)
            .replace('<!-- SEO:PRODUCT-NAME -->', () => escapeHTML(product.name))
            .replace('<!-- SEO:PRODUCT-CATEGORY -->', () => `<a href="${escapeHTML(categoryPath(category))}">${escapeHTML(category)}</a><i class="fa-solid fa-angle-left" aria-hidden="true"></i>`));
    });
    return {notFound};
}
module.exports = {installSeo, configuredOrigin, categoryName, categoryPath, productPath, productDescription, unitPrice, jsonLD};

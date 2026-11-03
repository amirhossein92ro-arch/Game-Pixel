(function (root, factory) {
    'use strict';
    const api = Object.freeze(factory());
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Web2ProductImages = api;
}(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    const extensions = ['webp', 'png', 'jpg', 'jpeg', 'avif'];
    const placeholders = /^(?:\/img\/product-placeholder\.svg|\/img\/hardware\/(?:cpu|motherboard|ram|gpu|ssd|cooler|psu|pc)\.svg|\/img\/products\/(?:accessories|chair|components|controller|headset|keyboard|microphone|monitor|mouse|streaming)\.svg)$/i;
    function local(value) {
        if (typeof value !== 'string' || value.length > 500) return '';
        const image = value.trim().replace(/^img\//, '/img/');
        if (!/^\/img\/[a-zA-Z0-9_./-]+\.(?:webp|png|jpe?g|gif|avif|svg)$/i.test(image)) return '';
        if (/backup/i.test(image)) return '';
        if (image.slice(1).split('/').some(part => !part || part === '.' || part.startsWith('.'))) return '';
        return image;
    }
    function isPlaceholder(value) { return placeholders.test(local(value)); }
    function type(product) {
        const p = product && typeof product === 'object' ? product : {};
        const name = String(p.name || p.title || '').toLowerCase();
        const category = String(p.category || '').trim().toLowerCase();
        // Specific names take precedence where an old catalog used broad categories.
        // A case fan is not a CPU cooler, and an empty case is not an assembled PC.
        if (/فن\s*کیس|case\s*fan/.test(name)) return 'case-fan';
        if (/سیستم\s*کامل|complete\s*(?:gaming\s*)?pc|assembled\s*pc/.test(name)) return 'complete-gaming-pc';
        if (/خنک[‌ -]*کننده\s*لپ[‌ -]*تاپ|laptop\s*cooler/.test(name)) return 'laptop-cooler';
        if (/پایه\s*خنک[‌ -]*کننده/.test(name)) return 'laptop-cooling-stand';
        if (/دسته\s*موبایل|mobile\s*controller/.test(name)) return 'mobile-controller';
        if (/آرکید|arcade/.test(name)) return 'arcade-controller';
        if (/ssd\s*اکسترنال|external\s*ssd/.test(name)) return 'external-ssd';
        if (/\bnvme\b/.test(name)) return 'nvme-ssd';
        if (/\bssd\b/.test(name)) return 'ssd';
        if (/کیت\s*رم|^(?:رم\s|ram\b)/.test(name)) return 'ram';
        if (/وبکم|وب‌کم|webcam/.test(name)) return 'webcam';
        if (/میکروفون|microphone/.test(name)) return 'microphone';
        if (/موس\s*پد|ماوس\s*پد|mouse\s*pad|desk\s*pad/.test(name)) return 'mousepad';
        if (/ساندبار|soundbar/.test(name)) return 'soundbar';
        if (/اسپیکر|speaker/.test(name)) return 'speaker';
        if (/هاب|usb\s*hub/.test(name)) return 'usb-hub';
        const groups = [
            ['cpu', /^(?:پردازنده|cpu|processor)$/],
            ['motherboard', /^(?:مادربرد|motherboard)$/],
            ['ram', /^(?:رم|ram|memory)$/],
            ['gpu', /^(?:کارت گرافیک|gpu|graphics card)$/],
            ['nvme-ssd', /^(?:ssd و حافظه|ssd|nvme|nvme ssd)$/],
            ['psu', /^(?:پاور|psu|power supply)$/],
            ['cpu-cooler', /^(?:خنک[‌ -]*کننده|cpu cooler|cooler)$/],
            ['gaming-case', /^(?:کیس|gaming case|pc case|case)$/],
            ['complete-gaming-pc', /^(?:سیستم کامل گیمینگ|complete gaming pc|gaming pc)$/],
            ['gaming-controller', /^(?:دسته بازی|کنترلر گیمینگ|controller|gaming controller)$/],
            ['keyboard', /^(?:کیبورد گیمینگ|کیبورد|keyboard)$/],
            ['mouse', /^(?:موس گیمینگ|موس|ماوس|mouse)$/],
            ['headset', /^(?:هدست گیمینگ|هدست|headset)$/],
            ['monitor', /^(?:مانیتور گیمینگ|مانیتور|monitor)$/],
            ['gaming-chair', /^(?:صندلی گیمینگ|صندلی|gaming chair|chair)$/],
            ['microphone', /^(?:میکروفون|microphone)$/]
        ];
        for (const entry of groups) if (entry[1].test(category)) return entry[0];
        // Broad accessory/component categories deliberately have no image fallback.
        return '';
    }
    function productCandidates(product) {
        const id = product && product.id !== undefined ? String(product.id) : '';
        return /^[a-zA-Z0-9_-]{1,120}$/.test(id) ? extensions.map(ext => '/img/products/product-' + id + '.' + ext) : [];
    }
    function categoryCandidates(product) {
        const slug = type(product);
        return slug ? extensions.map(ext => '/img/products/' + slug + '.' + ext) : [];
    }
    return {local, type, isPlaceholder, productCandidates, categoryCandidates};
}));

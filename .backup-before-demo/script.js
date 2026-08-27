"use strict";

const defaultProducts = [
    {
        id: 1,
        name: "کیبورد مکانیکی Nova K87",
        brand: "HYPERSTRIKE",
        icon: "fa-keyboard",
        accent: "#00d4ff",
        tag: "پرفروش",
        price: 3450000,
        stock: 14,
        rating: 4.9,
        reviews: 128,
        shortDescription: "کیبورد مکانیکی TKL با سوییچ‌های سریع، نورپردازی RGB و بدنه آلومینیومی.",
        description: "Nova K87 برای واکنش سریع و کنترل دقیق در بازی‌های رقابتی طراحی شده است. فرم جمع‌وجور آن فضای بیشتری برای حرکت موس ایجاد می‌کند و نورپردازی قابل تنظیم، ظاهر ستاپ شما را کامل می‌سازد.",
        features: ["سوییچ مکانیکی خطی", "نورپردازی RGB قابل تنظیم", "اتصال USB-C جداشونده", "Anti-Ghosting کامل", "کلیدهای مقاوم PBT", "بدنه آلومینیومی"],
        guarantee: "۱۸ ماه گارانتی",
        category: "کیبورد گیمینگ"
    },
    {
        id: 2,
        name: "موس بی‌سیم Pulse X1",
        brand: "VORTEX",
        icon: "fa-computer-mouse",
        accent: "#00ff66",
        tag: "فوق سبک",
        price: 2890000,
        stock: 21,
        rating: 4.8,
        reviews: 96,
        shortDescription: "موس فوق سبک ۶۳ گرمی با سنسور ۲۶۰۰۰ DPI و اتصال بی‌سیم کم‌تأخیر.",
        description: "Pulse X1 ترکیبی از وزن کم، دقت بالا و اتصال پایدار است. طراحی ارگونومیک و باتری بادوام آن برای جلسات طولانی بازی و رقابت‌های حساس عملکردی مطمئن فراهم می‌کند.",
        features: ["سنسور ۲۶۰۰۰ DPI", "وزن ۶۳ گرم", "اتصال 2.4GHz", "عمر باتری ۷۰ ساعته", "شش کلید قابل برنامه‌ریزی", "پایه‌های PTFE"],
        guarantee: "۱۲ ماه گارانتی",
        category: "موس گیمینگ"
    },
    {
        id: 3,
        name: "هدست فراگیر Sonic Pro",
        brand: "NEXUS AUDIO",
        icon: "fa-headphones",
        accent: "#8b5cf6",
        tag: "صدای 7.1",
        price: 4680000,
        stock: 9,
        rating: 4.7,
        reviews: 174,
        shortDescription: "هدست راحت با صدای فراگیر 7.1، میکروفون حذف نویز و درایورهای ۵۰ میلی‌متری.",
        description: "Sonic Pro صدایی دقیق و جهت‌دار ارائه می‌دهد تا کوچک‌ترین جزئیات محیط بازی را بشنوید. گوشی‌های نرم و میکروفون شفاف آن برای بازی تیمی و استفاده طولانی ایده‌آل هستند.",
        features: ["صدای مجازی 7.1", "درایور ۵۰ میلی‌متری", "میکروفون حذف نویز", "پد مموری‌فوم", "کنترل صدا روی گوشی", "اتصال USB و جک 3.5"],
        guarantee: "۲۴ ماه گارانتی",
        category: "هدست گیمینگ"
    },
    {
        id: 4,
        name: "صندلی گیمینگ Titan X",
        brand: "RACER SEAT",
        icon: "fa-chair",
        accent: "#ff4d6d",
        tag: "ارگونومیک",
        price: 14980000,
        stock: 5,
        rating: 4.9,
        reviews: 203,
        shortDescription: "صندلی ارگونومیک با تکیه‌گاه قابل تنظیم، دسته‌های چهاربعدی و فریم فلزی.",
        description: "Titan X برای حفظ وضعیت صحیح بدن در ساعت‌های طولانی طراحی شده است. تنظیمات گسترده، متریال مقاوم و بالشتک‌های حمایتی، راحتی و تمرکز شما را افزایش می‌دهند.",
        features: ["تکیه‌گاه تا ۱۶۰ درجه", "دسته‌های چهاربعدی", "فریم فولادی", "بالشتک گردن و کمر", "تحمل وزن تا ۱۵۰ کیلو", "چرخ‌های بی‌صدا"],
        guarantee: "۳۶ ماه گارانتی",
        category: "صندلی گیمینگ"
    },
    {
        id: 5,
        name: "دسته بازی Apex S5",
        brand: "APEX",
        icon: "fa-gamepad",
        accent: "#00d4ff",
        tag: "نسل جدید",
        price: 5280000,
        stock: 18,
        rating: 4.8,
        reviews: 312,
        shortDescription: "کنترلر بی‌سیم با بازخورد لمسی، تریگر تطبیقی و طراحی دقیق نسل جدید.",
        description: "Apex S5 با بازخورد لمسی چندلایه و تریگرهای تطبیقی، حس هر برخورد و حرکت را واقعی‌تر منتقل می‌کند. اتصال سریع و طراحی خوش‌دست آن تجربه‌ای روان می‌سازد.",
        features: ["بازخورد لمسی پیشرفته", "تریگرهای تطبیقی", "میکروفون داخلی", "باتری قابل شارژ", "درگاه USB-C", "سنسور حرکتی شش‌محوره"],
        guarantee: "۱۸ ماه گارانتی",
        category: "کنترلر گیمینگ"
    },
    {
        id: 6,
        name: "میکروفون Stream Core",
        brand: "BROADCAST LAB",
        icon: "fa-microphone-lines",
        accent: "#00ff66",
        tag: "استریم",
        price: 6150000,
        stock: 7,
        rating: 4.6,
        reviews: 81,
        shortDescription: "میکروفون USB کاندنسر با الگوی کاردیوئید و کنترل مستقیم برای استریم.",
        description: "Stream Core صدایی گرم و واضح برای استریم، پادکست و گفت‌وگوی تیمی ضبط می‌کند. نصب آسان USB و کنترل‌های روی بدنه، استفاده از آن را سریع و بدون دردسر می‌سازد.",
        features: ["کپسول کاندنسر", "الگوی کاردیوئید", "خروجی هدفون بدون تأخیر", "کلید قطع سریع صدا", "پایه ضد لرزش", "اتصال Plug & Play"],
        guarantee: "۱۸ ماه گارانتی",
        category: "تجهیزات استریم"
    },
    {
        id: 7,
        name: "SSD اکسترنال Velocity 1TB",
        brand: "VELOCITY",
        icon: "fa-hard-drive",
        accent: "#8b5cf6",
        tag: "سرعت بالا",
        price: 7290000,
        stock: 11,
        rating: 4.7,
        reviews: 104,
        shortDescription: "حافظه قابل حمل یک ترابایتی با سرعت خواندن ۱۰۵۰ مگابایت بر ثانیه.",
        description: "Velocity 1TB فضای کافی و سرعت بالا را در بدنه‌ای کوچک و مقاوم ارائه می‌دهد. بازی‌ها و فایل‌های حجیم خود را سریع جابه‌جا کنید و همیشه همراه داشته باشید.",
        features: ["ظرفیت یک ترابایت", "سرعت خواندن ۱۰۵۰MB/s", "درگاه USB 3.2 Gen 2", "بدنه مقاوم در برابر ضربه", "سازگار با PC و کنسول", "کابل USB-C همراه"],
        guarantee: "۶۰ ماه گارانتی",
        category: "حافظه گیمینگ"
    },
    {
        id: 8,
        name: "خنک‌کننده لپ‌تاپ Frost 6",
        brand: "ARCTIC GEAR",
        icon: "fa-fan",
        accent: "#00d4ff",
        tag: "شش فن",
        price: 2380000,
        stock: 16,
        rating: 4.5,
        reviews: 67,
        shortDescription: "پد خنک‌کننده شش‌فن با نور RGB و پنج سطح تنظیم ارتفاع برای لپ‌تاپ.",
        description: "Frost 6 جریان هوای گسترده‌ای زیر لپ‌تاپ ایجاد می‌کند و به حفظ عملکرد پایدار در بازی‌های سنگین کمک می‌کند. سرعت فن و زاویه قرارگیری به‌سادگی قابل تنظیم است.",
        features: ["شش فن کم‌صدا", "کنترل سرعت فن", "نورپردازی RGB", "پنج سطح تنظیم ارتفاع", "دو درگاه USB", "مناسب لپ‌تاپ تا ۱۷ اینچ"],
        guarantee: "۱۲ ماه گارانتی",
        category: "خنک‌کننده"
    }
];

const PRODUCTS_KEY = "gaming_store_products";
const MESSAGES_KEY = "gaming_store_messages";
const LEGACY_PRODUCT_KEYS = ["products", "store_products", "web2_products"];
const ADMIN_SESSION_KEY = "web2_admin_authenticated";
const ADMIN_PASSWORD = "GamePixel2026!";
const CART_KEY = "web2_cart";
const THEME_KEY = "web2_theme";
const DISCOUNT_KEY = "web2_discount";
const DISCOUNT_CODE = "WEB2";
const DISCOUNT_RATE = 0.1;
const numberFormatter = new Intl.NumberFormat("fa-IR");
const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short"
});

let products = [];
let adminApiMode = false;
const ADMIN_API_BASE = "/api/admin/products";
const PRODUCT_API_BASE = "/api/products";
const PRODUCT_FALLBACK_KEY = "gaming_store_products_fallback";

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function normalizeIcon(icon) {
    const iconName = String(icon || "").trim().replace(/^fa-(solid|regular|brands)\s+/, "");
    return /^fa-[a-z0-9-]+$/i.test(iconName) ? iconName : "fa-gamepad";
}

function normalizeAccent(accent) {
    const color = String(accent || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#00d4ff";
}

// ساختار یکنواخت محصول: هر رکورد (حتی با ساختار قدیمی) را به شکل استاندارد تبدیل می‌کند.
function normalizeProduct(item) {
    if (!item || typeof item !== "object") return null;

    const rawId = Number(item.id);
    const id = Number.isFinite(rawId) && rawId > 0 ? rawId : Date.now() + Math.floor(Math.random() * 1000);
    const price = Number(item.price);
    const stockRaw = Number(item.stock);
    const ratingRaw = Number(item.rating);
    const reviewsRaw = Number(item.reviews);

    let features = [];
    if (Array.isArray(item.features)) {
        features = item.features.map((feature) => String(feature)).filter(Boolean);
    } else if (item.specs && typeof item.specs === "object") {
        features = Object.entries(item.specs).map(([key, value]) => `${key}: ${value}`);
    } else if (item.specifications && typeof item.specifications === "object") {
        features = Object.entries(item.specifications).map(([key, value]) => `${key}: ${value}`);
    }

    const description = String(item.description ?? item.shortDescription ?? "").trim();
    const shortDescription = String(item.shortDescription ?? item.description ?? description).trim();

    return {
        id,
        name: String(item.name ?? item.title ?? "محصول بدون نام").trim(),
        image: String(item.image ?? "").trim() || "img/product-placeholder.svg",
        brand: String(item.brand ?? "WEB 2").trim(),
        icon: normalizeIcon(item.icon ?? item.image),
        accent: normalizeAccent(item.accent),
        tag: String(item.tag ?? "محصول").trim(),
        price: Number.isFinite(price) && price > 0 ? Math.round(price) : 0,
        stock: Number.isFinite(stockRaw) && stockRaw >= 0 ? stockRaw : 50,
        rating: Number.isFinite(ratingRaw) && ratingRaw > 0 ? ratingRaw : 5,
        reviews: Number.isFinite(reviewsRaw) && reviewsRaw >= 0 ? reviewsRaw : 0,
        shortDescription,
        description,
        features,
        guarantee: String(item.guarantee ?? "گارانتی فروشگاه").trim(),
        category: String(item.category ?? "محصول").trim()
    };
}

function mergeProducts(...lists) {
    const merged = new Map();
    lists.flat().forEach((item) => {
        const normalized = normalizeProduct(item);
        if (normalized) merged.set(String(normalized.id), { ...(merged.get(String(normalized.id)) || {}), ...normalized });
    });
    return [...merged.values()];
}

// اگر داده‌ها قبلاً با کلید دیگری ذخیره شده بودند، آن‌ها را پیدا و منتقل می‌کند (بدون حذف کلید قدیمی).
function migrateLegacyProducts() {
    for (const legacyKey of LEGACY_PRODUCT_KEYS) {
        try {
            const legacy = JSON.parse(localStorage.getItem(legacyKey));
            if (Array.isArray(legacy) && legacy.length) {
                console.log(`[getProducts] داده قدیمی از کلید «${legacyKey}» منتقل شد.`);
                return legacy.map(normalizeProduct).filter(Boolean);
            }
        } catch {
            continue;
        }
    }
    return [];
}

// خواندن محصولات از localStorage؛ اگر خالی بود داده‌های اولیه را می‌کارد.
function getProducts() {
    let stored = null;
    try {
        stored = JSON.parse(localStorage.getItem(PRODUCTS_KEY));
    } catch {
        stored = null;
    }

    if (!Array.isArray(stored) || !stored.length) {
        const migrated = migrateLegacyProducts();
        const seeded = mergeProducts(migrated);
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(seeded));
        console.log(`[getProducts] ${migrated.length ? "داده‌های منتقل‌شده" : "داده‌های اولیه (seed)"} ذخیره شدند — تعداد: ${seeded.length}`);
        products = seeded;
        return seeded;
    }

    let normalized = mergeProducts(stored);

    // محافظت در برابر داده‌ی معیوب: اگر کلید پر بود ولی همه‌ی رکوردها نامعتبر بودند،
    // به‌جای نمایش فروشگاه خالی، داده‌های اولیه بازگردانده می‌شوند (کلید قدیمی حذف نمی‌شود).
    if (!normalized.length) {
        normalized = [];
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(normalized));
        console.warn("[getProducts] داده‌ی ذخیره‌شده معیوب بود؛ داده‌های اولیه (seed) بازگردانده شدند.", { storedCount: stored.length });
        products = normalized;
        return normalized;
    }

    if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(normalized));
        console.log("[getProducts] ساختار محصولات قدیمی به‌روز و یکنواخت شد (migration).");
    }
    console.log(`[getProducts] از localStorage خوانده شد — تعداد: ${normalized.length}`);
    products = normalized;
    return normalized;
}

function saveProducts(list) {
    const normalized = (Array.isArray(list) ? list : products).map(normalizeProduct).filter(Boolean);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(normalized));
    products = normalized;
    console.log(`[saveProducts] در localStorage ذخیره شد — تعداد: ${normalized.length}`);
    return normalized;
}

async function loadProductsFromApi() {
    try {
        const response = await fetch(PRODUCT_API_BASE, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const apiProducts = Array.isArray(payload) ? payload : payload.products;
        if (!Array.isArray(apiProducts)) throw new Error("Invalid products payload");
        const merged = mergeProducts(apiProducts);
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(merged));
        localStorage.setItem(PRODUCT_FALLBACK_KEY, JSON.stringify(merged));
        products = merged;
        console.log(`[products] API ???? � ??????: ${apiProducts.length}? ?????: ${merged.length}`);
        return merged;
    } catch (error) {
        console.error("[products] ???? API:", error);
        let fallback = [];
        try { fallback = JSON.parse(localStorage.getItem(PRODUCT_FALLBACK_KEY) || "[]"); } catch {}
        products = mergeProducts(fallback);
        console.warn(`[products] ??????? ???? � ?????: ${products.length}`);
        return products;
    }
}

function createProduct(productData) {
    const name = String(productData?.name ?? "").trim();
    const description = String(productData?.description ?? "").trim();
    const price = Number(productData?.price);

    if (name.length < 2) throw new Error("نام محصول باید حداقل ۲ کاراکتر باشد.");
    if (description.length < 5) throw new Error("توضیحات محصول باید حداقل ۵ کاراکتر باشد.");
    if (!Number.isFinite(price) || price <= 0) throw new Error("قیمت محصول معتبر نیست.");

    const nextId = products.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
    const newProduct = normalizeProduct({
        id: nextId,
        name,
        brand: "WEB 2 CUSTOM",
        icon: productData.icon,
        accent: "#00d4ff",
        tag: "جدید",
        price: Math.round(price),
        stock: 50,
        rating: 5,
        reviews: 0,
        shortDescription: description,
        description,
        features: ["محصول افزوده‌شده توسط مدیریت", "موجود و آماده سفارش"],
        guarantee: "ضمانت فروشگاه",
        category: "محصول سفارشی"
    });

    products.push(newProduct);
    saveProducts(products);
    return newProduct;
}

function deleteProduct(productId) {
    const numericId = Number(productId);
    const product = getProduct(numericId);
    if (!product) return false;

    products = products.filter((item) => Number(item.id) !== numericId);
    saveProducts(products);
    saveCart(getCart().filter((item) => item.id !== numericId));
    return true;
}

function saveContactMessage(messageData) {
    let messages = [];
    try {
        messages = JSON.parse(localStorage.getItem(MESSAGES_KEY)) || [];
        if (!Array.isArray(messages)) messages = [];
    } catch {
        messages = [];
    }

    const nextId = messages.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
    const message = {
        id: nextId,
        name: String(messageData?.name ?? "").trim(),
        email: String(messageData?.email ?? "").trim(),
        subject: String(messageData?.subject ?? "").trim(),
        message: String(messageData?.message ?? "").trim(),
        createdAt: new Date().toISOString()
    };

    messages.unshift(message);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    return message;
}

function getContactMessages() {
    try {
        const messages = JSON.parse(localStorage.getItem(MESSAGES_KEY));
        return Array.isArray(messages) ? messages : [];
    } catch {
        return [];
    }
}

function formatNumber(value) {
    return numberFormatter.format(Number(value) || 0);
}

function formatPrice(value) {
    return `${formatNumber(value)} تومان`;
}

function getProduct(productId) {
    return products.find((product) => Number(product.id) === Number(productId));
}

function normalizeCart(cart) {
    if (!Array.isArray(cart)) return [];

    return cart.reduce((items, item) => {
        const product = getProduct(item && item.id);
        if (!product) return items;

        const stock = Math.max(0, Number(product.stock) || 0);
        if (stock < 1) return items;

        const productId = Number(product.id);
        const quantity = Math.max(1, Math.min(stock, Number(item.quantity) || 1));
        const existing = items.find((entry) => entry.id === productId);

        if (existing) {
            existing.quantity = Math.min(stock, existing.quantity + quantity);
        } else {
            items.push({ id: productId, quantity });
        }
        return items;
    }, []);
}

function getCart() {
    try {
        const storedCart = localStorage.getItem(CART_KEY);
        const legacyCart = localStorage.getItem("cart");
        const cart = normalizeCart(JSON.parse(storedCart || legacyCart || "[]"));

        if (!storedCart && legacyCart) {
            localStorage.setItem(CART_KEY, JSON.stringify(cart));
        }
        return cart;
    } catch {
        return [];
    }
}

function saveCart(cart) {
    const normalizedCart = normalizeCart(cart);
    localStorage.setItem(CART_KEY, JSON.stringify(normalizedCart));
    updateCartCount();
    return normalizedCart;
}

function getCartTotals(cart = getCart()) {
    const totals = cart.reduce((result, item) => {
        const product = getProduct(item.id);
        if (!product) return result;
        result.quantity += item.quantity;
        result.subtotal += product.price * item.quantity;
        return result;
    }, { quantity: 0, subtotal: 0 });
    const hasDiscount = localStorage.getItem(DISCOUNT_KEY) === DISCOUNT_CODE;
    const discount = hasDiscount ? Math.round(totals.subtotal * DISCOUNT_RATE) : 0;
    return {
        ...totals,
        price: totals.subtotal - discount,
        discount,
        hasDiscount
    };
}

function getProductBadge(product) {
    if (Number(product.reviews) >= 180) return "پرفروش";
    if (Number(product.id) >= 8 || String(product.tag).includes("جدید")) return "جدید";
    if (Number(product.price) >= 6000000) return "تخفیف";
    return product.tag;
}

function createProductCard(product, compact = false) {
    const accent = normalizeAccent(product.accent);
    return `
        <article class="product-card${compact ? " product-card-compact" : ""}" style="--accent:${accent};--accent-soft:${accent}18;--accent-soft-strong:${accent}66">
            <a class="product-card-link" href="product.html?id=${product.id}" aria-label="مشاهده مشخصات ${escapeHTML(product.name)}">
                <div class="product-art">
                    <span class="product-tag">${escapeHTML(getProductBadge(product))}</span>
                    <i class="fa-solid ${normalizeIcon(product.icon)}" aria-hidden="true"></i>
                </div>
                <div class="product-body">
                    <span class="product-brand">${escapeHTML(product.brand)}</span>
                    <h3>${escapeHTML(product.name)}</h3>
                    <p class="product-description">${escapeHTML(product.shortDescription)}</p>
                    <div class="product-rating" aria-label="امتیاز ${product.rating} از ۵">
                        <i class="fa-solid fa-star" aria-hidden="true"></i>
                        <strong>${product.rating}</strong>
                        <span>(${formatNumber(product.reviews)} نظر)</span>
                    </div>
                    <div class="product-footer">
                        <span class="product-price"><span>قیمت</span><strong>${formatPrice(product.price)}</strong></span>
                        <span class="view-product">مشاهده مشخصات <i class="fa-solid fa-arrow-left" aria-hidden="true"></i></span>
                    </div>
                </div>
            </a>
        </article>`;
}

function renderHomeDiscovery() {
    const categoryGrid = document.getElementById("categoryGrid");
    const categoryFilter = document.getElementById("categoryFilter");
    const featuredGrid = document.getElementById("featuredGrid");
    if (!categoryGrid && !categoryFilter && !featuredGrid) return;

    const categoryMap = new Map();
    products.forEach((product) => {
        if (!categoryMap.has(product.category)) {
            categoryMap.set(product.category, { icon: product.icon, count: 0, accent: product.accent });
        }
        categoryMap.get(product.category).count += 1;
    });

    if (categoryGrid) {
        categoryGrid.innerHTML = [...categoryMap.entries()].slice(0, 8).map(([category, meta]) => `
            <button class="category-card" type="button" data-category-select="${escapeHTML(category)}" style="--category-accent:${normalizeAccent(meta.accent)}">
                <span><i class="fa-solid ${normalizeIcon(meta.icon)}"></i></span>
                <strong>${escapeHTML(category)}</strong>
                <small>${formatNumber(meta.count)} محصول</small>
            </button>`).join("");
    }

    if (categoryFilter) {
        const currentValue = categoryFilter.value;
        categoryFilter.innerHTML = '<option value="all">همه دسته‌ها</option>' +
            [...categoryMap.keys()].map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("");
        categoryFilter.value = [...categoryMap.keys()].includes(currentValue) ? currentValue : "all";
    }

    if (featuredGrid) {
        const featured = [...products]
            .sort((a, b) => (b.reviews + b.rating * 40) - (a.reviews + a.rating * 40))
            .slice(0, 4);
        featuredGrid.innerHTML = featured.map((product) => createProductCard(product, true)).join("");
    }
}

function getFilteredProducts() {
    const query = document.getElementById("productSearch")?.value.trim().toLocaleLowerCase("fa") || "";
    const category = document.getElementById("categoryFilter")?.value || "all";
    const priceRange = document.getElementById("priceFilter")?.value || "all";
    const sort = document.getElementById("productSort")?.value || "popular";

    const filtered = products.filter((product) => {
        const searchable = `${product.name} ${product.brand} ${product.category} ${product.shortDescription}`.toLocaleLowerCase("fa");
        const matchesQuery = !query || searchable.includes(query);
        const matchesCategory = category === "all" || product.category === category;
        const matchesPrice = priceRange === "all" ||
            (priceRange === "under-3" && product.price < 3000000) ||
            (priceRange === "3-6" && product.price >= 3000000 && product.price <= 6000000) ||
            (priceRange === "over-6" && product.price > 6000000);
        return matchesQuery && matchesCategory && matchesPrice;
    });

    return filtered.sort((a, b) => {
        if (sort === "price-asc") return a.price - b.price;
        if (sort === "price-desc") return b.price - a.price;
        if (sort === "rating") return b.rating - a.rating;
        return (b.reviews + b.rating * 40) - (a.reviews + a.rating * 40);
    });
}

function updateCartCount() {
    const { quantity } = getCartTotals();
    document.querySelectorAll("#cart-count").forEach((counter) => {
        counter.textContent = formatNumber(quantity);
        counter.setAttribute("aria-label", `${formatNumber(quantity)} کالا در سبد خرید`);
        counter.classList.remove("cart-count-updated");
        void counter.offsetWidth;
        counter.classList.add("cart-count-updated");
    });
}

function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.setAttribute("role", "status");
    const icon = document.createElement("i");
    const text = document.createElement("span");
    icon.className = `fa-solid ${type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}`;
    icon.setAttribute("aria-hidden", "true");
    text.textContent = String(message);
    toast.append(icon, text);
    container.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add("removing");
        window.setTimeout(() => toast.remove(), 250);
    }, 3000);
}

function addToCart(productId) {
    const product = getProduct(productId);
    if (!product) {
        showToast("محصول موردنظر پیدا نشد.", "error");
        return;
    }
    if (Number(product.stock) < 1) {
        showToast("این محصول در حال حاضر موجود نیست.", "error");
        return;
    }

    const cart = getCart();
    const cartItem = cart.find((item) => item.id === product.id);

    if (cartItem) {
        if (cartItem.quantity >= product.stock) {
            showToast("بیشتر از موجودی محصول نمی‌توان اضافه کرد.", "error");
            return;
        }
        cartItem.quantity += 1;
    } else {
        cart.push({ id: product.id, quantity: 1 });
    }

    saveCart(cart);
    showToast(`${product.name} به سبد خرید اضافه شد.`);

    const button = document.querySelector(`[data-add-to-cart="${product.id}"]`);
    if (button) {
        const originalContent = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-check"></i> به سبد اضافه شد';
        window.setTimeout(() => {
            button.innerHTML = originalContent;
        }, 1400);
    }
}

function renderProducts() {
    const grid = document.getElementById("productGrid");
    if (!grid) return;
    console.log(`[renderProducts] رندر صفحه اصلی — تعداد: ${products.length}`);
    const productCount = document.getElementById("homeProductCount");
    if (productCount) productCount.textContent = formatNumber(products.length);

    if (!products.length) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1">
                <div class="empty-icon"><i class="fa-solid fa-box-open"></i></div>
                <h2>هنوز محصولی ثبت نشده است</h2>
                <p>محصولات جدید پس از ثبت در پنل مدیریت اینجا نمایش داده می‌شوند.</p>
            </div>`;
        return;
    }

    const visibleProducts = getFilteredProducts();
    const resultsCount = document.getElementById("productResultsCount");
    if (resultsCount) resultsCount.textContent = `${formatNumber(visibleProducts.length)} محصول نمایش داده می‌شود`;
    const clearButton = document.getElementById("clearProductFilters");
    if (clearButton) clearButton.hidden = visibleProducts.length === products.length;

    grid.innerHTML = visibleProducts.length
        ? visibleProducts.map((product) => createProductCard(product)).join("")
        : `<div class="empty-state products-empty">
            <div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
            <h2>محصولی با این فیلتر پیدا نشد</h2>
            <p>عبارت جستجو یا محدوده فیلترها را تغییر دهید.</p>
        </div>`;
}

function renderProductDetail() {
    const container = document.getElementById("productDetail");
    if (!container) return;

    const productId = new URLSearchParams(window.location.search).get("id");
    const product = getProduct(productId);

    if (!product) {
        container.setAttribute("aria-busy", "false");
        document.title = "محصول پیدا نشد | Web 2";
        container.innerHTML = `
            <div class="not-found-state">
                <i class="fa-solid fa-ghost" aria-hidden="true"></i>
                <h1>این محصول در دسترس نیست</h1>
                <p>شناسه محصول معتبر نیست یا محصول موردنظر از فهرست خارج شده است.</p>
                <a class="primary-button" href="index.html#products">بازگشت به محصولات <i class="fa-solid fa-arrow-left"></i></a>
            </div>`;
        return;
    }

    document.title = `${product.name} | Web 2`;
    container.setAttribute("aria-busy", "false");
    const breadcrumb = document.getElementById("breadcrumbProduct");
    if (breadcrumb) breadcrumb.textContent = product.name;
    const accent = normalizeAccent(product.accent);
    const inStock = Number(product.stock) > 0;

    container.innerHTML = `
        <div class="product-detail-grid" style="--accent:${accent};--accent-soft:${accent}18;--accent-soft-strong:${accent}66">
            <div class="detail-visual">
                <i class="fa-solid ${normalizeIcon(product.icon)}" aria-hidden="true"></i>
                <span class="detail-stock-badge ${inStock ? "" : "out-of-stock"}"><i class="fa-solid ${inStock ? "fa-circle-check" : "fa-circle-xmark"}"></i> ${inStock ? `${formatNumber(product.stock)} عدد موجود` : "ناموجود"}</span>
            </div>
            <div class="detail-info">
                <span class="detail-brand">${escapeHTML(product.brand)} / ${escapeHTML(product.category)}</span>
                <h1>${escapeHTML(product.name)}</h1>
                <div class="detail-rating">
                    <i class="fa-solid fa-star"></i>
                    <strong>${product.rating}</strong>
                    <span>از ۵ — ${formatNumber(product.reviews)} دیدگاه</span>
                </div>
                <p class="detail-intro">${escapeHTML(product.description)}</p>
                <ul class="detail-features">
                    ${(Array.isArray(product.features) ? product.features : []).map((feature) => `<li><i class="fa-solid fa-check"></i><span>${escapeHTML(feature)}</span></li>`).join("")}
                </ul>
                <div class="detail-meta">
                    <span><i class="fa-solid fa-shield-halved"></i> ${escapeHTML(product.guarantee)}</span>
                    <span><i class="fa-solid fa-truck-fast"></i> ارسال نمایشی رایگان</span>
                    <span><i class="fa-solid fa-box-open"></i> بسته‌بندی ایمن</span>
                </div>
                <div class="detail-purchase">
                    <span class="detail-price"><span>قیمت محصول</span><strong>${formatPrice(product.price)}</strong></span>
                    <span class="detail-stock-badge ${inStock ? "" : "out-of-stock"}"><i class="fa-solid ${inStock ? "fa-bolt" : "fa-ban"}"></i> ${inStock ? "آماده ارسال نمایشی" : "فعلاً قابل سفارش نیست"}</span>
                </div>
                <div class="detail-buttons">
                    <button class="primary-button" type="button" data-add-to-cart="${product.id}" ${inStock ? "" : "disabled"}><i class="fa-solid ${inStock ? "fa-cart-plus" : "fa-ban"}"></i> ${inStock ? "افزودن به سبد خرید" : "ناموجود"}</button>
                    <a class="secondary-button" href="index.html#products"><i class="fa-solid fa-arrow-right"></i> بازگشت به محصولات</a>
                </div>
            </div>
        </div>`;
}

function changeCartQuantity(productId, change) {
    const product = getProduct(productId);
    const cart = getCart();
    const cartItem = cart.find((item) => item.id === Number(productId));
    if (!product || !cartItem) return;

    const nextQuantity = cartItem.quantity + change;
    if (nextQuantity > product.stock) {
        showToast("تعداد انتخاب‌شده از موجودی بیشتر است.", "error");
        return;
    }

    if (nextQuantity < 1) {
        removeCartItem(productId);
        return;
    }

    cartItem.quantity = nextQuantity;
    saveCart(cart);
    renderCart();
}

function removeCartItem(productId) {
    const product = getProduct(productId);
    const cart = getCart().filter((item) => item.id !== Number(productId));
    saveCart(cart);
    renderCart();
    if (product) showToast(`${product.name} از سبد حذف شد.`);
}

function renderCart() {
    const cartItems = document.getElementById("cartItems");
    if (!cartItems) return;

    const emptyState = document.getElementById("emptyCart");
    const summary = document.getElementById("cartSummary");
    const cart = getCart();

    if (!cart.length) {
        cartItems.innerHTML = "";
        cartItems.setAttribute("aria-busy", "false");
        emptyState.hidden = false;
        summary.hidden = true;
        return;
    }

    emptyState.hidden = true;
    summary.hidden = false;
    cartItems.innerHTML = cart.map((item) => {
        const product = getProduct(item.id);
        const accent = normalizeAccent(product.accent);
        return `
            <article class="cart-item" style="--accent:${accent};--accent-soft:${accent}18;--accent-soft-strong:${accent}66">
                <a class="cart-item-art" href="product.html?id=${product.id}" aria-label="مشاهده ${escapeHTML(product.name)}">
                    <i class="fa-solid ${normalizeIcon(product.icon)}" aria-hidden="true"></i>
                </a>
                <div class="cart-item-info">
                    <span class="cart-item-brand">${escapeHTML(product.brand)}</span>
                    <h2><a href="product.html?id=${product.id}">${escapeHTML(product.name)}</a></h2>
                    <strong>${formatPrice(product.price * item.quantity)}</strong>
                </div>
                <div class="cart-item-actions">
                    <div class="quantity-control" aria-label="تعداد ${escapeHTML(product.name)}">
                        <button class="quantity-button" type="button" data-cart-action="increase" data-product-id="${product.id}" aria-label="افزایش تعداد"><i class="fa-solid fa-plus"></i></button>
                        <span class="quantity-value">${formatNumber(item.quantity)}</span>
                        <button class="quantity-button" type="button" data-cart-action="decrease" data-product-id="${product.id}" aria-label="کاهش تعداد"><i class="fa-solid fa-minus"></i></button>
                    </div>
                    <button class="remove-button" type="button" data-cart-action="remove" data-product-id="${product.id}" aria-label="حذف ${escapeHTML(product.name)}"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            </article>`;
    }).join("");
    cartItems.setAttribute("aria-busy", "false");

    const totals = getCartTotals(cart);
    document.getElementById("totalItems").textContent = formatNumber(totals.quantity);
    document.getElementById("subtotalPrice").textContent = formatPrice(totals.subtotal);
    document.getElementById("discountLine").hidden = !totals.hasDiscount;
    document.getElementById("discountAmount").textContent = `− ${formatPrice(totals.discount)}`;
    document.getElementById("totalPrice").textContent = formatPrice(totals.price);
}

function renderCheckout() {
    const itemsContainer = document.getElementById("checkoutItems");
    if (!itemsContainer) return;

    const checkoutContent = document.getElementById("checkoutContent");
    const cart = getCart();

    if (!cart.length) {
        itemsContainer.setAttribute("aria-busy", "false");
        checkoutContent.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1">
                <div class="empty-icon"><i class="fa-solid fa-basket-shopping"></i></div>
                <h2>محصولی برای پرداخت وجود ندارد</h2>
                <p>ابتدا یک محصول به سبد خرید اضافه کنید.</p>
                <a class="primary-button" href="index.html#products">رفتن به فروشگاه <i class="fa-solid fa-arrow-left"></i></a>
            </div>`;
        return;
    }

    itemsContainer.innerHTML = cart.map((item) => {
        const product = getProduct(item.id);
        const accent = normalizeAccent(product.accent);
        return `
            <div class="checkout-item" style="--accent:${accent};--accent-soft:${accent}18">
                <span class="checkout-item-icon"><i class="fa-solid ${normalizeIcon(product.icon)}"></i></span>
                <span class="checkout-item-info"><strong>${escapeHTML(product.name)}</strong><span>${formatNumber(item.quantity)} عدد</span></span>
                <strong>${formatPrice(product.price * item.quantity)}</strong>
            </div>`;
    }).join("");
    itemsContainer.setAttribute("aria-busy", "false");

    const totals = getCartTotals(cart);
    document.getElementById("checkoutItemCount").textContent = formatNumber(totals.quantity);
    document.getElementById("checkoutDiscountLine").hidden = !totals.hasDiscount;
    document.getElementById("checkoutDiscount").textContent = `− ${formatPrice(totals.discount)}`;
    document.getElementById("checkoutTotal").textContent = formatPrice(totals.price);
    document.getElementById("paymentAmount").textContent = formatPrice(totals.price);
}

function setupProductControls() {
    const controls = ["productSearch", "categoryFilter", "priceFilter", "productSort"]
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    controls.forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", renderProducts));

    document.getElementById("clearProductFilters")?.addEventListener("click", () => {
        document.getElementById("productSearch").value = "";
        document.getElementById("categoryFilter").value = "all";
        document.getElementById("priceFilter").value = "all";
        document.getElementById("productSort").value = "popular";
        renderProducts();
    });

    document.getElementById("categoryGrid")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category-select]");
        if (!button) return;
        document.getElementById("categoryFilter").value = button.dataset.categorySelect;
        renderProducts();
        document.getElementById("products").scrollIntoView({ behavior: "smooth" });
    });
}

function setupDiscountForm() {
    const form = document.getElementById("discountForm");
    if (!form) return;
    const input = document.getElementById("discountCode");
    const hint = document.getElementById("discountHint");
    if (localStorage.getItem(DISCOUNT_KEY) === DISCOUNT_CODE) {
        input.value = DISCOUNT_CODE;
        hint.textContent = "تخفیف ۱۰٪ فعال است.";
        hint.classList.add("success");
    }
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (input.value.trim().toUpperCase() !== DISCOUNT_CODE) {
            hint.textContent = "کد واردشده معتبر نیست.";
            hint.classList.remove("success");
            showToast("کد تخفیف معتبر نیست.", "error");
            return;
        }
        localStorage.setItem(DISCOUNT_KEY, DISCOUNT_CODE);
        hint.textContent = "تخفیف ۱۰٪ با موفقیت اعمال شد.";
        hint.classList.add("success");
        renderCart();
        showToast("کد تخفیف WEB2 اعمال شد.");
    });
}

function setupBackToTop() {
    const button = document.getElementById("backToTop");
    if (!button) return;
    const updateVisibility = () => button.classList.toggle("visible", window.scrollY > 500);
    window.addEventListener("scroll", updateVisibility, { passive: true });
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    updateVisibility();
}

function setFieldValidity(field, isValid) {
    if (!field) return isValid;
    field.classList.toggle("input-error", !isValid);
    field.setAttribute("aria-invalid", String(!isValid));
    return isValid;
}

function validateCheckoutForm() {
    const name = document.getElementById("customerName");
    const phone = document.getElementById("customerPhone");
    const address = document.getElementById("customerAddress");
    const card = document.getElementById("cardNumber");
    const expiry = document.getElementById("expiryDate");
    const cvv = document.getElementById("cvv");

    const cardDigits = card.value.replace(/\D/g, "");
    const phoneDigits = phone.value.replace(/\D/g, "");
    const expiryMatch = expiry.value.match(/^(\d{2})\/(\d{2})$/);

    const checks = [
        setFieldValidity(name, name.value.trim().length >= 3),
        setFieldValidity(phone, /^09\d{9}$/.test(phoneDigits)),
        setFieldValidity(address, address.value.trim().length >= 10),
        setFieldValidity(card, cardDigits.length === 16),
        setFieldValidity(expiry, Boolean(expiryMatch) && Number(expiryMatch[1]) >= 1 && Number(expiryMatch[1]) <= 12),
        setFieldValidity(cvv, /^\d{3,4}$/.test(cvv.value))
    ];

    return checks.every(Boolean);
}

function setupCheckoutForm() {
    const form = document.getElementById("checkoutForm");
    if (!form) return;

    const cardInput = document.getElementById("cardNumber");
    const expiryInput = document.getElementById("expiryDate");
    const phoneInput = document.getElementById("customerPhone");
    const cvvInput = document.getElementById("cvv");

    cardInput.addEventListener("input", () => {
        const digits = cardInput.value.replace(/\D/g, "").slice(0, 16);
        cardInput.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
        cardInput.classList.remove("input-error");
    });

    expiryInput.addEventListener("input", () => {
        const digits = expiryInput.value.replace(/\D/g, "").slice(0, 4);
        expiryInput.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
        expiryInput.classList.remove("input-error");
    });

    phoneInput.addEventListener("input", () => {
        phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 11);
        phoneInput.classList.remove("input-error");
    });

    cvvInput.addEventListener("input", () => {
        cvvInput.value = cvvInput.value.replace(/\D/g, "").slice(0, 4);
        cvvInput.classList.remove("input-error");
    });

    form.querySelectorAll("input, textarea").forEach((field) => {
        field.addEventListener("input", () => field.classList.remove("input-error"));
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!validateCheckoutForm()) {
            showToast("لطفاً اطلاعات فرم را کامل و صحیح وارد کنید.", "error");
            form.querySelector(".input-error")?.focus();
            return;
        }

        const button = document.getElementById("payButton");
        const originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span><i class="fa-solid fa-spinner fa-spin"></i> در حال پردازش...</span>';

        window.setTimeout(() => {
            const cart = getCart();
            const totals = getCartTotals(cart);
            const orderCode = `W2-${Date.now().toString().slice(-6)}`;
            const receiptDate = new Intl.DateTimeFormat("fa-IR", {
                dateStyle: "long",
                timeStyle: "short"
            }).format(new Date());
            const receiptItems = cart.map((item) => {
                const product = getProduct(item.id);
                return {
                    name: product.name,
                    quantity: item.quantity
                };
            });

            renderReceipt({
                orderCode,
                date: receiptDate,
                amount: formatPrice(totals.price),
                items: receiptItems
            });

            localStorage.removeItem(CART_KEY);
            localStorage.removeItem("cart");
            localStorage.removeItem(DISCOUNT_KEY);
            updateCartCount();
            document.getElementById("checkoutContent").hidden = true;
            document.getElementById("paymentSuccess").hidden = false;
            const successPanel = document.getElementById("paymentSuccess");
            successPanel.setAttribute("tabindex", "-1");
            successPanel.scrollIntoView({ behavior: "smooth", block: "start" });
            successPanel.focus({ preventScroll: true });
            button.innerHTML = originalContent;
            button.disabled = false;
        }, 1100);
    });
}

function renderReceipt(receipt) {
    document.getElementById("orderCode").textContent = receipt.orderCode;
    document.getElementById("receiptDate").textContent = receipt.date;
    document.getElementById("receiptAmount").textContent = receipt.amount;

    const productsList = document.getElementById("receiptProducts");
    productsList.replaceChildren(...receipt.items.map((item) => {
        const listItem = document.createElement("li");
        listItem.textContent = `${item.name} × ${formatNumber(item.quantity)}`;
        return listItem;
    }));

    const downloadButton = document.getElementById("downloadReceipt");
    downloadButton.onclick = () => downloadReceipt(receipt);
}

function downloadReceipt(receipt) {
    const products = receipt.items
        .map((item) => `- ${item.name} × ${formatNumber(item.quantity)}`)
        .join("\n");
    const content = [
        "WEB 2 - رسید پرداخت",
        "--------------------",
        `شماره سفارش: ${receipt.orderCode}`,
        `تاریخ: ${receipt.date}`,
        `مبلغ: ${receipt.amount}`,
        "محصولات:",
        products,
        "وضعیت: پرداخت موفق"
    ].join("\n");
    const blob = new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `receipt-${receipt.orderCode}.txt`;
    link.click();
    URL.revokeObjectURL(url);
}

function setupTheme() {
    const button = document.getElementById("themeBtn");
    if (!button) return;

    const icon = button.querySelector("i");
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const savedTheme = localStorage.getItem(THEME_KEY);
    const useLightTheme = savedTheme === "light";
    applyTheme(useLightTheme, button, icon, themeMeta, false);

    button.addEventListener("click", () => {
        const useLightTheme = !document.body.classList.contains("light-theme");
        const theme = useLightTheme ? "light" : "dark";
        localStorage.setItem(THEME_KEY, theme);
        applyTheme(useLightTheme, button, icon, themeMeta);
    });
}

let themeSwitchFrame = 0;

function applyTheme(
    useLightTheme,
    button = document.getElementById("themeBtn"),
    icon = button?.querySelector("i"),
    themeMeta = document.querySelector('meta[name="theme-color"]'),
    optimizeSwitch = true
) {
    if (optimizeSwitch) {
        document.documentElement.classList.add("theme-switching");
        if (themeSwitchFrame) cancelAnimationFrame(themeSwitchFrame);
        themeSwitchFrame = requestAnimationFrame(() => {
            themeSwitchFrame = requestAnimationFrame(() => {
                document.documentElement.classList.remove("theme-switching");
                themeSwitchFrame = 0;
            });
        });
    }

    document.body.classList.toggle("light-theme", useLightTheme);

    if (button) {
        if (icon) {
            icon.classList.toggle("fa-moon", useLightTheme);
            icon.classList.toggle("fa-sun", !useLightTheme);
        }
        button.setAttribute("aria-label", useLightTheme ? "فعال کردن تم تیره" : "فعال کردن تم روشن");
    }

    themeMeta?.setAttribute("content", useLightTheme ? "#f4f7ff" : "#050816");
}

function setupMobileMenu() {
    const button = document.getElementById("menuToggle");
    const nav = document.getElementById("mainNav");
    if (!button || !nav) return;

    const closeMenu = () => {
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "باز کردن منو");
        nav.classList.remove("open");
        document.body.classList.remove("menu-open");
    };

    button.addEventListener("click", () => {
        const willOpen = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(willOpen));
        button.setAttribute("aria-label", willOpen ? "بستن منو" : "باز کردن منو");
        nav.classList.toggle("open", willOpen);
        document.body.classList.toggle("menu-open", willOpen);
    });

    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("click", (event) => {
        if (window.innerWidth <= 860 && nav.classList.contains("open") && !nav.contains(event.target) && !button.contains(event.target)) {
            closeMenu();
        }
    });
    window.addEventListener("resize", () => {
        if (window.innerWidth > 860) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
    });
}

function setupContactForm() {
    const form = document.getElementById("contactForm");
    if (!form) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        saveContactMessage({
            name: formData.get("name"),
            email: formData.get("email"),
            subject: formData.get("subject"),
            message: formData.get("message")
        });
        showToast("پیام شما با موفقیت ثبت شد. سپاس از همراهی شما!");
        form.reset();
    });
}

function renderAdminProducts() {
    const container = document.getElementById("product-list");
    const productCount = document.getElementById("adminProductCount");
    console.log(`[renderAdminProducts] اجرا شد — تعداد محصولات: ${products.length}`);
    if (!container) return;

    if (productCount) productCount.textContent = formatNumber(products.length);

    if (!products.length) {
        container.innerHTML = `
            <div class="admin-empty-state">
                <i class="fa-solid fa-box-open"></i>
                <h3>هنوز محصولی ثبت نشده است</h3>
                <p>از فرم کنار این بخش محصول جدید را اضافه کنید.</p>
            </div>`;
        return;
    }

    container.innerHTML = products.map((product) => `
        <div class="admin-product-row" style="--accent:${normalizeAccent(product.accent)}">
            <span class="admin-product-icon"><i class="fa-solid ${normalizeIcon(product.icon)}"></i></span>
            <div class="admin-product-info">
                <strong>${escapeHTML(product.name)}</strong>
                <small>${escapeHTML(product.brand)}</small>
            </div>
            <span class="admin-product-price">${formatPrice(product.price)}</span>
            <span class="admin-product-stock">موجودی: ${formatNumber(product.stock)}</span>
            <button class="admin-edit-button" type="button" data-edit-product="${product.id}" aria-label="ویرایش ${escapeHTML(product.name)}"><i class="fa-regular fa-pen-to-square"></i> ویرایش</button>
            <button class="admin-delete-button" type="button" data-delete-product="${product.id}" aria-label="حذف ${escapeHTML(product.name)}"><i class="fa-regular fa-trash-can"></i> حذف</button>
        </div>
    `).join("");
}

async function loadAdminProductsFromApi() {
    const response = await fetch(ADMIN_API_BASE);
    if (!response.ok) throw new Error("دریافت محصولات از سرور ناموفق بود.");
    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : payload.items;
    if (!Array.isArray(list)) throw new Error("پاسخ نامعتبر از سرور دریافت شد.");
    products = list.map(normalizeProduct).filter(Boolean);
    adminApiMode = true;
    renderAdminProducts();
}

function renderAdminMessages() {
    const messagesContainer = document.getElementById("adminMessages");
    const messageCount = document.getElementById("adminMessageCount");
    if (!messagesContainer) return;

    const messages = getContactMessages();
    if (messageCount) messageCount.textContent = formatNumber(messages.length);

    if (!messages.length) {
        messagesContainer.innerHTML = `
            <div class="admin-empty-state">
                <i class="fa-regular fa-envelope-open"></i>
                <h3>هنوز پیامی دریافت نشده است</h3>
                <p>پیام‌های فرم تماس سایت در این قسمت نمایش داده می‌شوند.</p>
            </div>`;
        return;
    }

    messagesContainer.innerHTML = messages.map((item) => {
        const createdAt = new Date(item.createdAt);
        const displayDate = Number.isNaN(createdAt.getTime()) ? "زمان نامشخص" : dateFormatter.format(createdAt);
        return `
            <article class="admin-message-card">
                <div class="admin-message-head">
                    <div>
                        <strong>${escapeHTML(item.name)}</strong>
                        <a href="mailto:${encodeURIComponent(item.email)}">${escapeHTML(item.email)}</a>
                    </div>
                    <time datetime="${escapeHTML(item.createdAt)}">${escapeHTML(displayDate)}</time>
                </div>
                <h3>${escapeHTML(item.subject)}</h3>
                <p>${escapeHTML(item.message)}</p>
            </article>`;
    }).join("");
}

function unlockAdminPanel() {
    const loginView = document.getElementById("adminLoginView");
    const dashboard = document.getElementById("adminDashboard");
    if (loginView) loginView.hidden = true;
    if (dashboard) dashboard.hidden = false;
    renderAdminProducts();
    renderAdminMessages();
    loadAdminProductsFromApi().catch(() => {
        adminApiMode = false;
        showToast("اتصال به API مدیریت برقرار نشد؛ حالت محلی فعال است.", "error");
    });
}

function setupAdminPanel() {
    if (document.body.dataset.page !== "admin") return;

    const loginForm = document.getElementById("adminLoginForm");
    const productForm = document.getElementById("adminProductForm");
    const logoutButton = document.getElementById("adminLogout");
    const isAuthenticated = sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";

    if (isAuthenticated) unlockAdminPanel();

    loginForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const passwordInput = document.getElementById("adminPassword");
        if (passwordInput.value !== ADMIN_PASSWORD) {
            showToast("رمز عبور اشتباه است.", "error");
            passwordInput.select();
            return;
        }

        sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
        loginForm.reset();
        unlockAdminPanel();
        showToast("ورود به پنل مدیریت موفق بود.");
    });

    logoutButton?.addEventListener("click", () => {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        window.location.reload();
    });

    productForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!productForm.checkValidity()) {
            productForm.reportValidity();
            return;
        }

        const formData = new FormData(productForm);
        try {
            const payload = {
                name: formData.get("name"),
                price: formData.get("price"),
                description: formData.get("description"),
                category: formData.get("category"),
                stock: formData.get("stock"),
                image: formData.get("image")
            };
            if (adminApiMode) {
                const response = await fetch(ADMIN_API_BASE, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error("ثبت محصول در سرور ناموفق بود.");
                const product = normalizeProduct(await response.json());
                products.push(product);
                renderAdminProducts();
                productForm.reset();
                showToast(`${product.name} به فروشگاه اضافه شد.`);
                return;
            }
            const product = createProduct(payload);
            productForm.reset();
            renderAdminProducts();
            showToast(`${product.name} به فروشگاه اضافه شد.`);
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    document.getElementById("product-list")?.addEventListener("click", (event) => {
        const editButton = event.target.closest("[data-edit-product]");
        if (editButton) {
            const product = getProduct(editButton.dataset.editProduct);
            if (!product) return;
            const name = window.prompt("نام محصول", product.name);
            const price = window.prompt("قیمت", String(product.price));
            if (!name || !Number.isFinite(Number(price)) || Number(price) <= 0) return;
            const updated = normalizeProduct({ ...product, name: name.trim(), price: Math.round(Number(price)) });
            if (adminApiMode) {
                fetch(`${ADMIN_API_BASE}/${encodeURIComponent(product.id)}`, {
                    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated)
                }).then((response) => {
                    if (!response.ok) throw new Error("ویرایش محصول در سرور ناموفق بود.");
                    return response.json();
                }).then((saved) => {
                    products = products.map((item) => String(item.id) === String(saved.id) ? normalizeProduct(saved) : item);
                    renderAdminProducts();
                    showToast("محصول ویرایش شد.");
                }).catch((error) => showToast(error.message, "error"));
            } else {
                products = products.map((item) => String(item.id) === String(product.id) ? updated : item);
                saveProducts(products);
                renderAdminProducts();
                showToast("محصول ویرایش شد.");
            }
            return;
        }
        const deleteButton = event.target.closest("[data-delete-product]");
        if (!deleteButton) return;

        const product = getProduct(deleteButton.dataset.deleteProduct);
        if (!product || !window.confirm(`محصول «${product.name}» حذف شود؟`)) return;

        if (adminApiMode) {
            fetch(`${ADMIN_API_BASE}/${encodeURIComponent(product.id)}`, { method: "DELETE" })
                .then((response) => {
                    if (!response.ok) throw new Error("حذف محصول در سرور ناموفق بود.");
                    products = products.filter((item) => String(item.id) !== String(product.id));
                    renderAdminProducts();
                    showToast(`${product.name} حذف شد.`);
                })
                .catch((error) => showToast(error.message, "error"));
            return;
        }
        deleteProduct(product.id);
        renderAdminProducts();
        showToast(`${product.name} حذف شد.`);
    });
}

function setupGlobalActions() {
    document.addEventListener("click", (event) => {
        const addButton = event.target.closest("[data-add-to-cart]");
        if (addButton) {
            addToCart(addButton.dataset.addToCart);
            return;
        }

        const cartButton = event.target.closest("[data-cart-action]");
        if (!cartButton) return;

        const productId = cartButton.dataset.productId;
        const action = cartButton.dataset.cartAction;
        if (action === "increase") changeCartQuantity(productId, 1);
        if (action === "decrease") changeCartQuantity(productId, -1);
        if (action === "remove") removeCartItem(productId);
    });
}

function setupStorageSync() {
    window.addEventListener("storage", (event) => {
        if (event.key === PRODUCTS_KEY) {
            products = getProducts();
            renderHomeDiscovery();
            renderProducts();
            renderProductDetail();
            renderCart();
            renderCheckout();
            renderAdminProducts();
        }

        if (event.key === CART_KEY || event.key === "cart") {
            renderCart();
            renderCheckout();
            updateCartCount();
        }

        if (event.key === MESSAGES_KEY) renderAdminMessages();

        if (event.key === THEME_KEY) {
            const useLightTheme = event.newValue === "light";
            applyTheme(useLightTheme);
        }
    });
}

function initializeStore() {
    products = getProducts();
    loadProductsFromApi().then(() => {
        renderHomeDiscovery();
        renderProducts();
        renderProductDetail();
        renderCart();
        renderCheckout();
        renderAdminProducts();
    });
    setupTheme();
    setupMobileMenu();
    setupGlobalActions();
    setupStorageSync();
    setupContactForm();
    setupAdminPanel();
    renderHomeDiscovery();
    setupProductControls();
    setupDiscountForm();
    setupBackToTop();
    renderProducts();
    renderProductDetail();
    renderCart();
    renderCheckout();
    setupCheckoutForm();
    updateCartCount();
}

document.addEventListener("DOMContentLoaded", initializeStore);



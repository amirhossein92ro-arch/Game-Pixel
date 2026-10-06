'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dataPath = path.join(root, 'data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8').replace(/^\uFEFF/, ''));

const categoryMap = new Map([
    ['کیبورد گیمینگ', 'کیبورد گیمینگ'],
    ['موس گیمینگ', 'موس گیمینگ'],
    ['هدست گیمینگ', 'هدست'],
    ['مانیتور گیمینگ', 'مانیتور'],
    ['کنترلر گیمینگ', 'دسته بازی'],
    ['صندلی گیمینگ', 'صندلی گیمینگ'],
    ['میکروفون', 'میکروفون'],
    ['تجهیزات استریم', 'تجهیزات استریم'],
    ['وبکم', 'تجهیزات استریم'],
    ['حافظه گیمینگ', 'قطعات کامپیوتر'],
    ['خنک‌کننده', 'قطعات کامپیوتر'],
    ['گیمینگ', 'لوازم جانبی گیمینگ'],
    ['اسپیکر گیمینگ', 'لوازم جانبی گیمینگ'],
    ['موسپد گیمینگ', 'لوازم جانبی گیمینگ'],
    ['هاب و تجهیزات USB', 'لوازم جانبی گیمینگ'],
    ['لوازم ستاپ', 'لوازم جانبی گیمینگ']
]);

const images = {
    'موس گیمینگ': 'img/products/mouse.svg',
    'کیبورد گیمینگ': 'img/products/keyboard.svg',
    'هدست': 'img/products/headset.svg',
    'مانیتور': 'img/products/monitor.svg',
    'دسته بازی': 'img/products/controller.svg',
    'صندلی گیمینگ': 'img/products/chair.svg',
    'میکروفون': 'img/products/microphone.svg',
    'تجهیزات استریم': 'img/products/streaming.svg',
    'قطعات کامپیوتر': 'img/products/components.svg',
    'لوازم جانبی گیمینگ': 'img/products/accessories.svg'
};

if (!Array.isArray(data.products) || data.products.length < 50) {
    throw new Error('Catalog must contain at least 50 products before the upgrade.');
}

data.products = data.products.map((product, index) => {
    let category = categoryMap.get(product.category) || product.category;
    if (String(product.name).includes('میکروفون')) category = 'میکروفون';
    if (!images[category]) category = 'لوازم جانبی گیمینگ';
    return {
        ...product,
        category,
        image: images[category],
        shortDescription: String(product.shortDescription || product.description || 'تجهیز گیمینگ کاربردی برای تکمیل ستاپ بازی و استفاده روزمره.'),
        featured: product.featured ?? index < 8,
        status: product.status === 'inactive' ? 'inactive' : 'active'
    };
});

const required = Object.keys(images);
for (const category of required) {
    if (!data.products.some(product => product.category === category)) {
        throw new Error(`Missing required category: ${category}`);
    }
}
for (const product of data.products) {
    for (const field of ['name', 'price', 'category', 'shortDescription', 'image']) {
        if (product[field] === undefined || product[field] === null || product[field] === '') {
            throw new Error(`Product ${product.id} is missing ${field}`);
        }
    }
}

fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`Upgraded ${data.products.length} products across ${required.length} categories.`);

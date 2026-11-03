'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const images = require('../js/product-images.js');

function uploaded(value) {
    if (typeof value !== 'string' || value.length > 940000) return null;
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([a-zA-Z0-9+/=]+)$/.exec(value);
    if (!match) return null;
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length < 12 || bytes.length > 700000 || bytes.toString('base64') !== match[2]) return null;
    const type = match[1];
    const signature = type === 'png' ? bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))
        : type === 'jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : type === 'gif' ? ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))
        : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
    return signature ? {bytes, extension:type === 'jpeg' ? 'jpg' : type} : null;
}

// Files are checked inside img/ on each resolution so a removed/replaced asset
// cannot leave a cached broken URL, and symlinks cannot expose private files.
function createResolver({root = path.resolve(__dirname, '..'), mapping, materializeUploads = true} = {}) {
    const imageRoot = path.resolve(root, 'img');
    function exists(value) {
        const local = images.local(value);
        if (!local) return '';
        try {
            const base = fs.realpathSync(imageRoot);
            const filename = fs.realpathSync(path.join(root, local.slice(1)));
            const relative = path.relative(base, filename);
            if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return '';
            return fs.statSync(filename).isFile() ? local : '';
        } catch { return ''; }
    }
    function manifest() {
        if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) return mapping;
        try {
            const data = JSON.parse(fs.readFileSync(path.join(imageRoot, 'products', 'manifest.json'), 'utf8'));
            return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        } catch { return {}; }
    }
    function materialize(value) {
        const upload = uploaded(value);
        if (!upload) return '';
        const hash = crypto.createHash('sha256').update(upload.bytes).digest('hex');
        const local = '/img/products/upload-' + hash + '.' + upload.extension;
        const filename = path.join(root, local.slice(1));
        try {
            const products = path.join(imageRoot, 'products');
            if (materializeUploads) fs.mkdirSync(products, {recursive:true});
            const base = fs.realpathSync(imageRoot);
            const directory = fs.realpathSync(products);
            const relative = path.relative(base, directory);
            if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return '';
            if (materializeUploads) {
                try {fs.writeFileSync(filename, upload.bytes, {flag:'wx', mode:0o644});}
                catch (error) {if (error.code !== 'EEXIST') return '';}
            }
            // An existing same-name file must be the original bytes and stay in img/.
            return exists(local) && crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') === hash ? local : '';
        } catch { return ''; }
    }
    function firstExisting(values) {
        for (const value of values) {
            const image = exists(value);
            if (image) return image;
        }
        return '';
    }
    function resolve(product) {
        const p = product && typeof product === 'object' ? product : {};
        const explicit = exists(p.image) || materialize(p.image);
        const entries = manifest();
        const mapped = Object.hasOwn(entries, String(p.id)) ? exists(entries[String(p.id)]) : '';
        const specific = mapped || firstExisting(images.productCandidates(p));
        const category = firstExisting(images.categoryCandidates(p));
        const image = explicit && !images.isPlaceholder(explicit) ? explicit : specific || category || explicit || exists('/img/product-placeholder.svg');
        return {image, imageFallback: category && category !== image ? category : ''};
    }
    return {resolve, exists, materialize};
}
module.exports = {createResolver, uploaded};

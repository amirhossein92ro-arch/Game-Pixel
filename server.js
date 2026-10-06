"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

if (fs.existsSync(path.join(__dirname, '.env'))) process.loadEnvFile(path.join(__dirname, '.env'));

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10) || 3000;
const DATA_PATH = process.env.SEED_DATA_PATH || path.join(__dirname, "data.json");
const store = require("./lib/database.cjs").openDatabase(process.env.DATABASE_PATH || path.join(__dirname, "var", "web2.sqlite"), DATA_PATH);
const STATIC_ROOT = __dirname;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";

const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();

app.disable("x-powered-by");

/*
 * Express normally adds a charset for JSON and text responses, but static
 * files and custom handlers can vary between versions.  Normalising it in
 * one middleware keeps Persian content readable on every route.
 */
app.use((_req, res, next) => {
    const originalSetHeader = res.setHeader;
    res.setHeader = function setHeader(name, value) {
        if (
            typeof name === "string" &&
            name.toLowerCase() === "content-type" &&
            typeof value === "string" &&
            !/charset\s*=/i.test(value) &&
            /^(text\/|application\/(?:json|javascript|xml|xhtml\+xml))/i.test(value)
        ) {
            value = `${value}; charset=utf-8`;
        }
        return originalSetHeader.call(this, name, value);
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
});

// Product images can be uploaded by the admin panel as compact data URLs.
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true, limit: "6mb" }));

function repairMojibake(value) {
    if (typeof value === "string") {
        // Repair common UTF-8-as-Latin-1 text from older data files while
        // leaving correctly encoded Persian strings untouched.
        if (/[\u00c3\u00c2\u00d0\u00d1\u00d8\u00d9\u00da\u00db]/.test(value)) {
            try {
                const repaired = Buffer.from(value, "latin1").toString("utf8");
                if (repaired && !repaired.includes("\uFFFD")) return repaired;
            } catch {
                // Keep the original value when a legacy value cannot decode.
            }
        }
        return value;
    }
    if (Array.isArray(value)) return value.map(repairMojibake);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, repairMojibake(item)])
        );
    }
    return value;
}

function emptyData() {
    return { products: [], messages: [], users: [], orders: [] };
}

function readData() { return store.read(); }
function writeData(data) { return store.write(data); }
const security = require('./lib/commerce.cjs').installCommerce(app, store);
const requireAdmin = security.requireAdmin;
function readProducts() {
    const data = readData();
    return Array.isArray(data.products) ? data.products : [];
}

function writeProducts(products) {
    if (!Array.isArray(products)) {
        throw new TypeError("Products must be an array");
    }
    const data = readData();
    data.products = products;
    writeData(data);
}

/* â”€â”€ Generic data helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readCollection(name) {
    const data = readData();
    return Array.isArray(data[name]) ? data[name] : [];
}
function writeCollection(name, items) {
    if (!Array.isArray(items)) throw new TypeError(`${name} must be an array`);
    const data = readData();
    data[name] = items;
    writeData(data);
}
function getNextId(items) {
    return items.reduce((h, i) => { const id = Number(i && i.id); return Number.isFinite(id) ? Math.max(h, id) : h; }, 0) + 1;
}

/* â”€â”€ Posts helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readPosts() { return readCollection("posts"); }
function writePosts(posts) { writeCollection("posts", posts); }
function normalisePost(body, existing = null, forcedId) {
    const src = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : src.id;
    const title = asTrimmedString(src.title);
    if (!title || title.length > 200) return null;
    return {
        id, title,
        slug: asTrimmedString(src.slug) || title.replace(/\s+/g, "-").replace(/[^\w\u0600-\u06FF-]/g, ""),
        content: asTrimmedString(src.content),
        excerpt: asTrimmedString(src.excerpt),
        category: asTrimmedString(src.category, "Ø¹Ù…ÙˆÙ…ÛŒ"),
        tags: Array.isArray(src.tags) ? src.tags.map(String).filter(Boolean) : [],
        author: asTrimmedString(src.author, "Ù…Ø¯ÛŒØ±"),
        image: asTrimmedString(src.image),
        status: ["published","draft","archived"].includes(src.status) ? src.status : "draft",
        views: Number.isFinite(Number(src.views)) ? Math.max(0, Number(src.views)) : 0,
        commentStatus: src.commentStatus === "closed" ? "closed" : "open",
        createdAt: asTrimmedString(src.createdAt) || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

/* â”€â”€ Comments helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readComments() { return readCollection("comments"); }
function writeComments(comments) { writeCollection("comments", comments); }
function normaliseComment(body, existing = null, forcedId) {
    const src = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : src.id;
    const content = asTrimmedString(src.content);
    if (!content || content.length > 2000) return null;
    return {
        id, content,
        postId: Number(src.postId) || 0,
        author: asTrimmedString(src.author, "Ù†Ø§Ø´Ù†Ø§Ø³"),
        email: asTrimmedString(src.email),
        status: ["pending","approved","rejected"].includes(src.status) ? src.status : "pending",
        createdAt: asTrimmedString(src.createdAt) || new Date().toISOString(),
        parentId: Number(src.parentId) || null
    };
}

/* â”€â”€ Users helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readUsers() { return readCollection("users"); }
function writeUsers(users) { writeCollection("users", users); }
function normaliseUser(body, existing = null, forcedId) {
    const src = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : src.id;
    const name = asTrimmedString(src.name);
    if (!name) return null;
    return {
        id, name,
        phone: asTrimmedString(src.phone),
        email: asTrimmedString(src.email),
        role: ["user","editor","admin"].includes(src.role) ? src.role : "user",
        banned: src.banned === true || src.banned === "true",
        orderCount: Number.isFinite(Number(src.orderCount)) ? Math.max(0, Number(src.orderCount)) : 0,
        totalSpent: Number.isFinite(Number(src.totalSpent)) ? Math.max(0, Number(src.totalSpent)) : 0,
        joinDate: asTrimmedString(src.joinDate) || new Date().toISOString(),
        lastLogin: asTrimmedString(src.lastLogin) || "",
        updatedAt: asTrimmedString(src.updatedAt) || ""
    };
}

/* â”€â”€ Orders helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readOrders() { return readCollection("orders"); }
function writeOrders(orders) { writeCollection("orders", orders); }
function normaliseOrder(body, existing = null, forcedId) {
    const src = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : src.id;
    const code = asTrimmedString(src.code);
    if (!code) return null;
    return {
        id, code,
        items: Array.isArray(src.items) ? src.items : [],
        userName: asTrimmedString(src.userName),
        userEmail: asTrimmedString(src.userEmail),
        recipientName: asTrimmedString(src.recipientName),
        recipientPhone: asTrimmedString(src.recipientPhone),
        recipientAddress: asTrimmedString(src.recipientAddress),
        paymentMethod: asTrimmedString(src.paymentMethod, "Ú©Ø§Ø±Øª"),
        isAgreed: src.isAgreed === true,
        discountCode: asTrimmedString(src.discountCode),
        total: Number.isFinite(Number(src.total)) ? Math.max(0, Number(src.total)) : 0,
        status: ["processing","confirmed","shipped","cancelled","refunded"].includes(src.status) ? src.status : "processing",
        paymentStatus: ["paid","pending","failed","refunded"].includes(src.paymentStatus) ? src.paymentStatus : "paid",
        userPhone: asTrimmedString(src.userPhone),
        note: asTrimmedString(src.note),
        createdAt: asTrimmedString(src.createdAt) || new Date().toISOString(),
        updatedAt: asTrimmedString(src.updatedAt) || ""
    };
}

/* â”€â”€ Admin Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function getAdminStats(req,res){try{res.json(security.stats(req.admin));}catch(e){sendError(res,e,"خطا در آمار");}}

/* â”€â”€ CRUD: Posts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function getPosts(_req, res) { try { res.json(readPosts()); } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); } }
function getPost(req, res) {
    try {
        const found = readPosts().find(p => String(p.id) === String(req.params.id));
        if (!found) { const e = new Error("Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯"); e.statusCode = 404; throw e; }
        res.json(found);
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); }
}
function createPost(req, res) {
    try {
        const posts = readPosts();
        const post = normalisePost(req.body, null, getNextId(posts));
        if (!post) { const e = new Error("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù†ÙˆØ´ØªÙ‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª"); e.statusCode = 400; throw e; }
        writePosts([...posts, post]);
        res.status(201).json(post);
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§ Ø¯Ø± Ø°Ø®ÛŒØ±Ù‡"); }
}
function updatePost(req, res) {
    try {
        const posts = readPosts();
        const idx = posts.findIndex(p => String(p.id) === String(req.params.id));
        if (idx < 0) { const e = new Error("Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯"); e.statusCode = 404; throw e; }
        const updated = normalisePost(req.body, posts[idx], posts[idx].id);
        if (!updated) { const e = new Error("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª"); e.statusCode = 400; throw e; }
        posts[idx] = updated;
        writePosts(posts);
        res.json(updated);
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§ Ø¯Ø± ÙˆÛŒØ±Ø§ÛŒØ´"); }
}
function deletePost(req, res) {
    try {
        let posts = readPosts();
        const idx = posts.findIndex(p => String(p.id) === String(req.params.id));
        if (idx < 0) { const e = new Error("Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯"); e.statusCode = 404; throw e; }
        posts.splice(idx, 1);
        writePosts(posts);
        res.status(204).end();
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§ Ø¯Ø± Ø­Ø°Ù"); }
}

/* â”€â”€ CRUD: Comments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function getComments(_req, res) { try { res.json(readComments()); } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); } }
function createComment(req, res) {
    try {
        const comments = readComments();
        const comment = normaliseComment(req.body, null, getNextId(comments));
        if (!comment) { const e = new Error("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù†Ø¸Ø± Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª"); e.statusCode = 400; throw e; }
        writeComments([...comments, comment]);
        res.status(201).json(comment);
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); }
}
function updateComment(req, res) {
    try {
        const comments = readComments();
        const idx = comments.findIndex(c => String(c.id) === String(req.params.id));
        if (idx < 0) { const e = new Error("Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯"); e.statusCode = 404; throw e; }
        const updated = normaliseComment(req.body, comments[idx], comments[idx].id);
        if (!updated) { const e = new Error("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª"); e.statusCode = 400; throw e; }
        comments[idx] = updated;
        writeComments(comments);
        res.json(updated);
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); }
}
function deleteComment(req, res) {
    try {
        let comments = readComments();
        const idx = comments.findIndex(c => String(c.id) === String(req.params.id));
        if (idx < 0) { const e = new Error("Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯"); e.statusCode = 404; throw e; }
        comments.splice(idx, 1);
        writeComments(comments);
        res.status(204).end();
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); }
}

/* â”€â”€ CRUD: Users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
app.get("/api/admin/stats", requireAdmin, getAdminStats);

app.get("/api/admin/posts", requireAdmin, getPosts);
app.get("/api/admin/posts/:id", requireAdmin, getPost);
app.post("/api/admin/posts", requireAdmin, createPost);
app.put("/api/admin/posts/:id", requireAdmin, updatePost);
app.delete("/api/admin/posts/:id", requireAdmin, deletePost);

app.get("/api/admin/comments", requireAdmin, getComments);
app.post("/api/admin/comments", requireAdmin, createComment);
app.put("/api/admin/comments/:id", requireAdmin, updateComment);
app.delete("/api/admin/comments/:id", requireAdmin, deleteComment);



/* â”€â”€ Existing admin routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
app.get("/api/admin/products", requireAdmin, getProducts);
app.get("/api/admin/products/:id", requireAdmin, getProductById);
app.post("/api/admin/products", requireAdmin, createProduct);
app.put("/api/admin/products/:id", requireAdmin, updateProduct);
app.delete("/api/admin/products/:id", requireAdmin, deleteProduct);

/* â”€â”€ Public API routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
app.get("/api/products", getProducts);
app.get("/api/products/:id", getProductById);
app.post("/api/products", requireAdmin, createProduct);
app.put("/api/products/:id", requireAdmin, updateProduct);
app.delete("/api/products/:id", requireAdmin, deleteProduct);


/* â”€â”€ Static files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const staticOptions = {
    index: false,
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".html") res.setHeader("Content-Type", "text/html; charset=utf-8");
        else if (ext === ".json") res.setHeader("Content-Type", "application/json; charset=utf-8");
        else if (ext === ".js") res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        else if (ext === ".css") res.setHeader("Content-Type", "text/css; charset=utf-8");
    }
};
app.use("/css", express.static(path.join(STATIC_ROOT, "css"), staticOptions));
app.use("/js", express.static(path.join(STATIC_ROOT, "js"), staticOptions));
app.use("/img", express.static(path.join(STATIC_ROOT, "img"), staticOptions));
["style.css", "script.js", "products.js"].forEach((fileName) => {
    app.get(`/${fileName}`, (_req, res, next) => {
        res.sendFile(path.join(STATIC_ROOT, fileName), (error) => { if (error) next(error); });
    });
});

// Existing route definitions remain below
function getNextProductId(products) {
    const highest = products.reduce((highest, product) => {
        // Only the legacy decimal sequence participates in ID allocation.
        const key = String(product?.id ?? '');
        const sequence = /^[1-9][0-9]*$/.test(key) ? Number(key) : 0;
        return Number.isSafeInteger(sequence) ? Math.max(highest, sequence) : highest;
    }, 0);
    const saved = store.db.prepare("SELECT payload FROM settings WHERE id='product-sequence'").get();
    const next = Math.max(highest, Number(saved?.payload || 0)) + 1;
    store.db.prepare("INSERT OR REPLACE INTO settings VALUES('product-sequence',?)").run(String(next));
    return String(next);
}

function asTrimmedString(value, fallback = "") {
    return value === undefined || value === null ? fallback : String(value).trim();
}

function safeProductImage(value) {
    const image = String(value || "img/product-placeholder.svg");
    return /^(?:img\/[a-zA-Z0-9_.\/-]+|https:\/\/[^\s<>"']+|data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+)$/.test(image) ? image : "img/product-placeholder.svg";
}
function normaliseProduct(input, existing = null, forcedId = undefined) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const source = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : source.id;
    const name = asTrimmedString(source.name || source.title);
    const price = Number(source.price);

    if (!name || name.length > 200 || !Number.isSafeInteger(price) || price <= 0) {
        return null;
    }

    const stockValue = Number(source.stock);
    const ratingValue = Number(source.rating);
    const reviewsValue = Number(source.reviews);
    const discountValue = Number(source.discount);
    if (source.status && !["active", "inactive"].includes(source.status)) return null;
    if (!Number.isSafeInteger(stockValue) || stockValue < 0) return null;
    if (typeof source.image === 'string' && source.image.length > 3 * 1024 * 1024) return null;
    if (Math.round(price * (100 - Math.min(99, Math.max(0, Number(source.discount) || 0))) / 100) < 1) return null;
    if (["featured","isNew","bestSeller"].some(k=>source[k]!==undefined&&typeof source[k]!=="boolean")) return null;
    const features = Array.isArray(source.features)
        ? source.features.slice(0,40).map((feature) => String(feature).trim().slice(0,300)).filter(Boolean)
        : [];

    return {
        featured:source.featured??false,isNew:source.isNew??false,bestSeller:source.bestSeller??false,
        id: String(id),
        name,
        price: Math.round(price),
        discount: Number.isFinite(discountValue) ? Math.min(99, Math.max(0, Math.round(discountValue))) : 0,
        stock: Number.isFinite(stockValue) ? Math.max(0, Math.floor(stockValue)) : 0,
        rating: Number.isFinite(ratingValue) ? Math.min(5, Math.max(0, ratingValue)) : 0,
        reviews: Number.isFinite(reviewsValue) ? Math.max(0, Math.floor(reviewsValue)) : 0,
        brand: asTrimmedString(source.brand, "WEB 2").slice(0,100),
        icon: /^fa-[a-z0-9-]+$/.test(source.icon || '') ? source.icon : 'fa-gamepad',
        accent: /^#[a-f0-9]{6}$/i.test(source.accent || '') ? source.accent : '#00d4ff',
        tag: asTrimmedString(source.tag, "جدید").slice(0,100),
        shortDescription: asTrimmedString(source.shortDescription || source.description).slice(0,300),
        description: asTrimmedString(source.description).slice(0,5000),
        features,
        guarantee: asTrimmedString(source.guarantee, "گارانتی فروشگاه").slice(0,200),
        category: asTrimmedString(source.category, "Ù…Ø­ØµÙˆÙ„"),
        image: safeProductImage(source.image),
        status: source.status || "active",
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function validateProductPayload(body, existing = null, forcedId = undefined) {
    const product = normaliseProduct(body, existing, forcedId);
    if (!product) {
        const error = new Error("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù…Ø­ØµÙˆÙ„ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª");
        error.statusCode = 400;
        throw error;
    }
    return product;
}

function sendError(res, error, fallbackMessage) {
    const statusCode = Number.isInteger(error && error.statusCode) ? error.statusCode : 500;
    if (res.headersSent) return;
    res.status(statusCode).json({
        error: statusCode >= 500 ? 'خطای سرور؛ دوباره تلاش کنید.' : repairMojibake(error.message || fallbackMessage)
    });
}

function sendPage(fileName, res, next) {
    const filePath = path.join(STATIC_ROOT, fileName);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.sendFile(filePath, (error) => {
        if (error) next(error);
    });
}

const pageRoutes = {
    "/": "index.html",
    "/index": "index.html",
    "/index.html": "index.html",
    "/admin": "admin.html",
    "/admin.html": "admin.html",
    "/cart": "cart.html",
    "/cart.html": "cart.html",
    "/checkout": "checkout.html",
    "/checkout.html": "checkout.html",
    "/product": "product.html",
    "/product.html": "product.html",
    "/profile": "profile.html",
    "/profile.html": "profile.html"
};

Object.entries(pageRoutes).forEach(([route, fileName]) => {
    app.get(route, (_req, res, next) => sendPage(fileName, res, next));
});

function getProducts(_req, res) {
    try {
        return res
            .type("application/json")
            .json(readProducts().filter(p => _req.path.startsWith("/api/admin/") || p.status !== "inactive"));
    } catch (error) {
        console.error("[products] read failed:", error.message);
        return sendError(res, error, "Ø®Ø·Ø§ Ø¯Ø± Ø®ÙˆØ§Ù†Ø¯Ù† data.json");
    }
}

function createProduct(req, res) {
    try {
        const product = store.transaction(() => {
            const products = readProducts();
            const product = validateProductPayload(req.body, null, getNextProductId(products));
            if (products.some(p => p.name === product.name)) throw Object.assign(new Error('نام محصول تکراری است.'), {statusCode:409});
            writeProducts([...products, product]);
            security.adminSecurity.audit(req.admin,'PRODUCT_CREATED','product',product.id);req.auditRecorded=true;
            return product;
        });
        return res.status(201).type("application/json").json(product);
    } catch (error) {
        console.error("[products] create failed:", error.message);
        return sendError(res, error, "Ø®Ø·Ø§ Ø¯Ø± Ø°Ø®ÛŒØ±Ù‡ Ù…Ø­ØµÙˆÙ„");
    }
}

function updateProduct(req, res) {
    try {
        const products = readProducts();
        const index = products.findIndex(
            (product) => String(product && product.id) === String(req.params.id)
        );
        if (index < 0) {
            const notFound = new Error("Ù…Ø­ØµÙˆÙ„ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯");
            notFound.statusCode = 404;
            throw notFound;
        }

        const current = products[index];
        const updated = validateProductPayload(req.body, current, current.id);
        if (products.some(p => String(p.id) !== String(current.id) && p.name === updated.name)) throw Object.assign(new Error('نام محصول تکراری است.'), {statusCode:409});
        products[index] = updated;
        store.transaction(()=>{writeProducts(products);for(const [key,action]of [['price','PRODUCT_PRICE_CHANGED'],['stock','PRODUCT_STOCK_CHANGED']])if(current[key]!==updated[key])security.adminSecurity.audit(req.admin,action,'product',current.id,{previous:current[key],value:updated[key]});security.adminSecurity.audit(req.admin,'PRODUCT_UPDATED','product',current.id);req.auditRecorded=true;});
        return res.type("application/json").json(updated);
    } catch (error) {
        console.error("[products] update failed:", error.message);
        return sendError(res, error, "Ø®Ø·Ø§ Ø¯Ø± ÙˆÛŒØ±Ø§ÛŒØ´ Ù…Ø­ØµÙˆÙ„");
    }
}

function deleteProduct(req, res) {
    try {
        const products = readProducts();
        const index = products.findIndex(
            (product) => String(product && product.id) === String(req.params.id)
        );
        if (index < 0) {
            const notFound = new Error("Ù…Ø­ØµÙˆÙ„ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯");
            notFound.statusCode = 404;
            throw notFound;
        }

        products.splice(index, 1);
        // Empty product lists are valid: a complete CRUD API must allow the
        // final item to be deleted without corrupting data.json.
        store.transaction(()=>{writeProducts(products);security.adminSecurity.audit(req.admin,'PRODUCT_DELETED','product',req.params.id);req.auditRecorded=true;});
        return res.status(204).end();
    } catch (error) {
        console.error("[products] delete failed:", error.message);
        return sendError(res, error, "Ø®Ø·Ø§ Ø¯Ø± Ø­Ø°Ù Ù…Ø­ØµÙˆÙ„");
    }
}

function getProductById(req, res) {
    try {
        const product = readProducts().find(
            (item) => String(item && item.id) === String(req.params.id)
        );
        if (!product || (product.status === "inactive" && !req.path.startsWith("/api/admin/"))) {
            const notFound = new Error("Ù…Ø­ØµÙˆÙ„ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯");
            notFound.statusCode = 404;
            throw notFound;
        }
        return res.type("application/json").json(product);
    } catch (error) {
        console.error("[products] read-one failed:", error.message);
        return sendError(res, error, "Ø®Ø·Ø§ Ø¯Ø± Ø®ÙˆØ§Ù†Ø¯Ù† Ù…Ø­ØµÙˆÙ„");
    }
}


/* â”€â”€ End of routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const RUN_PORT = PORT;
app.use('/api', (_req, res) => res.status(404).json({ error: 'مسیر API پیدا نشد.' }));
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || error.statusCode || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: status < 500 ? error.message : 'خطای سرور؛ دوباره تلاش کنید.' });
});
app.listen(RUN_PORT, () => {
    console.log('Server is running on http://localhost:' + RUN_PORT);
}).on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
        ? `Port ${RUN_PORT} is already in use. Stop the other server or set PORT and APP_ORIGIN to a matching free port.`
        : `Server startup failed: ${error.message}`);
    store.db.close();
    process.exitCode = 1;
});

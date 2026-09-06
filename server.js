"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const app = express();
const PORT = Number.parseInt(process.env.PORT || "5000", 10) || 5000;
const DATA_PATH = path.join(__dirname, "data.json");
const STATIC_ROOT = __dirname;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "12345";
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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

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
    return { products: [], messages: [] };
}

function readData() {
    if (!fs.existsSync(DATA_PATH)) return emptyData();

    const source = fs.readFileSync(DATA_PATH, { encoding: "utf8" }).replace(/^\uFEFF/, "");
    const parsed = JSON.parse(source);
    const repaired = repairMojibake(parsed);

    if (Array.isArray(repaired)) {
        return { products: repaired, messages: [] };
    }

    if (!repaired || typeof repaired !== "object") {
        return emptyData();
    }

    return {
        ...repaired,
        products: Array.isArray(repaired.products) ? repaired.products : [],
        messages: Array.isArray(repaired.messages) ? repaired.messages : []
    };
}

function writeData(data) {
    const payload = data && typeof data === "object" && !Array.isArray(data)
        ? data
        : emptyData();
    const serialised = `${JSON.stringify(payload, null, 2)}\n`;
    const temporaryPath = `${DATA_PATH}.${process.pid}.${Date.now()}.tmp`;

    fs.writeFileSync(temporaryPath, serialised, { encoding: "utf8", mode: 0o600 });
    try {
        // POSIX rename replaces the destination atomically.  Windows can
        // reject replacing an existing file, so fall back to a safe copy.
        try {
            fs.renameSync(temporaryPath, DATA_PATH);
        } catch (error) {
            if (!["EEXIST", "EPERM", "EACCES"].includes(error && error.code)) {
                throw error;
            }
            fs.copyFileSync(temporaryPath, DATA_PATH);
            fs.unlinkSync(temporaryPath);
        }
    } finally {
        if (fs.existsSync(temporaryPath)) {
            try {
                fs.unlinkSync(temporaryPath);
            } catch {
                // The original write error is more useful to the caller.
            }
        }
    }
}

async function setupDefaultAdmin() {
    const data = readData();
    const current = data.admin && typeof data.admin === "object" ? data.admin : null;
    const passwordIsCurrent = current && typeof current.password === "string"
        ? await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, current.password).catch(() => false)
        : false;

    if (
        current &&
        current.username === ADMIN_USERNAME &&
        current.role === "admin" &&
        passwordIsCurrent
    ) {
        return;
    }

    data.admin = {
        username: ADMIN_USERNAME,
        password: await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10),
        role: "admin"
    };
    writeData(data);
    console.log("Admin user is ready.");
}

const adminReady = setupDefaultAdmin();

function getBearerToken(req) {
    const header = String(req.headers.authorization || "");
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : "";
}

function getAdminSession(req) {
    const token = getBearerToken(req);
    const session = token ? adminSessions.get(token) : null;
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
        adminSessions.delete(token);
        return null;
    }
    return { token, ...session };
}

function requireAdmin(req, res, next) {
    const session = getAdminSession(req);
    if (!session || session.role !== "admin") {
        return res.status(401).json({ error: "ورود مدیر لازم است." });
    }
    req.admin = session;
    next();
}

async function loginAdmin(req, res) {
    try {
        await adminReady;
        const username = asTrimmedString(req.body && req.body.username);
        const password = String((req.body && req.body.password) || "");
        const admin = readData().admin;
        const valid = admin &&
            username === admin.username &&
            typeof admin.password === "string" &&
            await bcrypt.compare(password, admin.password);

        if (!valid) {
            return res.status(401).json({ error: "نام کاربری یا رمز عبور اشتباه است." });
        }

        const token = crypto.randomBytes(32).toString("hex");
        adminSessions.set(token, {
            username: admin.username,
            role: admin.role,
            expiresAt: Date.now() + ADMIN_SESSION_TTL_MS
        });
        return res.json({ token, username: admin.username, role: admin.role });
    } catch (error) {
        console.error("[admin] login failed:", error.message);
        return sendError(res, error, "خطا در ورود مدیر");
    }
}

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

function getNextProductId(products) {
    return products.reduce((highest, product) => {
        const id = Number(product && product.id);
        return Number.isFinite(id) ? Math.max(highest, id) : highest;
    }, 0) + 1;
}

function asTrimmedString(value, fallback = "") {
    return value === undefined || value === null ? fallback : String(value).trim();
}

function normaliseProduct(input, existing = null, forcedId = undefined) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const source = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : source.id;
    const name = asTrimmedString(source.name || source.title);
    const price = Number(source.price);

    if (!name || name.length > 200 || !Number.isFinite(price) || price <= 0) {
        return null;
    }

    const stockValue = Number(source.stock);
    const ratingValue = Number(source.rating);
    const reviewsValue = Number(source.reviews);
    const features = Array.isArray(source.features)
        ? source.features.map((feature) => String(feature).trim()).filter(Boolean)
        : [];

    return {
        ...source,
        id,
        name,
        price: Math.round(price),
        stock: Number.isFinite(stockValue) ? Math.max(0, Math.floor(stockValue)) : 0,
        rating: Number.isFinite(ratingValue) ? Math.min(5, Math.max(0, ratingValue)) : 0,
        reviews: Number.isFinite(reviewsValue) ? Math.max(0, Math.floor(reviewsValue)) : 0,
        brand: asTrimmedString(source.brand),
        icon: asTrimmedString(source.icon, "fa-box"),
        accent: asTrimmedString(source.accent, "#00d4ff"),
        tag: asTrimmedString(source.tag),
        shortDescription: asTrimmedString(source.shortDescription),
        description: asTrimmedString(source.description),
        features,
        guarantee: asTrimmedString(source.guarantee),
        category: asTrimmedString(source.category, "محصول"),
        image: asTrimmedString(source.image, "img/product-placeholder.svg")
    };
}

function validateProductPayload(body, existing = null, forcedId = undefined) {
    const product = normaliseProduct(body, existing, forcedId);
    if (!product) {
        const error = new Error("اطلاعات محصول معتبر نیست");
        error.statusCode = 400;
        throw error;
    }
    return product;
}

function sendError(res, error, fallbackMessage) {
    const statusCode = Number.isInteger(error && error.statusCode) ? error.statusCode : 500;
    if (res.headersSent) return;
    res.status(statusCode).json({
        error: statusCode >= 500 ? fallbackMessage : (error.message || fallbackMessage)
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
            .json(readProducts());
    } catch (error) {
        console.error("[products] read failed:", error.message);
        return sendError(res, error, "خطا در خواندن data.json");
    }
}

function createProduct(req, res) {
    try {
        const products = readProducts();
        const product = validateProductPayload(req.body, null, getNextProductId(products));
        writeProducts([...products, product]);
        return res.status(201).type("application/json").json(product);
    } catch (error) {
        console.error("[products] create failed:", error.message);
        return sendError(res, error, "خطا در ذخیره محصول");
    }
}

function updateProduct(req, res) {
    try {
        const products = readProducts();
        const index = products.findIndex(
            (product) => String(product && product.id) === String(req.params.id)
        );
        if (index < 0) {
            const notFound = new Error("محصول پیدا نشد");
            notFound.statusCode = 404;
            throw notFound;
        }

        const current = products[index];
        const updated = validateProductPayload(req.body, current, current.id);
        products[index] = updated;
        writeProducts(products);
        return res.type("application/json").json(updated);
    } catch (error) {
        console.error("[products] update failed:", error.message);
        return sendError(res, error, "خطا در ویرایش محصول");
    }
}

function deleteProduct(req, res) {
    try {
        const products = readProducts();
        const index = products.findIndex(
            (product) => String(product && product.id) === String(req.params.id)
        );
        if (index < 0) {
            const notFound = new Error("محصول پیدا نشد");
            notFound.statusCode = 404;
            throw notFound;
        }

        products.splice(index, 1);
        // Empty product lists are valid: a complete CRUD API must allow the
        // final item to be deleted without corrupting data.json.
        writeProducts(products);
        return res.status(204).end();
    } catch (error) {
        console.error("[products] delete failed:", error.message);
        return sendError(res, error, "خطا در حذف محصول");
    }
}

function getProductById(req, res) {
    try {
        const product = readProducts().find(
            (item) => String(item && item.id) === String(req.params.id)
        );
        if (!product) {
            const notFound = new Error("محصول پیدا نشد");
            notFound.statusCode = 404;
            throw notFound;
        }
        return res.type("application/json").json(product);
    } catch (error) {
        console.error("[products] read-one failed:", error.message);
        return sendError(res, error, "خطا در خواندن محصول");
    }
}

// Both paths are kept for compatibility with the storefront and admin UI.
app.get("/api/products", getProducts);
app.get("/api/products/:id", getProductById);
app.post("/api/products", requireAdmin, createProduct);
app.put("/api/products/:id", requireAdmin, updateProduct);
app.delete("/api/products/:id", requireAdmin, deleteProduct);

app.post("/api/admin/login", loginAdmin);
app.get("/api/admin/session", requireAdmin, (req, res) => {
    res.json({ username: req.admin.username, role: req.admin.role });
});
app.post("/api/admin/logout", requireAdmin, (req, res) => {
    adminSessions.delete(req.admin.token);
    res.status(204).end();
});
app.get("/api/admin/products", requireAdmin, getProducts);
app.get("/api/admin/products/:id", requireAdmin, getProductById);
app.post("/api/admin/products", requireAdmin, createProduct);
app.put("/api/admin/products/:id", requireAdmin, updateProduct);
app.delete("/api/admin/products/:id", requireAdmin, deleteProduct);

// Only browser assets are public. Internal files such as data.json,
// server.js and package.json must never be downloadable.
const staticOptions = {
    index: false,
    setHeaders: (res, filePath) => {
        const extension = path.extname(filePath).toLowerCase();
        if (extension === ".html") {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
        } else if (extension === ".json") {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
        } else if (extension === ".js") {
            res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        } else if (extension === ".css") {
            res.setHeader("Content-Type", "text/css; charset=utf-8");
        }
    }
};

app.use("/css", express.static(path.join(STATIC_ROOT, "css"), staticOptions));
app.use("/js", express.static(path.join(STATIC_ROOT, "js"), staticOptions));
app.use("/img", express.static(path.join(STATIC_ROOT, "img"), staticOptions));
["style.css", "script.js", "products.js"].forEach((fileName) => {
    app.get(`/${fileName}`, (_req, res, next) => {
        res.sendFile(path.join(STATIC_ROOT, fileName), (error) => {
            if (error) next(error);
        });
    });
});

app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).type("application/json").json({ error: "مسیر API پیدا نشد" });
    }
    return res.status(404).type("html").send(
        "<!doctype html><html lang=\"fa\" dir=\"rtl\"><head><meta charset=\"UTF-8\"><title>صفحه پیدا نشد</title></head><body><h1>صفحه پیدا نشد</h1></body></html>"
    );
});

// Handles malformed JSON bodies and any unexpected route errors without
// allowing an exception to terminate the Node process.
app.use((error, _req, res, _next) => {
    console.error("[server] request failed:", error && error.stack ? error.stack : error);
    if (res.headersSent) return;
    if (error && (error.type === "entity.parse.failed" || error instanceof SyntaxError)) {
        return res.status(400).type("application/json").json({ error: "بدنه JSON نامعتبر است" });
    }
    return res.status(500).type("application/json").json({ error: "خطای داخلی سرور" });
});

if (require.main === module) {
    adminReady.then(() => app.listen(PORT, () => {
        console.log(`Gaming Store server running at http://localhost:${PORT}`);
        console.log(`Home: http://localhost:${PORT}/index`);
        console.log(`Admin: http://localhost:${PORT}/admin`);
    })).then((server) => server.on("error", (error) => {
        // Keep the failure observable while avoiding an uncaught exception.
        console.error("[server] listen failed:", error.message);
    })).catch((error) => {
        console.error("[admin] setup failed:", error.message);
        process.exitCode = 1;
    });
}

module.exports = app;
module.exports.app = app;
module.exports.DATA_PATH = DATA_PATH;
module.exports.setupDefaultAdmin = setupDefaultAdmin;
module.exports.readProducts = readProducts;
module.exports.writeProducts = writeProducts;

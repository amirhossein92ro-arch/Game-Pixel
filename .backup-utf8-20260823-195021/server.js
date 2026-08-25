"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, "data.json");

let writeQueue = Promise.resolve();

app.disable("x-powered-by");
app.use(cors());
app.use(bodyParser.json({ limit: "100kb" }));
app.use(bodyParser.urlencoded({ extended: false, limit: "100kb" }));

function cleanText(value, maxLength) {
    return String(value ?? "").trim().slice(0, maxLength);
}

function cleanIcon(value) {
    const icon = cleanText(value, 60).replace(/^fa-(solid|regular|brands)\s+/, "");
    return /^fa-[a-z0-9-]+$/i.test(icon) ? icon : "fa-gamepad";
}

function createHttpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

async function readData() {
    const rawData = await fs.readFile(DATA_FILE, "utf8");
    const data = JSON.parse(rawData);

    return {
        products: Array.isArray(data.products) ? data.products : [],
        messages: Array.isArray(data.messages) ? data.messages : []
    };
}

function updateData(mutator) {
    const operation = writeQueue.then(async () => {
        const data = await readData();
        const result = await mutator(data);
        await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
        return result;
    });

    writeQueue = operation.catch(() => {});
    return operation;
}

function validateProduct(body) {
    const name = cleanText(body.name, 80);
    const description = cleanText(body.description, 500);
    const price = Number(body.price);

    if (name.length < 2) throw createHttpError(400, "نام محصول باید حداقل ۲ کاراکتر باشد.");
    if (description.length < 5) throw createHttpError(400, "توضیحات محصول باید حداقل ۵ کاراکتر باشد.");
    if (!Number.isFinite(price) || price <= 0) throw createHttpError(400, "قیمت محصول معتبر نیست.");

    return {
        name,
        description,
        price: Math.round(price),
        icon: cleanIcon(body.icon)
    };
}

function validateContact(body) {
    const name = cleanText(body.name, 60);
    const email = cleanText(body.email, 100).toLowerCase();
    const subject = cleanText(body.subject, 100);
    const message = cleanText(body.message, 1000);
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (name.length < 2) throw createHttpError(400, "نام واردشده معتبر نیست.");
    if (!emailPattern.test(email)) throw createHttpError(400, "ایمیل واردشده معتبر نیست.");
    if (subject.length < 3) throw createHttpError(400, "موضوع پیام بیش از حد کوتاه است.");
    if (message.length < 10) throw createHttpError(400, "متن پیام باید حداقل ۱۰ کاراکتر باشد.");

    return { name, email, subject, message };
}

app.get("/api/products", async (req, res, next) => {
    try {
        const data = await readData();
        res.json(data.products);
    } catch (error) {
        next(error);
    }
});

app.get("/api/admin/products", async (req, res, next) => {
    try {
        const data = await readData();
        res.json(data.products);
    } catch (error) {
        next(error);
    }
});

app.post("/api/products", async (req, res, next) => {
    try {
        const input = validateProduct(req.body);
        const product = await updateData((data) => {
            const nextId = data.products.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
            const newProduct = {
                id: nextId,
                name: input.name,
                brand: "WEB 2 CUSTOM",
                icon: input.icon,
                accent: "#00d4ff",
                tag: "جدید",
                price: input.price,
                stock: 50,
                rating: 5,
                reviews: 0,
                shortDescription: input.description,
                description: input.description,
                features: [
                    "محصول افزوده‌شده توسط مدیریت",
                    "موجود و آماده سفارش"
                ],
                guarantee: "ضمانت فروشگاه",
                category: "محصول سفارشی"
            };

            data.products.push(newProduct);
            return newProduct;
        });

        res.status(201).json(product);
    } catch (error) {
        next(error);
    }
});

app.post("/api/admin/products", async (req, res, next) => {
    try {
        const input = validateProduct(req.body);
        const product = await updateData((data) => {
            const nextId = data.products.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
            const newProduct = {
                id: nextId,
                name: input.name,
                brand: "WEB 2 CUSTOM",
                icon: input.icon,
                image: cleanText(req.body.image, 500),
                accent: "#00d4ff",
                tag: "جدید",
                price: input.price,
                stock: Number.isFinite(Number(req.body.stock)) ? Math.max(0, Number(req.body.stock)) : 50,
                rating: 5,
                reviews: 0,
                shortDescription: input.description,
                description: input.description,
                features: [],
                guarantee: "ضمانت فروشگاه",
                category: cleanText(req.body.category, 80) || "محصول سفارشی"
            };
            data.products.push(newProduct);
            return newProduct;
        });
        res.status(201).json(product);
    } catch (error) {
        next(error);
    }
});

app.delete("/api/products/:id", async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        if (!Number.isInteger(productId) || productId < 1) {
            throw createHttpError(400, "شناسه محصول معتبر نیست.");
        }

        const deletedProduct = await updateData((data) => {
            const productIndex = data.products.findIndex((item) => Number(item.id) === productId);
            if (productIndex === -1) throw createHttpError(404, "محصول موردنظر پیدا نشد.");
            return data.products.splice(productIndex, 1)[0];
        });

        res.json({ message: "محصول با موفقیت حذف شد.", product: deletedProduct });
    } catch (error) {
        next(error);
    }
});

app.put("/api/admin/products/:id", async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const input = validateProduct(req.body);
        const product = await updateData((data) => {
            const item = data.products.find((entry) => Number(entry.id) === productId);
            if (!item) throw createHttpError(404, "محصول موردنظر پیدا نشد.");
            Object.assign(item, {
                name: input.name,
                price: input.price,
                description: input.description,
                shortDescription: input.description,
                category: cleanText(req.body.category, 80) || item.category,
                stock: Number.isFinite(Number(req.body.stock)) ? Math.max(0, Number(req.body.stock)) : item.stock,
                image: cleanText(req.body.image, 500)
            });
            return item;
        });
        res.json(product);
    } catch (error) {
        next(error);
    }
});

app.delete("/api/admin/products/:id", async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const deletedProduct = await updateData((data) => {
            const index = data.products.findIndex((entry) => Number(entry.id) === productId);
            if (index < 0) throw createHttpError(404, "محصول موردنظر پیدا نشد.");
            return data.products.splice(index, 1)[0];
        });
        res.json({ message: "محصول با موفقیت حذف شد.", product: deletedProduct });
    } catch (error) {
        next(error);
    }
});

app.post("/api/contact", async (req, res, next) => {
    try {
        const input = validateContact(req.body);
        const contactMessage = await updateData((data) => {
            const nextId = data.messages.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
            const newMessage = {
                id: nextId,
                ...input,
                createdAt: new Date().toISOString()
            };

            data.messages.unshift(newMessage);
            return newMessage;
        });

        res.status(201).json({
            message: "پیام شما با موفقیت ثبت شد.",
            contact: contactMessage
        });
    } catch (error) {
        next(error);
    }
});

app.get("/api/admin/messages", async (req, res, next) => {
    try {
        const data = await readData();
        res.json(data.messages);
    } catch (error) {
        next(error);
    }
});

const blockedStaticPaths = new Set([
    "/data.json",
    "/server.js",
    "/package.json",
    "/package-lock.json"
]);

app.use((req, res, next) => {
    if (blockedStaticPaths.has(req.path) || req.path.startsWith("/node_modules/")) {
        res.status(404).send("Not found");
        return;
    }
    next();
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin.html"));
});

app.use(express.static(ROOT_DIR, {
    dotfiles: "deny",
    index: "index.html",
    extensions: ["html"],
    maxAge: 0
}));

app.use("/api", (req, res) => {
    res.status(404).json({ message: "مسیر API موردنظر پیدا نشد." });
});

app.use((req, res) => {
    res.status(404).sendFile(path.join(ROOT_DIR, "index.html"));
});

app.use((error, req, res, next) => {
    console.error(error);
    const status = Number(error.status) || 500;
    res.status(status).json({
        message: status >= 500 ? "خطایی در سرور رخ داد." : error.message
    });
});

app.listen(PORT, () => {
    console.log(`Web 2 Gaming Store is running at http://localhost:${PORT}`);
});

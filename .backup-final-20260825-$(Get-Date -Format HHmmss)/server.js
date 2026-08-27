const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_PATH = path.join(__dirname, "data.json");
function repairMojibake(value) {
  if (typeof value === "string" && /[ØÙÚÃÂ]/.test(value)) {
    const bytes = Buffer.from([...value].map((ch) => ch === "\uFFFD" ? 0x81 : ch.charCodeAt(0) & 0xff));
    return bytes.toString("utf8");
  }
  if (Array.isArray(value)) return value.map(repairMojibake);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, repairMojibake(v)]));
  return value;
}

// پشتیبانی از JSON و داده‌های فرم
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تنظیم UTF-8 برای تمام پاسخ‌ها
app.use((req, res, next) => {
  res.setHeader("Charset", "utf-8");
  next();
});

// مسیرهای HTML باید قبل از static باشند تا فایل بدون پسوند «admin» تداخلی ایجاد نکند.
app.get("/", (_req, res) => {
  res.type("html").sendFile(path.join(__dirname, "index.html"));
});
app.get(["/admin", "/admin.html"], (_req, res) => {
  res.type("html").sendFile(path.join(__dirname, "admin.html"));
});
app.get(["/cart.html", "/checkout.html", "/product.html"], (req, res) => {
  res.type("html").sendFile(path.join(__dirname, req.path.slice(1)));
});

// سرو کردن تمام فایل‌های پروژه (HTML, CSS, JS, تصاویر)
app.use(express.static(__dirname));

// مسیر دریافت محصولات
app.get("/api/products", (req, res) => {
  if (fs.existsSync(DATA_PATH)) {
    try {
      const rawData = fs.readFileSync(DATA_PATH, "utf8");
      const data = repairMojibake(JSON.parse(rawData));
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.json(data.products || data);
    } catch (err) {
      return res.status(500).json({ error: "خطا در خواندن data.json" });
    }
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json([]);
});

function readProducts() {
  if (!fs.existsSync(DATA_PATH)) return [];
  const payload = repairMojibake(JSON.parse(fs.readFileSync(DATA_PATH, "utf8")));
  return Array.isArray(payload) ? payload : (Array.isArray(payload.products) ? payload.products : []);
}

function writeProducts(products) {
  if (!Array.isArray(products) || !products.length) {
    throw new Error("Refusing to overwrite products with an empty list");
  }
  const payload = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) : {};
  const next = { ...(payload && typeof payload === "object" ? payload : {}), products };
  const tempPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tempPath, DATA_PATH);
}

app.get("/api/admin/products", (_req, res) => {
  try {
    res.json(readProducts());
  } catch {
    res.status(500).json({ error: "خطا در خواندن محصولات" });
  }
});

app.post("/api/admin/products", (req, res) => {
  try {
    const products = readProducts();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const name = String(body.name || "").trim();
    const price = Number(body.price);
    if (name.length < 2 || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: "نام و قیمت محصول معتبر نیست" });
    }
    const id = products.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const product = {
      ...body, id, name, price: Math.round(price),
      stock: Number.isFinite(Number(body.stock)) ? Math.max(0, Number(body.stock)) : 0,
      category: String(body.category || "محصول").trim(),
      description: String(body.description || "").trim(),
      image: String(body.image || "img/product-placeholder.svg").trim()
    };
    writeProducts([...products, product]);
    res.status(201).json(product);
  } catch {
    res.status(500).json({ error: "خطا در ذخیره محصول" });
  }
});

app.put("/api/admin/products/:id", (req, res) => {
  try {
    const products = readProducts();
    const index = products.findIndex((item) => String(item.id) === String(req.params.id));
    if (index < 0) return res.status(404).json({ error: "محصول پیدا نشد" });
    const updated = { ...products[index], ...(req.body || {}), id: products[index].id };
    if (updated.price !== undefined) updated.price = Math.round(Number(updated.price));
    if (!updated.name || !Number.isFinite(updated.price) || updated.price <= 0) {
      return res.status(400).json({ error: "اطلاعات محصول معتبر نیست" });
    }
    products[index] = updated;
    writeProducts(products);
    res.json(updated);
  } catch {
    res.status(500).json({ error: "خطا در ویرایش محصول" });
  }
});

app.delete("/api/admin/products/:id", (req, res) => {
  try {
    const products = readProducts();
    const remaining = products.filter((item) => String(item.id) !== String(req.params.id));
    if (remaining.length === products.length) return res.status(404).json({ error: "محصول پیدا نشد" });
    writeProducts(remaining);
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "خطا در حذف محصول" });
  }
});

// اجرای سرور
app.listen(PORT, () => {
  console.log(`\n==============================================`);
  console.log(`🚀 Gaming Store Server is RUNNING!`);
  console.log(`👉 Home:   http://localhost:${PORT}`);
  console.log(`👉 Admin:  http://localhost:${PORT}/admin`);
  console.log(`👉 Admin HTML: http://localhost:${PORT}/admin.html`);
  console.log(`==============================================\n`);
});

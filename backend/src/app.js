require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/users/user.routes");
const productRoutes = require("./modules/products/product.routes");
const cartRoutes = require("./modules/cart/cart.routes");
const orderModule = require("./modules/orders/order.routes");
const messageModule = require("./modules/messages/message.routes");
const paymentRoutes = require("./modules/payments/payment.routes");

const { errorHandler } = require("./middleware/error.middleware");
const notFound = require("./middleware/notFound.middleware");

const app = express();

// CORS — مبدأ فرانت‌اند محلی (با ویرگول چند مقدار مجاز است).
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((s) => s.trim())
  : "*";
app.use(cors({ origin: allowedOrigins, credentials: false }));

// پردازش بدنه درخواست‌ها با محدودیت اندازه برای امنیت اولیه.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

// مسیرهای پایه
app.get("/", (_req, res) => res.json({ message: "Gaming Store API is running" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// مسیرهای ماژول‌ها
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);

// سفارش‌ها: مسیر کاربر + مسیر ادمین
app.use("/api/orders", orderModule.router);
app.use("/api/admin/orders", orderModule.adminRouter);

// پیام‌ها: مسیر عمومی + مسیر ادمین
app.use("/api/messages", messageModule.router);
app.use("/api/admin/messages", messageModule.adminRouter);

app.use("/api/payments", paymentRoutes);

// مدیریت خطا و مسیر پیدا‌نشده
app.use(notFound);
app.use(errorHandler);

module.exports = app;

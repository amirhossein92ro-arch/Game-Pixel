const express = require("express");
const protect = require("../../middleware/auth.middleware");
const adminOnly = require("../../middleware/admin.middleware");
const { createOrder, myOrders, getOrder, listOrders, updateStatus } = require("./order.controller");

// مسیرهای کاربر
const router = express.Router();
router.post("/", protect, createOrder);
router.get("/my-orders", protect, myOrders); // باید قبل از /:id باشد
router.get("/:id", protect, getOrder);

// مسیرهای ادمین (زیر پیشوند /api/admin/orders سوار می‌شوند)
const adminRouter = express.Router();
adminRouter.get("/", protect, adminOnly, listOrders);
adminRouter.put("/:id/status", protect, adminOnly, updateStatus);

module.exports = { router, adminRouter };

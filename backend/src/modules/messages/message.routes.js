const express = require("express");
const protect = require("../../middleware/auth.middleware");
const adminOnly = require("../../middleware/admin.middleware");
const { createMessage, listMessages, markRead } = require("./message.controller");

// ثبت پیام عمومی (زیر پیشوند /api/messages سوار می‌شود)
const router = express.Router();
router.post("/", createMessage);

// مسیرهای ادمین (زیر پیشوند /api/admin/messages سوار می‌شوند)
const adminRouter = express.Router();
adminRouter.get("/", protect, adminOnly, listMessages);
adminRouter.put("/:id/read", protect, adminOnly, markRead);

module.exports = { router, adminRouter };

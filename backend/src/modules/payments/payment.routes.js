const router = require("express").Router();
const protect = require("../../middleware/auth.middleware");
const { createPaymentRequest, verifyPayment } = require("./payment.controller");

// ایجاد درخواست پرداخت (نیازمند ورود)
router.post("/request", protect, createPaymentRequest);

// بازگشت از درگاه (عمومی — درگاه کاربر را اینجا redirect می‌کند)
router.get("/verify", verifyPayment);

module.exports = router;

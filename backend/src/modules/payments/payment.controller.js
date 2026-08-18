const { createError } = require("../../middleware/error.middleware");

// POST /api/payments/request — ساخت درخواست پرداخت.
// در حالت غیرفعال، پاسخ نمایشی برمی‌گردد؛ در حالت فعال، ساختار آماده اتصال به درگاه است.
async function createPaymentRequest(req, res, next) {
  try {
    const { amount, orderId } = req.body;
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw createError(400, "مبلغ پرداخت نامعتبر است.");
    }

    const enabled = process.env.PAYMENT_ENABLED === "true";
    if (!enabled) {
      return res.json({
        enabled: false,
        message: "درگاه پرداخت فعلاً غیرفعال است (پاسخ نمایشی).",
        amount: Number(amount),
        orderId: orderId || null,
        authority: "DEMO-AUTHORITY",
        paymentUrl: null
      });
    }

    // --- اتصال به درگاه (نمونه: زرین‌پال) — پس از دریافت کلید فعال می‌شود ---
    // const axios = require("axios");
    // const { data } = await axios.post("https://api.zarinpal.com/pg/v4/request.json", {
    //   merchant_id: process.env.ZARINPAL_MERCHANT_ID,
    //   amount: Number(amount),
    //   callback_url: process.env.PAYMENT_CALLBACK_URL,
    //   description: "Gaming Store Order"
    // });
    // return res.json({ authority: data.data.authority, paymentUrl: `https://www.zarinpal.com/pg/StartPay/${data.data.authority}` });

    throw createError(503, "درگاه پرداخت هنوز پیکربندی نشده است.");
  } catch (e) { next(e); }
}

// GET /api/payments/verify — callback/تأیید پرداخت.
async function verifyPayment(req, res, next) {
  try {
    const { Authority: authority, Status: status } = req.query;

    const enabled = process.env.PAYMENT_ENABLED === "true";
    if (!enabled) {
      return res.json({
        enabled: false,
        message: "بررسی نمایشی — درگاه غیرفعال است.",
        authority: authority || null,
        status: status || null,
        verified: false
      });
    }

    // --- تأیید پرداخت واقعی پس از فعال‌سازی درگاه ---
    // const { data } = await axios.post("https://api.zarinpal.com/pg/v4/verify.json", {
    //   merchant_id: process.env.ZARINPAL_MERCHANT_ID,
    //   amount, authority
    // });
    // const verified = data.data.code === 100 || data.data.code === 101;
    // return res.json({ verified, refId: data.data.ref_id });

    throw createError(503, "درگاه پرداخت هنوز پیکربندی نشده است.");
  } catch (e) { next(e); }
}

module.exports = { createPaymentRequest, verifyPayment };

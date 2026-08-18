// ساخت خطای HTTP با وضعیت و پیام مشخص.
function createError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// middleware نهایی مدیریت خطا — پیام تمیز بدون لو دادن جزئیات حساس.
function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;

  // خطای اعتبارسنجی Mongoose
  if (err.name === "ValidationError" && err.errors) {
    return res.status(400).json({
      message: "داده‌های ارسالی نامعتبر است.",
      errors: Object.fromEntries(
        Object.entries(err.errors).map(([k, v]) => [k, v.message])
      )
    });
  }

  // کلید تکراری Mongoose (11000)
  if (err.code === 11000 && err.keyValue) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      message: `مقدار فیلد «${field}» قبلاً ثبت شده است.`
    });
  }

  // خطای تبدیل ObjectId
  if (err.name === "CastError" && err.path === "_id") {
    return res.status(400).json({ message: "شناسه ارسالی نامعتبر است." });
  }

  if (status >= 500) {
    console.error("[error]", err);
  }

  res.status(status).json({ message: err.message || "خطای سرور رخ داد." });
}

module.exports = { createError, errorHandler };

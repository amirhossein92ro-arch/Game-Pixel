// مدیریت مسیرهای پیدا‌نشده.
function notFound(req, res) {
  res.status(404).json({ message: "مسیر موردنظر پیدا نشد." });
}

module.exports = notFound;

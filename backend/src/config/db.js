const mongoose = require("mongoose");

// اتصال به MongoDB.
// توجه: اگر دیتابیس در دسترس نباشد، سرور همچنان بالا می‌آید تا مسیرهای
// بدون دیتابیس (مثل مسیر ریشه) کار کنند؛ فقط عملیات دیتابیس خطا می‌دهند.
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[db] MONGODB_URI تنظیم نشده — عملیات دیتابیس کار نخواهند کرد.");
    return;
  }
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(uri);
    console.log("[db] اتصال به MongoDB برقرار شد.");
  } catch (error) {
    console.error("[db] اتصال به MongoDB ناموفق بود:", error.message);
  }
}

module.exports = connectDB;

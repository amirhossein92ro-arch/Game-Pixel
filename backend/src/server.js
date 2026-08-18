const app = require("./app");
const connectDB = require("./config/db");

const PORT = Number(process.env.PORT) || 5000;

function start() {
  // اتصال به دیتابیس (در صورت نبود، سرور باز هم بالا می‌آید).

  app.listen(PORT, () => {
    console.log(`Gaming Store API running at http://localhost:${PORT}`);
  });

  connectDB().catch((error) => {
    console.error("[db] MongoDB connection failed:", error.message);
  });
}

start();

// ثبت خطاهای مدیریت‌نشده
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err && err.message ? err.message : err);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err && err.message ? err.message : err);
});

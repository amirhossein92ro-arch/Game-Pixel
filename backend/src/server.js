const app = require("./app");
const connectDB = require("./config/db");

const PORT = Number(process.env.PORT) || 5000;

function start() {
  // اتصال به دیتابیس (در صورت نبود، سرور باز هم بالا می‌آید).
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Gaming Store API running at http://localhost:${PORT}`);
  });

  Promise.resolve()
    .then(() => connectDB())
    .catch((error) => {
      console.error("[db] MongoDB connection failed:", "Connection failed");
    });
}

start();

// ثبت خطاهای مدیریت‌نشده
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", "Unhandled server failure");
});

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../modules/users/user.model");

// ساخت ادمین اولیه از روی متغیرهای .env (روش امن ساخت اولین ادمین).
// اجرا: npm run seed
async function seedAdmin() {
  await connectDB();

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.error("ADMIN_EMAIL و ADMIN_PASSWORD را در فایل .env تنظیم کنید.");
    process.exit(1);
  }
  require('../../../lib/request-security.cjs').password(password);
  require('./input').email(email);

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== "admin") {
      existing.role = "admin";
      existing.sessionVersion=(existing.sessionVersion||0)+1;
      await existing.save();
      console.log(`کاربر «${email}» به نقش ادمین ارتقا یافت.`);
    } else {
      console.log(`ادمین «${email}» از قبل وجود دارد.`);
    }
  } else {
    await User.create({ name, email, password, role: "admin" });
    console.log(`ادمین اولیه ساخته شد: ${email}`);
  }

  await mongoose.connection.close();
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('Administrator seed failed.');
  process.exit(1);
});

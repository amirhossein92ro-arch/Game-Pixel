const User = require("../users/user.model");
const generateToken = require("../../utils/generateToken");
const { createError } = require("../../middleware/error.middleware");

// پاک‌سازی فیلدهای حساس پیش از خروجی.
function sanitize(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

// ثبت‌نام کاربر جدید.
async function registerUser({ name, email, password }) {
  if (!name || !email || !password) {
    throw createError(400, "نام، ایمیل و رمز عبور الزامی هستند.");
  }
  const exists = await User.findOne({ email });
  if (exists) throw createError(409, "این ایمیل قبلاً ثبت شده است.");

  const user = await User.create({ name, email, password });
  return { user: sanitize(user), token: generateToken(user) };
}

// ورود کاربر.
async function loginUser({ email, password }) {
  if (!email || !password) {
    throw createError(400, "ایمیل و رمز عبور الزامی هستند.");
  }
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.matchPassword(password))) {
    throw createError(401, "ایمیل یا رمز عبور اشتباه است.");
  }
  return { user: sanitize(user), token: generateToken(user) };
}

module.exports = { registerUser, loginUser, sanitize };

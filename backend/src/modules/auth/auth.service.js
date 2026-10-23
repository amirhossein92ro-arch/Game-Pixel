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
  if(typeof name!=='string'||name.trim().length<2||name.length>60||typeof email!=='string'||email.length>200||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72) {
    throw createError(400, "نام، ایمیل و رمز عبور الزامی هستند.");
  }
  email=require('../../utils/input').email(email);name=require('../../utils/input').text(name,2,60);
  require('../../../../lib/request-security.cjs').password(password);
  const exists = await User.findOne({ email });
  if (exists) throw createError(409, "این ایمیل قبلاً ثبت شده است.");

  const user = await User.create({ name, email, password });
  return { user: sanitize(user), token: generateToken(user) };
}

// ورود کاربر.
async function loginUser({ email, password }) {
  if(typeof email!=='string'||email.length>200||typeof password!=='string'||Buffer.byteLength(password)>72) {
    throw createError(400, "ایمیل و رمز عبور الزامی هستند.");
  }
  email=require('../../utils/input').email(email);
  const user = await User.findOne({ email }).select("+password");
  const valid=await require('bcryptjs').compare(password,user?.password||'$2b$12$uJbYKWiNFXiFSNTybLV2y.fUPnWxXVdOKtpTgCO.oZRNgL4FKae1i');
  const latest=user&&await User.findById(user._id).select('+password');
  if (!latest || latest.banned || !valid || latest.password!==user.password || latest.sessionVersion!==user.sessionVersion) {
    throw createError(401, "ایمیل یا رمز عبور اشتباه است.");
  }
  return { user: sanitize(latest), token: generateToken(latest) };
}

module.exports = { registerUser, loginUser, sanitize };

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "نام الزامی است."],
      trim: true,
      minlength: [2, "نام حداقل ۲ حرف باشد."],
      maxlength: 60
    },
    email: {
      type: String,
      required: [true, "ایمیل الزامی است."],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "ایمیل معتبر نیست."]
    },
    password: {
      type: String,
      required: [true, "رمز عبور الزامی است."],
      minlength: [12, "رمز حداقل ۱۲ کاراکتر باشد."],
      select: false // به‌صورت پیش‌فرض در خروجی کوئری نمی‌آید
    },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    banned: {type:Boolean,default:false},
    sessionVersion: {type:Number,default:0}
  },
  { timestamps: true }
);

// هش رمز پیش از ذخیره.
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const bcrypt = require("bcryptjs");
  require('../../../../lib/request-security.cjs').password(this.password);
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// مقایسه رمز ورودی با هش ذخیره‌شده.
userSchema.methods.matchPassword = function (entered) {
  const bcrypt = require("bcryptjs");
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "نام الزامی است."], trim: true, minlength: 2, maxlength: 60 },
    email: {
      type: String,
      required: [true, "ایمیل الزامی است."],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "ایمیل معتبر نیست."]
    },
    subject: { type: String, required: [true, "موضوع الزامی است."], trim: true, maxlength: 120 },
    message: { type: String, required: [true, "متن پیام الزامی است."], trim: true, maxlength: 2000 },
    isRead: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);

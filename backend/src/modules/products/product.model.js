const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "عنوان محصول الزامی است."], trim: true, minlength: 2, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: [true, "قیمت الزامی است."], min: 1, max:1e12, validate:Number.isSafeInteger },
    discountPrice: { type: Number, default: 0, min: 0 },
    category: { type: String, default: "general", trim: true, index: true },
    platform: { type: String, default: "multi", trim: true, index: true },
    image: { type: String, default: "" },
    gallery: [{ type: String }],
    stock: { type: Number, default: 0, min: 0, max:1000000, validate:Number.isSafeInteger },
    isFeatured: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// متن صفحات
productSchema.set("toJSON", {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

module.exports = mongoose.model("Product", productSchema);

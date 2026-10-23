const mongoose = require("mongoose");
const Cart = require("./cart.model");
const Product = require("../products/product.model");
const { createError } = require("../../middleware/error.middleware");

// قیمت نهایی واحد: قیمت تخفیف‌خورده در صورت وجود، وگرنه قیمت اصلی.
function unitPrice(product) {
  return product.discountPrice > 0 ? product.discountPrice : product.price;
}

// دریافت یا ساخت سبد کاربر به‌همراه populate محصول.
async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId }).populate("items.product");
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
    await cart.populate("items.product");
  }
  return cart;
}

// محاسبه قیمت کل سمت سرور — هرگز به قیمت فرانت اعتماد نمی‌شود.
function computeTotals(cart) {
  let total = 0;
  for (const item of cart.items) {
    if (!item.product) continue; // محصول حذف‌شده نادیده گرفته می‌شود
    total += unitPrice(item.product) * item.quantity;
  }
  return total;
}

function serialize(cart) {
  const items = cart.items
    .filter((i) => i.product)
    .map((i) => ({
      product: i.product,
      quantity: i.quantity,
      unitPrice: unitPrice(i.product),
      lineTotal: unitPrice(i.product) * i.quantity
    }));
  return { items, totalPrice: computeTotals(cart) };
}

// GET /api/cart
async function getCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user._id);
    res.json(serialize(cart));
  } catch (e) { next(e); }
}

// POST /api/cart  { productId, quantity }
async function addToCart(req, res, next) {
  try {
    const { productId, quantity = 1 } = req.body;
    if (!mongoose.isValidObjectId(productId)) throw createError(400, "شناسه محصول نامعتبر است.");

    const product = await Product.findById(productId);
    if (!product) throw createError(404, "محصول پیدا نشد.");

    const qty = require('../../utils/input').integer(quantity,1,1000000);
    if (product.stock < qty) throw createError(409, "موجودی محصول کافی نیست.");

    const cart = await getOrCreateCart(req.user._id);
    const existing = cart.items.find((i) => i.product && i.product._id.equals(product._id));
    if (existing) {
      if(existing.quantity+qty>product.stock)throw createError(409,'موجودی محصول کافی نیست.');
      existing.quantity += qty;
    } else {
      if(cart.items.length>=200)throw createError(400,'Too many cart items.');
      cart.items.push({ product: product._id, quantity: qty });
    }
    await cart.save();
    await cart.populate("items.product");
    res.json(serialize(cart));
  } catch (e) { next(e); }
}

// PUT /api/cart/:productId  { quantity }
async function updateQty(req, res, next) {
  try {
    const { productId } = req.params;
    if (!mongoose.isValidObjectId(productId)) throw createError(400, "شناسه محصول نامعتبر است.");

    const quantity = require('../../utils/input').integer(req.body.quantity,1,1000000);
    if (!Number.isFinite(quantity) || quantity < 1) throw createError(400, "تعداد نامعتبر است.");

    const cart = await getOrCreateCart(req.user._id);
    const item = cart.items.find((i) => i.product && i.product._id.equals(productId));
    if (!item) throw createError(404, "این محصول در سبد خرید نیست.");

    const product = await Product.findById(productId);
    if (product && product.stock < quantity) throw createError(409, "موجودی محصول کافی نیست.");

    item.quantity = quantity;
    await cart.save();
    await cart.populate("items.product");
    res.json(serialize(cart));
  } catch (e) { next(e); }
}

// DELETE /api/cart/:productId
async function removeFromCart(req, res, next) {
  try {
    const { productId } = req.params;
    require('../../utils/input').id(productId);
    const cart = await getOrCreateCart(req.user._id);
    cart.items = cart.items.filter((i) => !(i.product && i.product._id.equals(productId)));
    await cart.save();
    await cart.populate("items.product");
    res.json(serialize(cart));
  } catch (e) { next(e); }
}

module.exports = { getCart, addToCart, updateQty, removeFromCart };

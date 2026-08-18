const Order = require("./order.model");
const Cart = require("../cart/cart.model");
const { createError } = require("../../middleware/error.middleware");

// ساختن آیتم‌های سفارش و محاسبه قیمت کل از روی سبد کاربر (سمت سرور).
function unitPrice(product) {
  return product.discountPrice > 0 ? product.discountPrice : product.price;
}

async function buildOrderFromCart(userId) {
  const cart = await Cart.findOne({ user: userId }).populate("items.product");
  if (!cart || !cart.items.length) throw createError(400, "سبد خرید خالی است.");

  const items = [];
  let total = 0;
  for (const entry of cart.items) {
    if (!entry.product) continue;
    if (entry.product.stock < entry.quantity) {
      throw createError(409, `موجودی «${entry.product.title}» کافی نیست.`);
    }
    const price = unitPrice(entry.product);
    items.push({
      product: entry.product._id,
      title: entry.product.title,
      price,
      quantity: entry.quantity
    });
    total += price * entry.quantity;
  }
  if (!items.length) throw createError(400, "سبد خرید خالی است.");
  return { items, totalPrice: total };
}

// POST /api/orders
async function createOrder(req, res, next) {
  try {
    const shippingInfo = req.body.shippingInfo || {};
    const required = ["fullName", "phone", "address"];
    for (const key of required) {
      if (!shippingInfo[key]) throw createError(400, "اطلاعات ارسال (نام، تلفن، نشانی) ناقص است.");
    }

    const { items, totalPrice } = await buildOrderFromCart(req.user._id);
    const order = await Order.create({
      user: req.user._id,
      items,
      totalPrice,
      status: "pending",
      paymentStatus: "unpaid",
      shippingInfo
    });

    // کاهش موجودی محصول
    const Product = require("../products/product.model");
    for (const item of items) {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: -item.quantity } });
    }

    // خالی کردن سبد پس از ثبت سفارش
    await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } });

    res.status(201).json(order);
  } catch (e) { next(e); }
}

// GET /api/orders/my-orders
async function myOrders(req, res, next) {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (e) { next(e); }
}

// GET /api/orders/:id
async function getOrder(req, res, next) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) throw createError(404, "سفارش پیدا نشد.");
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      throw createError(403, "دسترسی به این سفارش ندارید.");
    }
    res.json(order);
  } catch (e) { next(e); }
}

// GET /api/admin/orders
async function listOrders(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate("user", "name email"),
      Order.countDocuments()
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
}

// PUT /api/admin/orders/:id/status
async function updateStatus(req, res, next) {
  try {
    const validStatuses = ["pending", "paid", "processing", "completed", "cancelled"];
    const { status } = req.body;
    if (!validStatuses.includes(status)) throw createError(400, "وضعیت نامعتبر است.");

    const update = { status };
    if (status === "paid") update.paymentStatus = "paid";

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) throw createError(404, "سفارش پیدا نشد.");
    res.json(order);
  } catch (e) { next(e); }
}

module.exports = { createOrder, myOrders, getOrder, listOrders, updateStatus };

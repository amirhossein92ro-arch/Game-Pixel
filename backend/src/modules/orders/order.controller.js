const Order = require("./order.model");
const Cart = require("../cart/cart.model");
const { createError } = require("../../middleware/error.middleware");

// ساختن آیتم‌های سفارش و محاسبه قیمت کل از روی سبد کاربر (سمت سرور).
function unitPrice(product) {
  return product.discountPrice > 0 ? product.discountPrice : product.price;
}

async function buildOrderFromCart(userId, transactionSession) {
  const cart = await Cart.findOne({ user: userId }).session(transactionSession).populate({path:'items.product',options:{session:transactionSession}});
  if (!cart || !cart.items.length) throw createError(400, "سبد خرید خالی است.");

  const items = [];
  let total = 0;
  if(cart.items.length>200)throw createError(400,'Too many cart items.');
  const seen=new Set();
  for (const entry of cart.items) {
    if (!entry.product || seen.has(String(entry.product._id))) throw createError(409,'Cart products changed.');
    seen.add(String(entry.product._id));
    require('../../utils/input').integer(entry.quantity,1,1000000);
    if (entry.product.stock < entry.quantity) {
      throw createError(409, `موجودی «${entry.product.title}» کافی نیست.`);
    }
    const price = unitPrice(entry.product);
    if(!Number.isSafeInteger(price)||price<1||price>entry.product.price||!Number.isSafeInteger(price*entry.quantity))throw createError(409,'Invalid product price.');
    items.push({
      product: entry.product._id,
      title: entry.product.title,
      price,
      quantity: entry.quantity
    });
    total += price * entry.quantity;
  }
  if (!items.length) throw createError(400, "سبد خرید خالی است.");
  if(!Number.isSafeInteger(total)||total<1)throw createError(409,'Invalid order total.');
  return { cart, items, totalPrice: total };
}

// POST /api/orders
async function createOrder(req, res, next) {
  let transactionSession;
  try {
    const shippingInfo = require('../../utils/input').shipping(req.body.shippingInfo);
    transactionSession=await require('mongoose').startSession();
    let order;
    // A replica set is required: unsupported transactions fail closed rather than overselling stock.
    await transactionSession.withTransaction(async()=>{
      const {cart,items,totalPrice}=await buildOrderFromCart(req.user._id,transactionSession);
      const Product = require('../products/product.model');
      for(const item of items){
        const changed=await Product.updateOne({_id:item.product,stock:{$gte:item.quantity}},{$inc:{stock:-item.quantity}},{session:transactionSession});
        if(changed.modifiedCount!==1)throw createError(409,'موجودی محصول کافی نیست.');
      }
      [order]=await Order.create([{user:req.user._id,items,totalPrice,status:'pending',paymentStatus:'unpaid',shippingInfo}],{session:transactionSession});
      const cleared=await Cart.updateOne({_id:cart._id,__v:cart.__v},{$set:{items:[]},$inc:{__v:1}},{session:transactionSession});
      if(cleared.modifiedCount!==1)throw createError(409,'Cart changed; try again.');
    });
    res.status(201).json(order);
  } catch (e) { next(e); } finally {if(transactionSession)await transactionSession.endSession();}
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
    const order = await Order.findOne({_id:require('../../utils/input').id(req.params.id),user:req.user._id});
    if (!order) throw createError(404, "سفارش پیدا نشد.");
    res.json(order);
  } catch (e) { next(e); }
}

// GET /api/admin/orders
async function listOrders(req, res, next) {
  try {
    const {page,limit}=require('../../utils/input').pagination(req.query,20);
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
  let transactionSession;
  try {
    const validStatuses = ["pending", "paid", "processing", "completed", "cancelled"];
    const { status } = req.body;
    if (!validStatuses.includes(status)) throw createError(400, "وضعیت نامعتبر است.");

    const id=require('../../utils/input').id(req.params.id);
    transactionSession=await require('mongoose').startSession();let order;
    await transactionSession.withTransaction(async()=>{
      order=await Order.findById(id).session(transactionSession);
      if(!order)throw createError(404,'سفارش پیدا نشد.');
      if(order.status==='cancelled'&&status!=='cancelled')throw createError(409,'Cancelled orders cannot be reopened.');
      if(status==='paid'&&order.paymentStatus!=='paid')throw createError(409,'Payment must be verified by the provider.');
      if(status==='cancelled'&&order.status!=='cancelled'){
        if(order.paymentStatus==='paid')throw createError(503,'A verified refund is required.');
        if(order.status==='completed')throw createError(409,'Completed orders cannot be cancelled here.');
        const Product=require('../products/product.model');
        for(const item of order.items)await Product.updateOne({_id:item.product},{$inc:{stock:item.quantity}},{session:transactionSession});
      }
      order.status=status;await order.save({session:transactionSession});
    });
    res.json(order);
  } catch (e) { next(e); } finally {if(transactionSession)await transactionSession.endSession();}
}

module.exports = { createOrder, myOrders, getOrder, listOrders, updateStatus };

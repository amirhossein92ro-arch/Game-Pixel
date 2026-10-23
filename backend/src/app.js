require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/users/user.routes");
const productRoutes = require("./modules/products/product.routes");
const cartRoutes = require("./modules/cart/cart.routes");
const orderModule = require("./modules/orders/order.routes");
const messageModule = require("./modules/messages/message.routes");
const paymentRoutes = require("./modules/payments/payment.routes");

const { errorHandler } = require("./middleware/error.middleware");
const notFound = require("./middleware/notFound.middleware");

if(process.env.NODE_ENV==='production')throw Error('This archived API is development-only. Deploy the hardened root server.js application.');
const app = express();
app.disable('x-powered-by');
const guard=require('../../lib/request-security.cjs');
const input=require('./utils/input');
const limit=guard.limiter({limit:120});
const authLimit=guard.limiter({limit:10,windowMs:900000});
app.use((req,res,next)=>{try{if(req.url.length>8192)throw Object.assign(Error('Request URL is too long.'),{status:414});guard.query(req.query);limit(req.ip);if(guard.canonicalPath(req.path).startsWith('/api/auth'))authLimit(req.ip);res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'});next();}catch(e){if(e.status===429)res.set('Retry-After',String(e.retryAfter||60));next(e);}});

// CORS — مبدأ فرانت‌اند محلی (با ویرگول چند مقدار مجاز است).
const allowedOrigins = new Set(
  (process.env.CLIENT_URL || "").split(",").map((value) => value.trim()).filter(Boolean)
);
for (const origin of allowedOrigins) {
  let url;
  try { url = new URL(origin); } catch { throw new Error("CLIENT_URL must contain valid HTTP(S) origins."); }
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
    throw new Error("CLIENT_URL must contain exact HTTP(S) origins without paths or wildcards.");
  }
}
app.use(cors({
  origin(origin, callback) {
    // Requests without Origin (for example CLI clients) are not browser CORS requests.
    if (!origin) return callback(null, false);
    if (allowedOrigins.has(origin)) return callback(null, true);
    const error = new Error("Origin is not allowed by CORS.");
    error.status = 403;
    return callback(error);
  },
  // The frontend uses fetch with credentials: 'include'. Never pair this with '*'.
  credentials: true
}));

// پردازش بدنه درخواست‌ها با محدودیت اندازه برای امنیت اولیه.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb", parameterLimit:50 }));

app.use((req,_res,next)=>{try{guard.shape(req.body);input.mutation(req);next();}catch(e){next(e);}});
app.use((req,res,next)=>{res.once('finish',()=>{if(req.user?.role==='admin'&&!['GET','HEAD','OPTIONS'].includes(req.method)&&res.statusCode<400)console.info('[audit]',JSON.stringify({timestamp:new Date().toISOString(),adminId:String(req.user._id),action:req.method,path:req.path,ip:req.ip}));});next();});
for(const name of ['id','productId'])app.param(name,(req,_res,next,value)=>{try{input.id(value);next();}catch(e){next(e);}});
// مسیرهای پایه
app.get("/", (_req, res) => res.json({ status: "ok", message: "Gaming Store Server Online" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// مسیرهای ماژول‌ها
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);

// سفارش‌ها: مسیر کاربر + مسیر ادمین
app.use("/api/orders", orderModule.router);
app.use("/api/admin/orders", orderModule.adminRouter);

// پیام‌ها: مسیر عمومی + مسیر ادمین
app.use("/api/messages", messageModule.router);
app.use("/api/admin/messages", messageModule.adminRouter);

app.use("/api/payments", paymentRoutes);

// مدیریت خطا و مسیر پیدا‌نشده
app.use(notFound);
app.use(errorHandler);

module.exports = app;

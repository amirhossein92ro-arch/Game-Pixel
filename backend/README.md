# Gaming Store API — بک‌اند ماژولار

بک‌اند فروشگاه Gaming Store با Node.js، Express و MongoDB (Mongoose). ساختار ماژولی، امن و قابل توسعه.

## نصب

```bash
cd backend
npm install
```

## تنظیم متغیرهای محیطی

یک فایل `.env` در پوشه `backend` بسازید (یا از `.env.example` کپی کنید) و مقدارها را بدهید:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000

MONGODB_URI=mongodb://127.0.0.1:27017/gaming_store

JWT_SECRET=یک_رشته_بلند_تصادفی_اینجا
JWT_EXPIRES_IN=7d

ADMIN_NAME=Admin
ADMIN_EMAIL=admin@gamingstore.test
ADMIN_PASSWORD=ChangeMe123!

# درگاه پرداخت (فعلاً غیرفعال)
PAYMENT_ENABLED=false
ZARINPAL_MERCHANT_ID=
PAYMENT_CALLBACK_URL=http://localhost:5000/api/payments/verify
```

> نکته امنیتی: فایل `.env` در `.gitignore` قرار دارد و هرگز نباید در مخزن کامیت شود. `JWT_SECRET` را حتماً به یک رشته بلند تصادفی تغییر دهید.

## راه‌اندازی MongoDB

- ساده‌ترین روش: نصب [MongoDB Community Edition](https://www.mongodb.com/try/download/community) و اجرای آن روی `127.0.0.1:27017`.
- یا استفاده از [MongoDB Atlas](https://www.mongodb.com/atlas) (آدرس اتصال را در `MONGODB_URI` قرار دهید).

در صورت نبود MongoDB، سرور باز هم بالا می‌آید و فقط اتصال دیتابیس هشدار می‌خورد.

## ساخت ادمین اول

پس از تنظیم `ADMIN_*` در `.env`، دستور زیر را اجرا کنید تا کاربر ادمین ساخته شود:

```bash
npm run seed
```

## اجرا

حالت توسعه (با reload خودکار):

```bash
npm run dev
```

حالت عادی:

```bash
npm start
```

سرور روی `http://localhost:5000` بالا می‌آید. ریشه مسیرها:

```http
GET http://localhost:5000/
```

باید پاسخ زیر را برگرداند:

```json
{ "message": "Gaming Store API is running" }
```

## ساختار پوشه‌ها

```
backend/
├── .env / .env.example
├── package.json
└── src/
    ├── app.js              # تنظیم Express و سوار شدن مسیرها
    ├── server.js           # راه‌اندازی سرور و اتصال دیتابیس
    ├── config/db.js        # اتصال MongoDB
    ├── utils/
    │   ├── generateToken.js
    │   └── seed.js         # ساخت ادمین اول
    ├── middleware/
    │   ├── auth.middleware.js     # بررسی ورود (JWT)
    │   ├── admin.middleware.js    # بررسی نقش ادمین
    │   ├── error.middleware.js
    │   └── notFound.middleware.js
    └── modules/
        ├── auth/      (ثبت‌نام/ورود)
        ├── users/     (پروفایل)
        ├── products/  (مدیریت محصولات + جستجو/فیلتر/مرتب‌سازی)
        ├── cart/      (سبد خرید با محاسبه قیمت سمت سرور)
        ├── orders/    (ثبت/لیست سفارش‌ها + مسیر ادمین)
        ├── messages/  (پیام‌های تماس + مسیر ادمین)
        └── payments/  (درگاه پرداخت آزمایشی، غیرفعال)
```

## لیست APIها

### احراز هویت (Auth)
| متد | مسیر | توضیح |
|-----|------|-------|
| POST | `/api/auth/register` | ثبت‌نام (نام، ایمیل، رمز) → توکن |
| POST | `/api/auth/login` | ورود (ایمیل، رمز) → توکن |

### کاربران (Users)
| متد | مسیر | توضیح |
|-----|------|-------|
| GET | `/api/users/profile` | پروفایل کاربر واردشده (نیازمند توکن) |

### محصولات (Products)
| متد | مسیر | توضیح |
|-----|------|-------|
| GET | `/api/products` | لیست محصولات (query: `search`، `category`، `platform`، `featured`، `sort=price-asc|price-desc|newest`، `page`، `limit`) |
| GET | `/api/products/:id` | جزئیات یک محصول |
| POST | `/api/products` | ساخت محصول **(ادمین)** |
| PUT | `/api/products/:id` | ویرایش محصول **(ادمین)** |
| DELETE | `/api/products/:id` | حذف محصول **(ادمین)** |

### سبد خرید (Cart) — همگی نیازمند توکن
| متد | مسیر | توضیح |
|-----|------|-------|
| GET | `/api/cart` | سبد کاربر (قیمت‌ها سمت سرور محاسبه می‌شوند) |
| POST | `/api/cart` | افزودن به سبد `{ productId, quantity }` |
| PUT | `/api/cart/:productId` | تغییر تعداد `{ quantity }` |
| DELETE | `/api/cart/:productId` | حذف آیتم |

### سفارش‌ها (Orders)
| متد | مسیر | توضیح |
|-----|------|-------|
| POST | `/api/orders` | ثبت سفارش از سبد (با `shippingInfo`) — نیازمند توکن |
| GET | `/api/orders/my-orders` | سفارش‌های کاربر — نیازمند توکن |
| GET | `/api/orders/:id` | جزئیات سفارش (مالک یا ادمین) — نیازمند توکن |
| GET | `/api/admin/orders` | لیست همه سفارش‌ها **(ادمین)** |
| PUT | `/api/admin/orders/:id/status` | تغییر وضعیت سفارش **(ادمین)** |

### پیام‌ها (Messages)
| متد | مسیر | توضیح |
|-----|------|-------|
| POST | `/api/messages` | ثبت پیام تماس (عمومی) |
| GET | `/api/admin/messages` | لیست پیام‌ها **(ادمین)** |
| PUT | `/api/admin/messages/:id/read` | خوانده‌شده‌标记 **(ادمین)** |

### پرداخت (Payments) — آزمایشی
| متد | مسیر | توضیح |
|-----|------|-------|
| POST | `/api/payments/request` | درخواست پرداخت (نیازمند توکن) |
| GET | `/api/payments/verify` | بازگشت از درگاه (عمومی) |

> تا زمانی که `PAYMENT_ENABLED=true` نباشد و کلید `ZARINPAL_MERCHANT_ID` تنظیم نشده باشد، درگاه واقعی فعال **نمی‌شود** و پاسخ آزمایشی برمی‌گردد.

## امنیت

- متغیرهای حساس فقط در `.env`.
- رمز کاربران با `bcryptjs` هش می‌شود.
- توکن JWT با تاریخ انقضا.
- مسیرهای ادمین هم نیازمند ورود و هم بررسی نقش ادمین هستند.
- خطاها بدون لو دادن اطلاعات حساس برگردانده می‌شوند.

# WEB 2 Gaming Store

Production deployment: [Phase 21 exact Windows/VPS procedure](deploy/phase21-production.md).
Domain/HTTPS deployment: [Phase 22 Ubuntu A-H commands and safety gates](deploy/phase22-https.md).
Current production release status is **NOT READY**; payment/configuration gates
must pass before any upload or activation. No VPS actions were performed.

Intro و پنل مدیریت با RBAC، Super Admin، Audit، تنظیمات و نمودارهای واقعی تکمیل شده‌اند. راهنمای کامل APIها، فایل‌ها، مهاجرت و ساخت مدیر: [docs/admin-intro.md](docs/admin-intro.md).

مسیر فعال فروشگاه، صفحات HTML ریشه، `script.js`، `style.css` و `server.js` است. پوشه‌های `backend/`، `gaming-store/` و `gaming-ecommerce/` نسخه‌های مستقل و قدیمی‌اند؛ به فروشگاه فعلی متصل نیستند و جزو بسته انتشار این نسخه نیستند. قابلیت‌ها و فایل‌های آن‌ها حفظ شده‌اند، اما نباید به‌عنوان سرویس Production همین فروشگاه اجرا شوند.

## اجرا

از ریشه همین پروژه دستور `npm start` یا `npm run dev` را اجرا کنید. سرور اصلی `server.js` صفحات و API را روی پورت **3000** ارائه می‌کند: `http://localhost:3000/` و `http://localhost:3000/api/products`. دستور `npx serve .` فقط فایل‌های استاتیک را ارائه می‌کند و `/api/products` ندارد؛ اگر پورت 3000 را اشغال کرده است، ابتدا آن را با Ctrl+C متوقف کنید.

Node.js **24.15 یا جدیدتر از شاخه 24** لازم است؛ از SQLite داخلی Node استفاده می‌شود و ممکن است هشدار Experimental نمایش داده شود.

```powershell
npm ci
Copy-Item .env.example .env
# .env را ویرایش کنید؛ ADMIN_PASSWORD خالی است و باید توسط شما تنظیم شود.
npm run check
npm test
npm start
```

فروشگاه روی `http://localhost:3000` اجرا می‌شود. رمز مدیر باید ۱۲ تا ۷۲ بایت UTF-8 باشد. رمز پیش‌فرض وجود ندارد؛ اگر `ADMIN_PASSWORD` تنظیم نشود ورود مدیر غیرفعال می‌ماند. در Production مقدار `NODE_ENV=production`، مبدأ HTTPS دقیق در `APP_ORIGIN` و رمز مدیر الزامی هستند. `.env` در سمت سرور خوانده می‌شود و منتشر نمی‌شود.

## داده‌ها و مهاجرت

### رمز ادمین Development/Test

Bootstrap credentials require a strong password of at least 12 characters in every environment. No development exception is supported.

برای بررسی تمام محصولات سرور روشن، `npm run verify:products` را اجرا کنید (یا `npm run verify:products -- http://localhost:PORT`). این ابزار تمام IDهای API، endpoint تک‌محصول، لینک‌های Home و رندر Product Detail را بررسی می‌کند و در صورت ناسازگاری با exit code ناموفق خارج می‌شود.

مهاجرت `expanded-product-catalog-v1` محصولات موجود در seed را برای دیتابیس‌های قدیمی به‌صورت یک‌باره تکمیل می‌کند؛ ویرایش‌های موجود و حذف‌های ثبت‌شده Admin حفظ می‌شوند. با پاسخ موفق API، فقط داده سرور در کارت‌ها استفاده می‌شود. محصول cache که در API نیست با نام و ID در Console گزارش و در `gaming_store_products_unresolved` برای بررسی حفظ می‌شود. ID سبد فقط با تطبیق یکتای نام و برند به ID سرور منتقل می‌شود؛ موارد مبهم در `web2_cart_unresolved` باقی می‌مانند و نشست و سفارش‌ها پاک نمی‌شوند.
 
### رفع خطای HTML در ورود و ثبت‌نام

روش پیشنهادی اجرای صفحات و API از سرور ریشه است: `npm start` و سپس `http://localhost:3000/`. فایل `js/api-config.js` تنظیم مرکزی API است؛ در این حالت `API_BASE_URL` خالی است و درخواست‌ها به همان مبدأ می‌روند. فایل HTML را مستقیم با `file://` باز نکنید و سرور `backend/` قدیمی را اجرا نکنید.

برای Live Server روی `http://127.0.0.1:5500/`، config مرکزی درخواست‌های `/api/` را به `http://127.0.0.1:3000` هدایت می‌کند. سرور Node در development، CORS با credentials را فقط برای مبدأهای loopback مجاز در `DEV_FRONTEND_ORIGINS` فعال می‌کند؛ پیش‌فرض `http://localhost:5500,http://127.0.0.1:5500` است. hostname فرانت‌اند و بک‌اند یکسان باشد تا کوکی‌های SameSite کار کنند. این allowlist در production غیرفعال است. برای پورت سفارشی مثل 5000، `PORT=5000` و `APP_ORIGIN=http://127.0.0.1:5000` را در `.env` و `DEVELOPMENT_API_PORT=5000` را در `js/api-config.js` تنظیم کنید؛ سپس سرور را دوباره اجرا کنید. برای پورت Live Server دیگر، فهرست پورت‌های `liveServer` در همان config و `DEV_FRONTEND_ORIGINS` را هماهنگ کنید.

مسیرهای صحیح نشست `POST /api/auth/register`، `POST /api/auth/login`، `GET /api/auth/session` و `POST /api/auth/logout` هستند و در `lib/commerce.cjs` نصب می‌شوند. مسیر ناشناخته API پاسخ JSON با وضعیت 404 دارد.

در این اجرای یک‌مبدأیی، پورت frontend و backend هر دو 3000 هستند و CORS لازم نیست. اگر `PORT` را تغییر می‌دهید، `APP_ORIGIN` را نیز مطابق URL واقعی تنظیم و صفحات را از همان پورت باز کنید. ثبت‌نام نام، موبایل معتبر `09xxxxxxxxx`، ایمیل و رمز حداقل ۱۲ کاراکتری (حداکثر ۷۲ بایت UTF-8) لازم دارد. نشست در کوکی HttpOnly و دیتابیس باقی می‌ماند؛ احراز هویت در localStorage ذخیره نمی‌شود.

- SQLite در `var/web2.sqlite` ذخیره می‌شود؛ مسیر با `DATABASE_PATH` قابل تغییر است.
- مهاجرت `migration-v1` هنگام اولین اجرا، ۶۹ محصول و داده‌های قبلی `data.json` را وارد می‌کند و اطلاعات کارت و رمزهای قدیمی را حذف می‌کند. خود `data.json` هم از این فیلدها پاک شده است.
- بعد از مهاجرت، SQLite منبع اصلی است؛ ویرایش `data.json` دیگر دیتابیس موجود را تغییر نمی‌دهد. محصولات جدید را در Admin مدیریت کنید.
- جداول Products، Users، Accounts، Orders، OrderItems، Discounts و Sessions وجود دارند. داده‌های محتوایی قبلی نیز حفظ می‌شوند. رمزهای هش‌شده فقط در Accounts و نشست‌ها به شکل هش توکن در Sessions قرار دارند.
- کاربران نمایشی قبلی قابل احراز هویت نیستند؛ باید ثبت‌نام کنند. سفارش‌های تاریخی بدون شناسه حساب به‌طور خودکار به کاربران جدید نسبت داده نمی‌شوند و در Admin قابل مشاهده‌اند.
- Checkout مبلغ، قیمت واحد، تخفیف و موجودی را از دیتابیس محاسبه می‌کند. ثبت سفارش، اقلام، کاهش موجودی، مصرف تخفیف و شناسه درخواست در یک تراکنش انجام می‌شود. درخواست تکراری همان سفارش را برمی‌گرداند.
- لغو سفارش موجودی را فقط یک بار بازمی‌گرداند؛ سفارش لغوشده بازگشایی نمی‌شود. سوابق سفارش از مسیر عمومی Admin حذف نمی‌شوند.
- این استقرار برای **یک نمونه سرور و دیسک پایدار محلی** در نظر گرفته شده است. SQLite و محدودکننده درخواست حافظه‌ای را بدون بازطراحی برای چند نمونه مستقل، فایل‌سیستم شبکه یا هاست با دیسک موقت استفاده نکنید.

## قابلیت‌های فعال

داشبورد جدید مشتری، دفترچه آدرس، علاقه‌مندی‌های حساب، امنیت و نشست‌ها، مرکز اعلان و گفتگوی پشتیبانی با Admin پیاده‌سازی شده‌اند. قرارداد API، تغییرات دیتابیس، اجرا و محدودیت‌های این بخش در [مستندات حساب کاربری](docs/account.md) آمده است.

نمایش و جزئیات محصولات، جستجو و فیلترها، تصاویر، محصولات ویژه، کنترل موجودی، سبد خرید و تخفیف درصدی/مبلغی، ثبت‌نام/ورود/خروج، پروفایل و آدرس‌ها، تاریخچه و جزئیات سفارش، فرم تماس با ذخیره سمت سرور، Admin مجزا، مدیریت کامل محصول و تصویر و وضعیت، مدیریت وضعیت سفارش و کاربر و کدهای تخفیف با تاریخ انقضا و سقف استفاده.

Admin حساب جداگانه با رمز محیطی دارد. نقش Admin در فهرست کاربران به‌تنهایی نشست مدیریت ایجاد نمی‌کند. تغییر ایمیل و موبایل نیازمند رمز فعلی است. مقدار rating/reviews داده محصول است؛ سیستم ارسال و تأیید نظر خریدار هنوز پیاده‌سازی نشده است.

## امنیت و پرداخت

نشست‌ها کوکی HttpOnly و SameSite=Strict دارند؛ در Production کوکی Secure می‌شود. درخواست‌های تغییردهنده نیازمند CSRF هستند و مبدأ بررسی می‌شود. APIهای مدیریت مجوز سمت سرور دارند، سفارش کاربر دیگر قابل مشاهده نیست، رمزها bcrypt هستند، هدرهای امنیتی و CSP فعال‌اند و APIهای حساس محدودیت درخواست دارند. اطلاعات خصوصی، دیتابیس، تنظیمات، سورس سرور و `.git` از HTTP سرو نمی‌شوند.

`PAYMENT_MODE=test` تنها حالت پیاده‌سازی‌شده است. شماره کارت، CVV و تاریخ انقضا دریافت یا ذخیره نمی‌شود. سفارش با `paymentStatus=test` ثبت می‌شود؛ **وجهی دریافت نمی‌شود** و در آمار فروش واقعی محاسبه نمی‌شود. تغییر متغیر به یک حالت دیگر درگاه واقعی ایجاد نمی‌کند؛ مسیر با خطای 503 بسته می‌ماند. قرارداد لایه Provider در `lib/payment.cjs` است؛ کلید درگاه باید فقط در سرور نگهداری شود.

## تست و پشتیبان‌گیری

`npm run check` بررسی نحوی JavaScript، شناسه‌های تکراری HTML، سازگاری اسکریپت‌ها با CSP و لینک‌ها/assetهای محلی را انجام می‌دهد. `npm test` تست سبد/محصولات و جریان HTTP حساب، Admin، سفارش، تخفیف، CSRF، دسترسی کاربران، موجودی هم‌زمان، درخواست تکراری و راه‌اندازی مجدد را روی دیتابیس موقت اجرا می‌کند.

صفحات عمومی `/`، `/products`، `/categories/:category` و `/product.html?id=...` از طریق `lib/seo.cjs` با محتوای محصول، عنوان، canonical، Open Graph و JSON-LD در سرور رندر می‌شوند. `APP_ORIGIN` مبنای URLهای عمومی است و در Production باید مبدأ واقعی HTTPS باشد؛ هدر Host مبنای این URLها نیست. Sitemap و robots پویا هستند و محصول غیرفعال یا حذف‌شده به 404 واقعی می‌رسد. صفحات خصوصی و APIها `noindex` دارند؛ کنترل دسترسی مستقل از آن برقرار است. قیمت‌های فروشگاه تومان هستند و مقدار استاندارد IRR در schema ده برابر آن است؛ امتیازهای نمایشی به‌عنوان نظر تأییدشده وارد schema نمی‌شوند.

تست‌های SEO خروجی HTML، تغییرات Admin و امنیت داده‌های محصول را بررسی می‌کنند. `tests/admin-browser.test.cjs` با Chrome نصب‌شده یا مسیر `CHROME_TEST_BINARY`، صفحات فروشگاه، دسته‌بندی و پنل را در عرض‌های ۱۴۴۰ و ۳۹۰ پیکسل بررسی می‌کند؛ اگر Chrome موجود نباشد این تست skip می‌شود. راهنمای ادامه کار و نتیجه بررسی نشست قطع‌شده در [docs/continuation.md](docs/continuation.md) است.

```powershell
npm run backup
```

پشتیبان سازگار و بررسی‌شده SQLite در `var/backups` ساخته می‌شود. پشتیبان شامل اطلاعات کاربران و هش رمزهاست؛ دسترسی را محدود و نسخه خارج از سرور را رمزگذاری کنید. بازیابی با `npm run restore -- --backup PATH --target PATH --offline-confirmed` فقط پس از توقف سرور انجام شود؛ ابزار پیش از جایگزینی نسخه ایمنی می‌سازد. دستور `npm run monitor` آمادگی سرویس، وضعیت PM2 و فضای دیسک را بررسی می‌کند. راهنمای کامل پشتیبان‌گیری، نگهداری، بازیابی و زمان‌بندی در [deploy/operations.md](deploy/operations.md) است.

## پیش از انتشار واقعی

1. دامنه، HTTPS و reverse proxy را تنظیم کنید. مبدأ دقیق و رمز مدیر را در `.env` بگذارید؛ هدر Origin را حذف نکنید. سرور را فقط از پشت همان پراکسی در دسترس قرار دهید. تنظیم اعتماد به پراکسی و rate limit توزیع‌شده نیازمند شناخت زیرساخت است.
2. مسیر دیتابیس را روی دیسک پایدار و با دسترسی محدود قرار دهید؛ پشتیبان زمان‌بندی‌شده و بازیابی آزمایشی داشته باشید. مسیرهایی مثل `data.json`، `.env`، `var/`، سورس backend و پوشه‌های backup را مستقیماً در وب‌سرور منتشر نکنید.
3. Provider رسمی را با درخواست و تأیید سمت سرور، callback معتبر، تطبیق مبلغ/سفارش، جلوگیری از تأیید تکراری و سیاست رزرو/انقضای موجودی پیاده‌سازی و آزمایش کنید. اکنون پرداخت، ارسال کالا و refund واقعی وجود ندارند.
4. برای بازیابی رمز پیاده‌سازی‌شده، سرویس SMS واقعی (Kavenegar یا adapter عمومی) و کلیدهای Turnstile را پیکربندی و در staging بررسی کنید؛ mock در Production مجاز نیست. تأیید ایمیل و اعلان ایمیلی به اتصال SMTP و پیاده‌سازی جداگانه نیاز دارند.
5. هزینه و محدوده ارسال، مالیات، سیاست مرجوعی و متن شرایط/حریم خصوصی را مطابق کسب‌وکار تعیین کنید؛ هزینه ارسال فعلاً صفر است و متن فروشگاه ماهیت آزمایشی دارد.
6. تصاویر و مشخصات، قیمت‌ها و موجودی واقعی را بازبینی کنید؛ کاتالوگ فعلی داده نمایشی است. نظرها و ratingها تأیید خریدار واقعی نیستند.
7. پیش از انتشار، UI را روی دستگاه واقعی و مرورگرهای دیگر هم بررسی کنید؛ تست خودکار Chromium عرض‌های دسکتاپ و موبایل، کنتراست، سرریز، حرکت کاهش‌یافته و جریان‌های اصلی را پوشش می‌دهد. پیمایش دستی با صفحه‌کلید و تست بار واقعی باید در staging تکمیل شود.
8. ممیزی وابستگی‌ها، به‌روزرسانی نسخه‌ها، پایش خطا، محدودکننده ورودی تصویر، حفاظت در برابر سوءاستفاده و تست بار را در محیط استقرار انجام دهید. این تغییرات جای ممیزی مستقل امنیت را نمی‌گیرد.

مرجع معماری نشست: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). مرجع SQLite: [مستندات Node.js](https://nodejs.org/api/sqlite.html).

## Performance tooling (Phase 17)

Run `npm run benchmark -- --output .runtime/performance.json --runs 3` for isolated latency/CPU/memory and 5/10/25/50-concurrent burst tests. Run `npm run benchmark -- --mode memory --profile growth --runs 1 --output .runtime/memory.json` for the timed heap/RSS/external-memory check. Both create synthetic temporary databases and cannot target the live app. Normal security limits remain enabled.

Run `npm run build:assets` after changing JS/CSS and before deployment. Deploy the generated HTML references together with the assets and restart the app. No new dependencies are required. Results, pagination contracts, cache limits and Nginx/PM2 deployment notes are in [docs/phase17-performance.md](docs/phase17-performance.md).
**Storage migration readiness (Phase 18)**

The active store is already SQLite. It remains the default (`STORAGE_DRIVER=sqlite`); `DATABASE_PATH` remains supported and `SQLITE_PATH` is an optional alias. JSON is a read-only legacy/import source. PostgreSQL and a JSON runtime driver fail closed until implemented. No file or URL silently changes drivers.

Run `npm run storage:dry-run` to inspect the shipped seed without writing a target. Use the representative fixture and explicit new destinations for imports. The normalized SQLite format is an offline rehearsal and cannot be used by the live app. Full commands, entity/transaction audit, integrity checks, security-state limitations and the unexecuted production checklist are in [docs/phase18-migration-readiness.md](docs/phase18-migration-readiness.md).

Run `npm run benchmark:storage -- --output .runtime/phase18-storage-local.json` for synthetic storage measurements. No new dependencies are required. Deploying backend changes requires restarting the existing single PM2 process; no production migration or infrastructure change is part of these commands.

## Security review tooling (Phase 19)

Run `node scripts/security-routes.cjs` for a JSON inventory of the active
Express routes, or add `--markdown` for a review table. Capture disables real
`.env` loading, opens only a disposable SQLite store and never starts a listener.
The [route inventory](docs/phase19-route-inventory.md) and
[security continuation report](docs/phase19-security.md) record the interrupted
review's scope, inherited fixes and verification. The normal `npm test` command
includes its route/CSRF matrix and deterministic session/password race tests.

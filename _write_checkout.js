const fs = require("fs");
const path = "E:\\web 2\\checkout.html";

// Read the existing file to get the header/footer parts
const existing = fs.readFileSync(path, "utf-8");

// Extract the head section (up to <body>)
const headStart = existing.indexOf("<!doctype");
const bodyStart = existing.indexOf("<body");
const headEnd = existing.indexOf(">", bodyStart) + 1;

const beforeMain = existing.substring(headStart, headEnd + 1);

// Find the main content area to replace
const mainStart = existing.indexOf("<main");
const mainEnd = existing.indexOf("</main>");
const afterMain = existing.substring(mainEnd);

// Build the new main content
const newMain = `  <main id="main-content" class="inner-page">
    <section class="container page-heading-block">
      <span class="eyebrow">MULTI-STEP CHECKOUT</span>
      <h1>تکمیل سفارش</h1>
      <p>فرآیند خرید سریع و هوشمند — در چند مرحله ساده</p>
    </section>

    <section class="container checkout-layout" id="checkoutContent">
      <div class="checkout-main glass-panel">
        <!-- Stepper Indicator -->
        <div class="stepper" id="checkoutStepper">
          <div class="step-item active" data-step="1">
            <div class="step-circle">1</div>
            <span class="step-label">ورود</span>
          </div>
          <div class="step-line"></div>
          <div class="step-item" data-step="2">
            <div class="step-circle">2</div>
            <span class="step-label">آدرس</span>
          </div>
          <div class="step-line"></div>
          <div class="step-item" data-step="3">
            <div class="step-circle">3</div>
            <span class="step-label">بررسی</span>
          </div>
          <div class="step-line"></div>
          <div class="step-item" data-step="4">
            <div class="step-circle">4</div>
            <span class="step-label">پرداخت</span>
          </div>
        </div>

        <!-- Step Panels -->
        <div class="stepper-panels">

          <!-- Step 1: Auth -->
          <div class="step-panel active" data-step="1">
            <div class="step-header">
              <i class="fa-solid fa-user-astronaut"></i>
              <h2>ورود / ثبت‌نام سریع</h2>
              <p>برای ادامه، یک حساب کاربری بسازید یا وارد شوید.</p>
            </div>
            <div class="step-auth-form" id="stepAuthForm">
              <div class="field-row">
                <label class="field">
                  <span>نام و نام‌خانوادگی</span>
                  <input type="text" id="authName" name="authName" required minlength="2" maxlength="60" autocomplete="name" placeholder="مثلاً امیرحسین رضایی">
                </label>
                <label class="field">
                  <span>شماره تماس یا ایمیل</span>
                  <input type="text" id="authPhone" name="authPhone" required autocomplete="tel" dir="ltr" placeholder="۰۹۱۲۱۲۳۴۵۶۷">
                </label>
              </div>
              <div class="step-actions">
                <button class="primary-button" type="button" id="stepAuthBtn">
                  <span>ورود / ثبت‌نام و ادامه</span>
                  <i class="fa-solid fa-arrow-left"></i>
                </button>
              </div>
            </div>
            <div class="step-auth-done" id="stepAuthDone" hidden>
              <div class="auth-done-box">
                <i class="fa-solid fa-circle-check" style="color:var(--green);font-size:2.5rem;filter:drop-shadow(0 0 12px rgba(0,255,102,0.5));"></i>
                <h3 id="authDoneName">خوش آمدید!</h3>
                <p>شما با موفقیت وارد حساب خود شدید.</p>
                <button class="primary-button" type="button" id="stepAuthContinue">
                  <span>ادامه به مرحله بعد</span>
                  <i class="fa-solid fa-arrow-left"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Step 2: Shipping -->
          <div class="step-panel" data-step="2">
            <div class="step-header">
              <i class="fa-solid fa-location-dot"></i>
              <h2>مشخصات ارسال</h2>
              <p>آدرس دقیق و اطلاعات تماس تحویل‌گیرنده را وارد کنید.</p>
            </div>
            <form id="stepShippingForm" autocomplete="on" novalidate>
              <div class="field-row">
                <label class="field">
                  <span>نام تحویل‌گیرنده</span>
                  <input type="text" id="shipName" name="shipName" required minlength="3" maxlength="80" autocomplete="name" placeholder="نام و نام خانوادگی">
                </label>
                <label class="field">
                  <span>شماره تماس</span>
                  <input type="tel" id="shipPhone" name="shipPhone" required autocomplete="tel" inputmode="numeric" dir="ltr" placeholder="۰۹۱۲۱۲۳۴۵۶۷" maxlength="11">
                </label>
              </div>
              <div class="field-row">
                <label class="field">
                  <span>کد پستی</span>
                  <input type="text" id="shipPostalCode" name="shipPostalCode" required inputmode="numeric" dir="ltr" placeholder="۱۰ رقمی" maxlength="10" minlength="10">
                </label>
                <label class="field">
                  <span>استان</span>
                  <input type="text" id="shipProvince" name="shipProvince" required placeholder="مثلاً تهران" maxlength="50">
                </label>
              </div>
              <label class="field">
                <span>شهر</span>
                <input type="text" id="shipCity" name="shipCity" required placeholder="مثلاً تهران" maxlength="50">
              </label>
              <label class="field">
                <span>آدرس کامل پستی</span>
                <textarea id="shipAddress" name="shipAddress" required minlength="10" maxlength="400" rows="3" placeholder="خیابان، کوچه، پلاک، واحد"></textarea>
              </label>
              <div class="step-actions">
                <button class="secondary-button" type="button" id="step2Back">
                  <i class="fa-solid fa-arrow-right"></i>
                  <span>بازگشت</span>
                </button>
                <button class="primary-button" type="submit" id="step2Next">
                  <span>ادامه و بررسی سفارش</span>
                  <i class="fa-solid fa-arrow-left"></i>
                </button>
              </div>
            </form>
          </div>

          <!-- Step 3: Review & Payment -->
          <div class="step-panel" data-step="3">
            <div class="step-header">
              <i class="fa-solid fa-receipt"></i>
              <h2>بررسی و خلاصه سفارش</h2>
              <p>اطلاعات نهایی را بررسی کنید و روش پرداخت را انتخاب کنید.</p>
            </div>
            <div class="step-review">
              <div class="review-section">
                <h3><i class="fa-solid fa-truck"></i> اطلاعات ارسال</h3>
                <div id="reviewShipping" class="review-data"></div>
              </div>
              <div class="review-section">
                <h3><i class="fa-solid fa-cart-shopping"></i> محصولات</h3>
                <div id="reviewProducts" class="review-products"></div>
              </div>
              <div class="review-section">
                <h3><i class="fa-solid fa-coins"></i> روش پرداخت</h3>
                <div class="payment-methods">
                  <label class="payment-method selected">
                    <input type="radio" name="paymentMethod" value="online" checked>
                    <i class="fa-solid fa-globe"></i>
                    <div>
                      <strong>پرداخت آنلاین (تستی)</strong>
                      <small>شبیه‌سازی درگاه پرداخت</small>
                    </div>
                  </label>
                  <label class="payment-method">
                    <input type="radio" name="paymentMethod" value="card">
                    <i class="fa-solid fa-credit-card"></i>
                    <div>
                      <strong>کارت به کارت</strong>
                      <small>تأیید دستی توسط پشتیبانی</small>
                    </div>
                  </label>
                </div>
              </div>
              <div class="review-totals">
                <div class="summary-line"><span>تعداد اقلام</span><strong id="reviewItemCount">0</strong></div>
                <div class="summary-line"><span>جمع محصولات</span><strong id="reviewSubtotal">0 تومان</strong></div>
                <div class="summary-line"><span>هزینه ارسال</span><strong class="free-label">رایگان</strong></div>
                <div class="summary-line discount-line" id="reviewDiscountLine" hidden><span>تخفیف WEB2</span><strong id="reviewDiscount">0 تومان</strong></div>
                <div class="summary-total"><span>مبلغ نهایی</span><strong id="reviewTotal">0 تومان</strong></div>
              </div>
              <div class="step-actions">
                <button class="secondary-button" type="button" id="step3Back">
                  <i class="fa-solid fa-arrow-right"></i>
                  <span>بازگشت</span>
                </button>
                <button class="primary-button" type="button" id="step3Pay">
                  <span>پرداخت و ثبت سفارش</span>
                  <i class="fa-solid fa-arrow-left"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Step 4: Result -->
          <div class="step-panel" data-step="4">
            <div class="step-result">
              <div class="success-ring">
                <i class="fa-solid fa-check"></i>
              </div>
              <span class="eyebrow">PAYMENT COMPLETE</span>
              <h2>سفارش شما با موفقیت ثبت شد!</h2>
              <p>از خرید شما متشکریم. سفارش شما در حال پردازش است.</p>
              <div class="result-tracking">
                <span>کد پیگیری</span>
                <strong id="trackingCode">GP-00000</strong>
              </div>
              <div class="result-info">
                <div><span>تاریخ ثبت</span><strong id="resultDate">—</strong></div>
                <div><span>مبلغ پرداخت‌شده</span><strong id="resultAmount">۰ تومان</strong></div>
                <div><span>وضعیت</span><strong style="color:var(--green)">در حال پردازش</strong></div>
              </div>
              <div class="step-actions" style="justify-content:center;margin-top:32px;">
                <a class="primary-button" href="profile.html" id="viewOrdersBtn">
                  <i class="fa-solid fa-clock-rotate-left"></i>
                  <span>مشاهده در سفارش‌های من</span>
                </a>
                <a class="secondary-button" href="index.html">
                  <i class="fa-solid fa-house"></i>
                  <span>بازگشت به فروشگاه</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary Sidebar -->
      <aside class="checkout-summary glass-panel" id="checkoutSummary">
        <div class="summary-title">
          <h2>سفارش شما</h2>
          <a href="cart.html">ویرایش</a>
        </div>
        <div class="checkout-items" id="checkoutItems" aria-live="polite" aria-busy="true"></div>
        <div class="summary-line"><span>تعداد اقلام</span><strong id="checkoutItemCount">0</strong></div>
        <div class="summary-line"><span>ارسال</span><strong class="free-label">رایگان</strong></div>
        <div class="summary-line discount-line" id="checkoutDiscountLine" hidden><span>تخفیف WEB2</span><strong id="checkoutDiscount">0 تومان</strong></div>
        <div class="summary-total"><span>مبلغ نهایی</span><strong id="checkoutTotal">0 تومان</strong></div>
      </aside>
    </section>
  </main>`;

// Reconstruct the file
const result = existing.substring(0, headEnd + 1) + "\n" + newMain + "\n" + afterMain;

fs.writeFileSync(path, result, "utf-8");
console.log("checkout.html updated successfully!");

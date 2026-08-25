const products = [
  {
    id: 1,
    name: "Intel Core i7-13700K CPU",
    price: 24500000,
    image: "images/intel-core-i7-13700k.png",
    category: "hardware",
    description:
      "پردازنده قدرتمند نسل سیزدهم اینتل با 16 هسته و 24 رشته پردازشی، مناسب اجرای بازی‌های سنگین، استریم هم‌زمان و تولید محتوا با نرخ فریم بالا.",
    specifications: {
      "تعداد هسته": "16 هسته",
      "تعداد رشته": "24 رشته",
      "حداکثر فرکانس": "5.4 گیگاهرتز",
      "سوکت": "LGA 1700",
      "توان پایه": "125 وات"
    }
  },
  {
    id: 2,
    name: "NVIDIA RTX 4070 GPU",
    price: 48500000,
    image: "images/nvidia-rtx-4070.png",
    category: "hardware",
    description:
      "کارت گرافیک گیمینگ مبتنی بر معماری Ada Lovelace با پشتیبانی از رهگیری پرتو و DLSS 3، ایده‌آل برای تجربه روان بازی‌ها در وضوح 1440p و اجرای پروژه‌های گرافیکی حرفه‌ای.",
    specifications: {
      "حافظه گرافیکی": "12 گیگابایت GDDR6X",
      "رابط حافظه": "192 بیت",
      "معماری": "Ada Lovelace",
      "فناوری ارتقای تصویر": "DLSS 3",
      "توان پیشنهادی منبع تغذیه": "650 وات"
    }
  },
  {
    id: 3,
    name: "RGB Gaming Keyboard",
    price: 3950000,
    image: "images/rgb-gaming-keyboard.png",
    category: "accessories",
    description:
      "کیبورد مکانیکی گیمینگ با نورپردازی RGB قابل تنظیم، کلیدهای سریع و مقاوم و قابلیت Anti-Ghosting برای ثبت دقیق فرمان‌ها در رقابت‌های حرفه‌ای.",
    specifications: {
      "نوع کلید": "مکانیکی",
      "نورپردازی": "RGB قابل تنظیم",
      "اتصال": "USB سیمی",
      "قابلیت Anti-Ghosting": "دارد",
      "چیدمان": "کامل"
    }
  },
  {
    id: 4,
    name: "Green Gaming Headset",
    price: 2850000,
    image: "images/green-gaming-headset.png",
    category: "accessories",
    description:
      "هدست گیمینگ سبز با صدای فراگیر، میکروفون نویزگیر و بالشتک‌های نرم که برای تشخیص دقیق جهت صدا و استفاده طولانی‌مدت در بازی طراحی شده است.",
    specifications: {
      "نوع صدا": "فراگیر مجازی 7.1",
      "میکروفون": "نویزگیر و قابل تنظیم",
      "نوع اتصال": "USB و جک 3.5 میلی‌متری",
      "کنترل صدا": "روی کابل",
      "رنگ": "سبز گیمینگ"
    }
  },
  {
    id: 5,
    name: "27-inch 165Hz Gaming Monitor",
    price: 16800000,
    image: "images/165hz-gaming-monitor.png",
    category: "hardware",
    description:
      "مانیتور 27 اینچی گیمینگ با نرخ نوسازی 165 هرتز، زمان پاسخ‌دهی سریع و پنل IPS برای نمایش حرکت‌های روان، رنگ‌های دقیق و زاویه دید گسترده.",
    specifications: {
      "اندازه صفحه": "27 اینچ",
      "وضوح تصویر": "2560 × 1440",
      "نرخ نوسازی": "165 هرتز",
      "نوع پنل": "IPS",
      "زمان پاسخ‌دهی": "1 میلی‌ثانیه"
    }
  },
  {
    id: 6,
    name: "Wireless RGB Gaming Mouse",
    price: 2250000,
    image: "images/wireless-rgb-gaming-mouse.png",
    category: "accessories",
    description:
      "ماوس بی‌سیم سبک با حسگر دقیق، نورپردازی RGB و کلیدهای قابل برنامه‌ریزی که کنترل سریع و پایدار را در بازی‌های شوتر و رقابتی فراهم می‌کند.",
    specifications: {
      "حداکثر دقت": "16000 DPI",
      "نوع اتصال": "بی‌سیم 2.4 گیگاهرتز",
      "تعداد کلید": "6 کلید",
      "نورپردازی": "RGB",
      "باتری": "قابل شارژ"
    }
  }
];

globalThis.products = products;

if (typeof module !== "undefined" && module.exports) {
  module.exports = products;
  module.exports.products = products;
}

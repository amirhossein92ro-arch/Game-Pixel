// دیتابیس محصولات فروشگاه امیر (Gaming Store)
const products = [
    {
        id: 1,
        name: "موس گیمینگ Razer DeathAdder",
        price: 2850000,
        image: "img/mouse.png",
        description: "دقیق‌ترین موس گیمینگ جهان با سنسور اپتیکال پیشرفته و ارگونومی فوق‌العاده برای ساعت‌ها بازی بی‌وقفه.",
        specs: {
            "DPI": "20,000",
            "نوع سوییچ": "Optical Gen-2",
            "وزن": "82 گرم"
        }
    },
    {
        id: 2,
        name: "کیبورد Corsair K70 RGB",
        price: 5400000,
        image: "img/keyboard.png",
        description: "کیبورد مکانیکال با بدنه آلومینیومی و نورپردازی RGB که هر کلید آن قابل برنامه‌ریزی است.",
        specs: {
            "نوع سوییچ": "Cherry MX Red",
            "اتصال": "USB Wired",
            "قابلیت": "Anti-Ghosting"
        }
    },
    {
        id: 3,
        name: "هدست SteelSeries Arctis 7",
        price: 7200000,
        image: "img/headset.png",
        description: "صدای ۳۶۰ درجه و میکروفون با حذف نویز محیطی، مخصوص گیمرهای حرفه‌ای و استریمرها.",
        specs: {
            "درایور": "40mm",
            "باتری": "24 ساعت",
            "اتصال": "Wireless 2.4GHz"
        }
    }
];

console.log("✅ لیست محصولات با موفقیت لود شد!");

'use strict';
// Merchant seed extension. WEB 2 entries describe configurable shop specifications,
// not manufacturer claims. Supplier model/warranty must be confirmed before ordering.
const common={accent:'#88572e',tag:'قطعات منتخب',discount:0,rating:0,reviews:0,status:'active',featured:false,isNew:true,guarantee:'شرایط گارانتی و تأمین پیش از سفارش تأیید شود'};
const rows=[
    [201,'پردازنده AMD Ryzen 5 7600 Box','AMD','پردازنده','cpu','fa-microchip',12500000,8,
        ['نسل Ryzen 7000 / معماری Zen 4','۶ هسته / ۱۲ رشته','فرکانس پایه 3.8GHz؛ بوست تا 5.1GHz','سوکت AM5؛ حافظه DDR5','نسخه جعبه‌دار'],
        'پردازنده شش‌هسته‌ای AM5 برای سیستم بازی و کار روزمره.'],
    [202,'پردازنده AMD Ryzen 5 7600 Tray','AMD','پردازنده','cpu','fa-microchip',11750000,6,
        ['نسل Ryzen 7000 / معماری Zen 4','۶ هسته / ۱۲ رشته','فرکانس پایه 3.8GHz؛ بوست تا 5.1GHz','سوکت AM5؛ حافظه DDR5','نسخه Tray؛ خنک‌کننده جداگانه لازم است'],
        'نسخه بدون جعبه Ryzen 5 7600 برای اسمبل با خنک‌کننده انتخابی.'],
    [203,'مادربرد MSI PRO B650M-A WIFI','MSI','مادربرد','motherboard','fa-microchip',11900000,5,
        ['چیپست AMD B650؛ سوکت AM5','فرم Micro-ATX','۴ اسلات DDR5؛ دو کانال','دو درگاه M.2 PCIe 4.0','شبکه 2.5GbE و Wi-Fi 6E'],
        'مادربرد AM5 با پشتیبانی DDR5 و ارتباط بی‌سیم.'],
    [204,'مادربرد MSI PRO B650M-A WIFI با راه‌اندازی','MSI','مادربرد','motherboard','fa-microchip',12100000,4,
        ['چیپست AMD B650؛ سوکت AM5','فرم Micro-ATX','۴ اسلات DDR5','دو درگاه M.2 PCIe 4.0','بسته شامل بررسی راه‌اندازی توسط فروشگاه'],
        'همان مادربرد B650 با خدمت بررسی اولیه و راه‌اندازی فروشگاه.'],
    [205,'کیت رم WEB 2 DDR5 32GB 5600','WEB 2','رم','ram','fa-memory',6700000,10,
        ['ظرفیت کل ۳۲ گیگابایت','کیت دو ماژول 16GB','نسل DDR5؛ سرعت 5600MT/s','بدون RGB','سازگاری نهایی با فهرست مادربرد بررسی شود'],
        'کیت حافظه دوکاناله DDR5 برای سیستم‌های AM5؛ مشخصات سفارش پیکربندی فروشگاه.'],
    [206,'کیت رم WEB 2 DDR5 16GB 5600','WEB 2','رم','ram','fa-memory',3600000,8,
        ['ظرفیت کل ۱۶ گیگابایت','کیت دو ماژول 8GB','نسل DDR5؛ سرعت 5600MT/s','بدون RGB','سازگاری نهایی با فهرست مادربرد بررسی شود'],
        'کیت اقتصادی DDR5 دوکاناله برای شروع یک سیستم جدید.'],
    [207,'کارت گرافیک Palit RTX 4060 Dual V1 8GB','PALIT','کارت گرافیک','gpu','fa-display',24500000,6,
        ['پردازنده گرافیکی GeForce RTX 4060','حافظه 8GB GDDR6','معماری Ada Lovelace','خنک‌کننده دو فن','نسل PCIe 4.0'],
        'کارت گرافیک دو فن با حافظه هشت گیگابایت برای سیستم بازی.'],
    [208,'کارت گرافیک Palit RTX 4060 Dual V1 بسته اسمبل','PALIT','کارت گرافیک','gpu','fa-display',24800000,3,
        ['GeForce RTX 4060؛ معماری Ada Lovelace','حافظه 8GB GDDR6','خنک‌کننده دو فن','بسته شامل نصب و بررسی خروجی تصویر','نیاز توان و ابعاد پیش از اسمبل بررسی شود'],
        'نسخه بسته اسمبل فروشگاه شامل نصب کارت و بررسی تصویر.'],
    [209,'SSD NVMe WEB 2 1TB Gen4','WEB 2','SSD و حافظه','ssd','fa-hard-drive',5200000,12,
        ['ظرفیت ۱ ترابایت','فرم M.2 2280','رابط NVMe PCIe 4.0','مناسب سیستم‌عامل و کتابخانه بازی','مشخصات پیکربندی فروشگاه؛ مدل تأمین در سفارش تأیید شود'],
        'حافظه NVMe یک ترابایتی برای سیستم کامل و ارتقای فضای ذخیره‌سازی.'],
    [210,'خنک‌کننده بادی WEB 2 Tower 120','WEB 2','خنک‌کننده','cooler','fa-fan',2400000,9,
        ['خنک‌کننده بادی تک برج','فن ۱۲۰ میلی‌متری PWM','پایه مناسب AM5','چهار لوله انتقال حرارت','ارتفاع نهایی و سازگاری کیس پیش از اسمبل بررسی شود'],
        'خنک‌کننده بادی AM5 با فن PWM برای پیکربندی منتخب فروشگاه.'],
    [211,'پاور WEB 2 650W Bronze','WEB 2','پاور','psu','fa-bolt',4500000,7,
        ['توان نامی پیکربندی ۶۵۰ وات','کلاس راندمان هدف Bronze','فرم ATX','کابل برق کارت گرافیک PCIe','مدل تأمین و گواهی نهایی در سفارش تأیید شود'],
        'پاور پیکربندی سیستم WEB 2؛ مدل دقیق تأمین پیش از خرید تأیید می‌شود.'],
    [212,'کیس WEB 2 Ivory Airflow','WEB 2','کیس','pc','fa-computer',3900000,7,
        ['رنگ عاجی؛ پنل کناری شفاف','پشتیبانی از Micro-ATX','جریان هوای جلو به عقب','جایگاه SSD و مدیریت کابل','مشخصات ابعاد قطعات پیش از اسمبل بررسی شود'],
        'کیس روشن برای پیکربندی‌های منتخب فروشگاه با تمرکز بر جریان هوا.'],
    [213,'فن کیس WEB 2 PWM 120','WEB 2','خنک‌کننده','cooler','fa-fan',650000,20,
        ['قطر فن ۱۲۰ میلی‌متر','کنترل سرعت PWM','بدون نورپردازی RGB','اتصال چهار پین','مناسب تهویه کیس'],
        'فن کم‌حاشیه برای تکمیل تهویه کیس و ساخت ستاپ روشن.'],
    [214,'سیستم کامل ویژه WEB 2 Ivory 7600','WEB 2','سیستم کامل گیمینگ','pc','fa-computer',72000000,4,
        ['CPU: AMD Ryzen 5 7600؛ شش هسته / دوازده رشته','GPU: Palit GeForce RTX 4060 Dual V1 8GB','مادربرد: MSI PRO B650M-A WIFI / AM5','رم: WEB 2 DDR5 32GB (2×16GB) 5600','SSD: WEB 2 NVMe Gen4 1TB','پاور: WEB 2 650W Bronze','کیس: WEB 2 Ivory Airflow','خنک‌کننده: WEB 2 Tower 120 / AM5'],
        'سیستم کامل با پیکربندی مشخص و فروش ویژه زمان‌دار؛ مانیتور و لوازم جانبی در بسته نیست.']
];
const products=rows.map(([id,name,brand,category,art,icon,price,stock,features,shortDescription])=>({...common,id,name,brand,category,image:'img/hardware/'+art+'.svg',icon,price,stock,features,shortDescription,
    description:shortDescription+' قطعات نام‌برده برند WEB 2 مشخصات پیکربندی فروشگاه هستند؛ مدل دقیق تأمین، شرایط ضمانت و سازگاری نهایی پیش از سفارش تأیید می‌شود.',featured:id===214||id===207||id===201}));
const pc=products.find(p=>p.id===214);
pc.campaign={id:'web2-ivory-year-2026',startAt:'2026-11-02T00:00:00.000Z',endAt:'2027-11-02T00:00:00.000Z',discount:10};
pc.components=[
    {label:'پردازنده',value:'AMD Ryzen 5 7600',productId:'201'},
    {label:'کارت گرافیک',value:'Palit RTX 4060 Dual V1 8GB',productId:'207'},
    {label:'مادربرد',value:'MSI PRO B650M-A WIFI',productId:'203'},
    {label:'رم',value:'DDR5 32GB / 2×16 / 5600',productId:'205'},
    {label:'SSD',value:'NVMe Gen4 1TB',productId:'209'},
    {label:'پاور',value:'650W Bronze',productId:'211'},
    {label:'کیس',value:'Ivory Airflow',productId:'212'},
    {label:'خنک‌کننده',value:'Tower 120 / AM5',productId:'210'}
];
pc.tag='پیشنهاد سیستم کامل';
module.exports=products;

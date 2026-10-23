'use strict';
const {field}=require('./account.cjs');
const safeURL=require('../js/safe-url.js');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const defaults={storeName:'WEB 2',description:'دنیای تجهیزات گیمینگ',logo:'',contactEmail:'hello@web2.game',contactPhone:'',contactAddress:'تهران، ایران',
    social:{instagram:'',discord:'',telegram:''},homeBanner:{enabled:false,title:'',text:'',image:'',link:'',buttonText:''},
    announcement:{enabled:false,text:'',link:'',startsAt:null,expiresAt:null},shippingCost:0,freeShippingThreshold:null,maintenance:false,themePreset:'neon',featuredProductIds:[]};
function safeLink(value,label='لینک'){
    const result=field(value??'',label,0,500);
    if(result&&safeURL.link(result)!==result)throw fail(400,`${label} باید HTTPS یا مسیر داخلی و بدون اطلاعات ورود باشد.`);
    return result;
}
function image(value){const result=field(value??'','آدرس تصویر',0,500);if(result&&safeURL.image(result,{allowData:false,maxLength:500})!==result)throw fail(400,'آدرس تصویر نامعتبر است.');return result;}
function amount(value,label,nullable=false){if(nullable&&(value===null||value===''))return null;if(!(typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)))throw fail(400,`${label} باید مبلغ صحیح و غیرمنفی باشد.`);const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>1000000000000)throw fail(400,`${label} باید مبلغ صحیح و غیرمنفی باشد.`);return n;}
function iso(value,label){if(value===null||value==='')return null;if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw fail(400,`${label} نامعتبر است.`);return new Date(value).toISOString();}
function bool(value,label){if(typeof value!=='boolean')throw fail(400,`${label} نامعتبر است.`);return value;}
function readSettings(store){const row=store.access('site').findSettingsById();const stored=row?JSON.parse(row.payload):{};const result=Object.fromEntries(Object.keys(defaults).map(key=>[key,stored[key]??defaults[key]]));for(const key of ['social','announcement','homeBanner'])result[key]=Object.fromEntries(Object.keys(defaults[key]).map(field=>[field,stored[key]?.[field]??defaults[key][field]]));for(const name of Object.keys(defaults.social))result.social[name]=safeURL.link(result.social[name]);result.announcement.link=safeURL.link(result.announcement.link);result.homeBanner.link=safeURL.link(result.homeBanner.link);result.logo=safeURL.image(result.logo,{allowData:false,maxLength:500});result.homeBanner.image=safeURL.image(result.homeBanner.image,{allowData:false,maxLength:500});result.revision=stored.revision??0;return result;}
function validateSettings(body,store){
    const old=readSettings(store),merged={...old,...body};
    const a={...old.announcement,...body.announcement},b={...old.homeBanner,...body.homeBanner};
    const social={...old.social,...body.social};
    const email=field(merged.contactEmail,'ایمیل تماس',0,200);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'ایمیل تماس نامعتبر است.');
    const ids=merged.featuredProductIds;
    if(!Array.isArray(ids)||ids.length>12||ids.some(id=>typeof id!=='string'||!store.list('products').some(p=>String(p.id)===id&&p.status!=='inactive'))||new Set(ids).size!==ids.length)throw fail(400,'فهرست محصولات ویژه نامعتبر است.');
    if(!['neon','cyan','purple'].includes(merged.themePreset))throw fail(400,'تم نامعتبر است.');
    const result={storeName:field(merged.storeName,'نام فروشگاه',2,60),description:field(merged.description,'توضیحات',0,500),logo:image(merged.logo),
        contactEmail:email,contactPhone:field(merged.contactPhone,'تلفن تماس',0,40),contactAddress:field(merged.contactAddress,'نشانی تماس',0,500),
        social:Object.fromEntries(['instagram','discord','telegram'].map(k=>[k,safeLink(social[k],k)])),
        homeBanner:{enabled:bool(b.enabled,'وضعیت بنر'),title:field(b.title,'عنوان بنر',0,120),text:field(b.text,'متن بنر',0,400),image:image(b.image),link:safeLink(b.link),buttonText:field(b.buttonText,'متن دکمه',0,60)},
        announcement:{enabled:bool(a.enabled,'وضعیت اعلان'),text:field(a.text,'متن اعلان',0,200),link:safeLink(a.link),startsAt:iso(a.startsAt,'زمان شروع'),expiresAt:iso(a.expiresAt,'زمان پایان')},
        shippingCost:amount(merged.shippingCost,'هزینه ارسال'),freeShippingThreshold:amount(merged.freeShippingThreshold,'حد ارسال رایگان',true),
        maintenance:bool(merged.maintenance,'وضعیت تعمیرات'),themePreset:merged.themePreset,featuredProductIds:ids};
    if(result.announcement.enabled&&!result.announcement.text)throw fail(400,'متن اعلان را وارد کنید.');
    if(result.homeBanner.enabled&&!result.homeBanner.title)throw fail(400,'عنوان بنر را وارد کنید.');
    if(a.startsAt&&a.expiresAt&&Date.parse(a.startsAt)>=Date.parse(a.expiresAt))throw fail(400,'پایان اعلان باید بعد از شروع باشد.');
    return result;
}
function shippingFor(store,afterDiscount){const settings=readSettings(store);return settings.freeShippingThreshold!==null&&afterDiscount>=settings.freeShippingThreshold?0:settings.shippingCost;}
module.exports={defaults,readSettings,validateSettings,safeLink,amount,iso,shippingFor};

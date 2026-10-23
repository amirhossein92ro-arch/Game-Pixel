"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");
const requestSecurity = require('./lib/request-security.cjs');
const {publicAsset} = require('./lib/public-assets.cjs');
const operationalLog = require('./lib/operational-log.cjs');

function fatalProcessError(error,category){
    const reason=typeof error?.message==='string'&&/^Production (?:requires HTTPS APP_ORIGIN|allows HTTPS origins only)/.test(error.message)?'Production requires HTTPS':undefined;
    operationalLog.write('process-crash',{level:'error',category,code:error?.code,productionOriginRequired:!!reason});
    try{require('./lib/ops-state.cjs').createState().update('last-crash',()=>({time:new Date().toISOString(),category}));}catch{}
    process.exit(1);
}
process.once('uncaughtException',error=>fatalProcessError(error,'uncaught-exception'));
process.once('unhandledRejection',error=>fatalProcessError(error,'unhandled-rejection'));

if (fs.existsSync(path.join(__dirname, '.env'))) process.loadEnvFile(path.join(__dirname, '.env'));

const app = express();
const runtimeConfig=require('./lib/runtime-config.cjs');
const {port:PORT,host:HOST,production:IS_PRODUCTION}=runtimeConfig.validateRuntime();
for(const code of runtimeConfig.productionWarnings())operationalLog.write('configuration-warning',{level:'warn',category:'configuration',code});
const store = require('./storage/index.cjs').openStorage({root:__dirname});
const STATIC_ROOT = __dirname;
app.disable("x-powered-by");
app.set('json escape', true);
app.use((req,res,next)=>{req.requestId=crypto.randomUUID();res.setHeader('X-Request-ID',req.requestId);next();});
const monitoring=require('./lib/monitoring.cjs').createMonitoring();
monitoring.start();
app.use(monitoring.observe);
const storageReady=require('./lib/monitoring.cjs').readiness(store,{filename:require('./storage/config.cjs').configuration().filename,onFailure:error=>monitoring.error(null,Object.assign(new Error('Storage unavailable.'),{code:'STORAGE_FAILURE'}),503)});
const maintenance=setInterval(()=>{try{const now=Date.now();store.cleanup();require('./lib/journey-analytics.cjs').createJourneyAnalytics(store).cleanup();store.transaction(()=>{store.access('runtime').deleteSessionsByExpires(now);store.access('runtime').deletePendingAuthByExpires(now);store.access('runtime').updateAccountFactorsByPendingUntil(now);store.access('runtime').deletePasswordResetChallengesByExpiresAtAndUsedAt(now-86400000);store.access('runtime').deleteLoginFailuresByWindowEndsAndLockedUntil(now,now);store.access('runtime').deleteRequestBudgetsByResetsAt(now);});}catch(error){monitoring.error(null,error,500);operationalLog.write('maintenance-failure',{level:'error',category:'maintenance'});}},3600000);
maintenance.unref();
if(process.env.TRUST_PROXY){
 const proxy=process.env.TRUST_PROXY;
 if(proxy==='true'||/^\d+$/.test(proxy)||proxy.split(',').some(value=>['*','0.0.0.0/0','::/0'].includes(value.trim())))throw Error('TRUST_PROXY must identify trusted proxy addresses, for example loopback.');
 app.set('trust proxy',proxy.split(',').map(v=>v.trim()));
}
app.use((req,res,next)=>{
    if (/^\/(?:api(?:\/|$)|admin(?:[.\/-]|$)|profile(?:[.\/-]|$)|account(?:[.\/-]|$)|auth(?:[.\/-]|$)|login(?:[.\/-]|$)|register(?:[.\/-]|$)|(?:forgot|reset)-password(?:[.\/-]|$)|password-reset(?:[.\/-]|$)|orders(?:\/|$)|cart(?:[.\/-]|$)|checkout(?:[.\/-]|$)|health$|ready$)/i.test(req.path)) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    if(req.url.length>8192)return res.status(414).json({error:'Request URL is too long.'});
    // Reject traversal before Express decodes or normalizes the URL.
    try { requestSecurity.canonicalPath(req.url.split(/[?#]/,1)[0]); }
    catch { return res.set('X-Robots-Tag','noindex, nofollow').status(404).end(); }
    next();
});
// Keep private project files outside the public URL space, even if a broad
// static mount is added later. Only the explicit /admin route serves the UI.
app.use((req, res, next) => {
    let pathname;
    try { pathname = decodeURIComponent(req.path).toLowerCase(); }
    catch { return res.set('X-Robots-Tag','noindex, nofollow').status(404).end(); }
    const segments = pathname.split('/').filter(Boolean);
    if (segments.some(segment =>
        segment === 'admin.html' || segment === 'server.js' ||
        segment === '.env' || segment.startsWith('.env.') ||
        segment === '.git' || segment.startsWith('.backup-') ||
        segment === 'data.json' || segment === 'var' ||
        segment === 'logs' || segment === 'log' || segment.endsWith('.log')
    )) return res.set('X-Robots-Tag','noindex, nofollow').status(404).end();
    next();
});
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    xFrameOptions: {action:'deny'},
    // Enable only after the real HTTPS origin and renewal have been verified.
    strictTransportSecurity: runtimeConfig.hstsOptions(),
    referrerPolicy: {policy: "strict-origin-when-cross-origin"},
    contentSecurityPolicy: {directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://challenges.cloudflare.com/turnstile/"],
        scriptSrcAttr: ["'none'"],
        objectSrc: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://challenges.cloudflare.com"],
        frameSrc: ["https://challenges.cloudflare.com"],
        frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"]
    }}
}));
// Count requests before parsing bodies or invoking CAPTCHA/bcrypt.
const requestLimit = requestSecurity.limiter({limit:800});
const loginLimit = requestSecurity.limiter({limit:30,windowMs:15*60000});
const registerLimit = requestSecurity.limiter({limit:10,windowMs:15*60000});
const credentialLimit = requestSecurity.limiter({limit:10,windowMs:15*60000});
app.use((req,res,next)=>{
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(/^\/api(?:\/|$)/i.test(req.path))res.setHeader('Cache-Control','no-store');
    if(/^\/(?:admin(?:[.\/-]|$)|profile(?:\.html)?\/?$|cart(?:\.html)?\/?$|checkout(?:\.html)?\/?$)/i.test(req.path)){res.setHeader('Cache-Control','no-store');res.vary('Cookie');}
    try {
        requestLimit(req.ip);
        if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
            const p=requestSecurity.canonicalPath(req.path);
            if(/^\/api\/(?:auth|admin)\/login$/.test(p))loginLimit(req.ip+':'+p);
            if(p==='/api/auth/register')registerLimit(req.ip);
            if(p==='/api/users/me/password'||p==='/api/users/me'&&req.method==='PUT'&&(req.headers['content-length']||req.headers['transfer-encoding']))credentialLimit(req.ip+':'+p);
        }
        next();
    } catch(error) { next(error); }
});

/*
 * Express normally adds a charset for JSON and text responses, but static
 * files and custom handlers can vary between versions.  Normalising it in
 * one middleware keeps Persian content readable on every route.
 */
app.use((_req, res, next) => {
    const originalSetHeader = res.setHeader;
    res.setHeader = function setHeader(name, value) {
        if (
            typeof name === "string" &&
            name.toLowerCase() === "content-type" &&
            typeof value === "string" &&
            !/charset\s*=/i.test(value) &&
            /^(text\/|application\/(?:json|javascript|xml|xhtml\+xml))/i.test(value)
        ) {
            value = `${value}; charset=utf-8`;
        }
        return originalSetHeader.call(this, name, value);
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
});

// Keep request parsing deliberately small; product artwork should normally be a URL or optimized data image.
app.use(express.json({ limit: "1mb", inflate:false }));
app.use(express.urlencoded({ extended: false, limit: "256kb", parameterLimit: 100, inflate:false }));
app.use((req,_res,next)=>{try{require('./lib/request-security.cjs').shape(req.body);next();}catch(e){next(e);}});
app.get('/health',(_req,res)=>res.set('Cache-Control','no-store').json({status:'ok'}));
app.get('/ready',(_req,res)=>{res.set('Cache-Control','no-store');if(storageReady())return res.json({status:'ok'});res.status(503).json({status:'unavailable'});});

function repairMojibake(value) {
    if (typeof value === "string") {
        // Repair common UTF-8-as-Latin-1 text from older data files while
        // leaving correctly encoded Persian strings untouched.
        if (/[\u00c3\u00c2\u00d0\u00d1\u00d8\u00d9\u00da\u00db]/.test(value)) {
            try {
                const repaired = Buffer.from(value, "latin1").toString("utf8");
                if (repaired && !repaired.includes("\uFFFD")) return repaired;
            } catch {
                // Keep the original value when a legacy value cannot decode.
            }
        }
        return value;
    }
    if (Array.isArray(value)) return value.map(repairMojibake);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, repairMojibake(item)])
        );
    }
    return value;
}

const security = require('./lib/commerce.cjs').installCommerce(app, store);
const requireAdmin = security.requireAdmin;
const requireAdminSession = security.requireAdminSession;
app.get('/api/admin/system-status',requireAdmin,(req,res)=>{
    if(req.admin.role!=='SUPER_ADMIN')return res.status(403).json({error:'Super admin required.'});
    res.set('Cache-Control','no-store').json(monitoring.status());
});
function readProducts() {
    return store.list('products').filter(product=>!product.deletedAt);
}

/* â”€â”€ Generic data helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readCollection(name) {
    return store.list(name);
}
function writeCollection(name, items) {
    return store.replace(name,items);
}

/* â”€â”€ Posts helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readPosts() { return readCollection("posts"); }
function writePosts(posts) { writeCollection("posts", posts); }
function normalisePost(body, existing = null, forcedId) {
    const src = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : src.id;
    const title = asTrimmedString(src.title);
    if (!title || title.length > 200) return null;
    const limits={slug:200,content:20000,excerpt:1000,category:80,author:100,image:500,createdAt:40};
    if(Object.entries(limits).some(([key,max])=>src[key]!==undefined&&(typeof src[key]!=='string'||src[key].length>max)))return null;
    if(src.status!==undefined&&!['published','draft','archived'].includes(src.status)||src.commentStatus!==undefined&&!['open','closed'].includes(src.commentStatus))return null;
    if(src.tags!==undefined&&(!Array.isArray(src.tags)||src.tags.length>30||src.tags.some(tag=>typeof tag!=='string'||tag.length>80)))return null;
    if(src.views!==undefined&&(!Number.isSafeInteger(Number(src.views))||Number(src.views)<0))return null;
    if(src.image&&safeProductImage(src.image)!==src.image)return null;
    if(src.createdAt&&!Number.isFinite(Date.parse(src.createdAt)))return null;
    return {
        id, title,
        slug: asTrimmedString(src.slug) || title.replace(/\s+/g, "-").replace(/[^\w\u0600-\u06FF-]/g, ""),
        content: asTrimmedString(src.content),
        excerpt: asTrimmedString(src.excerpt),
        category: asTrimmedString(src.category, "Ø¹Ù…ÙˆÙ…ÛŒ"),
        tags: Array.isArray(src.tags) ? src.tags.map(String).filter(Boolean) : [],
        author: asTrimmedString(src.author, "Ù…Ø¯ÛŒØ±"),
        image: asTrimmedString(src.image),
        status: ["published","draft","archived"].includes(src.status) ? src.status : "draft",
        views: Number.isFinite(Number(src.views)) ? Math.max(0, Number(src.views)) : 0,
        commentStatus: src.commentStatus === "closed" ? "closed" : "open",
        createdAt: asTrimmedString(src.createdAt) || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

/* â”€â”€ Comments helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readComments() { return readCollection("comments"); }
function writeComments(comments) { writeCollection("comments", comments); }
function normaliseComment(body, existing = null, forcedId) {
    const src = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : src.id;
    const content = asTrimmedString(src.content);
    if (!content || content.length > 2000) return null;
    if(src.status!==undefined&&!['pending','approved','rejected'].includes(src.status))return null;
    if(src.author!==undefined&&(typeof src.author!=='string'||src.author.length>100)||src.email!==undefined&&(typeof src.email!=='string'||src.email.length>200||src.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(src.email)))return null;
    if(['postId','parentId'].some(key=>src[key]!=null&&(!Number.isSafeInteger(Number(src[key]))||Number(src[key])<0)))return null;
    if(src.createdAt!==undefined&&(typeof src.createdAt!=='string'||!Number.isFinite(Date.parse(src.createdAt))))return null;
    return {
        id, content,
        postId: Number(src.postId) || 0,
        author: asTrimmedString(src.author, "Ù†Ø§Ø´Ù†Ø§Ø³"),
        email: asTrimmedString(src.email),
        status: ["pending","approved","rejected"].includes(src.status) ? src.status : "pending",
        createdAt: asTrimmedString(src.createdAt) || new Date().toISOString(),
        parentId: Number(src.parentId) || null
    };
}

/* â”€â”€ Users helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readUsers() { return readCollection("users"); }
function writeUsers(users) { writeCollection("users", users); }
function normaliseUser(body, existing = null, forcedId) {
    const src = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : src.id;
    const name = asTrimmedString(src.name);
    if (!name) return null;
    return {
        id, name,
        phone: asTrimmedString(src.phone),
        email: asTrimmedString(src.email),
        role: ["user","editor","admin"].includes(src.role) ? src.role : "user",
        banned: src.banned === true || src.banned === "true",
        orderCount: Number.isFinite(Number(src.orderCount)) ? Math.max(0, Number(src.orderCount)) : 0,
        totalSpent: Number.isFinite(Number(src.totalSpent)) ? Math.max(0, Number(src.totalSpent)) : 0,
        joinDate: asTrimmedString(src.joinDate) || new Date().toISOString(),
        lastLogin: asTrimmedString(src.lastLogin) || "",
        updatedAt: asTrimmedString(src.updatedAt) || ""
    };
}

/* â”€â”€ Orders helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readOrders() { return readCollection("orders"); }
function writeOrders(orders) { writeCollection("orders", orders); }
function normaliseOrder(body, existing = null, forcedId) {
    const src = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : src.id;
    const code = asTrimmedString(src.code);
    if (!code) return null;
    return {
        id, code,
        items: Array.isArray(src.items) ? src.items : [],
        userName: asTrimmedString(src.userName),
        userEmail: asTrimmedString(src.userEmail),
        recipientName: asTrimmedString(src.recipientName),
        recipientPhone: asTrimmedString(src.recipientPhone),
        recipientAddress: asTrimmedString(src.recipientAddress),
        paymentMethod: asTrimmedString(src.paymentMethod, "Ú©Ø§Ø±Øª"),
        isAgreed: src.isAgreed === true,
        discountCode: asTrimmedString(src.discountCode),
        total: Number.isFinite(Number(src.total)) ? Math.max(0, Number(src.total)) : 0,
        status: ["processing","confirmed","shipped","cancelled","refunded"].includes(src.status) ? src.status : "processing",
        paymentStatus: ["paid","pending","failed","refunded"].includes(src.paymentStatus) ? src.paymentStatus : "paid",
        userPhone: asTrimmedString(src.userPhone),
        note: asTrimmedString(src.note),
        createdAt: asTrimmedString(src.createdAt) || new Date().toISOString(),
        updatedAt: asTrimmedString(src.updatedAt) || ""
    };
}

/* â”€â”€ Admin Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function getAdminStats(req,res){try{res.json(security.stats(req.admin));}catch(e){sendError(res,e,"خطا در آمار");}}

/* â”€â”€ CRUD: Posts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function getPosts(_req, res) { try { require('./lib/listing.cjs').respond(_req,res,store.search.posts(_req.query)); } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); } }
function getPost(req, res) {
    try {
        const found = readPosts().find(p => String(p.id) === String(req.params.id));
        if (!found) { const e = new Error("Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯"); e.statusCode = 404; throw e; }
        res.json(found);
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); }
}
function createPost(req, res) {
    try {
        const post = normalisePost(req.body, null, store.nextId('posts'));
        if (!post) { const e = new Error("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù†ÙˆØ´ØªÙ‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª"); e.statusCode = 400; throw e; }
        store.put('posts',post,{insert:true});
        res.status(201).json(post);
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§ Ø¯Ø± Ø°Ø®ÛŒØ±Ù‡"); }
}
function updatePost(req, res) {
    try {
        const updated = store.mutate('posts',req.params.id,current=>{
        const updated = normalisePost(req.body, current, current.id);
        if (!updated) { const e = new Error("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª"); e.statusCode = 400; throw e; }
        return updated;});
        res.json(updated);
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§ Ø¯Ø± ÙˆÛŒØ±Ø§ÛŒØ´"); }
}
function deletePost(req, res) {
    try {
        store.remove('posts',req.params.id);
        res.status(204).end();
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§ Ø¯Ø± Ø­Ø°Ù"); }
}

/* â”€â”€ CRUD: Comments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function getComments(_req, res) { try { require('./lib/listing.cjs').respond(_req,res,require('./lib/listing.cjs').collectionPage(store,'comments',_req.query,{defaultSize:Object.keys(_req.query).length?20:100})); } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); } }
function createComment(req, res) {
    try {
        const comment = normaliseComment(req.body, null, store.nextId('comments'));
        if (!comment) { const e = new Error("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù†Ø¸Ø± Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª"); e.statusCode = 400; throw e; }
        store.put('comments',comment,{insert:true});
        res.status(201).json(comment);
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); }
}
function updateComment(req, res) {
    try {
        const updated = store.mutate('comments',req.params.id,current=>{
        const updated = normaliseComment(req.body, current, current.id);
        if (!updated) { const e = new Error("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª"); e.statusCode = 400; throw e; }
        return updated;});
        res.json(updated);
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); }
}
function deleteComment(req, res) {
    try {
        store.remove('comments',req.params.id);
        res.status(204).end();
    } catch (e) { sendError(res, e, "Ø®Ø·Ø§"); }
}

/* â”€â”€ CRUD: Users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
app.get("/api/admin/stats", requireAdmin, getAdminStats);

app.get("/api/admin/posts", requireAdmin, getPosts);
app.get("/api/admin/posts/:id", requireAdmin, getPost);
app.post("/api/admin/posts", requireAdmin, createPost);
app.put("/api/admin/posts/:id", requireAdmin, updatePost);
app.delete("/api/admin/posts/:id", requireAdmin, deletePost);

app.get("/api/admin/comments", requireAdmin, getComments);
app.post("/api/admin/comments", requireAdmin, createComment);
app.put("/api/admin/comments/:id", requireAdmin, updateComment);
app.delete("/api/admin/comments/:id", requireAdmin, deleteComment);



/* â”€â”€ Existing admin routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
app.get("/api/admin/products", requireAdmin, getProducts);
app.get("/api/admin/products/:id", requireAdmin, getProductById);
app.post("/api/admin/products", requireAdmin, createProduct);
app.put("/api/admin/products/:id", requireAdmin, updateProduct);
app.delete("/api/admin/products/:id", requireAdmin, deleteProduct);

/* â”€â”€ Public API routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
app.get("/api/products", getProducts);
app.get("/api/products/:id", getProductById);
app.post("/api/products", requireAdmin, createProduct);
app.put("/api/products/:id", requireAdmin, updateProduct);
app.delete("/api/products/:id", requireAdmin, deleteProduct);


/* â”€â”€ Static files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const staticOptions = {
    dotfiles: 'deny',
    index: false,
    etag: true,
    maxAge: 0,
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        setAssetCache(res,filePath);
        if (ext === ".html") res.setHeader("Content-Type", "text/html; charset=utf-8");
        else if (ext === ".json") res.setHeader("Content-Type", "application/json; charset=utf-8");
        else if (ext === ".js") {res.setHeader("Content-Type", "application/javascript; charset=utf-8");if(path.basename(filePath).startsWith('admin'))res.setHeader('Cache-Control','no-store');}
        else if (ext === ".css") res.setHeader("Content-Type", "text/css; charset=utf-8");
        else if (ext === ".svg") res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
};
const publicStyleFiles = new Set(['/account.css','/admin.css','/commerce.css','/intro.css','/rgb-text.css']);
const publicScriptFiles = new Set(['admin.js','admin-actions.js','admin-console.js','admin-support.js','admin-users.js','admin-login.js','api-config.js','intro.js','invoice.js','profile.js','session.js','site.js','wishlist.js','safe-url.js'].map(name=>'/'+name));
app.use("/css", publicAsset(path.join(STATIC_ROOT, "css"),['.css'],publicStyleFiles), express.static(path.join(STATIC_ROOT, "css"), staticOptions));
const setAssetCache=require('./lib/asset-cache.cjs').assetCache(STATIC_ROOT,['style.css','script.js','products.js',...[...publicStyleFiles].map(file=>'css'+file),...[...publicScriptFiles].map(file=>'js'+file)],IS_PRODUCTION);
const protectedAdminScripts = new Set([
    "/admin.js", "/admin-actions.js", "/admin-console.js", "/admin-support.js", "/admin-users.js"
]);
app.use("/js", publicAsset(path.join(STATIC_ROOT, "js"),['.js'],publicScriptFiles), (req, res, next) => {
    if (!protectedAdminScripts.has(decodeURIComponent(req.path).toLowerCase())) return next();
    res.set('Cache-Control','no-store');
    return requireAdminSession(req, res, next);
}, express.static(path.join(STATIC_ROOT, "js"), staticOptions));
app.use("/img", publicAsset(path.join(STATIC_ROOT, "img"),['.png','.jpg','.jpeg','.webp','.gif','.svg','.avif','.ico']), express.static(path.join(STATIC_ROOT, "img"), staticOptions));
["style.css", "script.js", "products.js"].forEach((fileName) => {
    app.get(`/${fileName}`, publicAsset(STATIC_ROOT,[".js",".css"],new Set(["/"+fileName])), (_req, res, next) => {
        staticOptions.setHeaders(res,path.join(STATIC_ROOT,fileName));
        res.sendFile(path.join(STATIC_ROOT, fileName), staticOptions, (error) => { if (error) next(error); });
    });
});
// Search Console HTML verification can be placed at the public root by the
// operator. Only Google's verification filename shape is served; no token ships.
app.get(/^\/google[a-z0-9]{8,64}\.html$/i, (req, res, next) => {
    const fileName = req.path.slice(1);
    return publicAsset(STATIC_ROOT,['.html'],new Set(['/'+fileName.toLowerCase()]))(req,res,() => {
        res.set('Cache-Control','no-cache');
        res.sendFile(path.join(STATIC_ROOT,fileName), staticOptions, error => {if(error)next(error);});
    });
});

// Existing route definitions remain below
function getNextProductId(products) {
    return store.nextId('products');
}

function asTrimmedString(value, fallback = "") {
    return value === undefined || value === null ? fallback : String(value).trim();
}

function safeProductImage(value) {
    const image = String(value || "img/product-placeholder.svg");
    const dataImage = /^data:image\/(png|jpeg|webp|gif);base64,([a-zA-Z0-9+/=]+)$/.exec(image);
    if (dataImage) {
        const bytes = Buffer.from(dataImage[2], 'base64');
        if (bytes.length < 12 || bytes.length > 700000 || bytes.toString('base64') !== dataImage[2]) return "img/product-placeholder.svg";
        const type = dataImage[1];
        const signature = type === 'png' ? bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))
            : type === 'jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
            : type === 'gif' ? ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))
            : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
        if (!signature) return "img/product-placeholder.svg";
    }
    return require('./js/safe-url.js').image(image) || "img/product-placeholder.svg";
}
function normaliseProduct(input, existing = null, forcedId = undefined) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const source = existing ? { ...existing, ...body } : { ...body };
    const id = forcedId !== undefined ? forcedId : source.id;
    const name = asTrimmedString(source.name || source.title);
    const price = Number(source.price);

    if (!name || name.length > 200 || !Number.isSafeInteger(price) || price <= 0) {
        return null;
    }
    const limits={name:200,title:200,brand:100,tag:100,shortDescription:300,description:5000,guarantee:200,category:80,image:900000};
    if(Object.entries(limits).some(([key,max])=>body[key]!==undefined&&(typeof body[key]!=='string'||body[key].length>max)))return null;
    if(body.features!==undefined&&(!Array.isArray(body.features)||body.features.length>40||body.features.some(feature=>typeof feature!=='string'||feature.length>300)))return null;
    if(body.image&&safeProductImage(body.image)!==body.image)return null;
    if(price>1e12||Number(source.stock)>1000000)return null;

    const stockValue = Number(source.stock);
    const ratingValue = Number(source.rating);
    const reviewsValue = Number(source.reviews);
    const discountValue = Number(source.discount);
    if(['price','stock','rating','reviews','discount'].some(key=>body[key]!==undefined&&!(typeof body[key]==='number'||typeof body[key]==='string'&&/^\d+(?:\.\d+)?$/.test(body[key]))))return null;
    if(source.discount!==undefined&&(!Number.isSafeInteger(discountValue)||discountValue<0||discountValue>99))return null;
    if(source.rating!==undefined&&(!Number.isFinite(ratingValue)||ratingValue<0||ratingValue>5))return null;
    if(source.reviews!==undefined&&(!Number.isSafeInteger(reviewsValue)||reviewsValue<0))return null;
    if (source.status && !["active", "inactive"].includes(source.status)) return null;
    if (!Number.isSafeInteger(stockValue) || stockValue < 0) return null;
    if (typeof source.image === 'string' && source.image.length > 3 * 1024 * 1024) return null;
    if (Math.round(price * (100 - Math.min(99, Math.max(0, Number(source.discount) || 0))) / 100) < 1) return null;
    if (["featured","isNew","bestSeller"].some(k=>source[k]!==undefined&&typeof source[k]!=="boolean")) return null;
    const features = Array.isArray(source.features)
        ? source.features.slice(0,40).map((feature) => String(feature).trim().slice(0,300)).filter(Boolean)
        : [];

    return {
        featured:source.featured??false,isNew:source.isNew??false,bestSeller:source.bestSeller??false,
        id: String(id),
        name,
        price: Math.round(price),
        discount: Number.isSafeInteger(discountValue) ? discountValue : 0,
        stock: Number.isFinite(stockValue) ? Math.max(0, Math.floor(stockValue)) : 0,
        rating: Number.isFinite(ratingValue) ? Math.min(5, Math.max(0, ratingValue)) : 0,
        reviews: Number.isFinite(reviewsValue) ? Math.max(0, Math.floor(reviewsValue)) : 0,
        brand: asTrimmedString(source.brand, "WEB 2").slice(0,100),
        icon: /^fa-[a-z0-9-]+$/.test(source.icon || '') ? source.icon : 'fa-gamepad',
        accent: /^#[a-f0-9]{6}$/i.test(source.accent || '') ? source.accent : '#00d4ff',
        tag: asTrimmedString(source.tag, "جدید").slice(0,100),
        shortDescription: asTrimmedString(source.shortDescription || source.description).slice(0,300),
        description: asTrimmedString(source.description).slice(0,5000),
        features,
        guarantee: asTrimmedString(source.guarantee).slice(0,200),
        category: asTrimmedString(source.category, "Ù…Ø­ØµÙˆÙ„"),
        image: safeProductImage(source.image),
        status: source.status || "active",
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function validateProductPayload(body, existing = null, forcedId = undefined) {
    const product = normaliseProduct(body, existing, forcedId);
    if (!product) {
        const error = new Error("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù…Ø­ØµÙˆÙ„ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª");
        error.statusCode = 400;
        throw error;
    }
    return product;
}

function sendError(res, error, fallbackMessage) {
    const statusCode = error?.statusCode || error?.status || 500;
    if(error.retryAfter)res.set('Retry-After',String(error.retryAfter));
    if(statusCode>=500)logServerError(res.req,'product',error);
    if (res.headersSent) return;
    res.status(statusCode).json({
        error: statusCode >= 500 ? 'خطای سرور؛ دوباره تلاش کنید.' : repairMojibake(error.message || fallbackMessage)
    });
}
function logServerError(req,category,error){
    monitoring.error(req,error,error?.status||error?.statusCode||500);
}

function sendPage(fileName, res, next) {
    const filePath = path.join(STATIC_ROOT, fileName);
    if (!res.getHeader("Cache-Control")) res.set("Cache-Control", "no-cache");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.sendFile(filePath, (error) => {
        if (error) next(error);
    });
}

function sendProtectedAdminPage(_req, res, next) {
    res.set("Cache-Control", "no-store");
    res.vary('Cookie');
    res.set("Content-Type", "text/html; charset=utf-8");
    res.sendFile(path.join(STATIC_ROOT, "admin.html"), (error) => {
        if (error) next(error);
    });
}

const seo = require('./lib/seo.cjs').installSeo(app, {store, root:STATIC_ROOT});
const pageRoutes = {
    "/admin-login": "admin-login.html",
    "/admin-login.html": "admin-login.html",
    "/cart": "cart.html",
    "/cart.html": "cart.html",
    "/checkout": "checkout.html",
    "/checkout.html": "checkout.html",
    "/profile": "profile.html",
    "/profile.html": "profile.html"
};

Object.entries(pageRoutes).forEach(([route, fileName]) => {
    app.get(route, (_req, res, next) => sendPage(fileName, res, next));
});

// The dashboard document is never part of the public page map. Authentication,
// account activity and the ADMIN/SUPER_ADMIN role are checked before sendFile.
app.get("/admin", requireAdminSession, sendProtectedAdminPage);
app.get(["/admin.html", "/admin.htm", "/admin/index.html"], (_req, res) => res.status(404).end());

function getProducts(req, res) {
    try {
        const {collectionPage,respond}=require('./lib/listing.cjs');
        const admin=/^\/api\/admin\//i.test(req.path),q=String(req.query.q||'').trim().toLowerCase(),category=String(req.query.category||''),stock=String(req.query.stock||''),status=String(req.query.status||''),sort=String(req.query.sort||'newest'),view=String(req.query.view||'');
        if(q.length>120||category.length>80||!['','low','out','available'].includes(stock)||!['','active','inactive'].includes(status)||!['newest','oldest','name','stock_asc','stock_desc','popular','price_asc','price_desc','rating'].includes(sort)||!['','summary','full'].includes(view))return res.status(400).json({error:'فیلتر نامعتبر است.'});
        const result=store.search.products(req.query,{admin,q,category,stock,status,sort,view});
        result.items=result.items.map(publicProduct);
        return respond(req,res,result);
    } catch(error) {return sendError(res,error,'خطا در دریافت محصولات');}
}

function createProduct(req, res) {
    try {
        const product = store.transaction(() => {
            const products = readProducts();
            const product = validateProductPayload(req.body, null, getNextProductId(products));
            if (products.some(p => p.name === product.name)) throw Object.assign(new Error('نام محصول تکراری است.'), {statusCode:409});
            const saved=store.put('products',product,{insert:true});
            security.adminSecurity.audit(req.admin,'PRODUCT_CREATED','product',product.id);req.auditRecorded=true;
            return saved;
        });
        return res.status(201).type("application/json").json(product);
    } catch (error) {
        return sendError(res, error, "Ø®Ø·Ø§ Ø¯Ø± Ø°Ø®ÛŒØ±Ù‡ Ù…Ø­ØµÙˆÙ„");
    }
}

function updateProduct(req, res) {
    try {
        const updated=store.transaction(()=>{
        const products = readProducts();
        const index = products.findIndex(
            (product) => String(product && product.id) === String(req.params.id)
        );
        if (index < 0) {
            const notFound = new Error("Ù…Ø­ØµÙˆÙ„ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯");
            notFound.statusCode = 404;
            throw notFound;
        }

        const current = products[index];
        const updated = validateProductPayload(req.body, current, current.id);
        store.assertRevision(current,req.body.revision,true);
        if (products.some(p => String(p.id) !== String(current.id) && p.name === updated.name)) throw Object.assign(new Error('نام محصول تکراری است.'), {statusCode:409});
        const saved=store.put('products',updated);for(const [key,action]of [['price','PRODUCT_PRICE_CHANGED'],['stock','PRODUCT_STOCK_CHANGED']])if(current[key]!==updated[key])security.adminSecurity.audit(req.admin,action,'product',current.id,{previous:current[key],value:updated[key]});security.adminSecurity.audit(req.admin,'PRODUCT_UPDATED','product',current.id);req.auditRecorded=true;
        return saved;});
        return res.type("application/json").json(updated);
    } catch (error) {
        return sendError(res, error, "Ø®Ø·Ø§ Ø¯Ø± ÙˆÛŒØ±Ø§ÛŒØ´ Ù…Ø­ØµÙˆÙ„");
    }
}

function deleteProduct(req, res) {
    try {
        if(req.body?.confirm!==true||req.body?.confirmationPhrase!=='DELETE')throw Object.assign(new Error('برای حذف محصول، عبارت DELETE را وارد کنید.'),{statusCode:400});
        store.transaction(()=>{store.remove('products',req.params.id,{expectedRevision:req.body.revision,requireRevision:true});security.adminSecurity.audit(req.admin,'PRODUCT_DELETED','product',req.params.id);req.auditRecorded=true;});
        return res.status(204).end();
    } catch (error) {
        return sendError(res, error, "Ø®Ø·Ø§ Ø¯Ø± Ø­Ø°Ù Ù…Ø­ØµÙˆÙ„");
    }
}

function getProductById(req, res) {
    try {
        const product = store.get('products',req.params.id);
        if (!product || product.deletedAt || (product.status !== "active" && !/^\/api\/admin\//i.test(req.path))) {
            const notFound = new Error("Ù…Ø­ØµÙˆÙ„ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯");
            notFound.statusCode = 404;
            throw notFound;
        }
        return res.type("application/json").json(publicProduct(product));
    } catch (error) {
        return sendError(res, error, "Ø®Ø·Ø§ Ø¯Ø± Ø®ÙˆØ§Ù†Ø¯Ù† Ù…Ø­ØµÙˆÙ„");
    }
}

function publicProduct(product) {
    const allowed=['id','name','title','price','discount','stock','rating','reviews','brand','icon','accent','tag',
        'shortDescription','description','features','guarantee','category','image','status','featured','isNew',
        'bestSeller','createdAt','updatedAt','revision'];
    return Object.fromEntries(allowed.filter(key=>Object.hasOwn(product,key)).map(key=>[key,key==='image'?safeProductImage(product[key]):product[key]]));
}


/* â”€â”€ End of routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const RUN_PORT = PORT;
app.use('/api', (_req, res) => res.status(404).json({ error: 'مسیر API پیدا نشد.' }));
app.use((req,res,next)=>{
    res.set('X-Robots-Tag','noindex, nofollow');
    if (['GET','HEAD'].includes(req.method) && req.accepts('html')) return seo.notFound(req,res).catch(next);
    return res.status(404).json({error:'Not found.'});
});
app.use((error, req, res, next) => {
    res.set('X-Robots-Tag','noindex, nofollow');
    const status = error.status || error.statusCode || 500;
    monitoring.error(req,error,status);
    if (res.headersSent) return next(error);
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    const message = error.type === 'entity.parse.failed' ? 'بدنه JSON معتبر نیست.'
        : error.type === 'entity.too.large' ? 'حجم درخواست بیش از حد مجاز است.'
        : error.code || [403,404].includes(status)&&/ENOENT|stat |sendfile|Forbidden/i.test(error.message||'') ? 'Request could not be completed.'
        : status < 500 ? error.message : 'خطای سرور؛ دوباره تلاش کنید.';
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
});
const httpServer = app.listen(RUN_PORT, HOST, () => {
    operationalLog.write('server-started',{category:'startup'},value=>console.log(value));
}).on('error', (error) => {
    operationalLog.write('server-error',{level:'error',category:'startup',code:error.code});
    monitoring.stop();clearInterval(maintenance);
    store.close();
    process.exitCode = 1;
});
httpServer.requestTimeout=30000;
httpServer.headersTimeout=15000;
httpServer.keepAliveTimeout=5000;
httpServer.maxRequestsPerSocket=1000;
let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) return; shuttingDown = true;
    clearInterval(maintenance);
    monitoring.stop();
    operationalLog.write('shutdown',{category:'shutdown'});
    const force = setTimeout(() => process.exit(1), 10000); force.unref();
    httpServer.closeIdleConnections();
    httpServer.close(error => {
        try { store.close(); } catch {}
        clearTimeout(force);
        if (error) { operationalLog.write('server-error',{level:'error',category:'shutdown'}); process.exitCode = 1; }
    });
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

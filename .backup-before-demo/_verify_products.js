// ت_VAR verifying the getProducts() seeding/migration logic in isolation.
const STORE = new Map();
global.localStorage = {
    getItem: (k) => (STORE.has(k) ? STORE.get(k) : null),
    setItem: (k, v) => { STORE.set(k, String(v)); },
    removeItem: (k) => { STORE.delete(k); }
};
// document only needs addEventListener (so the trailing line doesn't throw);
// getElementById returns null so render fns early-return — we only test getProducts here.
global.document = {
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ set textContent(v){}, get innerHTML(){return "";} , set innerHTML(v){} }),
    body: { dataset: { page: "home" }, classList: { toggle(){}, add(){}, remove(){}, contains(){return false;} } }
};
global.window = { addEventListener: () => {}, setTimeout: (cb, t) => setTimeout(cb, t), innerWidth: 1280 };

const fs = require("fs");
let src = fs.readFileSync("script.js", "utf8");
// strip the DOMContentLoaded binding so initializeStore doesn't run during eval
src = src.replace(/document\.addEventListener\("DOMContentLoaded",\s*initializeStore\);?\s*$/m, "");

const vm = require("vm");
const ctx = { ...global, Intl, Date, Math, JSON, console, Number, String, Array, Object, Boolean, Error, encodeURIComponent, window: global.window, document: global.document, localStorage: global.localStorage };
vm.createContext(ctx);
vm.runInContext(src, ctx);

function scenario(name, setup) {
    STORE.clear();
    if (setup) setup();
    const before = STORE.get("gaming_store_products");
    const result = ctx.getProducts();
    console.log(`\n[${name}]`);
    console.log("  products.length =", result.length, "| first:", result[0] && result[0].name);
    console.log("  localStorage before:", before);
    console.log("  localStorage after :", STORE.get("gaming_store_products") ? `<${JSON.parse(STORE.get("gaming_store_products")).length} items>` : null);
}

scenario("fresh browser (empty localStorage)");
scenario("legacy key 'products' with old {image,specs} structure", () => {
    STORE.set("products", JSON.stringify([
        { id: 1, name: "Intel i7", price: 1000, image: "img/cpu.png", description: "cpu", specifications: { "هسته": "16" } },
        { id: 2, name: "RTX 4070", price: 2000, image: "img/gpu.png", description: "gpu", specs: { "VRAM": "12GB" } }
    ]));
});
scenario("corrupt non-empty array of garbage", () => {
    STORE.set("gaming_store_products", JSON.stringify([null, "junk", 42, {}]));
});
scenario("valid stored products", () => {
    STORE.set("gaming_store_products", JSON.stringify([
        { id: 100, name: "تست", price: 5000, icon: "fa-keyboard", brand: "X", stock: 3, rating: 5, reviews: 0, shortDescription: "d", description: "d", features: [], guarantee: "g", category: "c", tag: "t", accent: "#00d4ff" }
    ]));
});

console.log("\n✅ All scenarios returned a non-empty normalized product list.");

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
function store() {
    const data = new Map();
    const listeners = { document: {}, window: {} };
    const button = { innerHTML: 'افزودن', dataset: {}, disabled: false };
    const timers = new Map();
    let timerId = 0;
    const context = vm.createContext({
        console,
        localStorage: {
            getItem: key => data.get(key) ?? null,
            setItem: (key, value) => data.set(key, String(value)),
            removeItem: key => data.delete(key),
        },
        document: {
            addEventListener: (type, callback) => (listeners.document[type] ??= []).push(callback),
            getElementById: () => null,
            querySelector: selector => selector.startsWith('[data-add-to-cart') ? button : null,
            querySelectorAll: () => { button.dataset.addToCart = "1"; return [button]; },
        },
        window: {
            addEventListener: (type, callback) => (listeners.window[type] ??= []).push(callback),
            setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
            clearTimeout: id => timers.delete(id),
        },
    });
    const run = code => vm.runInContext(code, context);
    run(source);
    run(`products = [{id:'1', name:'A', price:100, stock:3}, {id:2, name:'B', price:250, stock:5}];
        getCurrentUser = () => ({name:'test'});
        showToast = () => {}; openAuthModal = () => {};
        uiUpdates = 0; actualRenderCheckout = renderCheckout; actualRenderCart = renderCart;
        updateCartCount = renderCart = renderCheckout = renderInvoiceReview = () => { uiUpdates++; };`);
    const json = code => JSON.parse(JSON.stringify(run(code)));
    return { data, listeners, button, timers, context, run, json };
}

test('add, stock limit, quantities, totals, removal and refresh agree', () => {
    const s = store();
    s.run('addToCart(1); addToCart("1"); addToCart(2)');
    assert.deepEqual(s.json('getCart()'), [{ id: '1', quantity: 2 }, { id: '2', quantity: 1 }]);
    assert.equal(s.run('getCartTotals().subtotal'), 450);
    assert.equal(s.run('getCartTotals().quantity'), 3);
    s.run('changeCartQuantity(1, 1); addToCart(1)');
    assert.equal(s.run('getCart()[0].quantity'), 3);
    s.run('changeCartQuantity(1, "-1")');
    assert.equal(s.run('getCart()[0].quantity'), 3);
    s.run('changeCartQuantity(1, -1); removeCartItem(2)');
    assert.equal(s.run('getCartTotals().price'), 200);
    const reloaded = store();
    for (const [key, value] of s.data) reloaded.data.set(key, value);
    assert.deepEqual(reloaded.json('getCart()'), [{ id: '1', quantity: 2 }]);
    s.run('changeCartQuantity(1, -1); changeCartQuantity(1, -1)');
    assert.deepEqual(s.json('getCart()'), []);
    assert.equal(s.data.get('web2_cart'), '[]');
    assert.equal(s.run('getCartTotals().price'), 0);
    assert.ok(s.run('uiUpdates') > 0);
});

test('invalid data, duplicate ids, fractional quantities and legacy migration', () => {
    const s = store();
    assert.deepEqual(s.json(`normalizeCart([null, {}, {id:99}, {id:1,quantity:0},
        {id:1,quantity:-1}, {id:1,quantity:'bad'}, {id:1,quantity:0.5},
        {id:1,quantity:1.9}, {id:'1',quantity:1}, {id:2}])`),
        [{ id: '1', quantity: 2 }, { id: '2', quantity: 1 }]);
    s.data.set('cart', JSON.stringify([{ id: '1', quantity: 2 }]));
    assert.equal(s.run('getCart()[0].quantity'), 2);
    assert.equal(s.data.has('cart'), false);
    assert.ok(s.data.has('web2_cart'));
    s.data.set('web2_cart', '{broken');
    assert.deepEqual(s.json('getCart()'), []);
    s.run('products[0].price = NaN; products[1].stock = Infinity');
    assert.deepEqual(s.json('normalizeCart([{id:1}, {id:2}])'), []);
});

test('discount uses current totals and stock changes clamp quantities', () => {
    const s = store();
    s.run('addToCart(1); addToCart(1); localStorage.setItem(DISCOUNT_KEY, DISCOUNT_CODE)');
    assert.equal(s.run('getCartTotals().price'), 180);
    s.run('products[0].stock = 1.5');
    assert.equal(s.run('getCartTotals().price'), 90);
    s.run('products[0].stock = 0');
    assert.equal(s.run('getCartTotals().price'), 0);
});

test('product discounts and fixed/percent coupon totals stay finite', () => {
    const s=store();
    s.run('products[0].discount=20; saveCart([{id:1,quantity:2}])');
    assert.equal(s.run('getCartTotals().subtotal'),160);
    s.data.set('web2_discount','FIXED');
    s.data.set('web2_discount_rule',JSON.stringify({code:'FIXED',type:'fixed',value:30}));
    assert.equal(s.run('getCartTotals().price'),130);
    s.data.set('web2_discount_rule',JSON.stringify({code:'FIXED',type:'fixed',value:3000}));
    assert.equal(s.run('getCartTotals().price'),0);
    s.data.set('web2_discount_rule','{broken');
    assert.equal(s.run('getCartTotals().price'),160);
});

test('one click handler and storage handler even after repeated setup', () => {
    const s = store();
    s.run('setupGlobalActions(); setupGlobalActions(); setupStorageSync(); setupStorageSync()');
    assert.equal(s.listeners.document.click.length, 1);
    assert.equal(s.listeners.window.storage.length, 1);
    s.listeners.window.storage[0]({ key: s.run('DISCOUNT_KEY') });
    assert.equal(s.run('uiUpdates'), 4);
    s.button.disabled = true;
    s.listeners.document.click[0]({ target: { closest: selector => selector === '[data-add-to-cart]' ? s.button : null } });
    assert.deepEqual(s.json('getCart()'), []);
});

test('rapid clicks restore button label and storage failures abort safely', () => {
    const s = store();
    s.run('addToCart(1); addToCart(1)');
    assert.equal(s.timers.size, 1);
    for (const callback of s.timers.values()) callback();
    assert.equal(s.button.innerHTML, 'افزودن');
    s.context.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    s.run('addToCart(2); removeCartItem(1)');
    assert.deepEqual(s.json('getCart()'), [{ id: '1', quantity: 2 }]);
});

test('empty checkout preserves the form and restores it when cart is refilled', () => {
    const s = store();
    const nodes = new Map();
    const node = () => ({ hidden: false, innerHTML: '', textContent: '', setAttribute() {} });
    for (const id of ['checkoutItems', 'checkoutContent', 'checkoutItemCount',
        'checkoutDiscountLine', 'checkoutDiscount', 'checkoutTotal', 'paymentAmount', 'paymentSuccess']) {
        nodes.set(id, node());
    }
    const content = nodes.get('checkoutContent');
    content.innerHTML = '<form>existing payment form</form>';
    content.before = element => nodes.set(element.id, element);
    nodes.get('paymentSuccess').hidden = true;
    s.context.document.getElementById = id => nodes.get(id) || null;
    s.context.document.createElement = node;
    s.run('actualRenderCheckout()');
    assert.equal(content.hidden, true);
    assert.equal(content.innerHTML, '<form>existing payment form</form>');
    assert.equal(nodes.get('emptyCheckoutCart').hidden, false);
    s.run('saveCart([{id:"1",quantity:2}]); actualRenderCheckout()');
    assert.equal(content.hidden, false);
    assert.equal(nodes.get('emptyCheckoutCart').hidden, true);
    assert.equal(nodes.get('checkoutItemCount').textContent, s.run('formatNumber(2)'));
    assert.equal(nodes.get('checkoutTotal').textContent, s.run('formatPrice(200)'));
    s.run('saveCart([]); actualRenderCheckout()');
    assert.equal(content.innerHTML, '<form>existing payment form</form>');
    assert.equal(content.hidden, true);
});

test('API failure keeps cached products and the saved cart without a fallback', async () => {
    const s = store();
    s.run('saveCart([{id:1,quantity:2}])');
    s.context.fetch = async () => { throw new Error('offline'); };
    await s.run('loadProductsFromApi()');
    assert.deepEqual(s.json('getCart()'), [{id:"1",quantity:2}]);
    assert.equal(s.run('getCartTotals().subtotal'), 200);
});

test('invalid stock does not create available inventory', () => {
    const s = store();
    for (const stock of [undefined, -1, 'broken', Infinity]) {
        s.context.invalidStock = stock;
        assert.equal(s.run('normalizeProduct({id:1,price:100,stock:invalidStock}).stock'), 0);
    }
    assert.equal(s.run('normalizeProduct({id:1,price:100,stock:1.5}).stock'), 1);
});

test('delegated quantity and remove clicks run once and checkout keeps its destination', () => {
    const s = store();
    s.run('setupGlobalActions(); setupGlobalActions(); saveCart([{id:1,quantity:1}])');
    let prevented = false;
    const click = (selector, button) => s.listeners.document.click[0]({
        target: {closest: value => value === selector ? button : null},
        preventDefault: () => { prevented = true; }
    });
    click('[data-cart-action]', {dataset:{productId:'1',cartAction:'increase'}});
    assert.equal(s.run('getCart()[0].quantity'), 2);
    click('[data-cart-action]', {dataset:{productId:'1',cartAction:'decrease'}});
    assert.equal(s.run('getCart()[0].quantity'), 1);
    click('[data-cart-action]', {dataset:{productId:'1',cartAction:'remove'}});
    assert.deepEqual(s.json('getCart()'), []);
    prevented = false;
    click('#checkoutBtn', {});
    assert.equal(prevented, false);
    assert.match(fs.readFileSync(path.join(__dirname,'../cart.html'),'utf8'), /id="checkoutBtn" href="checkout.html"/);
    s.run('getCurrentUser = () => null');
    click('#checkoutBtn', {});
    assert.equal(prevented, true);
});

test('cart display, badge, WEB2 and checkout show the same quantity and total', async () => {
    const s = store();
    const nodes = new Map();
    const node = () => ({hidden:false,innerHTML:'',textContent:'',setAttribute(){}});
    for (const id of ['cartItems','emptyCart','cartSummary','totalItems','subtotalPrice',
        'discountLine','discountAmount','totalPrice','checkoutItems','checkoutContent',
        'checkoutItemCount','checkoutDiscountLine','checkoutDiscount','checkoutTotal','paymentAmount',
        'discountForm','discountCode','discountHint']) nodes.set(id,node());
    s.context.document.getElementById = id => nodes.get(id) || null;
    s.context.document.createElement = node;
    s.run('escapeHTML = value => String(value); saveCart([{id:1,quantity:2},{id:2,quantity:1}]); actualRenderCart()');
    assert.equal(nodes.get('emptyCart').hidden,true);
    assert.equal(nodes.get('subtotalPrice').textContent,s.run('formatPrice(450)'));
    const form = nodes.get('discountForm');
    form.dataset = {};
    let submit;
    form.addEventListener = (type, fn) => { submit = fn; };
    nodes.get('discountHint').classList = {add(){},remove(){}};
    nodes.get('discountCode').value = ' web2 ';
    s.context.fetch = async () => ({ok:true,json:async()=>({discountCode:'WEB2',discountType:'percent',discountValue:10})});
    s.run('Web2={request:async(url,options)=>(await fetch(url,options)).json()};');
    s.run('setupDiscountForm(); setupDiscountForm()');
    await submit({preventDefault(){}});
    s.run('actualRenderCart(); actualRenderCheckout()');
    assert.equal(nodes.get('totalPrice').textContent,s.run('formatPrice(405)'));
    assert.equal(nodes.get('checkoutTotal').textContent,nodes.get('totalPrice').textContent);
    assert.equal(nodes.get('checkoutItemCount').textContent,nodes.get('totalItems').textContent);
    s.run('saveCart([]); actualRenderCart()');
    assert.equal(nodes.get('emptyCart').hidden,false);
    assert.equal(nodes.get('cartSummary').hidden,true);
});

// Server validation is exercised via real HTTP in commerce.test.cjs.

test('expanded catalog renders, filters, sorts and supports all new product purchases', async () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname,'../data.json'),'utf8')).products;
    const added = catalog.filter(p=>p.id>=10);
    assert.equal(catalog.length,69);
    assert.equal(added.length,60);
    assert.equal(new Set(catalog.map(p=>p.id)).size,69);
    assert.equal(new Set(catalog.map(p=>p.name)).size,69);
    assert.equal(new Set(added.map(p=>p.reviews)).size,60);
    for(const p of added) {
        assert.ok(p.features.length>=5 && p.stock>0 && p.price>0 && p.rating>=4 && p.rating<=5);
        for(const key of ['name','brand','icon','accent','tag','shortDescription','description','guarantee','category']) assert.ok(p[key]);
    }
    const s=store();
    s.context.catalog=catalog;
    s.context.URLSearchParams=URLSearchParams;
    s.run('products=mergeProducts(catalog); productsLoaded=true; productsSource="api"; escapeHTML=value=>String(value)');
    const nodes=new Map();
    for(const id of ['productSearch','categoryFilter','priceFilter','productSort','productGrid','categoryGrid','featuredGrid','productDetail'])
        nodes.set(id,{value:id==='productSearch'?'':'all',innerHTML:'',setAttribute(){}});
    s.context.document.getElementById=id=>nodes.get(id)||null;
    s.run('renderProducts(); renderHomeDiscovery()');
    assert.equal((nodes.get('productGrid').innerHTML.match(/class="product-card"/g)||[]).length,69);
    assert.equal((nodes.get('featuredGrid').innerHTML.match(/product-card-compact/g)||[]).length,4);
    for(const category of new Set(added.map(p=>p.category))) {
        assert.ok(nodes.get('categoryFilter').innerHTML.includes(category));
        nodes.get('categoryFilter').value=category;
        assert.ok(s.json('getFilteredProducts()').every(p=>p.category===category));
    }
    nodes.get('categoryFilter').value='all';
    for(const p of added) {
        nodes.get('productSearch').value=p.name;
        assert.equal(s.json('getFilteredProducts()')[0].id,String(p.id));
        s.context.window.location={search:`?id=${p.id}`};
        s.run('renderProductDetail()');
        assert.ok(nodes.get('productDetail').innerHTML.includes(`data-add-to-cart="${p.id}"`));
        s.run(`saveCart([]); addToCart(${p.id}); changeCartQuantity(${p.id},1)`);
        assert.equal(s.run('getCartTotals().subtotal'),p.price*2);
    }
    nodes.get('productSearch').value='';
    for(const [range,predicate] of [['under-3',p=>p.price<3000000],['3-6',p=>p.price>=3000000&&p.price<=6000000],['over-6',p=>p.price>6000000]]) {
        nodes.get('priceFilter').value=range;
        const found=s.json('getFilteredProducts()');
        assert.ok(found.length && found.every(predicate));
    }
    nodes.get('priceFilter').value='all';
    for(const sort of ['price-asc','price-desc','rating','popular']) {
        nodes.get('productSort').value=sort;
        const found=s.json('getFilteredProducts()');
        const score=p=>sort==='rating'?p.rating:sort==='popular'?p.reviews+p.rating*40:p.price;
        assert.ok(found.every((p,i)=>i===0 || (sort==='price-asc'?score(found[i-1])<=score(p):score(found[i-1])>=score(p))));
    }
    const fresh=store();
    fresh.run('products=[]');
    assert.equal(fresh.run('getProducts().length'),68);
    fresh.context.fetch=async()=>({ok:true,json:async()=>catalog});
    await fresh.run('loadProductsFromApi()');
    assert.equal(fresh.run('getProducts().length'),69);
    assert.equal(fresh.json('defaultProducts.filter(p=>p.id>=10)').length,60);
});

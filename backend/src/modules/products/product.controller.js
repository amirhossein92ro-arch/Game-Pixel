const productService = require("./product.service");

// GET /api/products — جست‌وجو/فیلتر/مرتب‌سازی/صفحه‌بندی
async function list(req, res, next) {
  try {
    res.json(await productService.getProducts(req.query));
  } catch (e) { next(e); }
}

// GET /api/products/:id
async function getOne(req, res, next) {
  try {
    res.json(await productService.getProductById(req.params.id));
  } catch (e) { next(e); }
}

// POST /api/products (admin)
async function create(req, res, next) {
  try {
    res.status(201).json(await productService.createProduct(req.body));
  } catch (e) { next(e); }
}

// PUT /api/products/:id (admin)
async function update(req, res, next) {
  try {
    res.json(await productService.updateProduct(req.params.id, req.body));
  } catch (e) { next(e); }
}

// DELETE /api/products/:id (admin)
async function remove(req, res, next) {
  try {
    res.json(await productService.deleteProduct(req.params.id));
  } catch (e) { next(e); }
}

module.exports = { list, getOne, create, update, remove };

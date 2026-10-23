const Product = require("./product.model");
const { createError } = require("../../middleware/error.middleware");

// ساخت slug یکتا و مناسب URL از روی متن.
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/[^\w؀-ۿ\s-]/g, "") // حروف، اعداد، فارسی، فاصله و خط‌تیره نگه داشته شود
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

// اطمینان از یکتا بودن slug با افزودن شمارنده در صورت تداخل.
async function makeUniqueSlug(base) {
  const slug = slugify(base) || "product";
  let candidate = slug;
  let counter = 1;
  while (await Product.exists({ slug: candidate })) {
    candidate = `${slug}-${counter++}`;
  }
  return candidate;
}

// ساخت محصول (فقط ادمین).
async function createProduct(data) {
  const payload = require('../../utils/input').product(data);
  payload.slug = data.slug ? await makeUniqueSlug(data.slug) : await makeUniqueSlug(data.title || "product");
  return Product.create(payload);
}

// به‌روزرسانی محصول (slug تغییر نمی‌کند تا URLها پایدار بمانند).
async function updateProduct(id, data) {
  const current=await Product.findById(require('../../utils/input').id(id));
  if(!current)throw createError(404,'محصول پیدا نشد.');
  const payload=require('../../utils/input').product(data,current);
  delete payload.slug;
  const product = await Product.findByIdAndUpdate(id, {$set:payload}, { new: true, runValidators: true });
  if (!product) throw createError(404, "محصول پیدا نشد.");
  return product;
}

async function deleteProduct(id) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw createError(404, "محصول پیدا نشد.");
  return product;
}

async function getProductById(id) {
  const product = await Product.findById(id);
  if (!product) throw createError(404, "محصول پیدا نشد.");
  return product;
}

// فهرست محصولات با جست‌وجو، فیلتر دسته/پلتفرم و مرتب‌سازی قیمت.
async function getProducts(query) {
  const input=require('../../utils/input');require('../../../../lib/request-security.cjs').query(query);
  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.platform) filter.platform = query.platform;
  if (query.featured === "true") filter.isFeatured = true;
  if (query.search) {
    filter.$or = [
      { title: { $regex: input.escapeRegex(query.search), $options: "i" } },
      { description: { $regex: input.escapeRegex(query.search), $options: "i" } }
    ];
  }

  const sortMap = {
    "price-asc": { price: 1 },
    "price-desc": { price: -1 },
    newest: { createdAt: -1 }
  };
  if(query.sort!==undefined&&!Object.hasOwn(sortMap,query.sort))throw createError(400,'Invalid sort.');
  const sort = sortMap[query.sort] || { createdAt: -1 };

  const {page,limit}=input.pagination(query);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit),
    Product.countDocuments(filter)
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) };
}

module.exports = { createProduct, updateProduct, deleteProduct, getProductById, getProducts };

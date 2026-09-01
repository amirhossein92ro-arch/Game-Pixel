const fs = require("fs");
const data = JSON.parse(fs.readFileSync("E:\\web 2\\data.json", "utf-8"));
const products = data.products;
const lines = ["const defaultProducts = ["];
for (const p of products) {
  lines.push("    {");
  lines.push('        id: ' + p.id + ",");
  lines.push('        name: "' + p.name + '",');
  lines.push('        brand: "' + p.brand + '",');
  lines.push('        icon: "' + p.icon + '",');
  lines.push('        accent: "' + p.accent + '",');
  lines.push('        tag: "' + p.tag + '",');
  lines.push('        price: ' + p.price + ",");
  lines.push('        stock: ' + p.stock + ",");
  lines.push('        rating: ' + p.rating + ",");
  lines.push('        reviews: ' + p.reviews + ",");
  lines.push('        shortDescription: "' + p.shortDescription + '",');
  const desc = p.description.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  lines.push('        description: "' + desc + '",');
  lines.push('        features: ' + JSON.stringify(p.features) + ",");
  lines.push('        guarantee: "' + p.guarantee + '",');
  lines.push('        category: "' + p.category + '"');
  lines.push("    },");
}
lines.push("];");
fs.writeFileSync("E:\\web 2\\_defaultProducts.js", lines.join("\n"), "utf-8");
console.log("Generated " + products.length + " products");

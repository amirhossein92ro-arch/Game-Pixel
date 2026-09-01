const fs = require("fs");
const buf = fs.readFileSync("E:\\web 2\\script.js");
const search = 'name: String(item.name ?? item.title ?? "';
const idx = buf.indexOf(search);
if (idx >= 0) {
  const snippet = buf.slice(idx, idx + 80);
  console.log("Bytes:", Array.from(snippet).map(b => b.toString(16).padStart(2,"0")).join(" "));
  console.log("Text:", snippet.toString("utf-8"));
} else {
  console.log("Not found");
}

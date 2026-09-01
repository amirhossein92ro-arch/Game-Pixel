const fs = require("fs");
const path = "E:\\web 2\\checkout.html";
let html = fs.readFileSync(path, "utf-8");

// We will replace the entire body content after <main>
// Let me write the complete new file

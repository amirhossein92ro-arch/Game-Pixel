const fs = require("fs");
// Read the file as buffer
const buf = fs.readFileSync("E:\\web 2\\script.js");
// Decode as Latin-1 (ISO-8859-1)
const latin1Text = Buffer.from(buf).toString("latin1");
// Write back as UTF-8
fs.writeFileSync("E:\\web 2\\script.js", latin1Text, "utf-8");
console.log("File converted!");

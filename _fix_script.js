const fs = require("fs");
const scriptPath = "E:\\web 2\\script.js";
const defaultProductsPath = "E:\\web 2\\_defaultProducts.js";

let script = fs.readFileSync(scriptPath, "utf-8");
const defaultProducts = fs.readFileSync(defaultProductsPath, "utf-8");

// Find the defaultProducts array boundaries
const startMarker = "const defaultProducts = [";
const startIdx = script.indexOf(startMarker);
if (startIdx === -1) { console.log("ERROR: start marker not found"); process.exit(1); }

// Find ]; that ends the array, searching from after the start
const searchFrom = startIdx + startMarker.length;
const afterStart = script.substring(searchFrom);
const endIdxRel = afterStart.indexOf("];");
if (endIdxRel === -1) { console.log("ERROR: end marker not found"); process.exit(1); }

const endIdx = searchFrom + endIdxRel + 2; // include ];

// Replace the array
const before = script.substring(0, startIdx);
const after = script.substring(endIdx);
script = before + defaultProducts + "\n" + after;

// Fix normalizeProduct defaults
script = script.replace(
  'name: String(item.name ?? item.title ?? "\u00D9\u0085\u00D8\u00AD\u00D8\u00B5\u00D9\u0088\u00D9\u0084 \u00D8\u00A8\u00D8\u00AF\u00D9\u0088\u00D9\u0086 \u00D9\u0086\u00D8\u00A7\u00D9\u0085").trim()',
  'name: String(item.name ?? item.title ?? "\u0645\u062D\u0635\u0648\u0644 \u0628\u062F\u0648\u0646 \u0646\u0627\u0645").trim()'
);

script = script.replace(
  'String(item.tag ?? "\u00D9\u0085\u00D8\u00AD\u00D8\u00B5\u00D9\u0088\u00D9\u0084").trim()',
  'String(item.tag ?? "\u0645\u062D\u0635\u0648\u0644").trim()'
);

script = script.replace(
  'String(item.guarantee ?? "\u00DA\u00AF\u00D8\u00A7\u00D8\u00B1\u00D8\u00A7\u00D9\u0086\u00D8\u00AA\u00DB\u008C \u00D9\u0081\u00D8\u00B1\u00D9\u0088\u00D8\u00B4\u00DA\u00AF\u00D8\u00A7\u00D9\u0087").trim()',
  'String(item.guarantee ?? "\u06AF\u0627\u0631\u0627\u0646\u062A\u06CC \u0641\u0631\u0648\u0634\u06AF\u0627\u0647").trim()'
);

script = script.replace(
  'String(item.category ?? "\u00D9\u0085\u00D8\u00AD\u00D8\u00B5\u00D9\u0088\u00D9\u0084").trim()',
  'String(item.category ?? "\u0645\u062D\u0635\u0648\u0644").trim()'
);

// Fix updateCartCount aria-label
script = script.replace(
  'counter.setAttribute("aria-label", `${formatNumber(quantity)} \u00DA\u00A9\u00D8\u00A7\u00D9\u0084\u00D8\u00A7 \u00D8\u00AF\u00D8\u00B1 \u00D8\u00B3\u00D8\u00A8\u00D8\u00AF \u00D8\u00AE\u00D8\u00B1\u00DB\u008C\u00D8\u00AF`);',
  'counter.setAttribute("aria-label", `${formatNumber(quantity)} \u06A9\u0627\u0644\u0627 \u062F\u0631 \u0633\u0628\u062F \u062E\u0631\u06CC\u062F`);'
);

// Fix new product creation defaults
script = script.replace(
  'tag: "\u00D8\u00AC\u00D8\u00AF\u00DB\u008C\u00D8\u00AF"',
  'tag: "\u062C\u062F\u06CC\u062F"'
);

// Fix features array - need to find the exact corrupted string
// The corrupted features: ["\u00D9...", "\u00D9..."]
// Using a regex approach to find and fix
const corruptedFeatures = /features: \["[\u00D9\u00DA\u00DB\u00DC\u00DD\u00DE\u00DF\u00E0\u00E1\u00E2\u00E3\u00E4\u00E5\u00E6\u00E7\u00E8\u00E9\u00EA\u00EB\u00EC\u00ED\u00EE\u00EF\u00F0\u00F1\u00F2\u00F3\u00F4\u00F5\u00F6\u00F7\u00F8\u00F9\u00FA\u00FB\u00FC\u00FD\u00FE\u00FF]+"[^\]]*\]/;
// Simpler approach: use the specific string
script = script.replace(
  'features: ["\u00D9\u0085\u00D8\u00AD\u00D8\u00B5\u00D9\u0088\u00D9\u0084 \u00D8\u00A7\u00D9\u0081\u00D8\u00B2\u00D9\u0088\u00D8\u00AF\u00D9\u0087\u00E2\u0080\u008C\u00D8\u00B4\u00D8\u00AF\u00D9\u0087 \u00D8\u00AA\u00D9\u0088\u00D8\u00B3\u00D8\u00B7 \u00D9\u0085\u00D8\u00AF\u00DB\u008C\u00D8\u00B1\u00DB\u008C\u00D8\u00AA", "\u00D9\u0085\u00D9\u0088\u00D8\u00AC\u00D9\u0088\u00D8\u00AF \u00D9\u0088 \u0622\u0645\u0627\u062F\u0647 \u00D8\u00B3\u00D9\u0081\u00D8\u00A7\u00D8\u00B1\u00D8\u00B4"]',
  'features: ["\u0645\u062D\u0635\u0648\u0644 \u0627\u0641\u0632\u0648\u062F\u0647\u200C\u0634\u062F\u0647 \u062A\u0648\u0633\u0637 \u0645\u062F\u06CC\u0631\u06CC\u062A", "\u0645\u0648\u062C\u0648\u062F \u0648 \u0622\u0645\u0627\u062F\u0647 \u0633\u0641\u0627\u0631\u0634"]'
);

script = script.replace(
  'guarantee: "\u00D8\u00B6\u00D9\u0085\u00D8\u00A7\u00D9\u0086\u00D8\u00AA \u00D9\u0081\u00D8\u00B1\u00D9\u0088\u00D8\u00B4\u00DA\u00AF\u00D8\u00A7\u00D9\u0087"',
  'guarantee: "\u0636\u0645\u0627\u0646\u062A \u0641\u0631\u0648\u0634\u06AF\u0627\u0647"'
);

// Fix the comment before normalizeProduct
script = script.replace(
  "// \u00D8\u00B3\u00D8\u00A7\u00D8\u00AE\u00D8\u00AA\u00D8\u00A7\u00D8\u00B1 \u00DB\u008C\u00DA\u00A9\u00D9\u0086\u00D9\u0088\u00D8\u00A7\u00D8\u00AE\u00D8\u00AA \u00D9\u0085\u00D8\u00AD\u00D8\u00B5\u00D9\u0088\u00D9\u0084: \u00D9\u0087\u00D8\u00B1 \u00D8\u00B1\u00DA\u00A9\u00D9\u0088\u00D8\u00B1\u00D8\u00AF (\u00D8\u00AD\u00D8\u00AA\u00DB\u008C \u00D8\u00A8\u00D8\u00A7 \u00D8\u00B3\u00D8\u00A7\u00D8\u00AE\u00D8\u00AA\u00D8\u00A7\u00D8\u00B1 \u00D9\u0082\u00D8\u00AF\u00DB\u008C\u00D9\u0085\u00DB\u008C) \u00D8\u00B1\u00D8\u00A7 \u00D8\u00A8\u00D9\u0087 \u00D8\u00B4\u00DA\u00A9\u00D9\u0084 \u00D8\u00A7\u00D8\u00B3\u00D8\u00AA\u00D8\u00A7\u00D9\u0086\u00D8\u00AF\u00D8\u00A7\u00D8\u00B1\u00D8\u00AF \u00D8\u00AA\u00D8\u00A8\u00D8\u00AF\u00DB\u008C\u00D9\u0084 \u00D9\u0085\u00DB\u008C\u00E2\u0080\u008C\u00DA\u00A9\u00D9\u0086\u00D8\u00AF.",
  "// \u0633\u0627\u062E\u062A\u0627\u0631 \u06CC\u06A9\u0646\u0648\u0627\u062E\u062A \u0645\u062D\u0635\u0648\u0644: \u0647\u0631 \u0631\u06A9\u0648\u0631\u062F (\u062D\u062A\u06CC \u0628\u0627 \u0633\u0627\u062E\u062A\u0627\u0631 \u0642\u062F\u06CC\u0645\u06CC) \u0631\u0627 \u0628\u0647 \u0634\u06A9\u0644 \u0627\u0633\u062A\u0627\u0646\u062F\u0627\u0631\u062F \u062A\u0628\u062F\u06CC\u0644 \u0645\u06CC\u200C\u06A9\u0646\u062F."
);

fs.writeFileSync(scriptPath, script, "utf-8");
console.log("Done! File updated successfully.");

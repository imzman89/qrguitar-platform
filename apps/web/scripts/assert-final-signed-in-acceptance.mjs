import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const globalCss = read("app/globals.css");
const printSuite = read("app/handout/[code]/page.tsx");
const printModule = read("app/handout/[code]/print-suite.module.css");

const handoutPrintRule = globalCss.match(
  /\.handout-shell\[data-print-mode="handout"\] \.print-kit--handout \{([\s\S]*?)\n  \}/
);
assert(handoutPrintRule, "Profile Sheet print geometry is missing.");

const heightMatch = handoutPrintRule[1].match(/height:\s*([\d.]+)in\s*!important/);
assert(heightMatch, "Profile Sheet print height is not defined in physical units.");
const handoutHeight = Number(heightMatch[1]);
assert(handoutHeight <= 9, "Profile Sheet exceeds a printer-safe one-page Letter area.");
assert(handoutPrintRule[1].includes(`min-height: ${handoutHeight}in !important`), "Profile Sheet minimum height must match its print height.");
assert(handoutPrintRule[1].includes(`max-height: ${handoutHeight}in !important`), "Profile Sheet maximum height must match its print height.");
assert(handoutPrintRule[1].includes("box-sizing: border-box"), "Profile Sheet borders must remain inside its physical page height.");
assert(handoutPrintRule[1].includes("overflow: hidden !important"), "Profile Sheet must contain print-only overflow.");
assert(handoutPrintRule[1].includes("position: relative !important"), "Profile Sheet must contain its physical page content.");

const darkProfileRule = globalCss.match(
  /\.handout-shell\[data-print-theme="dark"\]\[data-print-mode="handout"\] \.print-kit-profile\.has-photo \{([\s\S]*?)\n  \}/
);
assert(darkProfileRule, "Dark Profile Sheet photo geometry is missing.");
const photoHeightMatch = darkProfileRule[1].match(/height:\s*([\d.]+)in/);
assert(photoHeightMatch && Number(photoHeightMatch[1]) <= 4.3, "Profile Sheet photo stage leaves no room for its QR, handoff, and footer.");
assert(
  globalCss.includes('.handout-shell[data-print-mode="handout"] .print-kit-footer {\n    display: none !important;'),
  "The redundant Profile Sheet footer must not create a second printed page."
);

assert(globalCss.includes('.handout-shell .print-kit {\n    display: none !important;'), "Inactive print formats must be removed from pagination.");
assert(globalCss.includes("page-break-inside: avoid"), "Print documents must avoid accidental page splitting.");
assert(printSuite.includes('margin: ${printSize === "compact" ? "0" : "0.3in"}'), "Print page margins must remain format-aware.");
assert(printSuite.includes("window.print()"), "Print Suite must use native browser printing.");
assert(printModule.includes("min-height: 0 !important"), "Print preview wrappers must not preserve screen minimum heights while printing.");
assert(printModule.includes("aspect-ratio: auto !important"), "Print preview wrappers must not preserve screen paper ratios while printing.");
assert(globalCss.includes('.handout-shell[data-print-mode="service"] .print-kit--service {\n    height: auto !important;\n    min-height: 0 !important;'), "Service Summary must not force a second printed page.");
assert(globalCss.includes('.handout-shell[data-print-mode="service"] .print-service-work {\n    flex: none;'), "Service Summary must not insert a print-only flex spacer.");

console.log(`Final signed-in print acceptance assertions passed at ${handoutHeight}in.`);

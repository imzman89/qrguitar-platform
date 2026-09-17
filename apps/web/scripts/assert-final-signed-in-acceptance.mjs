import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const page = read("app/handout/[code]/page.tsx");
const documentCss = read("app/handout/[code]/print-document.module.css");
const workspaceCss = read("app/handout/[code]/print-suite.module.css");

execFileSync(process.execPath, ["--test", "--test-reporter=dot", "scripts/test-print-layout.mjs", "scripts/test-handout-load.mjs"], { cwd: root, stdio: "inherit" });
assert(documentCss.includes("--print-content-height"), "The printable document must share physical dimensions with its preview.");
assert(documentCss.includes("page-break-inside: avoid"), "Print documents must avoid accidental page splitting.");
assert(page.includes("margin: ${geometry.margin}in"), "Page margins must use the selected paper geometry.");
assert(page.includes("window.print()"), "Print Suite must use native browser printing.");
assert(page.includes("disabled={!readyToPrint || printing}"), "Incomplete or overflowing pages must not be submitted to Print.");
assert(workspaceCss.includes("transform: none !important"), "Screen zoom must not affect actual print size.");
assert(workspaceCss.includes("overflow: visible !important"), "Printable content must not silently clip.");
assert(workspaceCss.includes("min-height: 0 !important"), "Screen wrapper heights must not generate extra print pages.");
console.log("Print renderer, geometry, privacy and loading checks passed. Native print-preview acceptance is a separate browser check.");

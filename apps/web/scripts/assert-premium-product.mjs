import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => readFile(path.join(root, filePath), "utf8");
const ok = (value, message) => { if (!value) throw new Error(message); };

const [drawer, dashboard, claims, transfers, transferPage, packageJson] = await Promise.all([
  "components/ActionDrawer.tsx",
  "app/dashboard/page.tsx",
  "app/ownership-claim/page.tsx",
  "app/api/transfers/route.ts",
  "app/transfer/[id]/page.tsx",
  "package.json"
].map(read));

ok(drawer.includes("createPortal") && drawer.includes("Escape") && drawer.includes("returnFocusTo?.focus()"), "Action drawer focus, Escape, or focus-return behavior is missing");
ok(drawer.includes('role="dialog"') && drawer.includes('aria-modal="true"'), "Action drawer dialog semantics are missing");
ok(dashboard.includes("Prepare for Buyer") && dashboard.includes("Private buyer code") && dashboard.includes("Resend Sign-in Email"), "Seller buyer-handoff controls are incomplete");
ok(dashboard.includes("Order or receipt reference (optional)") && dashboard.includes("one-way check"), "Optional private order-reference guidance is missing");
ok(claims.includes("Ownership Claim Center") && claims.includes("redeem_code") && claims.includes("orderReference: buyerOrderReference"), "Claim Center buyer-code acceptance is incomplete");
ok(transfers.includes("randomBytes") && transfers.includes("purchaser_code_hash") && transfers.includes("hashBuyerCode"), "Buyer codes are not generated and stored as one-way hashes");
ok(transfers.includes("claim_token_hash") && transfers.includes("hashOrderReference") && transfers.includes("orderReferenceRequired"), "Private order/reference verification is missing");
execFileSync(process.execPath, [path.join(root, "scripts/test-atomic-transfer-db.mjs")], { stdio: "inherit" });
ok(!/buyerCode\s*:\s*row\./.test(transfers) && !/purchaser_code_hash\s*:\s*row\./.test(transfers) && !/claim_token_hash\s*:\s*row\./.test(transfers), "A private code or hash is mapped into an API response");
ok(packageJson.includes('"test:premium-product"'), "Premium product test script is not registered");

const base = process.env.QRGUITAR_TEST_BASE_URL || "http://127.0.0.1:3003";
for (const route of ["/", "/dashboard", "/ownership-claim", "/account", "/catalog", "/how-it-works"]) {
  const response = await fetch(`${base}${route}`, { redirect: "manual", headers: { "cache-control": "no-cache" } });
  ok(response.status >= 200 && response.status < 400, `${route} returned ${response.status}`);
}

console.log("Premium product experience assertions passed.");

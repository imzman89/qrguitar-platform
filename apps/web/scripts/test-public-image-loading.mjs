import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const read = (relativePath) => fs.readFileSync(path.join(root, "apps/web", relativePath), "utf8");

const card = read("components/CollectibleRecordCard.tsx");
const catalog = read("app/catalog/CatalogClient.tsx");
const homepage = read("components/HomePageClient.tsx");
const showcase = read("components/HomeProfileShowcase.tsx");

function compileCard() {
  const module = { exports: {} };
  const code = ts.transpileModule(card, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText;
  const Icon = () => null;
  const Link = ({ children, ...props }) => React.createElement("a", props, children);
  const overrides = {
    "lucide-react": { ArrowRight: Icon, Camera: Icon, ChevronLeft: Icon, ChevronRight: Icon, FileText: Icon, Globe2: Icon, Hash: Icon },
    "next/link": { __esModule: true, default: Link },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "../lib/collectible-card": {
      resolveCollectibleCard: () => ({
        images: ["/lead.jpg", "/detail.jpg"], title: "Test Profile", profileUrl: "/i/TEST",
        code: "TEST", summary: "", factLine: "", publicSerial: "", photoCount: 2,
        publicDocumentCount: 0, collection: null
      })
    },
    "./ProfileStatusBadges": { ProfileStatusBadges: () => null },
    "./RecordShareButton": { RecordShareButton: () => null }
  };
  new Function("require", "module", "exports", code)(
    (name) => overrides[name] || require(name), module, module.exports
  );
  return module.exports.CollectibleRecordCard;
}

test("shared Profile cards are lazy by default and prioritize only an explicitly selected lead photo", () => {
  assert.match(card, /prioritizeLeadImage\?: boolean/);
  assert.match(card, /prioritizeLeadImage = false/);
  assert.match(card, /loading=\{prioritizeLeadImage && index === 0 \? "eager" : "lazy"\}/);
  assert.match(card, /fetchPriority=\{prioritizeLeadImage && index === 0 \? "high" : "low"\}/);
  assert.match(card, /width=\{1200\}[\s\S]*height=\{900\}/);
  assert.doesNotMatch(card, /loading=\{index === 0 \? "eager" : "lazy"\}/);
});

test("rendered card markup emits one high-priority lead only when the page opts in", () => {
  const CollectibleRecordCard = compileCard();
  const record = { qrCode: "TEST" };
  const prioritized = renderToStaticMarkup(React.createElement(CollectibleRecordCard, { record, prioritizeLeadImage: true }));
  const deferred = renderToStaticMarkup(React.createElement(CollectibleRecordCard, { record }));
  const prioritizedImages = [...prioritized.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  const deferredImages = [...deferred.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(prioritizedImages.length, 2);
  assert.match(prioritizedImages[0], /loading="eager"/);
  assert.match(prioritizedImages[0], /fetchPriority="high"/);
  assert.match(prioritizedImages[1], /loading="lazy"/);
  assert.match(prioritizedImages[1], /fetchPriority="low"/);
  assert.ok(deferredImages.every((image) => image.includes('loading="lazy"') && image.includes('fetchPriority="low"')));
  assert.ok(deferredImages.every((image) => image.includes('width="1200" height="900"')));
});

test("Catalog grants high priority to exactly the first visible Profile card", () => {
  assert.match(catalog, /visibleRecords\.map\(\(record, index\) =>/);
  assert.match(catalog, /prioritizeLeadImage=\{index === 0\}/);
  assert.equal((catalog.match(/prioritizeLeadImage=/g) || []).length, 1);
});

test("Homepage keeps only its above-the-fold showcase eager and defers supporting media", () => {
  assert.match(showcase, /loading="eager" fetchPriority="high" decoding="async" width=\{1200\} height=\{900\}/);
  assert.match(showcase, /loading="lazy" fetchPriority="low" decoding="async" width=\{92\} height=\{92\}/);
  assert.equal((showcase.match(/fetchPriority="high"/g) || []).length, 1);
  assert.match(homepage, /loading="lazy" fetchPriority="low" decoding="async" width=\{1200\} height=\{900\}/);
  assert.doesNotMatch(homepage, /prioritizeLeadImage/);
});

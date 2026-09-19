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
const cardResolver = read("lib/collectible-card.ts");
const catalog = read("app/catalog/CatalogClient.tsx");
const homepage = read("components/HomePageClient.tsx");
const showcase = read("components/HomeProfileShowcase.tsx");
const profile = read("app/i/[code]/ProfileClient.tsx");
const photoOrganizer = read("components/PhotoOrganizer.tsx");
const compactQr = read("components/CompactQr.tsx");
const brandLogo = read("components/BrandLogo.tsx");
const fallbackImage = read("components/FallbackImage.tsx");
const publicMediaVariant = read("lib/public-media-variant.ts");
const collection = read("app/collections/[handle]/page.tsx");
const collectionDirectory = read("app/collections/CollectionsDirectoryClient.tsx");
const dashboard = read("app/dashboard/page.tsx");
const homeStyles = read("components/HomePageClient.module.css");

function compileImageFallbackHelpers() {
  const module = { exports: {} };
  const source = read("lib/image-fallback.ts");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  new Function("require", "module", "exports", code)(require, module, module.exports);
  return module.exports;
}

function compilePublicMediaVariant() {
  const module = { exports: {} };
  const code = ts.transpileModule(publicMediaVariant, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  new Function("require", "module", "exports", code)(require, module, module.exports);
  return module.exports;
}

function compileFallbackImageComponent(useState) {
  const module = { exports: {} };
  const code = ts.transpileModule(fallbackImage, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => name === "react" ? { useState } : require(name), module, module.exports
  );
  return module.exports.FallbackImage;
}

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
    "../lib/public-media-variant": {
      publicMediaVariantUrl: (source, width) => source + "?w=" + width + "&format=webp"
    },
    "../lib/collectible-card": {
      resolveCollectibleCard: () => ({
        images: ["/lead.jpg", "/detail.jpg"], title: "Test Profile", profileUrl: "/i/TEST",
        code: "TEST", typeLabel: "Amplifier", summary: "", factLine: "", publicSerial: "", photoCount: 2,
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

function compileCollectibleResolver() {
  const module = { exports: {} };
  const code = ts.transpileModule(cardResolver, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const overrides = {
    "./instrument-profile-contract": {
      resolveInstrumentPresentation: () => ({ photos: [], serialNumber: "", counts: { photos: 0, documents: 0 } })
    },
    "./local-demo": {
      instrumentDisplayName: () => "Test Profile",
      instrumentToProfileUrl: () => "/i/TEST"
    },
    "./record-location": { formatRecordLocation: () => "" }
  };
  new Function("require", "module", "exports", code)(
    (name) => overrides[name] || require(name), module, module.exports
  );
  return module.exports.resolveCollectibleCard;
}

function compileInstrumentCategories() {
  const module = { exports: {} };
  const source = read("lib/instrument-categories.ts");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  new Function("require", "module", "exports", code)(require, module, module.exports);
  return module.exports.defaultInstrumentCategories;
}

test("public media variants are added only to checked public media proxy URLs", () => {
  const { publicMediaVariantSrcSet: responsive, publicMediaVariantUrl: variant } = compilePublicMediaVariant();
  const source = "/api/public-file/QRG-TEST/media/0123456789abcdef01234567";
  assert.equal(variant(source, 160), source + "?w=160&format=webp");
  assert.equal(variant(source, 640), source + "?w=640&format=webp");
  assert.equal(variant(source, 1200), source + "?w=1200&format=webp");
  for (const untrusted of [
    "https://images.example/large.jpg",
    "//images.example/large.jpg",
    "data:image/png;base64,AAAA",
    "/api/public-file/QRG-TEST/document/0123456789abcdef01234567",
    "/api/public-file/QRG-TEST/media/not-a-token",
    source + "?download=1",
    " " + source + " "
  ]) assert.equal(variant(untrusted, 640), untrusted);
  assert.equal(variant(source, 999), source);
  assert.equal(responsive(source), source + "?w=640&format=webp 640w, " + source + "?w=1200&format=webp 1200w");
  assert.equal(responsive(source, [160, 640]), source + "?w=160&format=webp 160w, " + source + "?w=640&format=webp 640w");
  assert.equal(responsive(source, [1200, 640, 640]), source + "?w=640&format=webp 640w, " + source + "?w=1200&format=webp 1200w");
  assert.equal(responsive(source, []), undefined);
  assert.equal(responsive("https://images.example/large.jpg"), undefined);
});

test("public image surfaces request bounded variants while keeping original URLs as identity", () => {
  assert.match(showcase, /publicMediaVariantUrl\(photos\[activePhoto\], 1200\)/);
  assert.match(showcase, /srcSet=\{publicMediaVariantSrcSet\(photos\[activePhoto\]\)\} sizes="\(max-width: 900px\) 360px, 560px"/);
  assert.match(showcase, /publicMediaVariantUrl\(photo, 160\)/);
  assert.match(homepage, /src=\{publicMediaVariantUrl\(recordPhoto, 640\)\} srcSet=\{publicMediaVariantSrcSet\(recordPhoto, \[160, 640\]\)\} sizes="\(max-width: 700px\) 360px, 320px"/);
  assert.doesNotMatch(homepage, /<img src=\{recordPhoto\}/);
  assert.match(card, /publicMediaVariantUrl\(imageUrl, 640\)/);
  assert.match(profile, /publicMediaVariantUrl\(galleryImages\[mediaIndex\], 1200\)/);
  assert.match(profile, /srcSet=\{publicMediaVariantSrcSet\(galleryImages\[mediaIndex\]\)\}[^>]*sizes="\(max-width: 900px\) 360px, 720px"/);
  assert.match(profile, /publicMediaVariantUrl\(activeMedia, 1200\)/);
  assert.match(profile, /srcSet=\{publicMediaVariantSrcSet\(activeMedia\)\}[^>]*sizes="\(max-width: 900px\) 360px, 1080px"/);
  assert.ok((profile.match(/publicMediaVariantUrl\(imageUrl, 160\)/g) || []).length >= 2);
  assert.ok((profile.match(/image\.srcset = srcSet;/g) || []).length >= 2);
  assert.ok((profile.match(/image\.src = publicMediaVariantUrl\(source, 1200\);/g) || []).length >= 2);
});

test("shared Profile card link derives its accessible name from visible content", () => {
  assert.doesNotMatch(card, /collectible-card-profile-link[^>]*aria-label/);
  const CollectibleRecordCard = compileCard();
  const html = renderToStaticMarkup(React.createElement(CollectibleRecordCard, { record: { qrCode: "TEST" } }));
  const link = html.match(/<a class="collectible-card-profile-link"[^>]*>/)?.[0] || "";
  assert.ok(link);
  assert.doesNotMatch(link, /aria-label=/);
});

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

test("shared Profile cards show the category selected for that Profile", () => {
  const CollectibleRecordCard = compileCard();
  const html = renderToStaticMarkup(React.createElement(CollectibleRecordCard, { record: { qrCode: "TEST" } }));
  assert.match(html, /<span class="collectible-card-type">Amplifier<\/span>/);
});

test("every upload category reaches Profile cards unchanged", () => {
  const resolveCollectibleCard = compileCollectibleResolver();
  const categories = compileInstrumentCategories();
  for (const instrumentType of categories) {
    const cardData = resolveCollectibleCard({ qrCode: "TEST", instrumentType });
    assert.equal(cardData.typeLabel, instrumentType);
  }
});

test("homepage Profile copy uses the saved category instead of a hard-coded instrument label", () => {
  assert.match(showcase, /QRguitar Profile<\/span>/);
  assert.match(showcase, /className=\{styles\.kicker\}>\{card\.typeLabel\}<\/span>/);
  assert.doesNotMatch(showcase, /A real QRguitar Profile|THE INSTRUMENT/);
});

test("homepage hero stacks before tablet columns become too narrow", () => {
  assert.match(homeStyles, /@media \(max-width: 900px\)[\s\S]*?\.home :global\(\.hero-grid\) \{[^}]*max-width: 720px;[^}]*grid-template-columns: minmax\(0,1fr\);/);
  assert.doesNotMatch(homeStyles, /@media \(max-width: 900px\)[\s\S]*?\.home :global\(\.hero-grid\) \{[^}]*width: 100%;/);
  assert.match(homeStyles, /@media \(max-width: 900px\)[\s\S]*?\.heroShowcase \{[^}]*width: 100%;[^}]*max-width: 720px;/);
});

test("failed gallery sources are removed without mutating or reordering the remaining photos", () => {
  const { appendFailedImageSource, filterAvailableImageSources } = compileImageFallbackHelpers();
  const sources = ["/lead.jpg", "/detail.jpg", "/back.jpg"];
  const failed = appendFailedImageSource([], sources[0]);
  assert.deepEqual(failed, ["/lead.jpg"]);
  assert.deepEqual(filterAvailableImageSources(sources, failed), ["/detail.jpg", "/back.jpg"]);
  assert.strictEqual(appendFailedImageSource(failed, sources[0]), failed, "repeated load errors must be idempotent");
  assert.deepEqual(filterAvailableImageSources(sources, [...failed, "/detail.jpg", "/back.jpg"]), []);
  assert.deepEqual(sources, ["/lead.jpg", "/detail.jpg", "/back.jpg"], "the source list must remain immutable");
});

test("public Profile reserves LCP priority for visible full-size photos and defers every thumbnail", () => {
  assert.match(profile, /filterAvailableImageSources\(allGalleryImages, failedGalleryImages\)/);
  assert.match(profile, /key=\{galleryImages\[mediaIndex\]\}[\s\S]{0,500}loading="eager"[\s\S]{0,120}fetchPriority="high"[\s\S]{0,160}width=\{1200\}[\s\S]{0,80}height=\{900\}[\s\S]{0,120}referrerPolicy="no-referrer"[\s\S]{0,150}markGalleryImageFailed/);
  assert.match(profile, /width=\{168\}[\s\S]{0,80}height=\{126\}[\s\S]{0,120}referrerPolicy="no-referrer"[\s\S]{0,140}markGalleryImageFailed\(imageUrl\)/);
  assert.match(profile, /key=\{activeMedia\}[\s\S]{0,500}loading="eager"[\s\S]{0,120}fetchPriority="high"[\s\S]{0,160}width=\{1600\}[\s\S]{0,80}height=\{1200\}/);
  assert.match(profile, /width=\{148\}[\s\S]{0,80}height=\{112\}[\s\S]{0,120}referrerPolicy="no-referrer"[\s\S]{0,140}markGalleryImageFailed\(imageUrl\)/);
  assert.ok((profile.match(/loading="lazy"[\s\S]{0,100}fetchPriority="low"/g) || []).length >= 3);
  assert.match(profile, /image\.fetchPriority = "low";[\s\S]{0,80}image\.referrerPolicy = "no-referrer";/);
});

test("editor and supporting UI images declare stable geometry and low-priority decoding", () => {
  assert.match(photoOrganizer, /loading="lazy"[\s\S]{0,100}fetchPriority="low"[\s\S]{0,100}decoding="async"[\s\S]{0,100}width=\{1200\}[\s\S]{0,80}height=\{900\}[\s\S]{0,100}referrerPolicy="no-referrer"/);
  assert.match(dashboard, /loading="lazy"[\s\S]{0,100}fetchPriority="low"[\s\S]{0,100}decoding="async"[\s\S]{0,100}width=\{1200\}[\s\S]{0,80}height=\{900\}/);
  assert.match(showcase, /referrerPolicy="no-referrer"/);
  assert.match(card, /referrerPolicy="no-referrer"/);
  assert.match(homepage, /referrerPolicy="no-referrer"/);
});

test("avatars, compact QR previews, and brand marks replace failed sources with usable fallbacks", () => {
  assert.match(fallbackImage, /failedSource === source/);
  assert.match(fallbackImage, /setFailedSource\(source\)/);
  assert.match(collection, /<FallbackImage[\s\S]{0,500}width=\{112\}[\s\S]{0,200}fallback=\{<div className="collection-avatar"/);
  assert.match(collectionDirectory, /<FallbackImage[\s\S]{0,500}loading="lazy"[\s\S]{0,300}width=\{640\}[\s\S]{0,200}fallback=\{<div className=\{styles\.placeholder\}/);
  assert.match(compactQr, /<FallbackImage[\s\S]{0,500}width=\{240\}[\s\S]{0,80}height=\{240\}[\s\S]{0,300}QR preview unavailable/);
  assert.match(brandLogo, /<FallbackImage[\s\S]{0,400}width=\{520\}[\s\S]{0,80}height=\{120\}[\s\S]{0,250}brand-logo-fallback/);
});

test("fallback image swaps only the failed source and still calls the caller error handler", () => {
  let failedSource = "";
  let callerErrors = 0;
  const FallbackImage = compileFallbackImageComponent((initial) => [failedSource || initial, (next) => { failedSource = next; }]);
  const fallback = React.createElement("span", null, "Image unavailable");
  const props = { src: " /broken.jpg ", alt: "Instrument", width: 640, height: 480, fallback, onError: () => { callerErrors += 1; } };
  const image = FallbackImage(props);
  assert.equal(image.type, "img");
  assert.equal(image.props.src, "/broken.jpg");
  assert.equal(image.props.alt, "Instrument");
  image.props.onError({});
  assert.equal(failedSource, "/broken.jpg");
  assert.equal(callerErrors, 1);
  assert.equal(renderToStaticMarkup(FallbackImage(props)), "<span>Image unavailable</span>");
  assert.equal(FallbackImage({ ...props, src: "/recovered.jpg" }).props.src, "/recovered.jpg", "a changed source must get a fresh load attempt");
});

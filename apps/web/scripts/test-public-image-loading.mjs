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
const photoViewer = read("components/PhotoViewer.tsx");
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

function compileCard(extraOverrides = {}) {
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
    "./CollectibleRecordCard.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
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
    "./RecordShareButton": { RecordShareButton: () => null },
    "./PhotoViewer": { PhotoViewer: () => null },
    ...extraOverrides
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

function renderHomepageShowcase(failedPhotos = []) {
  const module = { exports: {} };
  const code = ts.transpileModule(showcase, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const Icon = () => null;
  let stateIndex = 0;
  const overrides = {
    react: { ...React, useState: (initial) => [stateIndex++ === 2 ? failedPhotos : initial, () => {}] },
    "./HomeProfileShowcase.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
    "lucide-react": { ArrowUpRight: Icon, Camera: Icon },
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "../lib/public-media-variant": compilePublicMediaVariant(),
    "../lib/collectible-card": { resolveCollectibleCard: () => ({
      images: ["/lead.jpg", "/detail.jpg"], title: "Test amplifier", typeLabel: "Amplifier",
      photoCount: 2, factLine: "Fender • 1991", profileUrl: "/i/QRG-TEST", code: "QRG-TEST"
    }) },
    "./PhotoViewer": { PhotoViewer: () => null }
  };
  new Function("require", "module", "exports", code)((name) => overrides[name] || require(name), module, module.exports);
  return renderToStaticMarkup(React.createElement(module.exports.HomeProfileShowcase, { record: { qrCode: "QRG-TEST" } }));
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
  assert.match(showcase, /srcSet=\{publicMediaVariantSrcSet\(photos\[activePhoto\]\)\} sizes="\(max-width: 760px\) calc\(100vw - 40px\), \(max-width: 900px\) 720px, 620px"/);
  assert.equal((renderHomepageShowcase().match(/<img\b/g) || []).length, 1, "The homepage loads its lead photo; additional photos open on demand in the gallery.");
  assert.match(homepage, /src=\{publicMediaVariantUrl\(recordPhoto, 640\)\} srcSet=\{publicMediaVariantSrcSet\(recordPhoto, \[160, 640\]\)\} sizes="\(max-width: 700px\) 360px, 320px"/);
  assert.doesNotMatch(homepage, /<img src=\{recordPhoto\}/);
  assert.match(card, /publicMediaVariantUrl\(imageUrl, 640\)/);
  assert.match(profile, /publicMediaVariantUrl\(galleryImages\[mediaIndex\], 1200\)/);
  assert.match(profile, /srcSet=\{publicMediaVariantSrcSet\(galleryImages\[mediaIndex\]\)\}[^>]*sizes="\(max-width: 540px\) calc\(100vw - 32px\), \(max-width: 760px\) calc\(100vw - 40px\), \(max-width: 900px\) 720px, 684px"/);
  assert.match(photoViewer, /publicMediaVariantUrl\(activeSource, 1200\)/);
  assert.match(photoViewer, /srcSet=\{publicMediaVariantSrcSet\(activeSource\)\}[^>]*sizes="calc\(100vw - 24px\)"/);
  assert.ok(((profile + photoViewer).match(/publicMediaVariantUrl\(imageUrl, 160\)/g) || []).length >= 2);
  assert.ok(((profile + photoViewer).match(/image\.srcset = srcSet;/g) || []).length >= 2);
  assert.ok(((profile + photoViewer).match(/image\.src = publicMediaVariantUrl\(source, 1200\);/g) || []).length >= 2);
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
  const heroPhotos = [...renderHomepageShowcase().matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(heroPhotos.length, 1);
  assert.match(heroPhotos[0], /loading="eager"/);
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
  const showcaseHtml = renderHomepageShowcase();
  assert.match(showcaseHtml, /QRguitar Profile · Amplifier/);
  assert.match(showcaseHtml, /href="\/i\/QRG-TEST"/);
  assert.match(showcaseHtml, /aria-label="View all photos of Test amplifier"/);
  assert.doesNotMatch(showcase, /A real QRguitar Profile|THE INSTRUMENT/);
});

test("homepage hero and archive reflow into a single column on phones", () => {
  assert.match(homeStyles, /@media\s*\(max-width:760px\)[\s\S]*?\.home :global\(\.hero-grid\)\s*\{[^}]*grid-template-columns:1fr/);
  assert.match(homeStyles, /@media\s*\(max-width:520px\)[\s\S]*?\.home :global\(\.home-archive-rail\)\s*\{[^}]*grid-template-columns:1fr/);
  assert.doesNotMatch(homeStyles, /scroll-snap-type:\s*x mandatory/);
});

test("homepage photo count and accessible image total agree after a failed source", () => {
  const html = renderHomepageShowcase(["/lead.jpg"]);
  assert.match(html, /Test amplifier, photo 1 of 1/);
  assert.match(html, /View available photos of Test amplifier/);
  assert.match(html, /1 photo available/);
  assert.doesNotMatch(html, /2 photos/);
  const empty = renderHomepageShowcase(["/lead.jpg", "/detail.jpg"]);
  assert.match(empty, /Photos are currently unavailable/);
  assert.doesNotMatch(empty, /View available photos/);
});

test("homepage preserves public originality without adding a sale promotion", () => {
  const source = ts.createSourceFile("page.tsx", read("app/page.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sanitizer = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "sanitizePresentationRecord");
  assert.ok(sanitizer);
  const code = ts.transpileModule(sanitizer.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const present = new Function(code + "; return sanitizePresentationRecord;")();
  const record = Object.freeze({ qrCode: "QRG-TEST", originalityStatus: "modified", saleStatus: "for_sale", safetyStatus: "stolen" });
  assert.deepEqual(present(record), { qrCode: "QRG-TEST", originalityStatus: "modified", safetyStatus: "stolen" });
  assert.equal(record.saleStatus, "for_sale");
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
  assert.match(photoViewer, /key=\{activeSource\}[\s\S]{0,500}loading="eager"[\s\S]{0,120}fetchPriority="high"[\s\S]{0,160}width=\{1600\}[\s\S]{0,80}height=\{1200\}/);
  assert.match(photoViewer, /width=\{112\}[\s\S]{0,50}height=\{112\}[\s\S]{0,100}referrerPolicy="no-referrer"[\s\S]{0,100}markImageFailed\(imageUrl\)/);
  assert.ok(((profile + photoViewer).match(/loading="lazy"[\s\S]{0,100}fetchPriority="low"/g) || []).length >= 3);
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

function findElement(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) { const match = findElement(child, predicate); if (match) return match; }
    return null;
  }
  if (predicate(node)) return node;
  return findElement(node.props?.children, predicate);
}

function cardInteractionHarness(images = ["/lead.jpg", "/detail.jpg", "/back.jpg"], variant = "catalog") {
  const states = [], refs = [], navigation = [], scrolls = [];
  let stateCursor = 0, refCursor = 0;
  const PhotoViewer = () => null;
  const Card = compileCard({
    react: {
      useMemo: (factory) => factory(), useCallback: (callback) => callback, useEffect() {},
      useState(initial) {
        const index = stateCursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useRef(initial) { const index = refCursor++; return refs[index] ||= { current: initial }; }
    },
    "next/navigation": { useRouter: () => ({ push: (url) => navigation.push(url) }) },
    "./PhotoViewer": { PhotoViewer },
    "../lib/collectible-card": { resolveCollectibleCard: () => ({
      images, title: "Test Profile", profileUrl: "/i/TEST", code: "TEST", typeLabel: "Amplifier",
      summary: "", factLine: "", publicSerial: "", photoCount: images.length, publicDocumentCount: 0
    }) }
  });
  const rail = {
    clientWidth: 300, scrollLeft: 0,
    setPointerCapture() {}, releasePointerCapture() {},
    scrollTo(options) { this.scrollLeft = options.left; scrolls.push(options); },
    scrollBy(options) { this.scrollLeft += options.left; }
  };
  function render() {
    stateCursor = 0; refCursor = 0;
    const tree = Card({ record: { qrCode: "TEST" }, variant });
    const photo = findElement(tree, (node) => node.props?.className === "collectible-card-media-rail");
    photo.props.ref.current = rail;
    return { tree, photo, viewer: findElement(tree, (node) => node.type === PhotoViewer) };
  }
  return { render, rail, navigation, scrolls };
}

test("card photo click opens the full gallery at its selected image without changing the Profile route", () => {
  const harness = cardInteractionHarness();
  let view = harness.render();
  harness.rail.scrollLeft = 300;
  view.photo.props.onScroll({ currentTarget: harness.rail });
  view = harness.render();
  view.photo.props.onClick();
  view = harness.render();
  assert.ok(view.viewer);
  assert.equal(view.viewer.props.initialIndex, 1);
  assert.deepEqual(view.viewer.props.images, ["/lead.jpg", "/detail.jpg", "/back.jpg"]);
  assert.deepEqual(harness.navigation, []);
  view.viewer.props.onClose();
  assert.equal(harness.render().viewer, null);
});

test("archive preview announces the complete photo count and opens every public photo", () => {
  const images = ["/lead.jpg", "/detail.jpg", "/back.jpg", "/serial.jpg"];
  const harness = cardInteractionHarness(images, "archive");
  let view = harness.render();
  const inlineImages = [];
  function collectImages(node) {
    if (Array.isArray(node)) return node.forEach(collectImages);
    if (!node || typeof node !== "object") return;
    if (node.type === "img") inlineImages.push(node);
    collectImages(node.props?.children);
  }
  collectImages(view.tree);
  assert.equal(inlineImages.length, 1, "the archive keeps its single-image loading budget");
  assert.equal(view.photo.props["aria-label"], "Test Profile photo preview. 4 photos available. Press Enter to view photos.");
  assert.equal(inlineImages[0].props.alt, "Test Profile preview photo 1 of 4");
  view.photo.props.onClick();
  view = harness.render();
  assert.ok(view.viewer);
  assert.deepEqual(view.viewer.props.images, images, "the viewer receives the complete public gallery, not the preview slice");
  assert.equal(view.viewer.props.initialIndex, 0);
  assert.deepEqual(harness.navigation, []);
});

test("Enter and Space activate the same card photo viewer, while arrow keys only browse the rail", () => {
  for (const key of ["Enter", " "]) {
    const harness = cardInteractionHarness();
    let prevented = 0;
    harness.render().photo.props.onKeyDown({ key, preventDefault: () => { prevented++; } });
    assert.ok(harness.render().viewer, key + " opens viewer");
    assert.equal(prevented, 1);
    assert.deepEqual(harness.navigation, []);
  }
  const harness = cardInteractionHarness();
  let prevented = 0;
  harness.render().photo.props.onKeyDown({ key: "ArrowRight", preventDefault: () => { prevented++; } });
  assert.equal(harness.render().viewer, null);
  assert.equal(harness.rail.scrollLeft, 300);
  harness.render().photo.props.onKeyDown({ key: "ArrowLeft", preventDefault: () => { prevented++; } });
  assert.equal(harness.rail.scrollLeft, 0);
  assert.equal(prevented, 2);
  harness.render().photo.props.onKeyDown({ key: "Tab", preventDefault: () => { prevented++; } });
  assert.equal(prevented, 2, "normal keyboard focus navigation remains native");
});

test("dragging a card photo does not open its viewer and the next intentional click still works", () => {
  const harness = cardInteractionHarness();
  const photo = harness.render().photo;
  photo.props.onPointerDown({ pointerType: "mouse", pointerId: 1, clientX: 250 });
  photo.props.onPointerMove({ pointerType: "mouse", pointerId: 1, clientX: 30 });
  photo.props.onPointerUp({ pointerType: "mouse", pointerId: 1 });
  photo.props.onClick();
  assert.equal(harness.render().viewer, null);
  assert.deepEqual(harness.navigation, []);
  harness.render().photo.props.onClick();
  assert.ok(harness.render().viewer);
});

test("a card without photos cannot open an empty viewer by click or keyboard", () => {
  const harness = cardInteractionHarness([]);
  let photo = harness.render().photo;
  assert.equal(photo.props.tabIndex, -1);
  assert.doesNotMatch(photo.props["aria-label"], /Press Enter/);
  photo.props.onClick();
  assert.equal(harness.render().viewer, null);
  for (const key of ["Enter", " "]) {
    photo = harness.render().photo;
    photo.props.onKeyDown({ key, preventDefault() {} });
    assert.equal(harness.render().viewer, null);
  }
  assert.deepEqual(harness.navigation, []);
});

function compileStatusBadges() {
  const module = { exports: {} };
  const code = ts.transpileModule(read("components/ProfileStatusBadges.tsx"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const Icon = () => null;
  const overrides = {
    "lucide-react": { ShieldCheck: Icon, Siren: Icon, UserRound: Icon },
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "../lib/local-demo": {
      getInstrumentCondition: (record) => record.condition || "used",
      getInstrumentVerificationStatus: (record) => record.verificationStatus || "unverified"
    }
  };
  new Function("require", "module", "exports", code)((name) => overrides[name] || require(name), module, module.exports);
  return module.exports.ProfileStatusBadges;
}

test("suppressing duplicate hero trust chips preserves safety, sale, originality and condition disclosures", () => {
  const Badges = compileStatusBadges();
  const record = { verificationStatus: "verified", authenticityStatus: "confirmed", safetyStatus: "stolen", saleStatus: "for_sale", originalityStatus: "modified", condition: "used", instrumentType: "Amplifier" };
  const html = renderToStaticMarkup(React.createElement(Badges, { record, hideConfirmedTrust: true, includeCategory: true }));
  assert.doesNotMatch(html, /Verified by QRguitar|Authenticity Confirmed|Unverified|Authenticity Unconfirmed/);
  for (const label of ["Reported Stolen", "For Sale", "Modified", "Used", "Amplifier"]) assert.ok(html.includes(label), label + " remains visible");
  assert.match(profile, /hideConfirmedTrust=\{true\}[\s\S]{0,80}className=\{styles\["profile-hero-badges"\]\}/);
});

test("status trust chips remain enabled by default and still respect their individual visibility settings", () => {
  const Badges = compileStatusBadges();
  const record = { verificationStatus: "verified", authenticityStatus: "confirmed" };
  const defaultHtml = renderToStaticMarkup(React.createElement(Badges, { record }));
  assert.match(defaultHtml, /Verified by QRguitar/);
  assert.match(defaultHtml, /Authenticity Confirmed/);
  const hiddenHtml = renderToStaticMarkup(React.createElement(Badges, { record: { ...record, showVerificationBadge: false, showAuthenticityBadge: false } }));
  assert.doesNotMatch(hiddenHtml, /Verified by QRguitar|Authenticity Confirmed/);
});


test("card content opens its Profile without hijacking nested collection links or action buttons", () => {
  const harness = cardInteractionHarness();
  const { tree } = harness.render();
  const content = findElement(tree, (node) => node.props?.className === "collectible-card-content");
  assert.ok(content);
  content.props.onClick({ target: { closest: () => ({ tagName: "A" }) } });
  content.props.onClick({ target: { closest: () => ({ tagName: "BUTTON" }) } });
  assert.deepEqual(harness.navigation, []);
  content.props.onClick({ target: { closest: () => null } });
  assert.deepEqual(harness.navigation, ["/i/TEST"]);
  assert.equal(harness.render().viewer, null);
});


test("hero de-duplication preserves unverified and unconfirmed disclosures in every mixed trust state", () => {
  const Badges = compileStatusBadges();
  for (const verificationStatus of ["unverified", "verified"]) {
    for (const authenticityStatus of ["unconfirmed", "confirmed"]) {
      const record = { verificationStatus, authenticityStatus };
      const html = renderToStaticMarkup(React.createElement(Badges, { record, hideConfirmedTrust: true }));
      assert.equal(html.includes("Unverified"), verificationStatus === "unverified", "verification disclosure: " + JSON.stringify(record));
      assert.equal(html.includes("Authenticity Unconfirmed"), authenticityStatus === "unconfirmed", "authenticity disclosure: " + JSON.stringify(record));
      assert.doesNotMatch(html, /Verified by QRguitar|Authenticity Confirmed/, "confirmed details must not be duplicated as badges");
    }
  }
  const hidden = renderToStaticMarkup(React.createElement(Badges, { record: { verificationStatus: "unverified", authenticityStatus: "unconfirmed", showVerificationBadge: false, showAuthenticityBadge: false }, hideConfirmedTrust: true }));
  assert.doesNotMatch(hidden, /Unverified|Authenticity Unconfirmed/, "saved display preferences still apply");
});


test("cards mount only the selected photograph and its neighbors while reporting the complete public photo count", () => {
  const images = Array.from({ length: 20 }, (_, index) => "/photo-" + index + ".jpg");
  const Card = compileCard({ "../lib/collectible-card": { resolveCollectibleCard: () => ({
    images, title: "Large gallery", profileUrl: "/i/TEST", code: "TEST", typeLabel: "Amplifier", summary: "", factLine: "", publicSerial: "", photoCount: images.length, publicDocumentCount: 0, collection: null
  }) } });
  const html = renderToStaticMarkup(React.createElement(Card, { record: { qrCode: "TEST" } }));
  assert.equal((html.match(/<img\b/g) || []).length, 2, "a large public gallery must not start twenty image requests per card");
  assert.match(html, /1\/20/);
  assert.doesNotMatch(html, /photo-19\.jpg/);
  const archive = renderToStaticMarkup(React.createElement(Card, { record: { qrCode: "TEST" }, variant: "archive" }));
  assert.equal((archive.match(/<img\b/g) || []).length, 1);
  assert.match(archive, /20 photos/, "a one-image card preview still reports the real public gallery size");
});

test("photo upload failure stays attached to its source through reordering and leaves recovery controls usable", () => {
  const module = { exports: {} };
  const code = ts.transpileModule(photoOrganizer, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  new Function("require", "module", "exports", code)((name) => name === "react"
    ? { useState: (initial) => [initial, () => {}], useRef: (initial) => ({ current: initial }) }
    : require(name), module, module.exports);
  const Organizer = module.exports.PhotoOrganizer;
  const original = ["/lead.jpg", "/detail.jpg", "/back.jpg"];
  let images = [...original];
  let mainImage = "/detail.jpg";
  const removed = [];
  const errorMessage = "Upload failed. Your selected photograph is preserved; remove it or retry the saved form.";
  const render = () => Organizer({
    images, mainImage,
    statusByImage: { "/lead.jpg": { state: "error", message: errorMessage } },
    onSelectMain: (source) => { mainImage = source; },
    onRemove: (source) => { removed.push(source); images = images.filter((image) => image !== source); },
    onMove: (from, to) => { const next = [...images]; next.splice(to, 0, next.splice(from, 1)[0]); images = next; }
  });
  const tileAt = (tree, index) => findElement(tree, (node) => node.type === "article" && node.props["data-photo-index"] === index);
  const plain = (node) => Array.isArray(node) ? node.map(plain).join("") : typeof node === "string" ? node : node?.props ? plain(node.props.children) : "";
  let tree = render();
  let failedTile = tileAt(tree, 0);
  assert.equal(findElement(failedTile, (node) => node.props?.role === "alert").props.children[0].props.children, errorMessage);
  const menu = findElement(failedTile, (node) => node.type === "details");
  assert.equal(findElement(menu, (node) => node.type === "summary").props["aria-label"], "More options for photo 1");
  assert.equal(findElement(menu, (node) => node.type === "button" && plain(node).includes("Move earlier")).props.disabled, true);
  const moveLater = findElement(menu, (node) => node.type === "button" && plain(node).includes("Move later"));
  assert.equal(moveLater.props.disabled, false);
  moveLater.props.onClick();
  assert.deepEqual(images, ["/detail.jpg", "/lead.jpg", "/back.jpg"]);
  assert.deepEqual(original, ["/lead.jpg", "/detail.jpg", "/back.jpg"], "reordering must not mutate caller-owned input");
  tree = render();
  failedTile = tileAt(tree, 1);
  assert.equal(findElement(failedTile, (node) => node.type === "img").props.src, "/lead.jpg");
  assert.match(plain(findElement(failedTile, (node) => node.props?.role === "alert")), /selected photograph is preserved/);
  assert.equal(findElement(tileAt(tree, 0), (node) => node.props?.role === "alert"), null, "the error cannot move to the next photo by index");
  findElement(failedTile, (node) => node.type === "button" && node.props["aria-label"] === "Set photo 2 as main").props.onClick();
  assert.equal(mainImage, "/lead.jpg");
  findElement(failedTile, (node) => node.type === "button" && node.props["aria-label"] === "Remove photo 2").props.onClick();
  assert.deepEqual(removed, ["/lead.jpg"]);
  assert.deepEqual(images, ["/detail.jpg", "/back.jpg"]);
});

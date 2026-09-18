import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  assertNetlifyRuntimeConstraints,
  netlifyRuntimeConstraintViolations
} from "../../../scripts/check-netlify-runtime-constraints.mjs";

function fixture(route, editor) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qrguitar-netlify-runtime-"));
  const routeDirectory = path.join(root, "apps", "web", "app", "api", "fixture");
  const editorDirectory = path.join(root, "apps", "web", "app", "edit", "[code]");
  fs.mkdirSync(routeDirectory, { recursive: true });
  fs.mkdirSync(editorDirectory, { recursive: true });
  fs.writeFileSync(path.join(routeDirectory, "route.ts"), route);
  fs.writeFileSync(path.join(editorDirectory, "page.tsx"), editor);
  return root;
}

function removeFixture(root) {
  const absolute = path.resolve(root);
  if (
    path.dirname(absolute) !== path.resolve(os.tmpdir()) ||
    !path.basename(absolute).startsWith("qrguitar-netlify-runtime-")
  ) throw new Error("Unsafe Netlify runtime fixture cleanup path.");
  fs.rmSync(absolute, { recursive: true, force: true });
}

const safeProfilePatch = `
function buildInstrument() {
  return { heroImageDataUrl: form.heroImageDataUrl, galleryImageDataUrls: galleryImages };
}
fetch("/api/instruments", {
  method: "PATCH",
  body: JSON.stringify({
    heroImagePath: staged.photoPaths[mainPhotoIndex] || staged.photoPaths[0],
    photos: staged.photoPaths,
    documents: documents.map((document, index) => ({
      name: document.name,
      storagePath: staged.documentPaths[index]
    }))
  })
});
fetch("/api/instruments", {
  method: "PATCH",
  body: JSON.stringify({ verificationOnly: true })
});
`;

test("Netlify runtime preflight accepts bounded functions and metadata-only edits", () => {
  const root = fixture("export const maxDuration = 60;\n", safeProfilePatch);
  try {
    assert.deepEqual(netlifyRuntimeConstraintViolations(root), []);
    assert.doesNotThrow(() => assertNetlifyRuntimeConstraints(root));
  } finally {
    removeFixture(root);
  }
});

test("Netlify runtime preflight blocks long synchronous functions", () => {
  const root = fixture("export const maxDuration = 120;\n", safeProfilePatch);
  try {
    const violations = netlifyRuntimeConstraintViolations(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /120.*60 seconds/);
    assert.throws(() => assertNetlifyRuntimeConstraints(root), /compatibility check failed/);
  } finally {
    removeFixture(root);
  }
});

for (const [name, fields, expected] of [
  [
    "hero data URL",
    "heroImageDataUrl: form.heroImageDataUrl, photos: staged.photoPaths, documents: documents.map((document, index) => ({ storagePath: staged.documentPaths[index] }))",
    /inline hero/
  ],
  [
    "gallery data URLs",
    "heroImagePath: staged.photoPaths[0], photos: galleryImages, documents: documents.map((document, index) => ({ storagePath: staged.documentPaths[index] }))",
    /gallery|staged photo-path/
  ],
  [
    "document data URL",
    "heroImagePath: staged.photoPaths[0], photos: staged.photoPaths, documents: documents.map((document) => ({ dataUrl: document.dataUrl }))",
    /document data|document storage paths/
  ]
]) {
  test("Netlify runtime preflight blocks inline " + name + " in the Profile PATCH", () => {
    const editor = `fetch("/api/instruments", { method: "PATCH", body: JSON.stringify({ ${fields} }) });`;
    const root = fixture("export const maxDuration = 60;\n", editor);
    try {
      const violations = netlifyRuntimeConstraintViolations(root);
      assert.equal(violations.length, 1);
      assert.match(violations[0], expected);
      assert.match(violations[0], /6 MB/);
    } finally {
      removeFixture(root);
    }
  });
}

test("Netlify runtime preflight fails closed on an uninspectable Profile PATCH body", () => {
  const root = fixture(
    "export const maxDuration = 60;\n",
    "fetch(\"/api/instruments\", { method: \"PATCH\", body: JSON.stringify(instrument) });\n"
  );
  try {
    const violations = netlifyRuntimeConstraintViolations(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /not an inspectable JSON object/);
  } finally {
    removeFixture(root);
  }
});

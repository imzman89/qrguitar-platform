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

test("Netlify runtime preflight accepts bounded functions and metadata-only edits", () => {
  const root = fixture("export const maxDuration = 60;\n", "const body = { storagePath: uploaded.path };\n");
  try {
    assert.deepEqual(netlifyRuntimeConstraintViolations(root), []);
    assert.doesNotThrow(() => assertNetlifyRuntimeConstraints(root));
  } finally {
    removeFixture(root);
  }
});

test("Netlify runtime preflight blocks long functions and inline edit files", () => {
  const root = fixture(
    "export const maxDuration = 120;\n",
    "const body = { heroImageDataUrl: form.heroImageDataUrl, photos: galleryImages, dataUrl: document.dataUrl };\n"
  );
  try {
    const violations = netlifyRuntimeConstraintViolations(root);
    assert.equal(violations.length, 2);
    assert.match(violations[0], /120.*60 seconds/);
    assert.match(violations[1], /inline Profile file data.*6 MB/);
    assert.throws(() => assertNetlifyRuntimeConstraints(root), /compatibility check failed/);
  } finally {
    removeFixture(root);
  }
});

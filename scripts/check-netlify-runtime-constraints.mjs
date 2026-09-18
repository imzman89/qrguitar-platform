import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");

function filesBelow(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesBelow(target));
    else if (entry.isFile()) result.push(target);
  }
  return result;
}

export function netlifyRuntimeConstraintViolations(root = defaultRoot) {
  const violations = [];
  const routesRoot = path.join(root, "apps", "web", "app", "api");
  for (const route of filesBelow(routesRoot).filter(file => /route\.(?:ts|js)$/.test(file))) {
    const source = fs.readFileSync(route, "utf8");
    for (const match of source.matchAll(/export\s+const\s+maxDuration\s*=\s*(\d+)/g)) {
      if (Number(match[1]) > 60) {
        violations.push(
          path.relative(root, route).replaceAll("\\", "/") +
            " declares maxDuration=" +
            match[1] +
            "; Netlify synchronous functions stop at 60 seconds."
        );
      }
    }
  }

  const editor = path.join(root, "apps", "web", "app", "edit", "[code]", "page.tsx");
  const editorSource = fs.readFileSync(editor, "utf8");
  const inlineEditFields = [
    "heroImageDataUrl: form.heroImageDataUrl",
    "photos: galleryImages",
    "dataUrl: document.dataUrl"
  ].filter(fragment => editorSource.includes(fragment));
  if (inlineEditFields.length) {
    violations.push(
      "apps/web/app/edit/[code]/page.tsx still sends inline Profile file data in PATCH JSON (" +
        inlineEditFields.join(", ") +
        "); Netlify buffered requests are limited to 6 MB and binary base64 overhead lowers the practical limit."
    );
  }
  return violations;
}

export function assertNetlifyRuntimeConstraints(root = defaultRoot) {
  const violations = netlifyRuntimeConstraintViolations(root);
  if (violations.length) {
    throw new Error("Netlify runtime compatibility check failed:\n- " + violations.join("\n- "));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    assertNetlifyRuntimeConstraints();
    console.log("Netlify runtime compatibility checks passed (6 MB buffered payload, 60-second synchronous functions).");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Netlify runtime compatibility check failed.");
    process.exitCode = 1;
  }
}

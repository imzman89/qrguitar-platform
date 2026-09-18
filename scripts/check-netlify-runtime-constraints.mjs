import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

function propertyName(property) {
  if (!property?.name) return null;
  return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
    ? property.name.text
    : null;
}

function propertyAssignment(object, name) {
  return object.properties.find(
    property => ts.isPropertyAssignment(property) && propertyName(property) === name
  );
}

function stringValue(expression) {
  return ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)
    ? expression.text
    : null;
}

function exportedConstants(sourceFile) {
  const result = new Map();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        result.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return result;
}

function resolvedString(expression, constants, seen = new Set()) {
  const direct = expression ? stringValue(expression) : null;
  if (direct !== null) return direct;
  if (!expression || !ts.isIdentifier(expression) || seen.has(expression.text)) return null;
  const initializer = constants.get(expression.text);
  if (!initializer) return null;
  seen.add(expression.text);
  return resolvedString(initializer, constants, seen);
}

function resolvedNumber(expression, constants, seen = new Set()) {
  if (expression && ts.isNumericLiteral(expression)) return Number(expression.text);
  if (!expression || !ts.isIdentifier(expression) || seen.has(expression.text)) return null;
  const initializer = constants.get(expression.text);
  if (!initializer) return null;
  seen.add(expression.text);
  return resolvedNumber(initializer, constants, seen);
}

function inspectPayPalScheduler(root) {
  const scheduler = path.join(root, "netlify", "functions", "paypal-webhook-sweep.mjs");
  if (!fs.existsSync(scheduler)) {
    return ["the Netlify PayPal recovery schedule is missing"];
  }
  const source = fs.readFileSync(scheduler, "utf8");
  const sourceFile = ts.createSourceFile(scheduler, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (sourceFile.parseDiagnostics.length) {
    return ["the Netlify PayPal recovery schedule could not be parsed"];
  }

  const constants = exportedConstants(sourceFile);
  const config = constants.get("config");
  const schedule = config && ts.isObjectLiteralExpression(config)
    ? resolvedString(propertyAssignment(config, "schedule")?.initializer, constants)
    : null;
  const timeout = resolvedNumber(constants.get("PAYPAL_SWEEP_TIMEOUT_MS"), constants);
  const maxResponseBytes = resolvedNumber(constants.get("PAYPAL_SWEEP_MAX_RESPONSE_BYTES"), constants);
  const target = resolvedString(constants.get("PAYPAL_SWEEP_URL"), constants);
  const defaultHandler = sourceFile.statements.find(statement =>
    ts.isFunctionDeclaration(statement) &&
    statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)
  );
  const delegatesToSweep = Boolean(
    defaultHandler?.body?.statements.some(statement => {
      const expression = ts.isExpressionStatement(statement)
        ? statement.expression
        : ts.isReturnStatement(statement)
          ? statement.expression
          : null;
      const awaited = expression && ts.isAwaitExpression(expression) ? expression.expression : null;
      const delegated = awaited || (ts.isReturnStatement(statement) ? expression : null);
      return Boolean(
        delegated &&
          ts.isCallExpression(delegated) &&
          ts.isIdentifier(delegated.expression) &&
          delegated.expression.text === "runPayPalWebhookSweepSchedule"
      );
    })
  );
  const issues = [];
  if (schedule !== "*/5 * * * *") issues.push("the PayPal recovery schedule is not fixed at five-minute intervals");
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout >= 30000) {
    issues.push("the PayPal recovery request timeout is not bounded below Netlify's 30-second scheduled-function limit");
  }
  if (maxResponseBytes !== 1024) {
    issues.push("the PayPal recovery response is not fixed at the reviewed 1 KiB byte limit");
  }
  if (target !== "https://www.qrguitar.com/api/internal/paypal-webhook-sweep") {
    issues.push("the PayPal recovery schedule does not target the canonical production sweep endpoint");
  }
  if (!defaultHandler) issues.push("the PayPal recovery schedule has no default Netlify handler");
  else if (!delegatesToSweep) issues.push("the default Netlify handler does not await or return PayPal recovery");
  return issues;
}

function tomlString(section, key) {
  const match = section.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"\\s*(?:#.*)?$`, "m"));
  return match?.[1] ?? null;
}

function tomlInteger(section, key) {
  const match = section.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*(?:#.*)?$`, "m"));
  return match ? Number(match[1]) : null;
}

function inspectPaymentRateLimits(root) {
  const configPath = path.join(root, "netlify.toml");
  if (!fs.existsSync(configPath)) return ["netlify.toml is missing"];
  const source = fs.readFileSync(configPath, "utf8");
  const sections = source
    .split(/(?=^\[\[redirects\]\]\s*$)/m)
    .filter(section => /^\[\[redirects\]\]\s*$/m.test(section));
  const requirements = [
    { route: "/api/billing/paypal/webhook", limit: 300 },
    { route: "/api/internal/paypal-webhook-sweep", limit: 12 }
  ];
  const issues = [];
  for (const requirement of requirements) {
    const matching = sections.filter(section => tomlString(section, "from") === requirement.route);
    const section = matching.length === 1 ? matching[0] : null;
    const aggregation = section?.match(/^\s*aggregate_by\s*=\s*\[([^\]]*)\]\s*(?:#.*)?$/m)?.[1] ?? "";
    const aggregateBy = Array.from(aggregation.matchAll(/"([^"]+)"/g), match => match[1]).sort();
    if (
      !section ||
      tomlString(section, "to") !== requirement.route ||
      !/^\s*\[redirects\.rate_limit\]\s*$/m.test(section) ||
      tomlInteger(section, "window_limit") !== requirement.limit ||
      tomlInteger(section, "window_size") !== 60 ||
      aggregateBy.join(",") !== "domain,ip"
    ) {
      issues.push(
        `the Netlify rate limit for ${requirement.route} is missing or differs from the reviewed self-rewrite rule`
      );
    }
  }
  return issues;
}

function isJsonStringify(call) {
  return ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === "JSON" &&
    call.expression.name.text === "stringify";
}

function instrumentPatchPayloads(source, filename) {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (sourceFile.parseDiagnostics.length) {
    return { payloads: [], boundaryErrors: ["the Profile editor source could not be parsed"] };
  }

  const payloads = [];
  const boundaryErrors = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fetch" &&
      stringValue(node.arguments[0]) === "/api/instruments"
    ) {
      const options = node.arguments[1];
      if (!options || !ts.isObjectLiteralExpression(options)) {
        boundaryErrors.push("an /api/instruments request has an uninspectable options object");
      } else {
        const method = propertyAssignment(options, "method");
        if (method && stringValue(method.initializer) === "PATCH") {
          const body = propertyAssignment(options, "body");
          if (
            !body ||
            !ts.isCallExpression(body.initializer) ||
            !isJsonStringify(body.initializer) ||
            body.initializer.arguments.length !== 1 ||
            !ts.isObjectLiteralExpression(body.initializer.arguments[0])
          ) {
            boundaryErrors.push("an /api/instruments PATCH body is not an inspectable JSON object");
          } else {
            payloads.push({ payload: body.initializer.arguments[0], sourceFile });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { payloads, boundaryErrors };
}

function inspectProfilePatchBoundary(source, filename) {
  const { payloads, boundaryErrors } = instrumentPatchPayloads(source, filename);
  const issues = [...boundaryErrors];
  let profilePayloads = 0;

  for (const { payload, sourceFile } of payloads) {
    const hero = propertyAssignment(payload, "heroImagePath");
    const legacyHero = propertyAssignment(payload, "heroImageDataUrl");
    const photos = propertyAssignment(payload, "photos");
    const documents = propertyAssignment(payload, "documents");
    const legacyGallery = propertyAssignment(payload, "galleryImageDataUrls");
    if (!hero && !legacyHero && !photos && !documents && !legacyGallery) continue;
    profilePayloads++;

    const payloadText = payload.getText(sourceFile);
    if (/\b(?:heroImageDataUrl|galleryImageDataUrls|galleryImages|dataUrl)\b/.test(payloadText)) {
      issues.push("the Profile PATCH references inline hero, gallery, or document data");
    }
    if (
      !hero ||
      !/\bstaged\.photoPaths\s*\[/.test(hero.initializer.getText(sourceFile)) ||
      /\b(?:heroImageDataUrl|galleryImages|dataUrl)\b/.test(hero.initializer.getText(sourceFile))
    ) {
      issues.push("heroImagePath is not derived from staged photo paths");
    }
    if (!photos || photos.initializer.getText(sourceFile).replaceAll(/\s/g, "") !== "staged.photoPaths") {
      issues.push("photos is not the staged photo-path collection");
    }

    let safeDocuments = false;
    if (
      documents &&
      ts.isCallExpression(documents.initializer) &&
      ts.isPropertyAccessExpression(documents.initializer.expression) &&
      documents.initializer.expression.name.text === "map"
    ) {
      const storageAssignments = [];
      function findStoragePaths(node) {
        if (ts.isPropertyAssignment(node) && propertyName(node) === "storagePath") {
          storageAssignments.push(node.initializer.getText(sourceFile));
        }
        ts.forEachChild(node, findStoragePaths);
      }
      findStoragePaths(documents.initializer);
      safeDocuments = storageAssignments.some(value => /^staged\.documentPaths\s*\[/.test(value));
    }
    if (
      !safeDocuments ||
      (documents && /\bdataUrl\b/.test(documents.initializer.getText(sourceFile)))
    ) {
      issues.push("documents is not mapped to staged document storage paths");
    }
  }

  if (!profilePayloads) {
    issues.push("no inspectable Profile media PATCH JSON boundary was found");
  }
  return Array.from(new Set(issues));
}

export function netlifyRuntimeConstraintViolations(root = defaultRoot) {
  const violations = [...inspectPayPalScheduler(root), ...inspectPaymentRateLimits(root)];
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
  const profilePatchIssues = inspectProfilePatchBoundary(editorSource, editor);
  if (profilePatchIssues.length) {
    violations.push(
      "apps/web/app/edit/[code]/page.tsx Profile PATCH JSON is not storage-path-only (" +
        profilePatchIssues.join("; ") +
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
    console.log("Netlify runtime compatibility checks passed (6 MB buffered payload, 60-second synchronous functions, five-minute bounded PayPal recovery schedule, reviewed payment rate limits).");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Netlify runtime compatibility check failed.");
    process.exitCode = 1;
  }
}

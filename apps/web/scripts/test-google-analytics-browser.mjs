import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const chromeCandidates = process.platform === "win32"
  ? [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
    ]
  : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const chrome = chromeCandidates.find(candidate => fs.existsSync(candidate));
assert.ok(chrome, "A local Chrome or Edge executable is required for the GA4 browser smoke test.");
const build = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  cwd: webRoot,
  encoding: "utf8",
  env: {
    ...process.env,
    NEXT_PUBLIC_GA4_MEASUREMENT_ID: "G-ABC12345",
    NEXT_PUBLIC_OPTIONAL_TRACKING_PURPOSES: "analytics",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "browser-smoke-anon-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://browser-smoke.invalid"
  },
  windowsHide: true
});
assert.equal(build.status, 0, `Synthetic GA4 production build failed.\n${build.stdout || ""}\n${build.stderr || ""}`);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function until(work, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await work();
      if (value) return value;
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ""}`);
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.nextId;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }
  on(method, listener) {
    const listeners = this.listeners.get(method) || new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }
  close() { this.socket.close(); }
}

const fakeGtag = String.raw`(() => {
  const layer = window.dataLayer || [];
  window.__qrguitarArgumentsOnly = true;
  const processCommand = command => {
    if (Object.prototype.toString.call(command) !== "[object Arguments]") {
      window.__qrguitarArgumentsOnly = false;
      return;
    }
    if (command[0] !== "event" || command[1] !== "page_view") return;
    const parameters = command[2] || {};
    const query = new URLSearchParams({
      en: "page_view",
      dl: String(parameters.page_location || ""),
      dt: String(parameters.page_title || ""),
      dr: String(parameters.page_referrer || ""),
      rc: String(parameters.route_category || "")
    });
    fetch("https://www.google-analytics.com/g/collect?" + query, { mode: "no-cors", keepalive: true }).catch(() => {});
  };
  layer.forEach(processCommand);
  const push = layer.push.bind(layer);
  layer.push = function () {
    for (const command of arguments) processCommand(command);
    return push(...arguments);
  };
  document.cookie = "_ga=browser_smoke; Path=/; SameSite=Lax";
})();`;

const nextPort = await freePort();
const debugPort = await freePort();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "qrguitar-ga4-browser-"));
const nextOutput = [];
const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(nextPort)], {
  cwd: webRoot,
  env: { ...process.env, NEXT_PUBLIC_OPTIONAL_TRACKING_PURPOSES: "analytics", NEXT_PUBLIC_GA4_MEASUREMENT_ID: "G-ABC12345" },
  stdio: ["ignore", "pipe", "pipe"]
});
next.stdout.on("data", chunk => nextOutput.push(chunk.toString()));
next.stderr.on("data", chunk => nextOutput.push(chunk.toString()));

let browser;
let cdp;
try {
  await until(async () => {
    const response = await fetch(`http://127.0.0.1:${nextPort}/privacy`);
    return response.ok;
  }, `Next.js did not start\n${nextOutput.join("")}`, 30_000);

  browser = spawn(chrome, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ], { stdio: "ignore" });

  const target = await until(async () => {
    const targets = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
    return targets.find(item => item.type === "page" && item.webSocketDebuggerUrl);
  }, "Chrome DevTools target did not become available");
  cdp = new Cdp(target.webSocketDebuggerUrl);
  const requests = [];
  let loadCount = 0;
  cdp.on("Network.requestWillBeSent", event => requests.push(event.request.url));
  cdp.on("Page.loadEventFired", () => { loadCount++; });
  cdp.on("Fetch.requestPaused", async event => {
    try {
      const url = event.request.url;
      if (url.startsWith("https://www.googletagmanager.com/gtag/js")) {
        await cdp.send("Fetch.fulfillRequest", {
          requestId: event.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "content-type", value: "application/javascript; charset=utf-8" },
            { name: "access-control-allow-origin", value: "*" }
          ],
          body: Buffer.from(fakeGtag).toString("base64")
        });
      } else if (url.startsWith("https://www.google-analytics.com/g/collect")) {
        await cdp.send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: 204, responseHeaders: [] });
      } else {
        await cdp.send("Fetch.continueRequest", { requestId: event.requestId });
      }
    } catch {
      // A navigation can retire an interception while its response is being fulfilled.
    }
  });
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Network.enable"),
    cdp.send("Fetch.enable", { patterns: [
      { urlPattern: "https://www.googletagmanager.com/*", requestStage: "Request" },
      { urlPattern: "https://www.google-analytics.com/g/collect*", requestStage: "Request" }
    ] })
  ]);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: String.raw`(() => {
    window.__qrguitarSmokeDiagnostics = { errors: [], removals: [], storage: [] };
    const originalRemove = Element.prototype.remove;
    Element.prototype.remove = function () {
      if (this.id === "qrguitar-google-analytics") {
        window.__qrguitarSmokeDiagnostics.removals.push(new Error("GA script removed").stack || "unknown");
      }
      return originalRemove.call(this);
    };
    addEventListener("error", event => window.__qrguitarSmokeDiagnostics.errors.push(String(event.error?.stack || event.message || event.error)));
    addEventListener("unhandledrejection", event => window.__qrguitarSmokeDiagnostics.errors.push(String(event.reason?.stack || event.reason)));
    addEventListener("storage", event => window.__qrguitarSmokeDiagnostics.storage.push({ key: event.key, newValue: event.newValue }));
  })();` });

  const navigate = async url => {
    const before = loadCount;
    await cdp.send("Page.navigate", { url });
    await until(() => loadCount > before, `Page did not load ${url}`);
  };
  const evaluate = async expression => (await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;

  await navigate(`http://127.0.0.1:${nextPort}/privacy`);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(requests.some(url => /google-analytics|googletagmanager/.test(url)), false, "Google network activity occurred before consent.");
  assert.equal(await evaluate("Boolean(document.getElementById('qrguitar-google-analytics'))"), false);

  await evaluate("localStorage.setItem('qrguitar.optionalTrackingConsent.v1.analytics', 'accepted')");
  await navigate(`http://127.0.0.1:${nextPort}/privacy`);
  try {
    await until(() => requests.some(url => url.startsWith("https://www.google-analytics.com/g/collect")), "No synthetic GA4 collect request was observed");
  } catch (error) {
    const diagnostic = await evaluate(`JSON.stringify({
      consent: localStorage.getItem('qrguitar.optionalTrackingConsent.v1.analytics'),
      script: document.getElementById('qrguitar-google-analytics')?.src || null,
      layer: Array.isArray(window.dataLayer) ? window.dataLayer.map(value => ({ type: Object.prototype.toString.call(value), values: Array.from(value) })) : null,
      argumentsOnly: window.__qrguitarArgumentsOnly,
      diagnostics: window.__qrguitarSmokeDiagnostics
    })`);
    throw new Error(`${error.message}; requests=${JSON.stringify(requests)}; browser=${diagnostic}`);
  }
  const firstCollect = requests.find(url => url.startsWith("https://www.google-analytics.com/g/collect"));
  const firstUrl = new URL(firstCollect);
  assert.equal(firstUrl.searchParams.get("en"), "page_view");
  assert.equal(firstUrl.searchParams.get("dl"), "https://www.qrguitar.com/_measurement/privacy");
  assert.equal(firstUrl.searchParams.get("dr"), "");
  assert.equal(firstUrl.searchParams.get("rc"), "privacy");
  assert.equal(await evaluate("window.__qrguitarArgumentsOnly"), true, "The provider received a non-Arguments gtag command.");

  await until(() => evaluate("Boolean(document.querySelector('aside[aria-label=\"Privacy choices\"] button'))"), "Turn-off control did not appear");
  await evaluate("document.querySelector('aside[aria-label=\"Privacy choices\"] button').click()");
  await until(() => evaluate("localStorage.getItem('qrguitar.optionalTrackingConsent.v1.analytics') === 'denied'"), "Consent was not withdrawn");
  assert.equal(await evaluate("window['ga-disable-G-ABC12345']"), true);
  assert.equal(await evaluate("Boolean(document.getElementById('qrguitar-google-analytics'))"), false);

  await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Privacy choices').click()");
  await until(() => evaluate("Array.from(document.querySelectorAll('[role=\"dialog\"] button')).some(button => button.textContent === 'Accept')"), "Re-enable choices did not open");
  const beforeReload = loadCount;
  const beforeCollect = requests.filter(url => url.startsWith("https://www.google-analytics.com/g/collect")).length;
  try { await evaluate("Array.from(document.querySelectorAll('[role=\"dialog\"] button')).find(button => button.textContent === 'Accept').click()"); } catch { /* Expected when reload replaces the execution context. */ }
  await until(() => loadCount > beforeReload, "Accepting after withdrawal did not reload the page");
  await until(() => requests.filter(url => url.startsWith("https://www.google-analytics.com/g/collect")).length > beforeCollect, "GA4 did not reactivate after the consent reload");
  assert.equal(await evaluate("localStorage.getItem('qrguitar.optionalTrackingConsent.v1.analytics')"), "accepted");
  assert.equal(await evaluate("window.__qrguitarArgumentsOnly"), true);

  console.log("GA4 browser smoke passed: zero pre-consent Google requests, Arguments queue accepted, synthetic /g/collect observed, withdrawal cleaned up, and reacceptance reloaded/reactivated.");
} finally {
  cdp?.close();
  if (browser && !browser.killed) browser.kill();
  if (!next.killed) next.kill();
  await new Promise(resolve => setTimeout(resolve, 100));
  fs.rmSync(profile, { recursive: true, force: true });
}

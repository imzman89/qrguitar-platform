import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationPath = path.join(repo, "supabase/migrations/20260918184000_paypal_webhook_scheduler.sql");
const source = fs.readFileSync(migrationPath, "utf8");

function schedulerCommand(sql) {
  const match = sql.match(/\$qrguitar_cron\$([\s\S]*?)\$qrguitar_cron\$/);
  assert.ok(match, "scheduler command must use its reviewed dollar-quoted boundary");
  return match[1];
}

function validate(sql) {
  const command = schedulerCommand(sql);
  assert.match(sql, /create extension if not exists pg_cron/i);
  assert.match(sql, /create extension if not exists pg_net/i);
  assert.match(sql, /'qrguitar-paypal-webhook-sweep'\s*,\s*'\*\/5 \* \* \* \*'/);
  assert.equal((sql.match(/qrguitar-paypal-webhook-sweep/g) || []).length, 2, "one replacement lookup and one named job are required");
  assert.match(command, /select\s+net\.http_post\s*\(/i);
  assert.match(command, /url\s*:=\s*'https:\/\/www\.qrguitar\.com\/api\/internal\/paypal-webhook-sweep'/i);
  assert.match(command, /from\s+vault\.decrypted_secrets/i);
  assert.match(command, /name\s*=\s*'qrguitar_paypal_cron_secret'/i);
  assert.match(command, /having\s+count\(\*\)\s*=\s*1/i);
  assert.match(command, /'Authorization'\s*,\s*'Bearer '\s*\|\|\s*decrypted_secret/i);
  assert.match(command, /octet_length\(decrypted_secret\)\s+between\s+32\s+and\s+256/i);
  assert.match(command, /decrypted_secret\s*!~\s*'\[\[:space:\]\[:cntrl:\]\]'/i);
  assert.match(command, /timeout_milliseconds\s*:=\s*15000/i);
  assert.doesNotMatch(command, /billing_paypal_webhook_record_heartbeat/i, "only a completed application sweep may record readiness");
  assert.doesNotMatch(sql, /(?:secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{32,}['"]/i, "credentials must never be committed");
}

test("Supabase owns one five-minute PayPal recovery job with a Vault bearer", () => {
  validate(source);
});

test("scheduler contract rejects an unsafe cadence, host, timeout, or direct heartbeat", () => {
  const mutations = [
    source.replace("*/5 * * * *", "0 0 * * *"),
    source.replace("https://www.qrguitar.com", "https://preview.invalid"),
    source.replace("timeout_milliseconds := 15000", "timeout_milliseconds := 30000"),
    source.replace("select net.http_post(", "select public.billing_paypal_webhook_record_heartbeat('live'); select net.http_post(")
  ];
  for (const mutation of mutations) assert.throws(() => validate(mutation));
});

test("scheduler contract rejects bypassing Vault or weakening secret validation", () => {
  const mutations = [
    source.replace("from vault.decrypted_secrets", "from public.runtime_secrets"),
    source.replace("having count(*) = 1", "having count(*) >= 1"),
    source.replace("between 32 and 256", "between 1 and 256"),
    source.replace("and decrypted_secret !~ '[[:space:][:cntrl:]]'", "")
  ];
  for (const mutation of mutations) assert.throws(() => validate(mutation));
});

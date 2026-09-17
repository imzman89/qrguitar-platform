import "server-only";
import { createHash, randomUUID } from "node:crypto";

export type Environment = "test" | "live";
export type OfferKey = "profile_1" | "profile_10" | "profile_25";
export type Offer = { key: OfferKey; version: 1; currency: "usd"; amount: number; credits: number; priceId: string };
export const APPROVED_OFFERS = Object.freeze({
  profile_1: Object.freeze({ amount: 1200, credits: 1 }),
  profile_10: Object.freeze({ amount: 5000, credits: 10 }),
  profile_25: Object.freeze({ amount: 9900, credits: 25 })
});
export const BILLING_ORIGIN = "https://www.qrguitar.com";
export const CREATE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export type BillingConfig = { enabled?: boolean; environment?: Environment; secretKey?: string; webhookSecret?: string; webhookApiVersion?: string; testAppUrl?: string; prices?: Partial<Record<OfferKey, string>> };
export function readBillingConfig(env: Record<string, string | undefined>): BillingConfig {
  return { enabled: env.QRGUITAR_BILLING_ENABLED === "true", environment: env.STRIPE_ENVIRONMENT === "test" || env.STRIPE_ENVIRONMENT === "live" ? env.STRIPE_ENVIRONMENT : undefined,
    secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET, webhookApiVersion: env.STRIPE_WEBHOOK_API_VERSION, testAppUrl: env.QRGUITAR_BILLING_TEST_APP_URL,
    prices: { profile_1: env.STRIPE_PRICE_PROFILE_1, profile_10: env.STRIPE_PRICE_PROFILE_10, profile_25: env.STRIPE_PRICE_PROFILE_25 } };
}
export type Metadata = Record<string, string | undefined>;
export type StripePrice = { id: string; active: boolean; livemode: boolean; type: string; currency: string; unit_amount: number | null; billing_scheme: string; recurring?: unknown; custom_unit_amount?: unknown; transform_quantity?: unknown };
export type StripeCustomer = { id: string; livemode: boolean; metadata: Metadata; deleted?: boolean };
export type StripeSession = { id: string; livemode: boolean; mode: string; customer: string | null; client_reference_id: string | null; metadata: Metadata; status: string | null; payment_status: string; payment_intent: string | null; currency: string | null; amount_total: number | null; amount_subtotal: number | null; total_details: { amount_discount: number; amount_shipping: number | null; amount_tax: number }; subscription?: string | null; url: string | null };
export type StripeLine = { quantity: number | null; price: StripePrice | null; currency: string; amount_subtotal: number; amount_total: number; amount_discount: number; amount_tax: number };
export type StripePayment = { id: string; livemode: boolean; customer: string | null; metadata: Metadata; status: string; amount: number; amount_received: number; currency: string; latest_charge: string | null };
export type StripeCharge = { id: string; livemode: boolean; customer: string | null; payment_intent: string | null; status: string; paid: boolean; captured: boolean; amount: number; amount_captured: number; currency: string; amount_refunded: number; disputed: boolean };
export type StripeRefund = { id: string; livemode?: boolean; charge: string | null; payment_intent: string | null; amount: number; currency: string; status: string | null };
export type StripeDispute = { id: string; livemode: boolean; charge: string; payment_intent: string | null; amount: number; currency: string; status: string };
export type StripeEvent = { id: string; type: string; livemode: boolean; api_version: string | null; account?: string; data: { object: { id: string } } };
export type CheckoutParameters = {
  mode: "payment"; customer: string; client_reference_id: string; metadata: Metadata; payment_intent_data: { metadata: Metadata };
  line_items: [{ price: string; quantity: 1 }]; success_url: string; cancel_url: string;
  allow_promotion_codes: false; automatic_tax: { enabled: false }; adaptive_pricing: { enabled: false };
  after_expiration: { recovery: { enabled: false } };
};
/** Implement with the official stripe package; never implement webhook crypto here. */
export interface StripeGateway {
  retrievePrice(id: string): Promise<StripePrice>;
  createCustomer(params: { metadata: Metadata }, options: { idempotencyKey: string }): Promise<StripeCustomer>;
  retrieveCustomer(id: string): Promise<StripeCustomer>;
  findCustomers(metadata: Metadata): Promise<{ data: StripeCustomer[]; complete: boolean }>;
  createSession(params: CheckoutParameters, options: { idempotencyKey: string }): Promise<StripeSession>;
  retrieveSession(id: string): Promise<StripeSession>;
  listLineItems(id: string): Promise<{ data: StripeLine[]; has_more: boolean }>;
  findSessions(params: { customerId: string; orderId: string; ownerId: string; environment: Environment; createdAt: string }): Promise<{ data: StripeSession[]; complete: boolean }>;
  retrievePayment(id: string): Promise<StripePayment>;
  retrieveCharge(id: string): Promise<StripeCharge>;
  retrieveRefund(id: string): Promise<StripeRefund>;
  retrieveDispute(id: string): Promise<StripeDispute>;
  constructEvent(rawBody: string | Uint8Array, signature: string, endpointSecret: string): StripeEvent;
}
export type Order = { orderId: string; ownerId: string; environment: Environment; requestKey: string; status: string; offer: Offer; customerId: string | null; sessionId: string | null; paymentId: string | null; lastError: string | null; createdAt: string; updatedAt: string };
export type Actor = { id: string; accountStatus: string };
export type BillingDependencies<Context> = {
  config: BillingConfig; stripe: StripeGateway;
  /** Trusted server database scope for ledger reads; never enables provider operations. */
  ledgerEnvironment?: Environment;
  database: { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null | { code?: string } }> };
  authenticate(context: Context): Promise<Actor | null>;
  now?: () => number; timeoutMs?: number; diagnosticId?: () => string;
};
export class BillingError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly orderId?: string) { super(message); }
}
export function publicBillingError(error: unknown) {
  return error instanceof BillingError ? { status: error.status, body: { ok: false, code: error.code, message: error.message, ...(error.orderId ? { orderId: error.orderId } : {}) } }
    : { status: 503, body: { ok: false, code: "billing_unavailable", message: "Billing is temporarily unavailable. Please try again." } };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const id = (value: unknown, prefix: string): value is string => typeof value === "string" && new RegExp("^" + prefix + "[A-Za-z0-9_]+$").test(value);
const assert = (condition: unknown, code = "provider_mismatch") => { if (!condition) throw new BillingError(503, code, "This purchase needs verification before it can continue."); };
const identityKey = (kind: string, value: string) => `qrguitar:${kind}:v1:${createHash("sha256").update(value).digest("hex")}`;
function approvedOffer(value: unknown): Offer {
  const offer = object(value), spec = Object.hasOwn(APPROVED_OFFERS, String(offer.key)) ? APPROVED_OFFERS[offer.key as OfferKey] : null;
  assert(spec && offer.version === 1 && offer.currency === "usd" && offer.amount === spec.amount && offer.credits === spec.credits && id(offer.priceId, "price_"), "offer_unavailable");
  return { key: offer.key as OfferKey, version: 1, currency: "usd", amount: offer.amount as number, credits: offer.credits as number, priceId: offer.priceId as string };
}
function validatePrice(price: StripePrice, offer: Offer, environment: Environment, requireActive: boolean) {
  assert(price.id === offer.priceId && (!requireActive || price.active === true) && price.livemode === (environment === "live") && price.type === "one_time"
    && price.currency === "usd" && price.unit_amount === offer.amount && price.billing_scheme === "per_unit" && !price.recurring && !price.custom_unit_amount && !price.transform_quantity, "offer_unavailable");
}
function metadata(ownerId: string, environment: Environment, orderId?: string): Metadata {
  return { qrguitar_billing_version: "1", qrguitar_owner_id: ownerId, qrguitar_environment: environment, ...(orderId ? { qrguitar_order_id: orderId } : {}) };
}
function metadataMatches(actual: Metadata, expected: Metadata) { return actual && Object.entries(expected).every(([key, value]) => actual[key] === value); }

export function createBillingService<Context>(deps: BillingDependencies<Context>) {
  const config = structuredClone(deps.config), now = deps.now || Date.now;
  async function bounded<T>(run: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([Promise.resolve().then(run), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BillingError(503, "billing_timeout", "Billing could not confirm this request. Retry the same purchase.")), deps.timeoutMs ?? 8_000); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  function environment(purchases = false): Environment {
    const env = config.environment;
    if (!env || !config.secretKey?.startsWith(`sk_${env}_`) || !config.webhookSecret?.startsWith("whsec_") || !config.webhookApiVersion || (purchases && config.enabled !== true)) {
      throw new BillingError(503, "billing_disabled", "Paid Profile packs are not available right now.");
    }
    if (purchases) checkoutOrigin(env);
    return env;
  }
  function checkoutOrigin(env: Environment): string {
    if (env === "live") return BILLING_ORIGIN;
    try {
      const value = config.testAppUrl || "", url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password && !url.port
        && url.pathname === "/" && !url.search && !url.hash
        && (value === url.origin || value === url.origin + "/")
        && !["qrguitar.com", "www.qrguitar.com"].includes(url.hostname)) return url.origin;
    } catch { /* Invalid server configuration must never redirect a test buyer into production. */ }
    throw new BillingError(503, "billing_disabled", "The isolated test checkout destination is not configured.");
  }
  function ledgerEnvironment(): Environment {
    const env = deps.ledgerEnvironment ?? config.environment;
    if (env !== "live" && env !== "test") throw new BillingError(503, "billing_disabled", "Your billing environment could not be verified.");
    return env;
  }
  async function actor(context: Context, writing = false) {
    const value = await bounded(() => deps.authenticate(context));
    if (!value || !UUID.test(value.id)) throw new BillingError(401, "sign_in_required", "Sign in to view your purchases.");
    if (writing && value.accountStatus !== "active") throw new BillingError(403, "account_unavailable", "This account cannot make purchases.");
    return value;
  }
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await bounded(() => deps.database.rpc(name, args));
    if (result.error) {
      const code = result.error.code;
      if (code === "PT409") throw new BillingError(409, "billing_conflict", "A purchase or account review is already in progress. Reload your billing status.");
      if (code === "42501") throw new BillingError(403, "account_unavailable", "This account cannot make this billing request.");
      if (code === "P0002") throw new BillingError(404, "order_not_found", "Purchase not found.");
      throw new BillingError(503, "billing_unavailable", "Billing could not confirm this request. Retry the same purchase.");
    }
    if (result.data == null) throw new BillingError(503, "billing_unavailable", "Billing could not confirm this request. Retry the same purchase.");
    return result.data as T;
  }
  const scope = (ownerId: string, env: Environment) => ({ p_owner_id: ownerId, p_environment: env });
  function order(value: unknown, ownerId: string, env: Environment, orderId?: string): Order {
    const row = object(value);
    assert(typeof row.orderId === "string" && UUID.test(row.orderId) && (!orderId || row.orderId === orderId) && row.ownerId === ownerId && row.environment === env
      && typeof row.requestKey === "string" && UUID.test(row.requestKey) && ["reserved", "open", "fulfilled", "expired"].includes(String(row.status)) && typeof row.createdAt === "string" && Number.isFinite(Date.parse(row.createdAt)), "order_mismatch");
    assert(row.customerId === null || id(row.customerId, "cus_")); assert(row.sessionId === null || id(row.sessionId, "cs_")); assert(row.paymentId === null || id(row.paymentId, "pi_"));
    return { ...row, offer: approvedOffer(row.offer) } as Order;
  }
  async function getOrder(ownerId: string, env: Environment, orderId: string) {
    return order(await rpc("billing_get_order", { ...scope(ownerId, env), p_order_id: orderId }), ownerId, env, orderId);
  }
  async function markError(value: Order, code: string) {
    await rpc("billing_mark_order_error", { ...scope(value.ownerId, value.environment), p_order_id: value.orderId, p_code: code, p_receipt_id: (deps.diagnosticId || randomUUID)() });
  }
  async function reconciliation(value: Order): Promise<never> {
    await markError(value, "reconciliation_required");
    throw new BillingError(409, "reconciliation_required", "We need to verify the earlier purchase attempt. Do not start another payment.", value.orderId);
  }
  async function accountStatus(ownerId: string, env: Environment) {
    const account = object(await rpc("billing_account_status", scope(ownerId, env)));
    assert(account.createEnvironment === env, "billing_environment_mismatch");
    assert(account.environment === env && typeof account.hold === "boolean", "status_unavailable");
    return account;
  }
  async function assertNoHold(value: Order) {
    const account = await accountStatus(value.ownerId, value.environment);
    if (account.hold) throw new BillingError(409, "billing_review_required", "Purchases are paused while this account's billing is reviewed.", value.orderId);
  }
  function customerIdentity(customer: StripeCustomer, ownerId: string, env: Environment) {
    assert(id(customer.id, "cus_") && !customer.deleted && customer.livemode === (env === "live") && metadataMatches(customer.metadata, metadata(ownerId, env)));
  }
  async function getCustomer(value: Order, canCreate: boolean) {
    const env = value.environment, args = scope(value.ownerId, env);
    const mapping = await rpc<{ customerId: string | null }>("billing_get_customer", args);
    if (mapping.customerId) {
      assert(id(mapping.customerId, "cus_")); const found = await bounded(() => deps.stripe.retrieveCustomer(mapping.customerId!));
      assert(found.id === mapping.customerId); customerIdentity(found, value.ownerId, env); return found.id;
    }
    let customer: StripeCustomer;
    if (canCreate) customer = await bounded(() => deps.stripe.createCustomer({ metadata: metadata(value.ownerId, env) }, { idempotencyKey: identityKey("customer", `${env}:${value.ownerId}`) }));
    else {
      const found = await bounded(() => deps.stripe.findCustomers(metadata(value.ownerId, env)));
      if (!found.complete || found.data.length !== 1) return reconciliation(value);
      customer = found.data[0];
    }
    customerIdentity(customer, value.ownerId, env);
    const linked = await rpc<{ customerId: string }>("billing_link_customer", { ...args, p_customer_id: customer.id });
    assert(linked.customerId === customer.id); return customer.id;
  }
  function sessionIdentity(session: StripeSession, value: Order) {
    assert(id(session.id, "cs_") && (!value.sessionId || session.id === value.sessionId) && session.livemode === (value.environment === "live")
      && session.mode === "payment" && !session.subscription && session.customer === value.customerId && session.client_reference_id === value.orderId
      && metadataMatches(session.metadata, metadata(value.ownerId, value.environment, value.orderId))
      && session.currency === value.offer.currency && session.amount_subtotal === value.offer.amount && session.amount_total === value.offer.amount
      && session.total_details?.amount_discount === 0 && (session.total_details?.amount_shipping === 0 || session.total_details?.amount_shipping === null) && session.total_details?.amount_tax === 0);
  }
  async function verifySession(value: Order, sessionId: string) {
    const session = await bounded(() => deps.stripe.retrieveSession(sessionId)); assert(session.id === sessionId); sessionIdentity(session, value);
    const lines = await bounded(() => deps.stripe.listLineItems(session.id));
    assert(lines.has_more === false && lines.data.length === 1);
    const item = lines.data[0]; assert(item.quantity === 1 && item.price && item.currency === value.offer.currency && item.amount_subtotal === value.offer.amount
      && item.amount_total === value.offer.amount && item.amount_discount === 0 && item.amount_tax === 0);
    validatePrice(item.price!, value.offer, value.environment, false);
    return session;
  }
  function parameters(value: Order, customerId: string): CheckoutParameters {
    const meta = metadata(value.ownerId, value.environment, value.orderId), origin = checkoutOrigin(value.environment);
    return { mode: "payment", customer: customerId, client_reference_id: value.orderId, metadata: meta, payment_intent_data: { metadata: meta },
      line_items: [{ price: value.offer.priceId, quantity: 1 }], success_url: `${origin}/billing/return?orderId=${value.orderId}`, cancel_url: `${origin}/billing/cancel?orderId=${value.orderId}`,
      allow_promotion_codes: false, automatic_tax: { enabled: false }, adaptive_pricing: { enabled: false }, after_expiration: { recovery: { enabled: false } } };
  }
  async function checkout(context: Context, input: unknown) {
    const env = environment(true), owner = await actor(context, true), body = object(input);
    if (Object.keys(body).some(key => key !== "offerKey" && key !== "requestId") || !Object.hasOwn(APPROVED_OFFERS, String(body.offerKey)) || typeof body.requestId !== "string" || !UUID.test(body.requestId)) {
      throw new BillingError(400, "invalid_purchase", "Choose a Profile pack and retry with the same purchase request.");
    }
    const key = body.offerKey as OfferKey, offer = approvedOffer({ key, version: 1, currency: "usd", ...APPROVED_OFFERS[key], priceId: config.prices?.[key] });
    // The private database setting is authoritative, including before reservation.
    // Test payments must never create real production entitlement or order state.
    const account = await accountStatus(owner.id, env);
    assert(typeof account.commercialExempt === "boolean", "status_unavailable");
    if (account.commercialExempt) throw new BillingError(409, "profile_access_included", "Your approved plan already includes expanded Profile access. You do not need to buy credits.");
    let value = order(await rpc("billing_reserve_order", { ...scope(owner.id, env), p_request_key: body.requestId, p_offer: offer }), owner.id, env);
    assert(value.requestKey === body.requestId && JSON.stringify(value.offer) === JSON.stringify(offer), "order_mismatch");
    if (value.status === "fulfilled" || value.status === "expired") return { orderId: value.orderId, status: value.status };
    await assertNoHold(value);
    try {
      const age = now() - Date.parse(value.createdAt), canCreate = age >= 0 && age < CREATE_RETRY_WINDOW_MS;
      if (!value.sessionId && canCreate) validatePrice(await bounded(() => deps.stripe.retrievePrice(offer.priceId)), offer, env, true);
      const customerId = await getCustomer(value, canCreate); assert(!value.customerId || value.customerId === customerId); value = { ...value, customerId };
      let sessionId = value.sessionId;
      if (!sessionId && !canCreate) {
        const found = await bounded(() => deps.stripe.findSessions({ customerId, orderId: value.orderId, ownerId: owner.id, environment: env, createdAt: value.createdAt }));
        if (!found.complete || found.data.length !== 1) return reconciliation(value);
        sessionId = found.data[0].id;
      }
      if (!sessionId) {
        if (now() - Date.parse(value.createdAt) >= CREATE_RETRY_WINDOW_MS) return reconciliation(value);
        await assertNoHold(value);
        const created = await bounded(() => deps.stripe.createSession(parameters(value, customerId), { idempotencyKey: identityKey("checkout", `${env}:${value.orderId}`) }));
        assert(id(created.id, "cs_")); sessionId = created.id;
      }
      const session = await verifySession(value, sessionId);
      value = order(await rpc("billing_link_checkout", { ...scope(owner.id, env), p_order_id: value.orderId, p_session_id: session.id, p_customer_id: customerId }), owner.id, env, value.orderId);
      if (session.status !== "open") return { orderId: value.orderId, status: session.status === "expired" ? "processing_expiry" : "processing" };
      assert(session.payment_status === "unpaid" && typeof session.url === "string");
      await assertNoHold(value);
      const url = new URL(session.url!); assert(url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.port && !url.username && !url.password);
      return { orderId: value.orderId, status: "checkout", url: url.href };
    } catch (error) {
      if (error instanceof BillingError && ["reconciliation_required", "billing_review_required"].includes(error.code)) throw error;
      await markError(value, error instanceof BillingError && error.code === "provider_mismatch" ? "provider_mismatch" : "checkout_unconfirmed");
      throw new BillingError(503, "checkout_unconfirmed", "The payment attempt could not be confirmed. Retry this same purchase; do not start another payment.", value.orderId);
    }
  }
  async function offers() {
    let env: Environment, registered: Offer[];
    try {
      env = environment(true);
      const catalog = object(await rpc("billing_catalog", { p_environment: env }));
      assert(catalog.environment === env && catalog.createEnvironment === env && Array.isArray(catalog.offers), "billing_environment_mismatch");
      registered = (catalog.offers as unknown[]).map(approvedOffer);
      assert(new Set(registered.map(value => value.key)).size === registered.length, "offer_unavailable");
    } catch { return []; }
    const values = await Promise.all((Object.keys(APPROVED_OFFERS) as OfferKey[]).map(async key => {
      try { const value = approvedOffer({ key, version: 1, currency: "usd", ...APPROVED_OFFERS[key], priceId: config.prices?.[key] });
        assert(registered.some(item => JSON.stringify(item) === JSON.stringify(value)), "offer_unavailable");
        validatePrice(await bounded(() => deps.stripe.retrievePrice(value.priceId)), value, env, true);
        return { key, version: 1, currency: "usd", amount: value.amount, credits: value.credits, permanent: true, freeAllowance: 25 };
      } catch { return null; }
    }));
    return values.filter(value => value !== null);
  }
  async function status(context: Context, orderId?: string) {
    try {
      const env = ledgerEnvironment(), owner = await actor(context);
      if (orderId !== undefined && !UUID.test(orderId)) throw new BillingError(400, "invalid_purchase", "Purchase not found.");
      const account = await accountStatus(owner.id, env);
      assert(account.freeLimit === 25 && typeof account.commercialExempt === "boolean", "status_unavailable");
      for (const key of ["ownedProfiles", "freeRemaining", "paidGranted", "paidConsumed", "paidRemaining", "paidAvailable"]) assert(Number.isSafeInteger(account[key]) && Number(account[key]) >= 0, "status_unavailable");
      const pending = account.unresolvedOrder === null ? null : order(account.unresolvedOrder, owner.id, env);
      assert(!pending || ["reserved", "open"].includes(pending.status), "status_unavailable");
      const value = orderId ? await getOrder(owner.id, env, orderId) : null;
      return { environment: env, freeLimit: 25, ownedProfiles: account.ownedProfiles as number, commercialExempt: account.commercialExempt as boolean,
        freeRemaining: account.freeRemaining as number, paidGranted: account.paidGranted as number, paidConsumed: account.paidConsumed as number,
        paidRemaining: account.paidRemaining as number, paidAvailable: account.paidAvailable as number, hold: account.hold as boolean,
        unresolvedOrder: pending ? { orderId: pending.orderId, requestId: pending.requestKey, offerKey: pending.offer.key, status: pending.status } : null,
        order: value ? { orderId: value.orderId, status: value.status, offer: { key: value.offer.key, amount: value.offer.amount, currency: value.offer.currency, credits: value.offer.credits } } : null };
    } catch (error) {
      if (error instanceof BillingError && ["billing_unavailable", "billing_timeout"].includes(error.code)) {
        throw new BillingError(error.status, error.code, "Your credit balance could not be loaded. Refresh to try again.");
      }
      throw error;
    }
  }

  async function payment(value: Order, session: StripeSession) {
    assert(session.status === "complete" && session.payment_status === "paid" && id(session.payment_intent, "pi_"));
    const paid = await bounded(() => deps.stripe.retrievePayment(session.payment_intent!));
    assert(paid.id === session.payment_intent && (!value.paymentId || value.paymentId === paid.id) && paid.livemode === (value.environment === "live") && paid.customer === value.customerId
      && paid.status === "succeeded" && paid.amount === value.offer.amount && paid.amount_received === value.offer.amount && paid.currency === value.offer.currency
      && metadataMatches(paid.metadata, metadata(value.ownerId, value.environment, value.orderId)) && id(paid.latest_charge, "ch_"));
    const charge = await bounded(() => deps.stripe.retrieveCharge(paid.latest_charge!));
    assert(charge.id === paid.latest_charge && charge.payment_intent === paid.id && charge.customer === value.customerId && charge.livemode === (value.environment === "live")
      && charge.paid === true && charge.captured === true && charge.status === "succeeded" && charge.amount === value.offer.amount && charge.amount_captured === value.offer.amount
      && charge.currency === value.offer.currency && Number.isSafeInteger(charge.amount_refunded) && charge.amount_refunded >= 0 && charge.amount_refunded <= charge.amount && typeof charge.disputed === "boolean");
    return { paid, charge };
  }
  async function eventOrder(meta: Metadata, env: Environment) {
    if (meta?.qrguitar_billing_version !== "1") return null;
    assert(meta.qrguitar_environment === env && UUID.test(meta.qrguitar_owner_id || "") && UUID.test(meta.qrguitar_order_id || ""));
    const value = await getOrder(meta.qrguitar_owner_id!, env, meta.qrguitar_order_id!);
    const mapping = await rpc<{ customerId: string | null }>("billing_get_customer", scope(value.ownerId, env));
    assert(id(mapping.customerId, "cus_") && (!value.customerId || value.customerId === mapping.customerId));
    return { ...value, customerId: mapping.customerId };
  }
  async function review(value: Order, session: StripeSession, paymentId: string, eventId: string, kind: "refund" | "dispute", referenceId: string) {
    await rpc("billing_record_review", { ...scope(value.ownerId, value.environment), p_order_id: value.orderId, p_receipt: {
      eventId, sessionId: session.id, customerId: session.customer, paymentId, environment: value.environment, kind, referenceId
    } });
    return { received: true, status: "review" };
  }
  async function processSession(sessionId: string, eventId: string, env: Environment) {
    const snapshot = await bounded(() => deps.stripe.retrieveSession(sessionId)); assert(snapshot.id === sessionId);
    const value = await eventOrder(snapshot.metadata, env); if (!value) return { received: true, status: "ignored" };
    const session = await verifySession(value, sessionId);
    if (session.status === "expired" && session.payment_status === "unpaid") {
      await rpc("billing_link_checkout", { ...scope(value.ownerId, env), p_order_id: value.orderId, p_session_id: session.id, p_customer_id: value.customerId });
      await rpc("billing_record_checkout_expired", { ...scope(value.ownerId, env), p_order_id: value.orderId, p_receipt: { eventId, sessionId: session.id, customerId: session.customer, environment: env, status: "expired", paymentStatus: "unpaid" } });
      return { received: true, status: "expired" };
    }
    if (session.status !== "complete" || session.payment_status !== "paid") {
      await markError(value, "payment_pending"); return { received: true, status: "processing" };
    }
    const { paid, charge } = await payment(value, session);
    const reviewKind = charge.disputed ? "dispute" : charge.amount_refunded > 0 ? "refund" : null;
    // Commit the account hold first. If granting then fails, a retry can safely
    // replay both receipts without ever exposing reversed credits for spending.
    if (reviewKind) await review(value, session, paid.id, `${eventId}:review:${reviewKind}`, reviewKind, charge.id);
    const result = await rpc<{ granted: boolean; alreadyGranted: boolean }>("billing_fulfill_order", { ...scope(value.ownerId, env), p_order_id: value.orderId, p_receipt: {
      eventId, sessionId: session.id, customerId: session.customer, paymentId: paid.id, priceId: value.offer.priceId, amount: value.offer.amount, currency: value.offer.currency,
      credits: value.offer.credits, quantity: 1, environment: env, status: "complete", paymentStatus: "paid"
    } });
    assert(result.granted === true || result.alreadyGranted === true, "fulfillment_unconfirmed");
    return { received: true, status: reviewKind ? "review" : "fulfilled" };
  }
  async function processReview(event: StripeEvent, env: Environment) {
    let chargeId: string, kind: "refund" | "dispute", referenceId = event.data.object.id;
    let reversal: StripeRefund | StripeDispute | undefined;
    if (event.type.startsWith("charge.dispute.")) {
      assert(id(referenceId, "dp_")); reversal = await bounded(() => deps.stripe.retrieveDispute(referenceId)); kind = "dispute";
      assert(reversal.id === referenceId && reversal.livemode === (env === "live") && id(reversal.charge, "ch_")); chargeId = reversal.charge!;
    } else if (event.type.startsWith("refund.")) {
      assert(id(referenceId, "re_")); reversal = await bounded(() => deps.stripe.retrieveRefund(referenceId)); kind = "refund";
      assert(reversal.id === referenceId && (reversal.livemode === undefined || reversal.livemode === (env === "live")));
      if (reversal.status === "failed" || reversal.status === "canceled") return { received: true, status: "ignored" };
      assert(["pending", "succeeded", "requires_action"].includes(reversal.status || ""));
      if (reversal.charge) chargeId = reversal.charge;
      else {
        if (!reversal.payment_intent) return { received: true, status: "ignored" };
        const related = await bounded(() => deps.stripe.retrievePayment(reversal!.payment_intent!));
        assert(related.id === reversal.payment_intent);
        if (related.metadata?.qrguitar_billing_version !== "1") return { received: true, status: "ignored" };
        assert(id(related.latest_charge, "ch_")); chargeId = related.latest_charge!;
      }
    } else { assert(id(referenceId, "ch_")); chargeId = referenceId; kind = "refund"; }
    const charge = await bounded(() => deps.stripe.retrieveCharge(chargeId)); assert(charge.id === chargeId);
    // Legacy non-Checkout charges cannot belong to this PaymentIntent-backed flow.
    if (!charge.payment_intent) return { received: true, status: "ignored" };
    assert(id(charge.payment_intent, "pi_"));
    const paid = await bounded(() => deps.stripe.retrievePayment(charge.payment_intent!)); assert(paid.id === charge.payment_intent);
    const value = await eventOrder(paid.metadata, env); if (!value) return { received: true, status: "ignored" };
    if (reversal) assert((reversal.payment_intent === null || reversal.payment_intent === paid.id) && reversal.currency === value.offer.currency && Number.isSafeInteger(reversal.amount) && reversal.amount > 0 && reversal.amount <= value.offer.amount);
    else assert(charge.amount_refunded > 0);
    let sessionId = value.sessionId;
    if (!sessionId) {
      const found = await bounded(() => deps.stripe.findSessions({ customerId: value.customerId!, orderId: value.orderId, ownerId: value.ownerId, environment: env, createdAt: value.createdAt }));
      assert(found.complete && found.data.length === 1); sessionId = found.data[0].id;
    }
    const session = await verifySession(value, sessionId); const verified = await payment(value, session);
    assert(verified.paid.id === paid.id && verified.charge.id === charge.id);
    return review(value, session, paid.id, event.id, kind, referenceId);
  }
  async function webhook(rawBody: string | Uint8Array, signature: string | null) {
    const env = environment();
    if (!signature || (typeof rawBody !== "string" && !(rawBody instanceof Uint8Array))) throw new BillingError(400, "invalid_signature", "Invalid payment notification.");
    let event: StripeEvent;
    try { event = deps.stripe.constructEvent(rawBody, signature, config.webhookSecret!); }
    catch { throw new BillingError(400, "invalid_signature", "Invalid payment notification."); }
    assert(id(event.id, "evt_") && event.livemode === (env === "live") && !event.account && event.api_version === config.webhookApiVersion, "event_configuration_mismatch");
    const sessionTypes = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"];
    if (sessionTypes.includes(event.type)) { assert(id(event.data?.object?.id, "cs_")); return processSession(event.data.object.id, event.id, env); }
    if (["charge.refunded", "refund.created", "refund.updated", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed", "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated"].includes(event.type)) return processReview(event, env);
    return { received: true, status: "ignored" };
  }
  return { offers, checkout, status, webhook };
}

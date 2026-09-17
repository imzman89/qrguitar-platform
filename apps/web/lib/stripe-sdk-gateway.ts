import "server-only";
import Stripe from "stripe";
import type { BillingConfig, Metadata, StripeGateway, StripeCustomer, StripePrice, StripeSession, StripeLine, StripePayment, StripeCharge, StripeRefund, StripeDispute } from "./billing-service";

export const STRIPE_SDK_VERSION = "22.6.2";
export const STRIPE_API_VERSION = "2026-08-26.dahlia" satisfies Stripe.LatestApiVersion;
export const STRIPE_REQUEST_TIMEOUT_MS = 2_500;
export const STRIPE_NETWORK_RETRIES = 1;
export const STRIPE_RECOVERY_BUDGET_MS = 6_000;

type GatewayOptions = {
  /** Offline transport injection for tests; never derive this from a request. */
  httpClient?: Stripe.HttpClient;
  maxRecoveryPages?: number;
  recoveryBudgetMs?: number;
  now?: () => number;
};
const reference = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id || null;
function metadata(value: Metadata): Stripe.MetadataParam {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
function customer(value: Stripe.Customer | Stripe.DeletedCustomer): StripeCustomer {
  if (value.deleted) return { id: value.id, deleted: true, livemode: false, metadata: {} };
  return { id: value.id, livemode: value.livemode, metadata: { ...value.metadata } };
}
function price(value: Stripe.Price): StripePrice {
  return { id: value.id, active: value.active, livemode: value.livemode, type: value.type, currency: value.currency, unit_amount: value.unit_amount,
    billing_scheme: value.billing_scheme, recurring: value.recurring, custom_unit_amount: value.custom_unit_amount, transform_quantity: value.transform_quantity };
}
function session(value: Stripe.Checkout.Session): StripeSession {
  if (!value.total_details) throw new Error("Incomplete Checkout amounts.");
  return { id: value.id, livemode: value.livemode, mode: value.mode, customer: reference(value.customer), client_reference_id: value.client_reference_id,
    metadata: { ...value.metadata }, status: value.status, payment_status: value.payment_status, payment_intent: reference(value.payment_intent),
    currency: value.currency, amount_total: value.amount_total, amount_subtotal: value.amount_subtotal,
    total_details: { amount_discount: value.total_details.amount_discount, amount_shipping: value.total_details.amount_shipping, amount_tax: value.total_details.amount_tax },
    subscription: reference(value.subscription), url: value.url };
}
function line(value: Stripe.LineItem): StripeLine {
  return { quantity: value.quantity, price: value.price ? price(value.price) : null, currency: value.currency, amount_subtotal: value.amount_subtotal,
    amount_total: value.amount_total, amount_discount: value.amount_discount, amount_tax: value.amount_tax };
}
function payment(value: Stripe.PaymentIntent): StripePayment {
  return { id: value.id, livemode: value.livemode, customer: reference(value.customer), metadata: { ...value.metadata }, status: value.status, amount: value.amount,
    amount_received: value.amount_received, currency: value.currency, latest_charge: reference(value.latest_charge) };
}
function charge(value: Stripe.Charge): StripeCharge {
  return { id: value.id, livemode: value.livemode, customer: reference(value.customer), payment_intent: reference(value.payment_intent), status: value.status,
    paid: value.paid, captured: value.captured, amount: value.amount, amount_captured: value.amount_captured, currency: value.currency,
    amount_refunded: value.amount_refunded, disputed: value.disputed };
}
function refund(value: Stripe.Refund): StripeRefund {
  return { id: value.id, charge: reference(value.charge), payment_intent: reference(value.payment_intent), amount: value.amount, currency: value.currency, status: value.status ?? null };
}
function dispute(value: Stripe.Dispute): StripeDispute {
  return { id: value.id, livemode: value.livemode, charge: reference(value.charge)!, payment_intent: reference(value.payment_intent), amount: value.amount, currency: value.currency, status: value.status };
}

/** Lazy construction lets an unconfigured app build and return disabled offers. */
export function createOfficialStripeGateway(settings: BillingConfig, options: GatewayOptions = {}): StripeGateway {
  const config = structuredClone(settings), now = options.now || Date.now;
  const maxPages = options.maxRecoveryPages ?? 10, budget = options.recoveryBudgetMs ?? STRIPE_RECOVERY_BUDGET_MS;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100 || !Number.isInteger(budget) || budget < 1 || budget > STRIPE_RECOVERY_BUDGET_MS) throw new Error("Invalid recovery bounds.");
  let sdk: Stripe | undefined;
  function client() {
    if (!sdk) {
      if (!config.environment || !config.secretKey?.startsWith(`sk_${config.environment}_`) || config.webhookApiVersion !== STRIPE_API_VERSION) throw new Error("Stripe configuration is incomplete or incompatible.");
      sdk = new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION, timeout: STRIPE_REQUEST_TIMEOUT_MS, maxNetworkRetries: STRIPE_NETWORK_RETRIES,
        telemetry: false, ...(options.httpClient ? { httpClient: options.httpClient } : {}) });
    }
    return sdk;
  }
  async function paginate<T extends { id: string }>(fetchPage: (cursor: string | undefined, requestOptions: Stripe.RequestOptions) => Promise<Stripe.ApiList<T>>, matches: (value: T) => boolean) {
    const deadline = now() + budget, data: T[] = [], seen = new Set<string>(); let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const remaining = deadline - now(); if (remaining <= 0) return { data, complete: false };
      const result = await fetchPage(cursor, { timeout: Math.max(1, Math.min(STRIPE_REQUEST_TIMEOUT_MS, remaining)), maxNetworkRetries: 0 });
      if (!Array.isArray(result.data) || typeof result.has_more !== "boolean") throw new Error("Incomplete Stripe recovery page.");
      for (const item of result.data) {
        if (!item.id || seen.has(item.id)) return { data, complete: false };
        seen.add(item.id); if (matches(item)) data.push(item);
      }
      if (!result.has_more) return { data, complete: true };
      if (!result.data.length) return { data, complete: false };
      cursor = result.data.at(-1)!.id;
    }
    return { data, complete: false };
  }
  return {
    async retrievePrice(id) { return price(await client().prices.retrieve(id)); },
    async createCustomer(params, requestOptions) {
      const body: Stripe.CustomerCreateParams = { metadata: metadata(params.metadata) };
      return customer(await client().customers.create(body, { idempotencyKey: requestOptions.idempotencyKey }));
    },
    async retrieveCustomer(id) { return customer(await client().customers.retrieve(id)); },
    async findCustomers(expected) {
      // Listing avoids search-index lag. A bounded incomplete scan cannot authorize
      // a replacement customer; the service leaves the original order unresolved.
      const result = await paginate<Stripe.Customer>((cursor, requestOptions) => client().customers.list({ limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, requestOptions),
        value => Object.entries(expected).every(([key, valueExpected]) => value.metadata?.[key] === valueExpected));
      return { complete: result.complete, data: result.data.map(customer) };
    },
    async createSession(params, requestOptions) {
      const body: Stripe.Checkout.SessionCreateParams = { ...params, metadata: metadata(params.metadata), payment_intent_data: { metadata: metadata(params.payment_intent_data.metadata) } };
      return session(await client().checkout.sessions.create(body, { idempotencyKey: requestOptions.idempotencyKey }));
    },
    async retrieveSession(id) { return session(await client().checkout.sessions.retrieve(id)); },
    async listLineItems(id) {
      const result = await client().checkout.sessions.listLineItems(id, { limit: 2 });
      return { has_more: result.has_more, data: result.data.map(line) };
    },
    async findSessions(query) {
      const created = Date.parse(query.createdAt);
      if (!Number.isFinite(created)) throw new Error("Invalid order creation time.");
      const expected = { qrguitar_billing_version: "1", qrguitar_order_id: query.orderId, qrguitar_owner_id: query.ownerId, qrguitar_environment: query.environment };
      const result = await paginate<Stripe.Checkout.Session>((cursor, requestOptions) => client().checkout.sessions.list({ customer: query.customerId, created: { gte: Math.max(0, Math.floor(created / 1000) - 300) }, limit: 100,
        ...(cursor ? { starting_after: cursor } : {}) }, requestOptions), value => reference(value.customer) === query.customerId && Object.entries(expected).every(([key, expectedValue]) => value.metadata?.[key] === expectedValue));
      return { complete: result.complete, data: result.data.map(session) };
    },
    async retrievePayment(id) { return payment(await client().paymentIntents.retrieve(id)); },
    async retrieveCharge(id) { return charge(await client().charges.retrieve(id)); },
    async retrieveRefund(id) { return refund(await client().refunds.retrieve(id)); },
    async retrieveDispute(id) { return dispute(await client().disputes.retrieve(id)); },
    constructEvent(rawBody, signature, endpointSecret) {
      const event = client().webhooks.constructEvent(rawBody, signature, endpointSecret);
      const value = event.data.object as { id?: unknown };
      return { id: event.id, type: event.type, livemode: event.livemode, api_version: event.api_version ?? null, ...(event.account ? { account: event.account } : {}),
        data: { object: { id: typeof value.id === "string" ? value.id : "" } } };
    }
  };
}

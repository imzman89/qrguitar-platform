import "server-only";
import { BillingError } from "./billing-service";
import { DIRECT_OFFERS, directPaymentUrl, isDirectMethod, type DirectOrder, type DirectOfferKey } from "./direct-payments";
import type { DirectPaymentsConfig } from "./direct-payments-config";

type Environment = "test" | "live";
type Actor = { id: string; accountStatus: string; role: string };
type Dependencies<Context> = {
  config: DirectPaymentsConfig; environment: Environment;
  database: { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null | { code?: string } }> };
  authenticate(context: Context): Promise<Actor | null>; timeoutMs?: number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const plainText = (value: unknown, max: number, min = 0): value is string => typeof value === "string" && value.trim().length >= min && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const fail = (code = "payment_unavailable", message = "This payment could not be verified. Refresh its status before continuing."): never => { throw new BillingError(503, code, message); };

export function createDirectPaymentsService<Context>(deps: Dependencies<Context>) {
  const config = structuredClone(deps.config), environment = deps.environment;
  async function bounded<T>(fn: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([Promise.resolve().then(fn), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BillingError(503, "payment_timeout", "The result could not be confirmed. Refresh or retry the same request.")), deps.timeoutMs ?? 8000); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await bounded(() => deps.database.rpc(name, args));
    if (result.error) {
      if (["PT409", "23505"].includes(result.error.code || "")) throw new BillingError(409, "payment_conflict", "This order or payment needs review. Refresh the existing order before starting another payment.");
      if (result.error.code === "42501") throw new BillingError(403, "payment_forbidden", "This account cannot make that payment request.");
      if (result.error.code === "P0002") throw new BillingError(404, "payment_not_found", "Payment order not found.");
      if (result.error.code === "22023") throw new BillingError(400, "invalid_payment", "Check the payment details and try again.");
      return fail();
    }
    if (result.data == null) return fail();
    return result.data;
  }
  const scope = (ownerId: string) => ({ p_owner_id: ownerId, p_environment: environment });
  async function actor(context: Context, writing = false, admin = false) {
    const value = await bounded(() => deps.authenticate(context));
    if (!value || !validId(value.id)) throw new BillingError(401, "sign_in_required", "Sign in to continue.");
    if ((writing || admin) && value.accountStatus !== "active") throw new BillingError(403, "account_unavailable", "Your account cannot make this request.");
    if (admin && value.role !== "admin") throw new BillingError(403, "admin_required", "Payment review requires an active administrator account.");
    return value;
  }
  function order(input: unknown, ownerId?: string, adminView = false): DirectOrder {
    const row = obj(input), offer = obj(row.offer), recipient = obj(row.recipient), claim = obj(row.claim);
    const approved = DIRECT_OFFERS.find(value => value.key === offer.key);
    if (!validId(row.orderId) || !validId(row.ownerId) || (ownerId && row.ownerId !== ownerId) || row.environment !== environment
      || !validId(row.requestKey) || !isDirectMethod(row.provider) || !approved || offer.amount !== approved.amount || offer.credits !== approved.credits
      || offer.currency !== "usd" || offer.version !== 1 || !["reserved", "open", "fulfilled", "expired"].includes(String(row.status))
      || !plainText(recipient.accountKey, 120, 3) || !plainText(recipient.displayName, 120, 1)
      || !((recipient.address === null) || plainText(recipient.address, 200, 1))
      || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) return fail("invalid_order");
    const paymentUrl = recipient.paymentUrl === null ? null : directPaymentUrl(row.provider, recipient.paymentUrl);
    if ((recipient.paymentUrl !== null && !paymentUrl) || (!paymentUrl && !recipient.address)) return fail("invalid_recipient");
    if (claim.reference !== undefined && !plainText(claim.reference, 200)) return fail("invalid_order");
    return {
      orderId: row.orderId, ownerId: row.ownerId, requestId: row.requestKey, offerKey: approved.key,
      method: row.provider, status: row.status === "fulfilled" ? "fulfilled" : row.status === "expired" ? "closed" : row.claim ? "pending_review" : "awaiting_payment",
      reference: `QRG-${row.orderId}`, offer: { ...approved },
      recipient: { accountKey: adminView ? recipient.accountKey : row.provider, displayName: recipient.displayName,
        paymentUrl: adminView ? paymentUrl : null, address: adminView ? recipient.address as string | null : null },
      createdAt: row.createdAt, payerReference: typeof claim.reference === "string" ? claim.reference : null
    };
  }
  function account(input: unknown) {
    const row = obj(input);
    if (row.environment !== environment || row.createEnvironment !== environment || row.freeLimit !== 25
      || typeof row.commercialExempt !== "boolean" || typeof row.hold !== "boolean"
      || ["ownedProfiles", "freeRemaining", "paidGranted", "paidConsumed", "paidRemaining", "paidAvailable"].some(key => !Number.isSafeInteger(row[key]) || Number(row[key]) < 0)
      || Number(row.freeRemaining) > 25 || row.paidRemaining !== Number(row.paidGranted) - Number(row.paidConsumed)
      || row.paidAvailable !== (row.hold ? 0 : row.paidRemaining)) return fail("balance_unavailable", "Your credit balance could not be verified. Refresh before continuing.");
    let unresolvedOrder = null;
    if (row.unresolvedOrder !== null) {
      const pending = obj(row.unresolvedOrder), offer = obj(pending.offer);
      if (!validId(pending.orderId) || !validId(pending.requestKey) || !DIRECT_OFFERS.some(value => value.key === offer.key)
        || !["reserved", "open"].includes(String(pending.status))) return fail("balance_unavailable");
      unresolvedOrder = { orderId: pending.orderId, requestId: pending.requestKey, offerKey: offer.key, status: pending.status };
    }
    return { environment, freeLimit: 25 as const, ownedProfiles: row.ownedProfiles as number, freeRemaining: row.freeRemaining as number,
      paidGranted: row.paidGranted as number, paidConsumed: row.paidConsumed as number, paidRemaining: row.paidRemaining as number,
      paidAvailable: row.paidAvailable as number, commercialExempt: row.commercialExempt, hold: row.hold, unresolvedOrder, order: null };
  }
  async function status(context: Context, orderId?: string) {
    const owner = await actor(context);
    if (orderId !== undefined && !validId(orderId)) throw new BillingError(400, "invalid_payment", "Payment order not found.");
    const result = obj(await rpc("billing_direct_status", { ...scope(owner.id), p_order_id: orderId || null }));
    const snapshot = account(result.account);
    const directOrder = result.order == null ? null : order(result.order, owner.id);
    const pendingOrder = result.pendingOrder == null ? null : order(result.pendingOrder, owner.id);
    if (orderId && directOrder?.orderId !== orderId) return fail("invalid_order");
    return { ...snapshot, directOrder, pendingOrder, enabled: config.enabled && config.methods.length > 0,
      methods: config.enabled ? config.methods.map(({ key, label }) => ({ key, label })) : [],
      offers: config.enabled && config.methods.length ? DIRECT_OFFERS.map(value => ({ ...value })) : [], approvalMessage: config.approvalMessage };
  }
  async function checkout(context: Context, input: unknown) {
    const owner = await actor(context, true), body = obj(input);
    if (Object.keys(body).some(key => !["offerKey", "method", "requestId"].includes(key))
      || !validId(body.requestId) || !isDirectMethod(body.method) || !DIRECT_OFFERS.some(value => value.key === body.offerKey)) {
      throw new BillingError(400, "invalid_payment", "Choose a Profile pack and payment method.");
    }
    // The request identity remains recoverable even after receiving configuration changes.
    const existing = obj(await rpc("billing_direct_find_order", { ...scope(owner.id), p_request_key: body.requestId }));
    if (existing.order) {
      const previous = order(existing.order, owner.id);
      if (previous.offerKey !== body.offerKey || previous.method !== body.method) throw new BillingError(409, "payment_conflict", "Retry this purchase with its original pack and payment method.");
      return { order: previous };
    }
    const method = config.methods.find(value => value.key === body.method);
    if (!config.enabled || !method) throw new BillingError(503, "billing_disabled", "Payments are not available right now. Your existing Profiles and credits are unchanged.");
    const balance = account(await rpc("billing_account_status", scope(owner.id)));
    if (balance.commercialExempt) throw new BillingError(409, "profile_access_included", "Your approved plan already includes expanded Profile access. You do not need credits.");
    if (balance.hold) throw new BillingError(409, "billing_review_required", "New purchases are paused while your billing is reviewed.");
    const recipient = { ...method.recipient, paymentUrl: method.links[body.offerKey as DirectOfferKey] || null };
    const placed = order(await rpc("billing_direct_reserve_order", { ...scope(owner.id), p_request_key: body.requestId, p_offer_key: body.offerKey, p_provider: body.method, p_recipient: recipient }), owner.id);
    if (placed.requestId !== body.requestId || placed.offerKey !== body.offerKey || placed.method !== body.method) return fail("invalid_order");
    return { order: placed };
  }
  async function claim(context: Context, input: unknown) {
    const owner = await actor(context, true), body = obj(input);
    if (Object.keys(body).some(key => !["orderId", "requestId", "reference"].includes(key))
      || !validId(body.orderId) || !validId(body.requestId) || !plainText(body.reference, 200)) {
      throw new BillingError(400, "invalid_payment", "Check your order and payment reference.");
    }
    const value = order(await rpc("billing_direct_claim_order", { ...scope(owner.id), p_order_id: body.orderId, p_claim_id: body.requestId, p_reference: body.reference.trim() }), owner.id);
    if (value.orderId !== body.orderId) return fail("invalid_order");
    return { order: value };
  }
  async function queue(context: Context, orderId?: string) {
    const admin = await actor(context, false, true);
    if (orderId !== undefined && !validId(orderId)) throw new BillingError(400, "invalid_payment", "Enter a complete QRguitar order reference.");
    const result = obj(await rpc("billing_direct_list_orders", { p_operator_id: admin.id, p_environment: environment, p_order_id: orderId || null }));
    if (!Array.isArray(result.orders) || result.orders.length > 100 || typeof result.hasMore !== "boolean") return fail();
    const orders = result.orders.map(value => order(value, undefined, true));
    if (orderId && (orders.length > 1 || orders.some(value => value.orderId !== orderId) || result.hasMore)) return fail();
    return { environment, orders, hasMore: result.hasMore };
  }
  async function decide(context: Context, input: unknown) {
    const admin = await actor(context, true, true), body = obj(input);
    if (!validId(body.orderId) || !validId(body.requestId) || !plainText(body.reason, 1000, 10)) throw new BillingError(400, "invalid_review", "Include an order, decision reference, and a review reason of 10–1000 characters.");
    const base = { p_environment: environment, p_order_id: body.orderId, p_operator_id: admin.id, p_reason: body.reason.trim() };
    let result: unknown;
    if (body.action === "verify") {
      if (Object.keys(body).some(key => !["action", "orderId", "requestId", "paymentReference", "amount", "currency", "reason"].includes(key))
        || !plainText(body.paymentReference, 200, 3) || !Number.isSafeInteger(body.amount) || Number(body.amount) <= 0 || body.currency !== "usd") {
        throw new BillingError(400, "invalid_review", "Enter the actual completed payment reference, amount, currency, and reason.");
      }
      result = await rpc("billing_direct_verify_order", { ...base, p_verification_id: body.requestId, p_payment_reference: body.paymentReference.trim(), p_amount: body.amount, p_currency: body.currency });
    } else if (body.action === "close") {
      if (Object.keys(body).some(key => !["action", "orderId", "requestId", "reason"].includes(key))) throw new BillingError(400, "invalid_review", "Invalid closure request.");
      result = await rpc("billing_direct_close_order", { ...base, p_decision_id: body.requestId });
    } else if (body.action === "review") {
      if (Object.keys(body).some(key => !["action", "orderId", "requestId", "kind", "paymentReference", "reason"].includes(key))
        || !["refund", "dispute"].includes(String(body.kind)) || !plainText(body.paymentReference, 200, 3)) throw new BillingError(400, "invalid_review", "Include the original incoming payment transaction reference. Put the refund or dispute details in the reason.");
      result = await rpc("billing_direct_record_review", { ...base, p_decision_id: body.requestId, p_kind: body.kind, p_reference: body.paymentReference.trim() });
    } else throw new BillingError(400, "invalid_review", "Choose a supported payment review action.");
    const value = order(result, undefined, true);
    if (value.orderId !== body.orderId) return fail("invalid_order");
    return { order: value };
  }
  return { status, checkout, claim, queue, decide };
}

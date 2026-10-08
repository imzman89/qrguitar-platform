import { BillingError } from "../../../../lib/billing-service";
import { profileBillingEnvironment } from "../../../../lib/billing-environment";
import { readBillingBody } from "../../../../lib/billing-http";
import { getSupabaseEnvStatus } from "../../../../lib/supabase-server";
import { adminJson, requireAdmin } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Json = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const integer = (value: unknown, minimum: number, maximum: number, nullable = false) => {
  if (nullable && (value === null || value === "" || value === undefined)) return null;
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new BillingError(400, "invalid_promotion", "Check the promotion values and try again.");
  return Number(value);
};
const date = (value: unknown) => {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new BillingError(400, "invalid_promotion", "Enter valid promotion dates.");
  return new Date(value).toISOString();
};
function environment() {
  const settings = getSupabaseEnvStatus(), value = profileBillingEnvironment(process.env, settings.supabaseUrl);
  if (!value) throw new BillingError(503, "billing_disabled", "Billing environment is not configured.");
  return value;
}
function errorResponse(error: unknown) {
  if (error instanceof BillingError) return adminJson({ ok: false, code: error.code, message: error.message }, { status: error.status });
  const row = object(error), code = String(row.code || "");
  if (["PT409", "23505"].includes(code)) return adminJson({ ok: false, code: "promotion_conflict", message: "That promotion changed or its code already exists. Refresh and try again." }, { status: 409 });
  if (code === "P0002") return adminJson({ ok: false, code: "promotion_not_found", message: "Promotion not found." }, { status: 404 });
  if (code === "42501") return adminJson({ ok: false, code: "admin_required", message: "Active admin access is required." }, { status: 403 });
  return adminJson({ ok: false, code: "promotion_unavailable", message: "Promotion settings could not be saved. Check the values and try again." }, { status: 400 });
}
async function body(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.has("origin") && request.headers.get("origin") !== new URL(request.url).origin))
    throw new BillingError(403, "origin_not_allowed", "Open Admin from QRguitar to continue.");
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json"
    || (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity"))
    throw new BillingError(415, "invalid_content_type", "Send a JSON request.");
  const bytes = await readBillingBody(request, 16384, 10000);
  try { return object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
  catch { throw new BillingError(400, "invalid_body", "Invalid promotion request."); }
}
function config(value: unknown, includeCode: boolean) {
  const row = object(value), code = String(row.code || "").trim().toUpperCase(), name = String(row.name || "").trim();
  const description = String(row.description || "").trim(), status = row.status, audience = row.audience, discountType = row.discountType;
  const eligible = Array.isArray(row.eligibleOfferKeys) ? [...new Set(row.eligibleOfferKeys)] : [];
  if ((includeCode && !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) || name.length < 1 || name.length > 80 || description.length > 500
    || (includeCode && status !== "active" && status !== "paused") || !["everyone", "admin"].includes(String(audience))
    || !["fixed_total", "amount_off", "percent_off"].includes(String(discountType))
    || eligible.length < 1 || eligible.length > 3 || eligible.some(key => !["profile_1", "profile_10", "profile_25"].includes(String(key))))
    throw new BillingError(400, "invalid_promotion", "Complete the promotion settings and choose at least one Profile pack.");
  const discountValue = integer(row.discountValue, discountType === "fixed_total" ? 30 : 1, discountType === "percent_off" ? 10000 : 100000000);
  const minimumAmount = integer(row.minimumAmount ?? 0, 0, 100000000);
  const startsAt = date(row.startsAt), endsAt = date(row.endsAt);
  if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) throw new BillingError(400, "invalid_promotion", "The end date must be after the start date.");
  const maxRedemptions = integer(row.maxRedemptions, 1, 100000000, true);
  const maxRedemptionsPerOwner = integer(row.maxRedemptionsPerOwner, 1, 100000000, true);
  if (maxRedemptions !== null && maxRedemptionsPerOwner !== null && maxRedemptionsPerOwner > maxRedemptions)
    throw new BillingError(400, "invalid_promotion", "Per-account uses cannot exceed total uses.");
  return { ...(includeCode ? { code, status } : {}), name, description, audience, discountType, discountValue, minimumAmount,
    eligibleOfferKeys: eligible, startsAt, endsAt, maxRedemptions, maxRedemptionsPerOwner };
}

export async function GET(request: Request) {
  const access = await requireAdmin(request); if (!access.ok) return access.response;
  try {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => key !== "promotionId") || query.getAll("promotionId").length > 1) throw new BillingError(400, "invalid_promotion", "Invalid promotion request.");
    const promotionId = query.get("promotionId"), env = environment(), common = { p_operator_id: access.admin.user!.id,
      p_allow_environment_admin: access.admin.accessSource === "env", p_environment: env };
    const result = promotionId
      ? UUID.test(promotionId) ? await access.supabase.rpc("billing_promo_admin_redemptions", { ...common, p_promotion_id: promotionId }) : { data: null, error: { code: "P0002" } }
      : await access.supabase.rpc("billing_promo_admin_list", common);
    if (result.error) throw result.error;
    return adminJson({ ok: true, ...object(result.data) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const access = await requireAdmin(request); if (!access.ok) return access.response;
  try {
    const input = await body(request), action = String(input.action || ""), env = environment(), common = {
      p_operator_id: access.admin.user!.id, p_operator_email: access.admin.email,
      p_allow_environment_admin: access.admin.accessSource === "env", p_environment: env
    };
    let result;
    if (action === "create") {
      const value = config(input.promotion, true);
      result = await access.supabase.rpc("billing_promo_admin_create", { ...common, p_code: value.code, p_name: value.name,
        p_description: value.description, p_status: value.status, p_audience: value.audience, p_discount_type: value.discountType,
        p_discount_value: value.discountValue, p_minimum_amount: value.minimumAmount, p_eligible_offer_keys: value.eligibleOfferKeys,
        p_starts_at: value.startsAt, p_ends_at: value.endsAt, p_max_redemptions: value.maxRedemptions,
        p_max_redemptions_per_owner: value.maxRedemptionsPerOwner, p_reason: `Created promotion ${value.code} from QRguitar Admin.` });
    } else if (action === "update") {
      const value = config(input.promotion, false), promotionId = String(input.promotionId || ""), revision = integer(input.expectedRevision, 1, 2147483647);
      if (!UUID.test(promotionId)) throw new BillingError(400, "invalid_promotion", "Invalid promotion.");
      result = await access.supabase.rpc("billing_promo_admin_update", { ...common, p_promotion_id: promotionId,
        p_expected_revision: revision, p_name: value.name, p_description: value.description, p_audience: value.audience,
        p_discount_type: value.discountType, p_discount_value: value.discountValue, p_minimum_amount: value.minimumAmount,
        p_eligible_offer_keys: value.eligibleOfferKeys, p_starts_at: value.startsAt, p_ends_at: value.endsAt,
        p_max_redemptions: value.maxRedemptions, p_max_redemptions_per_owner: value.maxRedemptionsPerOwner,
        p_reason: "Updated promotion settings from QRguitar Admin." });
    } else if (action === "status") {
      const promotionId = String(input.promotionId || ""), status = String(input.status || ""), revision = integer(input.expectedRevision, 1, 2147483647);
      if (!UUID.test(promotionId) || !["active", "paused", "archived"].includes(status)) throw new BillingError(400, "invalid_promotion", "Invalid promotion status change.");
      const verb = status === "active" ? "Resumed" : status === "paused" ? "Paused" : "Archived";
      result = await access.supabase.rpc("billing_promo_admin_set_status", { ...common, p_promotion_id: promotionId,
        p_expected_revision: revision, p_status: status, p_reason: `${verb} promotion from QRguitar Admin.` });
    } else throw new BillingError(400, "invalid_promotion", "Choose a valid promotion action.");
    if (result.error) throw result.error;
    return adminJson({ ok: true, promotion: result.data });
  } catch (error) { return errorResponse(error); }
}

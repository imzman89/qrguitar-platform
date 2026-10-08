import { paypalAdminReviewHandlers } from "../../../../lib/paypal-admin-review-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = paypalAdminReviewHandlers.list;
export const POST = paypalAdminReviewHandlers.decide;


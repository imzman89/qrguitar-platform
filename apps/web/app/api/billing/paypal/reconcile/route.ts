import { paypalHandlers } from "../../../../../lib/paypal-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = paypalHandlers.reconcile;

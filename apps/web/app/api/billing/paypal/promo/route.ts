import { paypalHandlers } from "../../../../../lib/paypal-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const POST = paypalHandlers.quote;

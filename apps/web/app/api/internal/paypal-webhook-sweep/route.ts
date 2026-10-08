import { paypalWebhookSweep } from "../../../../lib/paypal-webhook-runtime";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export const GET=paypalWebhookSweep;
export const POST=paypalWebhookSweep;

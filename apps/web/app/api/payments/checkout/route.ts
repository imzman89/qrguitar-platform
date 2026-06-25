import { NextResponse } from "next/server";
import { getPaymentItem, type PaymentItem } from "../../../../lib/payments";

type CheckoutBody = {
  itemId?: string;
  email?: string;
  transferId?: string;
  instrumentId?: string;
};

export async function POST(request: Request) {
  let body: CheckoutBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  }

  const item = getPaymentItem(body.itemId);
  if (!item) {
    return NextResponse.json({ error: "Unknown QRguitar payment item." }, { status: 400 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "http://localhost:3000";

  if (!secretKey) {
    return NextResponse.json(
      {
        error: "Checkout is unavailable until the Stripe secret key is added in Vercel."
      },
      { status: 503 }
    );
  }

  const sessionBody = buildCheckoutSessionBody(item, appUrl, body);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: sessionBody
  });

  const payload = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: payload.error?.message || "Stripe Checkout could not be created." }, { status: 502 });
  }

  return NextResponse.json({ url: payload.url, id: payload.id });
}

function buildCheckoutSessionBody(item: PaymentItem, appUrl: string, body: CheckoutBody) {
  const params = new URLSearchParams();
  const successUrl = `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = body.transferId ? `${appUrl}/transfer/${body.transferId}` : `${appUrl}/checkout/cancel?item=${item.id}`;

  params.set("mode", item.mode);
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("client_reference_id", body.transferId || body.instrumentId || item.id);
  params.set("metadata[itemId]", item.id);
  params.set("metadata[transferId]", body.transferId || "");
  params.set("metadata[instrumentId]", body.instrumentId || "");
  params.set("metadata[credits]", String(item.credits));
  params.set("metadata[includedTransferCredits]", String(item.includedTransferCredits));

  if (body.email?.trim()) {
    params.set("customer_email", body.email.trim().toLowerCase());
  }

  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][product_data][name]", `QRguitar ${item.name}`);
  params.set("line_items[0][price_data][product_data][description]", item.description);
  params.set("line_items[0][price_data][unit_amount]", String(item.unitAmount));

  if (item.mode === "subscription" && item.interval) {
    params.set("line_items[0][price_data][recurring][interval]", item.interval);
  }

  return params;
}

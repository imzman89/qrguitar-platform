import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!sessionId) {
    return NextResponse.json({ error: "Missing Checkout session id." }, { status: 400 });
  }

  if (!secretKey) {
    return NextResponse.json(
      { error: "Checkout verification is unavailable until the Stripe secret key is added in Vercel." },
      { status: 503 }
    );
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`
    },
    cache: "no-store"
  });

  const session = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: session.error?.message || "Could not verify Checkout session." }, { status: 502 });
  }

  return NextResponse.json({
    id: session.id,
    paymentStatus: session.payment_status,
    status: session.status,
    mode: session.mode,
    customerEmail: session.customer_details?.email || session.customer_email || "",
    metadata: session.metadata || {}
  });
}

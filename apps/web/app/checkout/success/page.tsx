"use client";

import { BadgeCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { applyDemoPurchase } from "../../../lib/local-demo";
import { formatPaymentAmount, getPaymentItem } from "../../../lib/payments";

type SessionPayload = {
  paymentStatus: string;
  customerEmail: string;
  metadata: Record<string, string>;
};

export default function CheckoutSuccessPage() {
  const [status, setStatus] = useState("Verifying payment...");
  const [session, setSession] = useState<SessionPayload | null>(null);

  useEffect(() => {
    async function verifySession() {
      const sessionId = new URLSearchParams(window.location.search).get("session_id");
      if (!sessionId) {
        setStatus("Missing Stripe checkout session.");
        return;
      }

      const response = await fetch(`/api/payments/session?session_id=${encodeURIComponent(sessionId)}`);
      const payload = await response.json();

      if (!response.ok) {
        setStatus(payload.error || "Payment could not be verified.");
        return;
      }

      setSession(payload);

      if (payload.paymentStatus !== "paid" && payload.paymentStatus !== "no_payment_required") {
        setStatus("Stripe has not marked this payment paid yet.");
        return;
      }

      applyDemoPurchase({
        itemId: payload.metadata.itemId || "",
        sessionId,
        customerEmail: payload.customerEmail || "",
        credits: Number(payload.metadata.credits || 0),
        includedTransferCredits: Number(payload.metadata.includedTransferCredits || 0),
        transferId: payload.metadata.transferId || undefined
      });

      setStatus("Payment confirmed. Your QRguitar account has been updated.");
    }

    void verifySession();
  }, []);

  const item = getPaymentItem(session?.metadata?.itemId);
  const transferId = session?.metadata?.transferId;

  return (
    <>
      <Nav />
      <main className="section auth-page">
        <div className="shell auth-layout">
          <section>
            <div className="eyebrow">Checkout complete</div>
            <h1>{item ? `${item.name} is ready.` : "Payment received."}</h1>
            <p>{status}</p>
            {item ? (
              <div className="payment-receipt card">
                <BadgeCheck />
                <div>
                  <strong>{item.name}</strong>
                  <span>{formatPaymentAmount(item.unitAmount)} {item.mode === "subscription" ? "per year" : "paid"}</span>
                </div>
              </div>
            ) : null}
          </section>
          <section className="card form auth-card">
            <h3>Next step</h3>
            {transferId ? (
              <>
                <p>Return to the transfer claim page and accept ownership.</p>
                <Link className="button" href={`/transfer/${transferId}`}>
                  Return to Transfer
                </Link>
              </>
            ) : (
              <>
                <p>Your account is now marked paid and verified. You can create records from the dashboard.</p>
                <Link className="button" href="/dashboard">
                  Open Dashboard
                </Link>
                <Link className="button secondary" href="/create">
                  Create Record
                </Link>
              </>
            )}
            {!session ? (
              <p className="fine-print">
                <Loader2 size={14} /> Waiting on Stripe verification.
              </p>
            ) : null}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

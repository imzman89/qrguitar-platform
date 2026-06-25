"use client";

import Link from "next/link";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { getPaymentItem } from "../../../lib/payments";

export default function CheckoutCancelPage() {
  const itemId = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("item");
  const item = getPaymentItem(itemId);

  return (
    <>
      <Nav />
      <main className="section auth-page">
        <div className="shell auth-layout">
          <section>
            <div className="eyebrow">Checkout cancelled</div>
            <h1>{item ? `${item.name} checkout was cancelled.` : "Checkout was cancelled."}</h1>
            <p>No payment was recorded. You can return to pricing or continue managing your records.</p>
          </section>
          <section className="card form auth-card">
            <Link className="button" href="/#pricing">
              Back to Pricing
            </Link>
            <Link className="button secondary" href="/dashboard">
              Open Dashboard
            </Link>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

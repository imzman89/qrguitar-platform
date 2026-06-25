"use client";

import { CreditCard } from "lucide-react";
import { useState } from "react";
import type { PaymentItemId } from "../lib/payments";

type CheckoutButtonProps = {
  itemId: PaymentItemId;
  email?: string;
  transferId?: string;
  instrumentId?: string;
  children: string;
  className?: string;
};

export function CheckoutButton({
  itemId,
  email,
  transferId,
  instrumentId,
  children,
  className = "button"
}: CheckoutButtonProps) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function startCheckout() {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ itemId, email, transferId, instrumentId })
      });

      const payload = await response.json();

      if (!response.ok || !payload.url) {
        setMessage(payload.error || "Checkout is unavailable. Try again shortly.");
        setIsLoading(false);
        return;
      }

      window.location.href = payload.url;
    } catch {
      setMessage("Checkout could not start. Check your connection and try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="checkout-button-wrap">
      <button className={className} type="button" onClick={startCheckout} disabled={isLoading}>
        <CreditCard size={16} />
        {isLoading ? "Opening Checkout..." : children}
      </button>
      {message ? <p className="checkout-message">{message}</p> : null}
    </div>
  );
}

export type PaymentItemId = "single" | "pack10" | "pack25" | "commercial" | "transfer";

export type PaymentItem = {
  id: PaymentItemId;
  name: string;
  description: string;
  unitAmount: number;
  mode: "payment" | "subscription";
  interval?: "year";
  credits: number;
  includedTransferCredits: number;
  planAfterPurchase: "paid" | "commercial";
};

export const paymentCatalog: Record<PaymentItemId, PaymentItem> = {
  single: {
    id: "single",
    name: "Single Instrument",
    description: "One permanent QRguitar instrument record.",
    unitAmount: 1200,
    mode: "payment",
    credits: 1,
    includedTransferCredits: 0,
    planAfterPurchase: "paid"
  },
  pack10: {
    id: "pack10",
    name: "10-Code Pack",
    description: "Ten permanent QRguitar instrument records.",
    unitAmount: 5000,
    mode: "payment",
    credits: 10,
    includedTransferCredits: 0,
    planAfterPurchase: "paid"
  },
  pack25: {
    id: "pack25",
    name: "25-Code Pack",
    description: "Twenty-five records with one included transfer per instrument.",
    unitAmount: 9900,
    mode: "payment",
    credits: 25,
    includedTransferCredits: 25,
    planAfterPurchase: "paid"
  },
  commercial: {
    id: "commercial",
    name: "Commercial",
    description: "Annual QRguitar commercial plan for shops, builders, and brands.",
    unitAmount: 19900,
    mode: "subscription",
    interval: "year",
    credits: 50,
    includedTransferCredits: 50,
    planAfterPurchase: "commercial"
  },
  transfer: {
    id: "transfer",
    name: "Ownership Transfer",
    description: "Paid QRguitar ownership transfer.",
    unitAmount: 700,
    mode: "payment",
    credits: 0,
    includedTransferCredits: 0,
    planAfterPurchase: "paid"
  }
};

export function getPaymentItem(id: string | null | undefined) {
  if (!id || !(id in paymentCatalog)) {
    return null;
  }

  return paymentCatalog[id as PaymentItemId];
}

export function formatPaymentAmount(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2
  }).format(cents / 100);
}

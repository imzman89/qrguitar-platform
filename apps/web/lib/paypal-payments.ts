import type { DirectOffer, DirectOfferKey } from "./direct-payments";

export type PayPalOrderStatus = "reserved" | "approval_pending" | "processing" | "fulfilled" | "cancelled" | "needs_review";
export type PayPalOrder = {
  orderId: string; ownerId: string; requestId: string; offerKey: DirectOfferKey;
  paypalOrderId: string | null; status: PayPalOrderStatus; offer: DirectOffer; createdAt: string;
};
export type PayPalPaymentsSnapshot = {
  environment: "test" | "live"; enabled: boolean; applePayEnabled: boolean; clientId: string | null; currency: "USD"; merchantName: string;
  offers: DirectOffer[]; order: PayPalOrder | null; pendingOrder: PayPalOrder | null; legacyOrderId: string | null;
  legacyOrderProvider: "direct" | "stripe" | null;
  freeLimit: 25; ownedProfiles: number; freeRemaining: number; paidGranted: number; paidConsumed: number;
  paidRemaining: number; paidAvailable: number; commercialExempt: boolean; hold: boolean;
};

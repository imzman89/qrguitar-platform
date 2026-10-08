export type PayPalReviewAction = "release" | "retain_hold";

export type PayPalWebhookDelivery = {
  deliveryId: string;
  state: "queued" | "verified" | "planned" | "retry" | "processing" | "completed" | "quarantined";
  eventId: string | null;
  eventType: string | null;
  cursor: number;
  totalItems: number | null;
  attemptCount: number;
  lastErrorCode: string | null;
  outcomeCode: string | null;
  rawAvailable: boolean | null;
  continuationAvailable: boolean | null;
  acknowledgedAt: string | null;
  nextAttemptAt: string;
  lockedUntil: string | null;
  receivedAt: string;
  updatedAt: string;
};

export type PayPalAdminReview = {
  eventId: string;
  orderId: string;
  ownerId: string;
  reference: string;
  holdReason: string;
  receiptKind: "payment" | "refund" | "dispute" | "expired" | "error";
  providerEventId: string | null;
  eventType: string | null;
  eventCursor: number | null;
  resourceKind: "capture" | "refund" | "dispute" | "order" | null;
  resourceId: string | null;
  refundId: string | null;
  disputeId: string | null;
  caseId: string | null;
  paypalOrderId: string | null;
  captureId: string | null;
  providerStatus: string | null;
  amount: number | null;
  currency: string | null;
  expectedAmount: number;
  expectedCurrency: "USD";
  credits: number;
  createdAt: string;
  lastDecision: {
    action: PayPalReviewAction;
    reason: string;
    createdAt: string;
  } | null;
};

import type { DirectOfferKey, PromotionDiscountType } from "./direct-payments";

export type PromotionStatus = "active" | "paused" | "archived";
export type PromotionAudience = "everyone" | "admin";
export const OWNER_TEST_PROMOTION_CODES = ["GARYWON", "GARYAPPLE"] as const;
export const isOwnerTestPromotion = (code: string) => OWNER_TEST_PROMOTION_CODES.includes(code as typeof OWNER_TEST_PROMOTION_CODES[number]);
export function promoAdminAuthTransition(previousActorId: string | null | undefined, nextActorId: string | null, hasLoaded: boolean) {
  const actorChanged = previousActorId !== undefined && previousActorId !== nextActorId;
  return { actorId: nextActorId, resetWorkspace: actorChanged, reload: !hasLoaded || actorChanged };
}
export type AdminPromotion = {
  id: string; code: string; name: string; description: string; status: PromotionStatus; audience: PromotionAudience;
  discountType: PromotionDiscountType; discountValue: number; minimumAmount: number; eligibleOfferKeys: DirectOfferKey[];
  startsAt: string | null; endsAt: string | null; maxRedemptions: number | null; maxRedemptionsPerOwner: number | null;
  revision: number; createdAt: string; updatedAt: string; reservedRedemptions: number; completedRedemptions: number;
  releasedRedemptions: number; adjustedRedemptions: number; grossCapturedAmount: number;
};
export type PromotionRedemption = {
  orderId: string; ownerId: string; code: string; offerKey: DirectOfferKey; credits: number;
  originalAmount: number; discountAmount: number; finalAmount: number;
  status: "reserved" | "open" | "fulfilled" | "expired"; createdAt: string;
};
export type PromotionAuditEvent = {
  id: string; action: "create" | "update" | "pause" | "resume" | "archive"; reason: string;
  operatorEmail: string | null; revision: number; createdAt: string;
};
export type PromotionForm = {
  code: string; name: string; description: string; status: "active" | "paused"; audience: PromotionAudience;
  discountType: PromotionDiscountType; discountValue: number; minimumAmount: number; eligibleOfferKeys: DirectOfferKey[];
  startsAt: string | null; endsAt: string | null; maxRedemptions: number | null; maxRedemptionsPerOwner: number | null;
};

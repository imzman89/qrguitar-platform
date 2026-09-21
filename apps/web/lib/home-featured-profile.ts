import type { DemoInstrument } from "./local-demo";
import { getProfilePhotoUrls } from "./instrument-profile-contract";
import { isEligiblePublicProfile } from "./public-profile-eligibility";

/** Use current public data without concealing safety or retirement information. */
export function selectHomeFeaturedProfile(records: DemoInstrument[]): DemoInstrument | null {
  const eligible = records.filter((record) => record.visibility === "public"
    && !record.collectionRemovedAt
    && isEligiblePublicProfile(record)
    && record.safetyStatus !== "lost" && record.safetyStatus !== "stolen"
    && getProfilePhotoUrls(record).length > 0);
  return eligible.find((record) => /guitar/i.test(record.instrumentType || "")) || eligible[0] || null;
}

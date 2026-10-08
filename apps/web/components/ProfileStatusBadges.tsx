import { ShieldCheck, Siren, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  type DemoInstrument
} from "../lib/local-demo";

type ProfileStatusBadgesProps = {
  record: DemoInstrument;
  includeCondition?: boolean;
  hideConfirmedTrust?: boolean;
  includeCategory?: boolean;
  maxBadges?: number;
  className?: string;
  ownerCollection?: DemoInstrument["publicCollection"];
};

export function ProfileStatusBadges({
  record,
  includeCondition = true,
  hideConfirmedTrust = false,
  includeCategory = false,
  maxBadges,
  className = "",
  ownerCollection
}: ProfileStatusBadgesProps) {
  const condition = getInstrumentCondition(record);
  const verificationStatus = getInstrumentVerificationStatus(record);
  const authenticityStatus = record.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed";
  const safetyStatus = record.safetyStatus === "lost" || record.safetyStatus === "stolen" || record.safetyStatus === "recovered"
    ? record.safetyStatus
    : "clear";
  const saleStatus = record.saleStatus === "for_sale" ? "For Sale" : "";
  const originalityStatus = record.originalityStatus === "all_original"
    ? "All Original"
    : record.originalityStatus === "modified"
      ? "Modified"
      : "";

  const badges: ReactNode[] = [];
  if (safetyStatus !== "clear") badges.push(<StatusBadge key="safety" tone={safetyStatus === "recovered" ? "recovered" : "safety"} label={safetyStatusLabel(safetyStatus)} icon={<Siren aria-hidden="true" />} />);
  if (record.showVerificationBadge !== false && (!hideConfirmedTrust || verificationStatus !== "verified")) badges.push(<StatusBadge key="verification" tone={verificationStatus === "verified" ? "verified" : "unverified"} label={verificationStatus === "verified" ? "Verified by QRguitar" : "Unverified"} icon={<ShieldCheck aria-hidden="true" />} />);
  if (record.showAuthenticityBadge !== false && (!hideConfirmedTrust || authenticityStatus !== "confirmed")) badges.push(<StatusBadge key="authenticity" tone={authenticityStatus === "confirmed" ? "auth-confirmed" : "auth-unconfirmed"} label={authenticityStatus === "confirmed" ? "Authenticity Confirmed" : "Authenticity Unconfirmed"} icon={<ShieldCheck aria-hidden="true" />} />);
  if (saleStatus) badges.push(<StatusBadge key="sale" tone="sale" label={saleStatus} />);
  if (originalityStatus) badges.push(<StatusBadge key="originality" tone="disclosure" label={originalityStatus} />);
  if (includeCondition) badges.push(<StatusBadge key="condition" tone="condition" label={condition === "new" ? "New" : "Used"} />);
  if (includeCategory && record.instrumentType) badges.push(<StatusBadge key="category" tone="disclosure" label={record.instrumentType} />);

  return (
    <div className={`record-badge-row ${className}`.trim()} aria-label="Profile status">
      {typeof maxBadges === "number" ? badges.slice(0, maxBadges) : badges}
      {ownerCollection?.handle && ownerCollection.publicName ? (
        <Link className="record-owner-link" href={`/collections/${ownerCollection.handle}`} aria-label={`View ${ownerCollection.publicName}'s member page and public collection`}>
          <UserRound aria-hidden="true" />
          <span>Owned by <strong>{ownerCollection.publicName}</strong></span>
        </Link>
      ) : null}
    </div>
  );
}

function StatusBadge({ tone, label, icon }: { tone: string; label: string; icon?: ReactNode }) {
  return (
    <span className={`record-badge record-badge--${tone}`}>
      {icon}
      <span className="record-badge-text">{label}</span>
    </span>
  );
}

function safetyStatusLabel(status: "lost" | "stolen" | "recovered" | "clear") {
  if (status === "lost") return "Reported Lost";
  if (status === "stolen") return "Reported Stolen";
  if (status === "recovered") return "Recovered";
  return "No Alert";
}

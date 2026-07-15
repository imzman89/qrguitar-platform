import { ShieldCheck, Siren } from "lucide-react";
import type { ReactNode } from "react";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  type DemoInstrument
} from "../lib/local-demo";

type ProfileStatusBadgesProps = {
  record: DemoInstrument;
  includeCondition?: boolean;
  includeCategory?: boolean;
  className?: string;
};

export function ProfileStatusBadges({
  record,
  includeCondition = true,
  includeCategory = false,
  className = ""
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

  return (
    <div className={`record-badge-row ${className}`.trim()} aria-label="Profile status">
      {includeCondition ? <StatusBadge tone="condition" label={condition === "new" ? "New" : "Used"} /> : null}
      {record.showVerificationBadge !== false ? (
        <StatusBadge
          tone={verificationStatus === "verified" ? "verified" : "unverified"}
          label={verificationStatus === "verified" ? "Verified by QRguitar" : "Unverified"}
          icon={<ShieldCheck aria-hidden="true" />}
        />
      ) : null}
      {record.showAuthenticityBadge !== false ? (
        <StatusBadge
          tone={authenticityStatus === "confirmed" ? "auth-confirmed" : "auth-unconfirmed"}
          label={authenticityStatus === "confirmed" ? "Authenticity Confirmed" : "Authenticity Unconfirmed"}
          icon={<ShieldCheck aria-hidden="true" />}
        />
      ) : null}
      {safetyStatus !== "clear" ? (
        <StatusBadge
          tone={safetyStatus === "recovered" ? "recovered" : "safety"}
          label={safetyStatusLabel(safetyStatus)}
          icon={<Siren aria-hidden="true" />}
        />
      ) : null}
      {saleStatus ? <StatusBadge tone="sale" label={saleStatus} /> : null}
      {originalityStatus ? <StatusBadge tone="disclosure" label={originalityStatus} /> : null}
      {includeCategory && record.instrumentType ? <StatusBadge tone="disclosure" label={record.instrumentType} /> : null}
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

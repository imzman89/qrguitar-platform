import { isServiceHistoryEvent } from "../lib/instrument-profile-contract";
import type { ServiceHistoryEntry } from "../lib/local-demo";

type Props = {
  entry: ServiceHistoryEntry;
  saving: boolean;
  onEdit: (entry: ServiceHistoryEntry) => void;
  onDelete: (entry: ServiceHistoryEntry) => void;
};

export function EditorTimelineEntry({ entry, saving, onEdit, onDelete }: Props) {
  const profileCreated = entry.eventType?.trim().toLowerCase() === "profile_created";
  const automaticHistory = profileCreated || entry.isSystem === true;
  const provenance = automaticHistory
    ? "Profile history"
    : entry.sourceKind === "provider_submitted_owner_approved"
      ? `Provider-submitted · Owner-approved${entry.providerVerifiedAt ? " · Verified Service Provider" : ""}${entry.evidenceReviewedAt ? " · QRguitar-reviewed evidence" : ""}`
      : isServiceHistoryEvent(entry) ? "Owner-reported service" : "Owner-reported history";
  const details = [profileCreated ? "" : (entry.category || entry.eventType || "").replace(/_/g, " "), entry.shopName, entry.location].filter(Boolean).join(" · ");
  const lockedReason = automaticHistory
    ? profileCreated ? "Recorded automatically when this Profile was created." : "Recorded automatically as part of this Profile’s history."
    : entry.lockedReason || "Locked historical entry. Contact QRguitar admin to correct its attribution.";

  return (
    <article className="timeline-item">
      <span>{entry.serviceDate || "Date unavailable"} · {entry.isPublic ? "Public" : "Private"}</span>
      <h3>{entry.title}</h3>
      <p className="service-provenance">{provenance}</p>
      {details ? <p>{details}</p> : null}
      {entry.publicDescription ? <p>{entry.publicDescription}</p> : null}
      {entry.privateNotes ? <p className="fine-print">Private: {entry.privateNotes}</p> : null}
      {entry.canEdit === false ? (
        <p className="fine-print">{lockedReason}</p>
      ) : (
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={() => onEdit(entry)}>Edit Entry</button>
          <button className="button secondary" type="button" onClick={() => onDelete(entry)} disabled={saving}>Delete Entry</button>
        </div>
      )}
    </article>
  );
}

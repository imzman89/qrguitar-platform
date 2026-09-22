
"use client";
import { useUiText } from "./UiTextProvider";
import { isServiceHistoryEvent } from "../lib/instrument-profile-contract";
import type { ServiceHistoryEntry } from "../lib/local-demo";

type Props = {
  entry: ServiceHistoryEntry;
  saving: boolean;
  onEdit: (entry: ServiceHistoryEntry) => void;
  onDelete: (entry: ServiceHistoryEntry) => void;
};

export function EditorTimelineEntry({ entry, saving, onEdit, onDelete }: Props) {
  const ui = useUiText("components.EditorTimelineEntry");
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
      <span>{entry.serviceDate || ui("ui.components.EditorTimelineEntry.f41419fb08be", "Date unavailable")} · {entry.isPublic ? ui("ui.components.EditorTimelineEntry.591935b15b1c", "Public") : ui("ui.components.EditorTimelineEntry.c63eb6720c6e", "Private")}</span>
      <h3>{entry.title}</h3>
      <p className="service-provenance">{provenance}</p>
      {details ? <p>{details}</p> : null}
      {entry.publicDescription ? <p>{entry.publicDescription}</p> : null}
      {entry.privateNotes ? <p className="fine-print">{ui("ui.components.EditorTimelineEntry.fb10fb0165f6", "Private:")}{" "}{entry.privateNotes}</p> : null}
      {entry.canEdit === false ? (
        <p className="fine-print">{lockedReason}</p>
      ) : (
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={() => onEdit(entry)}>{ui("ui.components.EditorTimelineEntry.d83dfbcb6ec0", "Edit Entry")}</button>
          <button className="button secondary" type="button" onClick={() => onDelete(entry)} disabled={saving}>{ui("ui.components.EditorTimelineEntry.41bb004dc509", "Delete Entry")}</button>
        </div>
      )}
    </article>
  );
}

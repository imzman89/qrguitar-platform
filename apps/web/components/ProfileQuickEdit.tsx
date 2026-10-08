"use client";
import { useUiText } from "./UiTextProvider";
import { focusDialog, trapDialogTab } from "../lib/dialog-focus";


import { AlertTriangle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getInstrumentCondition, getInstrumentVerificationStatus, type DemoInstrument } from "../lib/local-demo";
import { getProfilePhotoUrls } from "../lib/instrument-profile-contract";
import { getSupabaseAccessToken } from "../lib/supabase-browser";

type QuickEditForm = {
  name: string;
  visibility: "public" | "private" | "unlisted";
  showSerialPublic: boolean;
  saleStatus: "for_sale" | "not_for_sale";
  condition: "new" | "used";
  location: string;
  summary: string;
  heroImageDataUrl: string;
  safetyStatus: "clear" | "lost" | "stolen" | "recovered";
  publicSafetyNote: string;
};

export function ProfileQuickEdit({ record, onClose, onSaved, isSessionCurrent }: {
  record: DemoInstrument;
  isSessionCurrent: () => boolean;
  onClose: () => void;
  onSaved: (record: DemoInstrument) => void;
}) {
  const ui = useUiText("components.ProfileQuickEdit");
  const photos = useMemo(() => getProfilePhotoUrls(record), [record]);
  const [form, setForm] = useState<QuickEditForm>(() => toForm(record, photos));
  const [savedForm, setSavedForm] = useState<QuickEditForm>(() => toForm(record, photos));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const active = useRef(true);
  const savePending = useRef(false);
  function isCurrent() { return active.current && isSessionCurrent(); }
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<() => void>(() => undefined);
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  closeRef.current = () => {
    if (dirty && !window.confirm("Discard unsaved Quick Edit changes?")) return;
    active.current = false;
    onClose();
  };

  useEffect(() => {
    active.current = true;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const currentPaddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";
    focusDialog(dialogRef.current);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      trapDialogTab(event, dialogRef.current);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      active.current = false;
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  function close() {
    closeRef.current();
  }

  async function save() {
    if (!isCurrent() || savePending.current) return;
    savePending.current = true;
    setSaving(true);
    setMessage("");
    try {
      if (record.visibility !== "public" && record.visibility !== "private" && record.visibility !== "unlisted") throw new Error("Reload this Profile before saving again.");
      const versionPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
      if (typeof record.updatedAt !== "string" || !versionPattern.test(record.updatedAt) || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error("Reload this Profile before saving again.");
      const documentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!Array.isArray(record.documentFiles) || record.documentFiles.some((document) =>
          !document || typeof document.id !== "string" || !documentIdPattern.test(document.id) ||
          typeof document.updatedAt !== "string" || !versionPattern.test(document.updatedAt) || !Number.isFinite(Date.parse(document.updatedAt)))) throw new Error("Reload this Profile and its documents before saving again.");
      const token = await getSupabaseAccessToken();
      if (!isCurrent()) return;
      if (!token) throw new Error("Sign in again before saving.");
      const response = await fetch("/api/instruments", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          qrCode: record.qrCode,
          expectedUpdatedAt: record.updatedAt,
          expectedDocuments: record.documentFiles.map(({ id, updatedAt }) => ({ id, updatedAt })),
          name: form.name,
          brand: record.brand,
          model: record.model,
          serial: record.serial,
          serialNotUsed: record.serialNotUsed === true,
          year: record.year,
          instrumentType: record.instrumentType || "",
          builder: record.builder || "",
          finish: record.finish || "",
          condition: form.condition,
          saleStatus: form.saleStatus,
          originalityStatus: record.originalityStatus || "unknown",
          ownerName: record.owner,
          location: form.location,
          visibility: form.visibility,
          summary: form.summary,
          heroImageDataUrl: form.heroImageDataUrl,
          photos,
          showSerialPublic: Boolean(record.serial) && form.showSerialPublic,
          verificationStatus: getInstrumentVerificationStatus(record),
          authenticityStatus: record.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed",
          documents: record.documentFiles || [],
          customFields: record.customFields || [],
          customLinks: record.customLinks || []
        })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; qrCode?: string; updatedAt?: string; message?: string } | null;
      if (!isCurrent()) return;
      if (!response.ok || payload?.ok !== true || payload.qrCode !== record.qrCode || typeof payload.updatedAt !== "string" || !versionPattern.test(payload.updatedAt) || !Number.isFinite(Date.parse(payload.updatedAt))) throw new Error(payload?.message || "Could not save Quick Edit changes.");

      if (form.safetyStatus !== (record.safetyStatus || "clear") || form.publicSafetyNote !== (record.publicSafetyNote || "")) {
        if (!isCurrent()) return;
        const safetyResponse = await fetch("/api/safety-status", {
          method: "PATCH",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ qrCode: record.qrCode, safetyStatus: form.safetyStatus, publicSafetyNote: form.publicSafetyNote })
        });
        const safetyPayload = await safetyResponse.json().catch(() => null) as { ok?: boolean; qrCode?: string; message?: string } | null;
        if (!isCurrent()) return;
        if (!safetyResponse.ok || safetyPayload?.ok !== true || safetyPayload.qrCode !== record.qrCode) throw new Error(safetyPayload?.message || "Profile saved, but the safety alert could not be updated.");
      }

      if (!isCurrent()) return;
      setSavedForm(form);
      onSaved({
        ...record,
        updatedAt: payload.updatedAt,
        documentFiles: record.documentFiles.map((document) => ({ ...document, updatedAt: payload.updatedAt })),
        name: form.name,
        visibility: form.visibility,
        showSerialPublic: Boolean(record.serial) && form.showSerialPublic,
        saleStatus: form.saleStatus,
        instrumentCondition: form.condition,
        location: form.location,
        summary: form.summary,
        heroImageDataUrl: form.heroImageDataUrl,
        safetyStatus: form.safetyStatus,
        publicSafetyNote: form.publicSafetyNote
      });
      setMessage(ui("ui.components.ProfileQuickEdit.3a06720a52cb", "Profile updated."));
    } catch (error) {
      if (!isCurrent()) return;
      setMessage(error instanceof Error ? error.message : ui("ui.components.ProfileQuickEdit.67524ea94ea8", "Could not save Quick Edit changes."));
    } finally {
      savePending.current = false;
      if (isCurrent()) setSaving(false);
    }
  }

  return (
    <div className="quick-edit-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="quick-edit-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-edit-title" tabIndex={-1}>
        <header>
          <div><span className="eyebrow">{ui("ui.components.ProfileQuickEdit.d4e63f569f33", "Quick Edit")}</span><h2 id="quick-edit-title">{record.name || ui("ui.components.ProfileQuickEdit.a9e9f2e46b92", "{{value1}} {{value2}}", { value1: record.brand, value2: record.model })}</h2></div>
          <button className="icon-button" type="button" onClick={close} aria-label={ui("ui.components.ProfileQuickEdit.4ee3c33fc702", "Close Quick Edit")}><X /></button>
        </header>
        <div className="quick-edit-grid">
          <label className="field"><span>{ui("ui.components.ProfileQuickEdit.8d615ba766e1", "Profile title")}</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <p className="field-note">{ui("ui.components.ProfileQuickEdit.savePreservesVisibility", "Saving keeps this Profile’s visibility and does not publish your collection. Choose document sharing in the full editor.")}</p>
          <label className="field"><span>{ui("ui.components.ProfileQuickEdit.12f67f8539c4", "Availability")}</span><select value={form.saleStatus} onChange={(event) => setForm({ ...form, saleStatus: event.target.value as QuickEditForm["saleStatus"] })}><option value="not_for_sale">{ui("ui.components.ProfileQuickEdit.323d22588945", "Not for sale")}</option><option value="for_sale">{ui("ui.components.ProfileQuickEdit.aedf56fc02b4", "For sale")}</option></select></label>
          <label className="field"><span>{ui("ui.components.ProfileQuickEdit.39b36d38d6eb", "Condition")}</span><select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value as QuickEditForm["condition"] })}><option value="used">{ui("ui.components.ProfileQuickEdit.ae7d8dfac9ff", "Used")}</option><option value="new">{ui("ui.components.ProfileQuickEdit.18fdd549b2ed", "New")}</option></select></label>
          <label className="field"><span>{ui("ui.components.ProfileQuickEdit.15b61974b270", "Location")}</span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
          <label className="field"><span>{ui("ui.components.ProfileQuickEdit.14b29400712f", "Main photo")}</span><select value={form.heroImageDataUrl} onChange={(event) => setForm({ ...form, heroImageDataUrl: event.target.value })}>{photos.map((photo, index) => <option value={photo} key={photo}>{ui("ui.components.ProfileQuickEdit.d84eebada93e", "Photo")}{" "}{index + 1}{photo === record.heroImageDataUrl ? ui("ui.components.ProfileQuickEdit.15ed202dfc23", " (current)") : ""}</option>)}</select></label>
          <label className="field quick-edit-wide"><span>{ui("ui.components.ProfileQuickEdit.ca6f44db47d0", "Profile story")}</span><textarea rows={4} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label>
          {record.serial ? <div className="quick-edit-wide"><label className="toggle-field"><input type="checkbox" checked={form.showSerialPublic} onChange={(event) => setForm({ ...form, showSerialPublic: event.target.checked })} />{" "}{ui("ui.components.ProfileQuickEdit.serialShareLabel", "Show Serial Number on Profile")}</label><p className="fine-print">{ui("ui.components.ProfileQuickEdit.serialIdNotice", "Hides only the serial field. The permanent QR ID and URL may still include the serial.")}</p></div> : null}
          <label className="field"><span>{ui("ui.components.ProfileQuickEdit.32cf4596244a", "Lost / stolen status")}</span><select value={form.safetyStatus} onChange={(event) => setForm({ ...form, safetyStatus: event.target.value as QuickEditForm["safetyStatus"] })}><option value="clear">{ui("ui.components.ProfileQuickEdit.d1af410eb4d0", "No alert")}</option><option value="lost">{ui("ui.components.ProfileQuickEdit.3f1cf9ff5a13", "Reported lost")}</option><option value="stolen">{ui("ui.components.ProfileQuickEdit.f616a2b55136", "Reported stolen")}</option><option value="recovered">{ui("ui.components.ProfileQuickEdit.37ce0a91ee27", "Recovered")}</option></select></label>
          {form.safetyStatus !== "clear" ? <label className="field"><span>{ui("ui.components.ProfileQuickEdit.profileAlertNote", "Profile alert note")}</span><textarea rows={3} value={form.publicSafetyNote} onChange={(event) => setForm({ ...form, publicSafetyNote: event.target.value })} /></label> : null}
        </div>
        <aside className="quick-edit-identity"><AlertTriangle size={16} /><span>{ui("ui.components.ProfileQuickEdit.a6c8f92c19f4", "QRguitar ID")}{" "}<b>{record.qrCode}</b>{" "}{ui("ui.components.ProfileQuickEdit.f8eb11bf748c", "and the permanent URL cannot be changed here.")}</span></aside>
        {message ? <p className="form-message">{message}</p> : null}
        <footer><button className="button secondary" type="button" onClick={close}>{ui("ui.components.ProfileQuickEdit.19766ed6ccb2", "Cancel")}</button><button className="button" type="button" disabled={saving || !dirty} onClick={() => void save()}>{saving ? ui("ui.components.ProfileQuickEdit.dc85af8f2b1d", "Saving...") : ui("ui.components.ProfileQuickEdit.c74a565b3fc9", "Save Quick Edit")}</button></footer>
      </section>
    </div>
  );
}

function toForm(record: DemoInstrument, photos: string[]): QuickEditForm {
  return {
    name: record.name || `${record.brand} ${record.model}`.trim(),
    visibility: record.visibility === "public" || record.visibility === "unlisted" ? record.visibility : "private",
    showSerialPublic: record.showSerialPublic === true,
    saleStatus: record.saleStatus || "not_for_sale",
    condition: getInstrumentCondition(record),
    location: record.location || "",
    summary: record.summary || "",
    heroImageDataUrl: record.heroImageDataUrl || photos[0] || "",
    safetyStatus: record.safetyStatus || "clear",
    publicSafetyNote: record.publicSafetyNote || ""
  };
}

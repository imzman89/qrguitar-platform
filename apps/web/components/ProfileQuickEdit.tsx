"use client";

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
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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
      const token = await getSupabaseAccessToken();
      if (!isCurrent()) return;
      if (!token) throw new Error("Sign in again before saving.");
      const response = await fetch("/api/instruments", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          qrCode: record.qrCode,
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
      const payload = await response.json().catch(() => null) as { ok?: boolean; qrCode?: string; message?: string } | null;
      if (!isCurrent()) return;
      if (!response.ok || payload?.ok !== true || payload.qrCode !== record.qrCode) throw new Error(payload?.message || "Could not save Quick Edit changes.");

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
      setMessage("Profile updated.");
    } catch (error) {
      if (!isCurrent()) return;
      setMessage(error instanceof Error ? error.message : "Could not save Quick Edit changes.");
    } finally {
      savePending.current = false;
      if (isCurrent()) setSaving(false);
    }
  }

  return (
    <div className="quick-edit-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="quick-edit-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-edit-title" tabIndex={-1}>
        <header>
          <div><span className="eyebrow">Quick Edit</span><h2 id="quick-edit-title">{record.name || `${record.brand} ${record.model}`}</h2></div>
          <button className="icon-button" type="button" onClick={close} aria-label="Close Quick Edit"><X /></button>
        </header>
        <div className="quick-edit-grid">
          <label className="field"><span>Profile title</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="field"><span>Visibility</span><select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value as QuickEditForm["visibility"] })}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label>
          <label className="field"><span>Availability</span><select value={form.saleStatus} onChange={(event) => setForm({ ...form, saleStatus: event.target.value as QuickEditForm["saleStatus"] })}><option value="not_for_sale">Not for sale</option><option value="for_sale">For sale</option></select></label>
          <label className="field"><span>Condition</span><select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value as QuickEditForm["condition"] })}><option value="used">Used</option><option value="new">New</option></select></label>
          <label className="field"><span>Location</span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
          <label className="field"><span>Main photo</span><select value={form.heroImageDataUrl} onChange={(event) => setForm({ ...form, heroImageDataUrl: event.target.value })}>{photos.map((photo, index) => <option value={photo} key={photo}>Photo {index + 1}{photo === record.heroImageDataUrl ? " (current)" : ""}</option>)}</select></label>
          <label className="field quick-edit-wide"><span>Profile story</span><textarea rows={4} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label>
          {record.serial ? <label className="toggle-field quick-edit-wide"><input type="checkbox" checked={form.showSerialPublic} onChange={(event) => setForm({ ...form, showSerialPublic: event.target.checked })} /> Show Serial Number on the public Profile</label> : null}
          <label className="field"><span>Lost / stolen status</span><select value={form.safetyStatus} onChange={(event) => setForm({ ...form, safetyStatus: event.target.value as QuickEditForm["safetyStatus"] })}><option value="clear">No alert</option><option value="lost">Reported lost</option><option value="stolen">Reported stolen</option><option value="recovered">Recovered</option></select></label>
          {form.safetyStatus !== "clear" ? <label className="field"><span>Public alert note</span><textarea rows={3} value={form.publicSafetyNote} onChange={(event) => setForm({ ...form, publicSafetyNote: event.target.value })} /></label> : null}
        </div>
        <aside className="quick-edit-identity"><AlertTriangle size={16} /><span>QRguitar ID <b>{record.qrCode}</b> and the permanent URL cannot be changed here.</span></aside>
        {message ? <p className="form-message">{message}</p> : null}
        <footer><button className="button secondary" type="button" onClick={close}>Cancel</button><button className="button" type="button" disabled={saving || !dirty} onClick={() => void save()}>{saving ? "Saving..." : "Save Quick Edit"}</button></footer>
      </section>
    </div>
  );
}

function toForm(record: DemoInstrument, photos: string[]): QuickEditForm {
  return {
    name: record.name || `${record.brand} ${record.model}`.trim(),
    visibility: record.visibility || "private",
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

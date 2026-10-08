"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseAccessToken } from "../lib/supabase-browser";
import { useUiText } from "./UiTextProvider";
type Row = { id: string; name: string; fileName: string; createdAt: string };

export function RetainedPrivateDocuments({ actorEmail, isSessionCurrent }: {
  actorEmail: string; isSessionCurrent: () => boolean
}) {
  const ui = useUiText("components.RetainedPrivateDocuments");
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<{ check: (() => boolean) | null; email: string; rows: Row[];
    hasMore: boolean; loading: boolean; message: string }>({
    check: null, email: "", rows: [], hasMore: false, loading: true, message: ""
  });
  const revision = useRef(0);
  useEffect(() => {
    const lease = ++revision.current;
    let active = true;
    const current = () => active && revision.current === lease && isSessionCurrent();
    setView({ check: isSessionCurrent, email: actorEmail, rows: [], hasMore: false, loading: true, message: "" });
    void (async () => {
      try {
        const token = await getSupabaseAccessToken();
        if (!current()) return;
        const response = await fetch("/api/retained-documents?offset=" + offset, {
          cache: "no-store", headers: { authorization: "Bearer " + token }
        });
        const payload = await response.json().catch(() => null) as {
          ok?: boolean; documents?: Row[]; hasMore?: boolean
        } | null;
        if (!current()) return;
        if (!response.ok || payload?.ok !== true || !Array.isArray(payload.documents)) throw new Error();
        setView({ check: isSessionCurrent, email: actorEmail, rows: payload.documents,
          hasMore: payload.hasMore === true, loading: false, message: "" });
      } catch {
        if (current()) setView({ check: isSessionCurrent, email: actorEmail, rows: [],
          hasMore: false, loading: false, message: ui("ui.components.RetainedPrivateDocuments.loadFailure", "Private files could not be loaded. Try again later.") });
      }
    })();
    return () => { active = false; revision.current++; };
  }, [actorEmail, isSessionCurrent, offset, ui]);

  async function download(row: Row) {
    const lease = revision.current;
    const current = () => revision.current === lease && isSessionCurrent();
    try {
      const token = await getSupabaseAccessToken();
      if (!current()) return;
      const response = await fetch("/api/retained-documents?id=" + encodeURIComponent(row.id), {
        cache: "no-store", headers: { authorization: "Bearer " + token }
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (!current()) return;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl; anchor.download = row.fileName; anchor.click();
      setView(v => ({ ...v, message: "" }));
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      if (current()) setView(v => ({ ...v, message: ui("ui.components.RetainedPrivateDocuments.downloadFailure", "The file could not be downloaded. Try again later.") }));
    }
  }
  // Clear display synchronously across account/lease changes, before a new effect runs.
  const visible = view.check === isSessionCurrent && view.email === actorEmail && isSessionCurrent();
  return <details className="panel">
    <summary>{ui("ui.components.RetainedPrivateDocuments.title", "Private files you kept")}</summary>
    <p>{ui("ui.components.RetainedPrivateDocuments.help", "Unchecked private files stay with your account after a handoff.")}</p>
    <p role="status">{visible ? view.message || (view.loading ? ui("ui.components.RetainedPrivateDocuments.loading", "Loading…") : "") : ""}</p>
    {visible && !view.loading && !view.message && !view.rows.length ? <p>{ui("ui.components.RetainedPrivateDocuments.empty", "No retained private files.")}</p> : null}
    {visible ? <ul>{view.rows.map(row => <li key={row.id}>{row.name}{" "}
      <button type="button" onClick={() => void download(row)}>{ui("ui.components.RetainedPrivateDocuments.download", "Download")}</button></li>)}</ul> : null}
    {visible && offset > 0 ? <button type="button" disabled={view.loading} onClick={() => setOffset(v => Math.max(0, v - 50))}>{ui("ui.components.RetainedPrivateDocuments.previous", "Previous")}</button> : null}
    {visible && view.hasMore ? <button type="button" disabled={view.loading} onClick={() => setOffset(v => v + 50)}>{ui("ui.components.RetainedPrivateDocuments.next", "Next")}</button> : null}
  </details>;
}

"use client";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import { MemberMessageLink } from "./MemberMessageLink";
import { useUiText } from "./UiTextProvider";
import type { RecordedBusinessContact } from "../lib/recorded-business-contact";
import { cleanCollectionWebsite } from "../lib/public-collections";

/** Authenticated owner-only contact; clears immediately on account changes and never enters a public DTO. */
export function RecordedBusinessSupport({ code }: { code: string }) {
  const ui = useUiText("components.RecordedBusinessSupport");
  const [contact, setContact] = useState<RecordedBusinessContact | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true, revision = 0;
    let controller: AbortController | undefined;
    let unsubscribe: (() => void) | undefined;
    setContact(null); setFailed(false);
    try {
      const auth = createBrowserSupabaseClient().auth;
      const load = async (session: { access_token: string; user: { id: string } } | null) => {
        const requestRevision = ++revision;
        controller?.abort(); setContact(null); setFailed(false);
        if (!session) return;
        const operation = new AbortController(); controller = operation;
        const timer = setTimeout(() => operation.abort(), 15000);
        try {
          const response = await fetch("/api/instruments/business-contact?code=" + encodeURIComponent(code), {
            cache: "no-store", headers: { authorization: "Bearer " + session.access_token }, signal: operation.signal
          });
          const body = await response.json();
          if (!active || requestRevision !== revision || operation.signal.aborted) return;
          const current = await auth.getSession();
          if (!active || requestRevision !== revision) return;
          if (current.error) throw new Error();
          if (current.data.session?.user.id !== session.user.id) return;
          if (!response.ok || body?.ok !== true || body.actorId !== session.user.id) throw new Error();
          const value = body.contact;
          if (value && (typeof value.transferId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.transferId) || typeof value.publicName !== "string" || typeof value.handle !== "string"
            || typeof value.messageAllowed !== "boolean" || typeof value.warrantyHelpUrl !== "string"
            || (value.warrantyHelpUrl && cleanCollectionWebsite(value.warrantyHelpUrl) !== value.warrantyHelpUrl))) throw new Error();
          setContact(value);
        } catch { if (active && requestRevision === revision) setFailed(true); }
        finally { clearTimeout(timer); }
      };
      const subscription = auth.onAuthStateChange((_event, session) => { if (active) void load(session); });
      unsubscribe = () => subscription.data.subscription.unsubscribe();
      const startup = revision;
      void auth.getSession().then(({ data, error }) => {
        if (!active || revision !== startup) return;
        if (error) setFailed(true); else void load(data.session);
      }).catch(() => { if (active && revision === startup) setFailed(true); });
    } catch { setFailed(true); }
    return () => { active = false; revision++; controller?.abort(); unsubscribe?.(); };
  }, [code, attempt]);
  if (failed) return <details open className="owner-profile-actions" aria-label={ui("ui.components.RecordedBusinessSupport.title", "Seller & support")}><summary>{ui("ui.components.RecordedBusinessSupport.title", "Seller & support")}</summary><p role="alert">{ui("ui.components.RecordedBusinessSupport.unavailable", "Recorded business contact could not be checked.")}</p><button type="button" className="button secondary" onClick={() => setAttempt(value => value + 1)}>{ui("ui.components.RecordedBusinessSupport.retry", "Try again")}</button></details>;
  if (!contact) return null;
  return <details className="owner-profile-actions" aria-label={ui("ui.components.RecordedBusinessSupport.title", "Seller & support")}>
    <summary>{ui("ui.components.RecordedBusinessSupport.title", "Seller & support")}</summary><p>{code}: {contact.publicName}</p>
    {contact.messageAllowed ? <MemberMessageLink handle={contact.handle} transferId={contact.transferId} label={ui("ui.components.RecordedBusinessSupport.message", "Message recorded business")} /> : null}
    {contact.warrantyHelpUrl ? <a className="button secondary" href={contact.warrantyHelpUrl} target="_blank" rel="noopener noreferrer">{ui("ui.components.RecordedBusinessSupport.warranty", "Warranty assistance")}</a> : null}
    {!contact.messageAllowed && !contact.warrantyHelpUrl ? <p>{ui("ui.components.RecordedBusinessSupport.optedOut", "Messaging and warranty assistance are unavailable here. If you have a purchase receipt, use its seller contact details for purchase or warranty questions.")}</p> : null}
    <p>{ui("ui.components.RecordedBusinessSupport.help", "Based on the accepted handoff to your account. Contact availability does not confirm purchase terms or warranty coverage.")}</p>
  </details>;
}

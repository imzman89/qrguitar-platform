"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { buildSupportEmailDraft, supportDraftLimits, supportEmailAddress, type EmailDraft, type SupportEmailLabels } from "../../lib/support-email-draft";
import styles from "./contact.module.css";

export type SupportDraftCopy = SupportEmailLabels & {
  heading: string; intro: string; security: string; general: string; prepare: string; prepared: string;
  open: string; manual: string; longDraft: string; noScript: string; required: string; invalidEmail: string; tooLong: string;
  send: string; sending: string; accepted: string; unconfirmed: string; rejected: string; unavailable: string; limited: string; website: string;
};

export function ContactEmailDraft({ copy, topics }: { copy: SupportDraftCopy; topics: Array<{ id: string; title: string }> }) {
  const id = useId();
  const [ready, setReady] = useState(false);
  const [fields, setFields] = useState({ name: "", email: "", topic: "", message: "" });
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [error, setError] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState<"" | "accepted" | "unconfirmed" | "rejected" | "unavailable" | "limited">("");
  const sendingRef = useRef(false);
  const mountedRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => { mountedRef.current = true; setReady(true); return () => { mountedRef.current = false; controllerRef.current?.abort(); }; }, []);
  useEffect(() => { if (draft) resultRef.current?.focus(); }, [draft]);

  function change(key: keyof typeof fields, value: string) {
    if (sendingRef.current) return;
    setFields(current => ({ ...current, [key]: value }));
    setDraft(null);
    setError("");
    setDelivery("");
  }
  function prepare(event: { preventDefault(): void }) {
    event.preventDefault();
    const topic = topics.find(item => item.id === fields.topic)?.title || copy.general;
    const result = buildSupportEmailDraft({ ...fields, topic }, copy);
    if (!result.ok) { setError(copy[result.error]); setDraft(null); return; }
    setError("");
    setDraft(result.draft);
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current || delivery === "accepted" || delivery === "unconfirmed") return;
    const topic = topics.find(item => item.id === fields.topic)?.title || copy.general;
    const validation = buildSupportEmailDraft({ ...fields, topic }, copy);
    if (!validation.ok) { setError(copy[validation.error]); return; }
    sendingRef.current = true; setBusy(true); setError(""); setDelivery("");
    const controller = new AbortController(); controllerRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 20_000);
    let dispatched = false;
    try {
      const request = { ...fields, topic, website, idempotencyKey: crypto.randomUUID() };
      dispatched = true;
      const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const result = await response.json().catch(() => null) as { ok?: boolean; code?: string; outcome?: string } | null;
      if (!mountedRef.current) return;
      if (response.status === 202 && result?.ok === true && result.code === "provider_accepted" && result.outcome === "accepted") setDelivery("accepted");
      else if (response.status >= 400 && result?.ok === false && result.outcome === "rejected") {
        setDelivery(result.code === "delivery_unavailable" ? "unavailable" : result.code === "rate_limited" ? "limited" : "rejected");
      } else setDelivery("unconfirmed");
    } catch { if (mountedRef.current) setDelivery(dispatched ? "unconfirmed" : "unavailable"); }
    finally { clearTimeout(timer); sendingRef.current = false; if (mountedRef.current) setBusy(false); }
  }

  return <div className={styles.emailDraft}>
    <h2 id={`${id}-heading`}>{copy.heading}</h2>
    <p id={`${id}-intro`}>{copy.intro}</p>
    <p className="fine-print" id={`${id}-security`}>{copy.security}</p>
    <form onSubmit={send} aria-busy={busy} aria-labelledby={`${id}-heading`} aria-describedby={`${id}-intro ${id}-security`}>
      {/* No names: native pre-hydration form submission must not put private text in a URL. */}
      <fieldset disabled={!ready || busy}>
        <label htmlFor={`${id}-name`}>{copy.name}</label>
        <input id={`${id}-name`} autoComplete="name" required maxLength={supportDraftLimits.name} value={fields.name} onChange={event => change("name", event.target.value)} />
        <label htmlFor={`${id}-email`}>{copy.email}</label>
        <input id={`${id}-email`} type="email" autoComplete="email" pattern={"[^\\s@]+@[^\\s@]+\\.[^\\s@]+"} required maxLength={supportDraftLimits.email} value={fields.email} onChange={event => change("email", event.target.value)} />
        <label htmlFor={`${id}-topic`}>{copy.topic}</label>
        <select id={`${id}-topic`} value={fields.topic} onChange={event => change("topic", event.target.value)}>
          <option value="">{copy.general}</option>
          {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
        </select>
        <label htmlFor={`${id}-message`}>{copy.message}</label>
        <textarea id={`${id}-message`} rows={6} required maxLength={supportDraftLimits.message} value={fields.message} onChange={event => change("message", event.target.value)} />
        <div className={styles.honeypot} aria-hidden="true"><label htmlFor={`${id}-website`}>{copy.website}</label><input id={`${id}-website`} tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></div>
        <button className="button" type="submit" disabled={delivery === "accepted" || delivery === "unconfirmed"}>{busy ? copy.sending : copy.send}</button>
        <button className="button secondary" type="button" onClick={prepare}>{copy.prepare}</button>
      </fieldset>
    </form>
    <noscript><p>{copy.noScript}</p></noscript>
    {error ? <p role="alert">{error}</p> : null}
    {busy ? <p role="status">{copy.sending}</p> : null}
    {delivery ? <p role={delivery === "accepted" ? "status" : "alert"}>{copy[delivery]}</p> : null}
    {draft ? <div ref={resultRef} tabIndex={-1} className={styles.draftResult} aria-label={copy.prepared}>
      <p role="status">{copy.prepared}</p>
      {draft.href ? <a className="button" href={draft.href}>{copy.open}</a> : <p>{copy.longDraft}</p>}
      <p id={`${id}-manual`}>{copy.manual} <a href={`mailto:${supportEmailAddress}`}>{supportEmailAddress}</a></p>
      <textarea readOnly rows={8} value={draft.body} aria-label={copy.message} aria-describedby={`${id}-manual`} onFocus={event => event.currentTarget.select()} />
    </div> : null}
  </div>;
}

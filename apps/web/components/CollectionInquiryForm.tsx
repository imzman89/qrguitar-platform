"use client";
import { useUiText } from "./UiTextProvider";


import Link from "next/link";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { getSupabaseAccessToken } from "../lib/supabase-browser";

export function CollectionInquiryForm({ handle, publicName, profiles }: { handle: string; publicName: string; profiles: Array<{ code: string; title: string }> }) {
  const ui = useUiText("components.CollectionInquiryForm");
  const [message, setMessage] = useState("");
  const [profileCode, setProfileCode] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void getSupabaseAccessToken().then((token) => {
      if (active) setSignedIn(Boolean(token));
    });
    return () => {
      active = false;
    };
  }, []);

  async function sendInquiry() {
    if (message.trim().length < 20) {
      setStatus("Write at least 20 characters so the collection owner has enough context.");
      return;
    }
    const token = await getSupabaseAccessToken();
    if (!token) {
      setStatus("Sign in to send a private inquiry.");
      return;
    }
    setSending(true);
    setStatus("");
    try {
      const response = await fetch("/api/collection-inquiries", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ handle, message, profileCode })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      setStatus(payload?.message || (response.ok ? "Inquiry sent privately." : "The inquiry could not be sent."));
      if (response.ok && payload?.ok) setMessage("");
    } catch {
      setStatus("The inquiry could not be sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="collection-inquiry" aria-labelledby="collection-inquiry-title">
      <div>
        <div className="eyebrow">{ui("ui.components.CollectionInquiryForm.f5b9e421b518", "Member message")}</div>
        <h2 id="collection-inquiry-title">{ui("ui.components.CollectionInquiryForm.2f77668a9dfb", "Message")}{" "}{publicName}</h2>
        <p>{ui("ui.components.CollectionInquiryForm.06e017302739", "Ask about an instrument, availability, service, or a possible transfer. QRguitar relays the message while both email addresses stay private.")}</p>
      </div>
      <div className="collection-inquiry-form">
        {profiles.length ? <label><span>{ui("ui.components.CollectionInquiryForm.427244f38501", "Profile (optional)")}</span><select value={profileCode} onChange={(event) => setProfileCode(event.target.value)}><option value="">{ui("ui.components.CollectionInquiryForm.36f42bae0bbf", "General collection inquiry")}</option>{profiles.map((profile) => <option value={profile.code} key={profile.code}>{profile.title}</option>)}</select></label> : null}
        <label><span>{ui("ui.components.CollectionInquiryForm.2f77668a9dfb", "Message")}</span><textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} placeholder={ui("ui.components.CollectionInquiryForm.97c4c42ae818", "What would you like the owner, shop, or brand to know?")} /></label>
        <div className="collection-inquiry-actions"><button className="button" type="button" onClick={() => void sendInquiry()} disabled={sending}><Send size={15} /> {sending ? ui("ui.components.CollectionInquiryForm.286a3af7348e", "Sending...") : ui("ui.components.CollectionInquiryForm.214ca7c74602", "Send private inquiry")}</button>{signedIn === false ? <Link className="text-link" href={`/login?next=${encodeURIComponent(`/collections/${handle}`)}`}>{ui("ui.components.CollectionInquiryForm.bfd402b2f6f3", "Sign in")}</Link> : null}</div>
        {status ? <p className="form-message" role="status">{status}</p> : null}
      </div>
    </section>
  );
}

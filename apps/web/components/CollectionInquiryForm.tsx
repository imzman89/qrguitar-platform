"use client";

import Link from "next/link";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { getSupabaseAccessToken } from "../lib/supabase-browser";

export function CollectionInquiryForm({ handle, publicName, profiles }: { handle: string; publicName: string; profiles: Array<{ code: string; title: string }> }) {
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
        <div className="eyebrow">Member message</div>
        <h2 id="collection-inquiry-title">Message {publicName}</h2>
        <p>Ask about an instrument, availability, service, or a possible transfer. QRguitar relays the message while both email addresses stay private.</p>
      </div>
      <div className="collection-inquiry-form">
        {profiles.length ? <label><span>Profile (optional)</span><select value={profileCode} onChange={(event) => setProfileCode(event.target.value)}><option value="">General collection inquiry</option>{profiles.map((profile) => <option value={profile.code} key={profile.code}>{profile.title}</option>)}</select></label> : null}
        <label><span>Message</span><textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} placeholder="What would you like the owner, shop, or brand to know?" /></label>
        <div className="collection-inquiry-actions"><button className="button" type="button" onClick={() => void sendInquiry()} disabled={sending}><Send size={15} /> {sending ? "Sending..." : "Send private inquiry"}</button>{signedIn === false ? <Link className="text-link" href={`/login?next=${encodeURIComponent(`/collections/${handle}`)}`}>Sign in</Link> : null}</div>
        {status ? <p className="form-message" role="status">{status}</p> : null}
      </div>
    </section>
  );
}

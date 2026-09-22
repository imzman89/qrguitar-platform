"use client";
import { useUiText } from "./UiTextProvider";


import { LoaderCircle, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSupabaseAccessToken } from "../lib/supabase-browser";
import styles from "./MessagesClient.module.css";

export function StartConversation({ handle, profileCode }: { handle: string; profileCode: string }) {
  const ui = useUiText("components.StartConversation");
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const next = `/messages/new?member=${encodeURIComponent(handle)}${profileCode ? `&profile=${encodeURIComponent(profileCode)}` : ""}`;
    void (async () => {
      const token = await getSupabaseAccessToken();
      if (!token) return router.replace(`/login?next=${encodeURIComponent(next)}`);
      try {
        const response = await fetch("/api/messages/conversations", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ handle, profileCode })
        });
        const payload = await response.json().catch(() => null) as { ok?: boolean; conversationId?: string; message?: string } | null;
        if (!response.ok || !payload?.conversationId) throw new Error(payload?.message || "The conversation could not be opened.");
        router.replace(`/messages/${payload.conversationId}`);
      } catch (reason) { setError(reason instanceof Error ? reason.message : ui("ui.components.StartConversation.c2ad2f8a287b", "The conversation could not be opened.")); }
    })();
  }, [handle, profileCode, router]);

  return <div className={styles.state}>{error ? <MessageCircle /> : <LoaderCircle className={styles.spin} />}<h1>{error ? ui("ui.components.StartConversation.6117bce566e1", "Conversation unavailable") : ui("ui.components.StartConversation.2a8b850dadd9", "Opening conversation")}</h1><p>{error || ui("ui.components.StartConversation.33b411810f73", "Creating a private QRguitar conversation.")}</p>{error ? <><Link className="button" href={`/collections/${handle}`}>{ui("ui.components.StartConversation.30f0846e225a", "Return to member page")}</Link><Link className="text-link" href="/messages">{ui("ui.components.StartConversation.7ff385329889", "Open Messages")}</Link></> : null}</div>;
}

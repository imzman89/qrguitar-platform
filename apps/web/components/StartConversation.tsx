"use client";
import { useUiText } from "./UiTextProvider";
import { LoaderCircle, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import styles from "./MessagesClient.module.css";

export function StartConversation({ handle, profileCode }: { handle: string; profileCode: string }) {
  const ui = useUiText("components.StartConversation");
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true, current = true;
    let actor: string | undefined;
    let unsubscribe: (() => void) | undefined;
    const controller = new AbortController();
    const next = `/messages/new?member=${encodeURIComponent(handle)}${profileCode ? `&profile=${encodeURIComponent(profileCode)}` : ""}`;
    const sessionChanged = "Your sign-in session changed. Try again to continue with your current account.";
    setError("");

    function stop(message: string) {
      if (!active || !current) return;
      current = false;
      controller.abort();
      setError(message);
    }
    function check() {
      if (!active || !current) throw new Error("Conversation request is no longer current.");
    }
    async function bounded<T>(run: () => Promise<T>): Promise<T> {
      check();
      let onAbort = () => {};
      try {
        return await Promise.race([Promise.resolve().then(() => { check(); return run(); }), new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error("Conversation request was interrupted."));
          controller.signal.addEventListener("abort", onAbort, { once: true });
        })]);
      } finally { controller.signal.removeEventListener("abort", onAbort); }
    }
    const timer = setTimeout(() => stop("Opening the conversation timed out. Check your connection and try again."), 15000);

    void (async () => {
      try {
        const auth = createBrowserSupabaseClient().auth;
        const subscription = auth.onAuthStateChange((_event, session) => {
          if (!active || !current) return;
          const nextActor = session?.user.id || "";
          if (actor !== undefined && actor !== nextActor) stop(sessionChanged);
          else actor = nextActor;
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
        async function readSession() {
          const result = await bounded(() => auth.getSession());
          check();
          if (result.error) throw new Error("Could not check your sign-in session. Check your connection and try again.");
          const session = result.data.session;
          const nextActor = session?.user.id || "";
          if (actor !== undefined && actor !== nextActor) { stop(sessionChanged); check(); }
          actor = nextActor;
          return session;
        }
        const session = await readSession();
        check();
        if (!session) { router.replace(`/login?next=${encodeURIComponent(next)}`); return; }
        if (!session.access_token || !session.user.id) throw new Error("Could not check your sign-in session. Please try again.");
        const response = await bounded(() => fetch("/api/messages/conversations", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({ handle, profileCode })
        }));
        check();
        const payload = await bounded(() => response.json()) as { ok?: boolean; conversationId?: string; message?: string } | null;
        // Recheck identity before displaying a private result, including silent session changes.
        await readSession();
        check();
        if (!response.ok || payload?.ok !== true || typeof payload.conversationId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(payload.conversationId)) {
          setError(typeof payload?.message === "string" ? payload.message : "The conversation could not be opened. Please try again.");
          return;
        }
        router.replace(`/messages/${encodeURIComponent(payload.conversationId)}`);
      } catch {
        if (active && current) setError("The conversation could not be opened.");
      } finally { clearTimeout(timer); }
    })();

    return () => {
      active = false;
      current = false;
      controller.abort();
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [handle, profileCode, router, attempt]);

  return <div className={styles.state}>
    {error ? <MessageCircle /> : <LoaderCircle className={styles.spin} />}
    <h1>{error ? ui("ui.components.StartConversation.6117bce566e1", "Conversation unavailable") : ui("ui.components.StartConversation.2a8b850dadd9", "Opening conversation")}</h1>
    <p role="status">{error === "The conversation could not be opened." ? ui("ui.components.StartConversation.c2ad2f8a287b", "The conversation could not be opened.") : error || ui("ui.components.StartConversation.33b411810f73", "Creating a private QRguitar conversation.")}</p>
    {error ? <><button className="button" type="button" onClick={() => setAttempt(value => value + 1)}>{ui("ui.components.StartConversation.retryConversation", "Try again")}</button><Link className="text-link" href={`/collections/${encodeURIComponent(handle)}`}>{ui("ui.components.StartConversation.30f0846e225a", "Return to member page")}</Link><Link className="text-link" href="/messages">{ui("ui.components.StartConversation.7ff385329889", "Open Messages")}</Link></> : null}
  </div>;
}

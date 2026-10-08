"use client";
import { useUiText } from "./UiTextProvider";
import { LoaderCircle, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import styles from "./MessagesClient.module.css";

export function StartConversation({ handle, profileCode, transferId = "" }: { handle: string; profileCode: string; transferId?: string }) {
  const ui = useUiText("components.StartConversation");
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const recoveryRetry = useRef(false);
  const [error, setError] = useState<{ kind: "" | "sessionChanged" | "timeout" | "failed" | "unconfirmed" | "server"; message?: string }>({ kind: "" });
  const errorMessage = error.kind === "sessionChanged" ? ui("ui.components.StartConversation.sessionChanged", "Your sign-in session changed. Try again to continue with your current account.")
    : error.kind === "timeout" ? ui("ui.components.StartConversation.openingTimedOut", "Opening the conversation timed out. Check your connection and try again.")
    : error.kind === "failed" ? ui("ui.components.StartConversation.c2ad2f8a287b", "The conversation could not be opened.")
    : error.kind === "unconfirmed" ? ui("ui.components.StartConversation.openRetryFailure", "The conversation could not be opened. Please try again.")
    : error.kind === "server" ? error.message : "";

  useEffect(() => {
    let active = true, current = true;
    let actor: string | undefined;
    let awaitingAuthRecovery = false, requestStarted = false;
    let unsubscribe: (() => void) | undefined;
    const controller = new AbortController();
    const next = `/messages/new?member=${encodeURIComponent(handle)}${transferId ? `&transfer=${encodeURIComponent(transferId)}` : profileCode ? `&profile=${encodeURIComponent(profileCode)}` : ""}`;
    setError({ kind: "" });

    function stop(kind: "sessionChanged" | "timeout") {
      if (!active || !current) return;
      current = false;
      controller.abort();
      setError({ kind });
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
    const timer = setTimeout(() => stop("timeout"), 15000);

    void (async () => {
      try {
        const auth = createBrowserSupabaseClient().auth;
        let authRevision = 0;
        let refreshedSession: { access_token: string; user: { id: string } } | null = null;
        const subscription = auth.onAuthStateChange((_event, session) => {
          // Use readSession for startup; INITIAL_SESSION can be a stale failure snapshot.
          if (!active || !current || _event === "INITIAL_SESSION") return;
          const nextActor = session?.user.id || "";
          if (actor !== undefined && actor !== nextActor) stop("sessionChanged");
          else {
            actor = nextActor;
            if (_event === "TOKEN_REFRESHED" && session?.access_token) {
              authRevision++;
              refreshedSession = session;
              // A failed lookup may settle just before the SDK recovers. Resume
              // once, only while no conversation request has been sent.
              if (awaitingAuthRecovery && !requestStarted && !recoveryRetry.current) {
                recoveryRetry.current = true;
                awaitingAuthRecovery = false;
                setAttempt(value => value + 1);
              }
            }
          }
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
        async function readSession() {
          const readRevision = authRevision;
          const result = await bounded(() => auth.getSession());
          check();
          if (result.error) {
            if (authRevision > readRevision && refreshedSession?.user.id === actor) return refreshedSession;
            awaitingAuthRecovery = !requestStarted;
            throw new Error("Could not check your sign-in session. Check your connection and try again.");
          }
          awaitingAuthRecovery = false;
          const session = result.data.session;
          const nextActor = session?.user.id || "";
          if (actor !== undefined && actor !== nextActor) { stop("sessionChanged"); check(); }
          actor = nextActor;
          return session;
        }
        const session = await readSession();
        check();
        if (!session) { router.replace(`/login?next=${encodeURIComponent(next)}`); return; }
        if (!session.access_token || !session.user.id) throw new Error("Could not check your sign-in session. Please try again.");
        requestStarted = true;
        const response = await bounded(() => fetch("/api/messages/conversations", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({ handle, profileCode: transferId ? "" : profileCode, ...(transferId ? { transferId } : {}) })
        }));
        check();
        const payload = await bounded(() => response.json()) as { ok?: boolean; conversationId?: string; message?: string } | null;
        // Recheck identity before displaying a private result, including silent session changes.
        await readSession();
        check();
        if (!response.ok || payload?.ok !== true || typeof payload.conversationId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(payload.conversationId)) {
          setError(typeof payload?.message === "string" && payload.message.trim() ? { kind: "server", message: payload.message } : { kind: "unconfirmed" });
          return;
        }
        router.replace(`/messages/${encodeURIComponent(payload.conversationId)}`);
      } catch {
        if (active && current) setError({ kind: "failed" });
      } finally { clearTimeout(timer); }
    })();

    return () => {
      active = false;
      current = false;
      controller.abort();
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [handle, profileCode, transferId, router, attempt]);

  return <div className={styles.state}>
    {error.kind ? <MessageCircle /> : <LoaderCircle className={styles.spin} />}
    <h1>{error.kind ? ui("ui.components.StartConversation.6117bce566e1", "Conversation unavailable") : ui("ui.components.StartConversation.2a8b850dadd9", "Opening conversation")}</h1>
    <p role="status">{errorMessage || ui("ui.components.StartConversation.33b411810f73", "Creating a private QRguitar conversation.")}</p>
    {error.kind ? <><button className="button" type="button" onClick={() => { recoveryRetry.current = false; setAttempt(value => value + 1); }}>{ui("ui.components.StartConversation.retryConversation", "Try again")}</button><Link className="text-link" href={`/collections/${encodeURIComponent(handle)}`}>{ui("ui.components.StartConversation.30f0846e225a", "Return to member page")}</Link><Link className="text-link" href="/messages">{ui("ui.components.StartConversation.7ff385329889", "Open Messages")}</Link></> : null}
  </div>;
}

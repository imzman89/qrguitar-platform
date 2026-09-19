"use client";

import {
  ArrowLeft,
  ExternalLink,
  FileImage,
  Flag,
  ImagePlus,
  Inbox,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  MEMBER_MEDIA_BUCKET,
  MEMBER_MEDIA_COUNT_LIMIT,
  MEMBER_MEDIA_LIMIT,
  MEMBER_MEDIA_TYPES,
  mergeMemberConversationPages,
  mergeMemberMessagePages,
  type MemberConversationPage,
  type MemberConversationSummary,
  type MemberConversationThread
} from "../lib/member-messaging";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../lib/supabase-browser";
import styles from "./MessagesClient.module.css";

type Phase = "loading" | "ready" | "signed-out" | "error";
type PendingSend = { operationId: string; message: string; files: File[]; uploaded: boolean };
type UploadIntent = { uploadId: string; path: string; token: string };

class MessageRequestError extends Error {
  status: number;
  uncertain: boolean;
  constructor(message: string, status = 0, uncertain = false) {
    super(message);
    this.status = status;
    this.uncertain = uncertain;
  }
}

async function messageFetch<T>(url: string, init: RequestInit = {}) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new MessageRequestError("Sign in to use QRguitar Messages.", 401);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json().catch(() => null) as (T & { message?: string }) | null;
    if (!response.ok || !payload) throw new MessageRequestError(payload?.message || "Messages could not complete that action.", response.status, response.status >= 500);
    return payload;
  } catch (error) {
    if (error instanceof MessageRequestError) throw error;
    throw new MessageRequestError("The result could not be confirmed. Check your connection and try again.", 0, true);
  }
}

function memberRole(value: string) {
  const labels: Record<string, string> = {
    player: "Player / owner",
    collector: "Collector",
    shop: "Store / retailer",
    builder: "Builder / brand",
    luthier: "Luthier / repair shop"
  };
  return labels[value] || "QRguitar member";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }).format(date);
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function MemberAvatar({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed
    ? <img className={styles.avatar} src={src} alt="" width={56} height={56} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className={styles.avatarFallback} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}

export function MessagesClient({ conversationId = "" }: { conversationId?: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [conversations, setConversations] = useState<MemberConversationSummary[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string | null>(null);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [thread, setThread] = useState<MemberConversationThread | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [uncertainSend, setUncertainSend] = useState(false);
  const [connection, setConnection] = useState("Connecting");
  const pendingSend = useRef<PendingSend | null>(null);
  const messageEnd = useRef<HTMLDivElement | null>(null);
  const messageList = useRef<HTMLDivElement | null>(null);
  const loadingHistory = useRef(false);
  const firstThreadLoad = useRef(true);

  const handleRequestError = useCallback((reason: unknown) => {
    const failure = reason instanceof MessageRequestError ? reason : new MessageRequestError("Messages are temporarily unavailable.");
    if (failure.status === 401) setPhase("signed-out");
    else {
      setError(failure.message);
      setPhase((current) => current === "loading" ? "error" : current);
    }
    return failure;
  }, []);

  const loadInbox = useCallback(async (showLoading = true) => {
    if (showLoading) setPhase("loading");
    setError("");
    try {
      const payload = await messageFetch<{ ok: boolean } & MemberConversationPage>("/api/messages");
      setConversations(payload.conversations || []);
      setConversationCursor(payload.nextCursor || null);
      setPhase("ready");
    } catch (reason) { handleRequestError(reason); }
  }, [handleRequestError]);

  const loadMoreConversations = useCallback(async () => {
    if (!conversationCursor || loadingMoreConversations) return;
    setLoadingMoreConversations(true);
    setError("");
    try {
      const payload = await messageFetch<{ ok: boolean } & MemberConversationPage>(`/api/messages?cursor=${encodeURIComponent(conversationCursor)}`);
      setConversations((current) => mergeMemberConversationPages(current, payload.conversations || []));
      setConversationCursor(payload.nextCursor || null);
    } catch (reason) { handleRequestError(reason); }
    finally { setLoadingMoreConversations(false); }
  }, [conversationCursor, handleRequestError, loadingMoreConversations]);

  const loadThread = useCallback(async (showLoading = true) => {
    if (!conversationId) return;
    if (showLoading) setPhase("loading");
    setError("");
    try {
      const payload = await messageFetch<{ ok: boolean; conversation: MemberConversationThread }>(`/api/messages/${conversationId}`);
      setThread((current) => {
        if (showLoading || !current || current.id !== payload.conversation.id) return payload.conversation;
        const currentIds = new Set(current.messages.map((message) => message.id));
        const overlapsLoadedHistory = payload.conversation.messages.some((message) => currentIds.has(message.id));
        if (!overlapsLoadedHistory && current.messages.length) return payload.conversation;
        return {
          ...payload.conversation,
          messages: mergeMemberMessagePages(current.messages, payload.conversation.messages),
          hasOlderMessages: current.hasOlderMessages,
          nextMessageCursor: current.nextMessageCursor
        };
      });
      setPhase("ready");
      void messageFetch(`/api/messages/${conversationId}/controls`, { method: "POST", body: JSON.stringify({ action: "read" }) }).catch(() => undefined);
    } catch (reason) { handleRequestError(reason); }
  }, [conversationId, handleRequestError]);

  useEffect(() => {
    if (conversationId) void loadThread();
    else void loadInbox();
  }, [conversationId, loadInbox, loadThread]);

  useEffect(() => {
    if (!conversationId || phase === "signed-out") return;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(`member-conversation:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "member_messages", filter: `conversation_id=eq.${conversationId}` }, () => void loadThread(false))
      .subscribe((status) => setConnection(status === "SUBSCRIBED" ? "Live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "Reconnecting" : "Connecting"));
    const refresh = () => { if (document.visibilityState === "visible") void loadThread(false); };
    const timer = window.setInterval(refresh, 12000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, loadThread, phase]);

  useEffect(() => {
    const latest = thread?.messages.at(-1)?.id;
    if (!latest) return;
    if (loadingHistory.current) { loadingHistory.current = false; return; }
    messageEnd.current?.scrollIntoView({ behavior: firstThreadLoad.current ? "auto" : "smooth", block: "end" });
    firstThreadLoad.current = false;
  }, [thread?.messages]);

  async function loadOlderMessages() {
    if (!thread?.nextMessageCursor || loadingOlderMessages || !conversationId) return;
    const beforeHeight = messageList.current?.scrollHeight || 0;
    const beforeTop = messageList.current?.scrollTop || 0;
    setLoadingOlderMessages(true);
    setError("");
    try {
      const payload = await messageFetch<{ ok: boolean; conversation: MemberConversationThread }>(
        `/api/messages/${conversationId}?cursor=${encodeURIComponent(thread.nextMessageCursor)}`
      );
      loadingHistory.current = true;
      setThread((current) => current ? {
        ...current,
        messages: mergeMemberMessagePages(current.messages, payload.conversation.messages),
        hasOlderMessages: payload.conversation.hasOlderMessages,
        nextMessageCursor: payload.conversation.nextMessageCursor
      } : payload.conversation);
      window.requestAnimationFrame(() => {
        if (messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight - beforeHeight + beforeTop;
      });
    } catch (reason) { handleRequestError(reason); }
    finally { setLoadingOlderMessages(false); }
  }

  function chooseFiles(selected: FileList | null) {
    setNotice("");
    const next = [...files, ...Array.from(selected || [])];
    if (next.length > MEMBER_MEDIA_COUNT_LIMIT) return setNotice("A message can include up to four photos or videos.");
    const invalid = next.find((file) => !(MEMBER_MEDIA_TYPES as readonly string[]).includes(file.type) || file.size < 1 || file.size > MEMBER_MEDIA_LIMIT);
    if (invalid) return setNotice(`${invalid.name} is not a supported image or video under 15 MB.`);
    setFiles(next);
  }

  async function discardPending(attempt: PendingSend | null) {
    if (!attempt?.uploaded || !conversationId) return;
    await messageFetch(`/api/messages/${conversationId}/uploads`, { method: "DELETE", body: JSON.stringify({ operationId: attempt.operationId }) }).catch(() => undefined);
  }

  async function sendMessage() {
    if (!conversationId || sending) return;
    const cleanDraft = draft.trim();
    if (!cleanDraft && !files.length) return setNotice("Write a message or attach a photo or video.");
    const attempt = pendingSend.current || { operationId: crypto.randomUUID(), message: cleanDraft, files: [...files], uploaded: false };
    pendingSend.current = attempt;
    setSending(true);
    setError("");
    setNotice("");
    try {
      if (attempt.files.length && !attempt.uploaded) {
        const prepared = await messageFetch<{ ok: boolean; uploads: UploadIntent[] }>(`/api/messages/${conversationId}/uploads`, {
          method: "POST",
          body: JSON.stringify({
            operationId: attempt.operationId,
            files: attempt.files.map((file) => ({ uploadId: crypto.randomUUID(), fileName: file.name, mimeType: file.type, fileSizeBytes: file.size }))
          })
        });
        attempt.uploaded = true;
        const supabase = createBrowserSupabaseClient();
        for (let index = 0; index < prepared.uploads.length; index += 1) {
          const intent = prepared.uploads[index];
          const uploaded = await supabase.storage.from(MEMBER_MEDIA_BUCKET).uploadToSignedUrl(intent.path, intent.token, attempt.files[index], {
            contentType: attempt.files[index].type,
            cacheControl: "3600"
          });
          if (uploaded.error) throw new MessageRequestError(`Could not upload ${attempt.files[index].name}.`, 422);
        }
      }
      await messageFetch(`/api/messages/${conversationId}/send`, {
        method: "POST",
        body: JSON.stringify({ operationId: attempt.operationId, message: attempt.message })
      });
      pendingSend.current = null;
      setUncertainSend(false);
      setDraft("");
      setFiles([]);
      setNotice("Message sent.");
      await loadThread(false);
    } catch (reason) {
      const failure = reason instanceof MessageRequestError ? reason : new MessageRequestError("The send could not be confirmed.", 0, true);
      if (failure.uncertain) {
        setUncertainSend(true);
        setError(`${failure.message} Retry will use the same protected send operation.`);
      } else {
        await discardPending(attempt);
        pendingSend.current = null;
        setUncertainSend(false);
        setError(failure.message);
      }
    } finally { setSending(false); }
  }

  const signinHref = `/login?next=${encodeURIComponent(conversationId ? `/messages/${conversationId}` : "/messages")}`;
  if (phase === "loading") return <MessageState icon={<LoaderCircle className={styles.spin} />} title="Opening Messages" copy="Loading your private conversations." />;
  if (phase === "signed-out") return <MessageState icon={<MessageCircle />} title="Sign in to Messages" copy="Private conversations are available to signed-in QRguitar members." action={<Link className="button" href={signinHref}>Sign in</Link>} />;
  if (phase === "error" && !thread && !conversations.length) return <MessageState icon={<RefreshCw />} title="Messages are unavailable" copy={error} action={<button className="button" type="button" onClick={() => conversationId ? void loadThread() : void loadInbox()}>Try again</button>} />;

  if (!conversationId) {
    return (
      <section className={styles.workspace} aria-labelledby="messages-title">
        <header className={styles.inboxHeader}>
          <div><span className="eyebrow">Private member conversations</span><h1 id="messages-title">Messages</h1><p>{"Connect with owners, stores, brands, builders, and repair professionals without exposing either member's email address. Conversation history stays available to both members."}</p></div>
          <Link className="button secondary" href="/collections"><UserRound size={16} /> Find members</Link>
        </header>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.inboxList}>
          {conversations.length ? conversations.map((conversation) => (
            <Link className={`${styles.conversationCard} ${conversation.unread ? styles.unread : ""}`} href={`/messages/${conversation.id}`} key={conversation.id}>
              <MemberAvatar name={conversation.member.publicName} src={conversation.member.avatarUrl} />
              <div className={styles.conversationBody}>
                <div className={styles.conversationTopline}><strong>{conversation.member.publicName}</strong><time>{conversation.lastMessage ? formatTime(conversation.lastMessage.createdAt) : "New"}</time></div>
                <span>{memberRole(conversation.member.accountType)}{conversation.member.location ? ` / ${conversation.member.location}` : ""}</span>
                {conversation.contextProfile ? <small>About {conversation.contextProfile.title}</small> : null}
                <p>{conversation.lastMessage ? `${conversation.lastMessage.sentByMe ? "You: " : ""}${conversation.lastMessage.body}` : "Start the conversation."}</p>
              </div>
              {conversation.unread ? <i aria-label="Unread message" /> : null}
            </Link>
          )) : <MessageState compact icon={<Inbox />} title="Your inbox is ready" copy="Open a member page or public QRguitar Profile to start a private conversation." action={<Link className="button" href="/collections">Browse member collections</Link>} />}
        </div>
        {conversationCursor ? <div className={styles.paginationRow}><button className="button secondary" type="button" disabled={loadingMoreConversations} onClick={() => void loadMoreConversations()}>{loadingMoreConversations ? "Loading…" : "Load older conversations"}</button></div> : null}
      </section>
    );
  }

  if (!thread) return null;
  const lockComposer = uncertainSend || sending;
  return (
    <section className={styles.workspace} aria-labelledby="thread-title">
      <header className={styles.threadHeader}>
        <Link className={styles.backLink} href="/messages"><ArrowLeft size={17} /> Messages</Link>
        <div className={styles.threadIdentity}><MemberAvatar name={thread.member.publicName} src={thread.member.avatarUrl} /><div><h1 id="thread-title">{thread.member.publicName}</h1><p>{memberRole(thread.member.accountType)}{thread.member.location ? ` / ${thread.member.location}` : ""}</p></div></div>
        <span className={`${styles.connection} ${connection === "Live" ? styles.live : ""}`}><i /> {connection}</span>
      </header>
      <div className={styles.threadGrid}>
        <div className={styles.threadPanel}>
          {thread.hasOlderMessages ? <div className={styles.historyNote}><button type="button" disabled={loadingOlderMessages} onClick={() => void loadOlderMessages()}>{loadingOlderMessages ? "Loading earlier messages…" : "Load earlier messages"}</button></div> : null}
          <div ref={messageList} className={styles.messageList} aria-live="polite">
            {!thread.messages.length ? <div className={styles.threadEmpty}><MessageCircle /><strong>Start the conversation</strong><p>Ask a focused question about the Profile, availability, service, or a potential transfer.</p></div> : null}
            {thread.messages.map((message) => (
              <article className={`${styles.message} ${message.sentByMe ? styles.mine : styles.theirs}`} key={message.id}>
                {message.body ? <p>{message.body}</p> : null}
                {message.attachments.length ? <div className={styles.mediaGrid}>{message.attachments.map((attachment) => attachment.mimeType.startsWith("image/") ? (
                  <a href={attachment.signedUrl} target="_blank" rel="noopener noreferrer" key={attachment.id} aria-label={`Open ${attachment.fileName}`}><img src={attachment.signedUrl} alt={attachment.fileName} loading="lazy" /></a>
                ) : (
                  <video controls preload="metadata" key={attachment.id}><source src={attachment.signedUrl} type={attachment.mimeType} />Your browser cannot play this video.</video>
                ))}</div> : null}
                <footer><time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time></footer>
              </article>
            ))}
            <div ref={messageEnd} />
          </div>
          <div className={styles.composer}>
              <label htmlFor="member-message-draft">Message</label>
              <textarea id="member-message-draft" rows={3} maxLength={4000} value={draft} disabled={lockComposer} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${thread.member.publicName}`} />
              {files.length ? <ul className={styles.fileList}>{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><FileImage size={15} /><span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span><button type="button" disabled={lockComposer} title={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></li>)}</ul> : null}
              <div className={styles.composerActions}>
                <label className={styles.attachButton}><ImagePlus size={17} /><span>Add media</span><input type="file" multiple accept={MEMBER_MEDIA_TYPES.join(",")} disabled={lockComposer || files.length >= 4} onChange={(event) => { chooseFiles(event.target.files); event.currentTarget.value = ""; }} /></label>
                <span>{draft.length}/4000</span>
                <button className="button" type="button" disabled={sending} onClick={() => void sendMessage()}>{sending ? <LoaderCircle className={styles.spin} size={16} /> : <Send size={16} />}{sending ? "Sending..." : uncertainSend ? "Retry send" : "Send"}</button>
              </div>
          </div>
          {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
        <aside className={styles.memberPanel} aria-label="Member and conversation details">
          <div className={styles.memberSummary}><MemberAvatar name={thread.member.publicName} src={thread.member.avatarUrl} /><div><strong>{thread.member.publicName}</strong><span>{memberRole(thread.member.accountType)}</span></div></div>
          {thread.member.bio ? <p>{thread.member.bio}</p> : null}
          <div className={styles.memberLinks}>
            {thread.member.handle ? <Link href={`/collections/${thread.member.handle}`}><UserRound size={15} /> View member page</Link> : null}
            {thread.member.websiteUrl ? <a href={thread.member.websiteUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Visit website</a> : null}
            {thread.contextProfile ? <Link href={thread.contextProfile.href}><ShieldCheck size={15} /> {thread.contextProfile.title}</Link> : null}
          </div>
          <div className={styles.threadControls}>
            <a href={`mailto:support@qrguitar.com?subject=${encodeURIComponent("QRguitar message safety concern")}&body=${encodeURIComponent(`Conversation ID: ${conversationId}\n\nPlease describe the message, concern, and approximate time. Do not include passwords, payment-card numbers, or unrelated personal documents.`)}`}><Flag size={15} /> Report a safety concern</a>
          </div>
        </aside>
      </div>
    </section>
  );
}

function MessageState({ icon, title, copy, action, compact = false }: { icon: ReactNode; title: string; copy: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`${styles.state} ${compact ? styles.compactState : ""}`}>{icon}<h2>{title}</h2><p>{copy}</p>{action}</div>;
}

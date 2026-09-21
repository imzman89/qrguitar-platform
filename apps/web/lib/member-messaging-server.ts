import "server-only";

import type { User } from "@supabase/supabase-js";
import { assertAccountCanWrite, type ServerSupabaseClient } from "./admin-auth";
import {
  MEMBER_MEDIA_BUCKET,
  type MemberConversationPage,
  type MemberConversationSummary,
  type MemberConversationThread,
  type MemberIdentity,
  type MemberMessageAttachment,
  type MemberMessageProfileContext
} from "./member-messaging";
import { cleanPublicCollection, publicCollectionOwnerKey } from "./public-collections";
import { createServerSupabaseClient, getAuthenticatedUser } from "./supabase-server";

type ConversationRow = {
  id: string;
  user_a: string;
  user_b: string;
  context_guitar_id?: string | null;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
  user_a_read_at?: string | null;
  user_b_read_at?: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  storage_path: string;
};

const genericMember: MemberIdentity = {
  publicName: "QRguitar member",
  handle: "",
  accountType: "member",
  bio: "",
  location: "",
  websiteUrl: "",
  avatarUrl: ""
};

export const MEMBER_CONVERSATION_PAGE_SIZE = 25;
export const MEMBER_MESSAGE_PAGE_SIZE = 200;

type ConversationCursor = { updatedAt: string; id: string };
type MessageCursor = { createdAt: string; id: string };

function canonicalTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null;
  const calendarDate = new Date(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== match[1]) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const utc = parsed.toISOString();
  if (!/^\d{4}-/.test(utc)) return null;
  // PostgreSQL retains microseconds. Date normalizes the timezone but would
  // truncate the fraction, dropping exact inbox matches and cursor boundaries.
  let fraction = (match[5] || "").padEnd(3, "0");
  while (fraction.length > 3 && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return `${utc.slice(0, 19)}.${fraction}Z`;
}

function canonicalUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function encodeCursor(prefix: "mc1" | "mm1", timestamp: string, id: string) {
  const normalizedTime = canonicalTimestamp(timestamp);
  const normalizedId = canonicalUuid(id);
  if (!normalizedTime || !normalizedId) throw new Error("invalid_message_cursor_source");
  return `${prefix}.${Buffer.from(JSON.stringify([normalizedTime, normalizedId]), "utf8").toString("base64url")}`;
}

function decodeCursor(value: string, prefix: "mc1" | "mm1") {
  if (value.length > 256 || !value.startsWith(`${prefix}.`) || !/^[A-Za-z0-9._-]+$/.test(value)) return null;
  try {
    const payload = value.slice(prefix.length + 1);
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(decoded) || decoded.length !== 2) return null;
    const timestamp = canonicalTimestamp(decoded[0]);
    const id = canonicalUuid(decoded[1]);
    if (!timestamp || !id || decoded[0] !== timestamp || decoded[1] !== id) return null;
    return encodeCursor(prefix, timestamp, id) === value ? { timestamp, id } : null;
  } catch {
    return null;
  }
}

export function decodeMemberConversationCursor(value: string): ConversationCursor | null {
  const decoded = decodeCursor(value, "mc1");
  return decoded ? { updatedAt: decoded.timestamp, id: decoded.id } : null;
}

export function decodeMemberMessageCursor(value: string): MessageCursor | null {
  const decoded = decodeCursor(value, "mm1");
  return decoded ? { createdAt: decoded.timestamp, id: decoded.id } : null;
}

export type MessagingAccess =
  | { ok: true; user: User; supabase: ServerSupabaseClient }
  | { ok: false; status: number; message: string };

export async function requireMessagingAccess(request: Request): Promise<MessagingAccess> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return { ok: false, status: 503, message: "Messages are temporarily unavailable." };
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return { ok: false, status: 401, message: auth.error || "Sign in required." };
  const writable = await assertAccountCanWrite(supabase, auth.user);
  if (!writable.ok) return { ok: false, status: writable.status, message: writable.message };
  return { ok: true, user: auth.user, supabase };
}

function otherMember(conversation: ConversationRow, actorId: string) {
  if (conversation.user_a === actorId) return conversation.user_b;
  if (conversation.user_b === actorId) return conversation.user_a;
  return "";
}

function actorValue<T>(conversation: ConversationRow, actorId: string, userA: T, userB: T) {
  return conversation.user_a === actorId ? userA : userB;
}

async function loadMemberIdentities(supabase: ServerSupabaseClient, userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const identities = new Map<string, MemberIdentity>();
  if (!ids.length) return identities;
  const [content, profiles] = await Promise.all([
    supabase.from("site_content").select("content_key,content_value").in("content_key", ids.map(publicCollectionOwnerKey)),
    supabase.from("profiles").select("id,account_status,hide_public_content").in("id", ids)
  ]);
  if (content.error || profiles.error) throw new Error("member_identity_unavailable");
  const visible = new Map((profiles.data || []).map((row) => [String(row.id), row.hide_public_content !== true && !["banned", "removed"].includes(String(row.account_status || ""))]));
  for (const row of content.data || []) {
    const userId = String(row.content_key || "").replace(/^public_collection_owner:/, "");
    const collection = cleanPublicCollection(row.content_value as Record<string, unknown>);
    if (!visible.get(userId) || !collection.enabled || !collection.publicName || !collection.handle) continue;
    identities.set(userId, {
      publicName: collection.publicName,
      handle: collection.handle,
      accountType: collection.accountType,
      bio: collection.bio,
      location: collection.location,
      websiteUrl: collection.websiteUrl,
      avatarUrl: collection.avatarUrl
    });
  }
  return identities;
}

async function loadProfileContexts(supabase: ServerSupabaseClient, guitarIds: string[]) {
  const ids = [...new Set(guitarIds.filter(Boolean))];
  const profiles = new Map<string, MemberMessageProfileContext>();
  if (!ids.length) return profiles;
  const result = await supabase.from("guitars")
    .select("id,qr_code,name,brand,model,visibility,owner_removed_at,admin_archived_at")
    .in("id", ids);
  if (result.error) throw new Error("message_profile_context_unavailable");
  for (const row of result.data || []) {
    if (row.visibility !== "public" || row.owner_removed_at || row.admin_archived_at || !row.qr_code) continue;
    profiles.set(String(row.id), {
      code: String(row.qr_code),
      title: String(row.name || [row.brand, row.model].filter(Boolean).join(" ") || row.qr_code),
      href: `/i/${encodeURIComponent(String(row.qr_code))}`
    });
  }
  return profiles;
}

function summarizeConversation(
  conversation: ConversationRow,
  actorId: string,
  identity: MemberIdentity,
  context: MemberMessageProfileContext | null,
  lastMessage: MessageRow | null
): MemberConversationSummary {
  const readAt = actorValue(conversation, actorId, conversation.user_a_read_at, conversation.user_b_read_at);
  return {
    id: conversation.id,
    member: identity,
    contextProfile: context,
    lastMessage: lastMessage ? {
      body: lastMessage.body || "Shared media",
      createdAt: lastMessage.created_at,
      sentByMe: lastMessage.sender_id === actorId
    } : null,
    unread: Boolean(conversation.last_message_at && (!readAt || new Date(conversation.last_message_at).getTime() > new Date(readAt).getTime()))
  };
}

export async function listMemberConversations(
  supabase: ServerSupabaseClient,
  actorId: string,
  cursor: ConversationCursor | null = null
): Promise<MemberConversationPage> {
  let query = supabase.from("member_conversations")
    .select("id,user_a,user_b,context_guitar_id,created_at,updated_at,last_message_at,user_a_read_at,user_b_read_at")
    .or(`user_a.eq.${actorId},user_b.eq.${actorId}`);
  if (cursor) query = query.or(`updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`);
  const result = await query
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MEMBER_CONVERSATION_PAGE_SIZE + 1);
  if (result.error) throw new Error("messages_unavailable");
  const fetched = (result.data || []) as ConversationRow[];
  const conversations = fetched.slice(0, MEMBER_CONVERSATION_PAGE_SIZE);
  if (!conversations.length) return { conversations: [], nextCursor: null };
  const ids = conversations.map((row) => row.id);
  const latestTerms = conversations
    .filter((row) => row.last_message_at)
    .map((row) => `and(conversation_id.eq.${row.id},created_at.eq.${canonicalTimestamp(row.last_message_at)})`);
  const [identities, contexts, messages] = await Promise.all([
    loadMemberIdentities(supabase, conversations.map((row) => otherMember(row, actorId))),
    loadProfileContexts(supabase, conversations.map((row) => row.context_guitar_id || "")),
    latestTerms.length
      ? supabase.from("member_messages").select("id,conversation_id,sender_id,body,created_at")
        .in("conversation_id", ids).or(latestTerms.join(",")).order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);
  if (messages.error) throw new Error("messages_unavailable");
  const latest = new Map<string, MessageRow>();
  for (const row of (messages.data || []) as MessageRow[]) if (!latest.has(row.conversation_id)) latest.set(row.conversation_id, row);
  const page = conversations.map((conversation) => {
    const targetId = otherMember(conversation, actorId);
    return summarizeConversation(
      conversation,
      actorId,
      identities.get(targetId) || genericMember,
      contexts.get(conversation.context_guitar_id || "") || null,
      latest.get(conversation.id) || null
    );
  });
  const boundary = conversations.at(-1);
  return {
    conversations: page,
    nextCursor: fetched.length > MEMBER_CONVERSATION_PAGE_SIZE && boundary
      ? encodeCursor("mc1", boundary.updated_at, boundary.id)
      : null
  };
}
export async function requireParticipantConversation(supabase: ServerSupabaseClient, actorId: string, conversationId: string) {
  const result = await supabase.from("member_conversations")
    .select("id,user_a,user_b,context_guitar_id,created_at,updated_at,last_message_at,user_a_read_at,user_b_read_at")
    .eq("id", conversationId).maybeSingle<ConversationRow>();
  if (result.error || !result.data || !otherMember(result.data, actorId)) return null;
  return result.data;
}

export async function loadMemberConversation(
  supabase: ServerSupabaseClient,
  actorId: string,
  conversationId: string,
  cursor: MessageCursor | null = null
): Promise<MemberConversationThread | null> {
  const conversation = await requireParticipantConversation(supabase, actorId, conversationId);
  if (!conversation) return null;
  const targetId = otherMember(conversation, actorId);
  let query = supabase.from("member_messages")
    .select("id,conversation_id,sender_id,body,created_at")
    .eq("conversation_id", conversationId);
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  const messagesResult = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MEMBER_MESSAGE_PAGE_SIZE + 1);
  if (messagesResult.error) throw new Error("messages_unavailable");
  const fetched = (messagesResult.data || []) as MessageRow[];
  const pageDescending = fetched.slice(0, MEMBER_MESSAGE_PAGE_SIZE);
  const messages = [...pageDescending].reverse();
  const messageIds = messages.map((row) => row.id);
  const [identities, contexts, attachmentResult] = await Promise.all([
    loadMemberIdentities(supabase, [targetId]),
    loadProfileContexts(supabase, [conversation.context_guitar_id || ""]),
    messageIds.length
      ? supabase.from("member_message_attachments").select("id,message_id,file_name,mime_type,file_size_bytes,storage_path").in("message_id", messageIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (attachmentResult.error) throw new Error("message_media_unavailable");
  const attachments = (attachmentResult.data || []) as AttachmentRow[];
  const uniquePaths = [...new Set(attachments.map((row) => row.storage_path))];
  const signedByPath = new Map<string, string>();
  if (uniquePaths.length) {
    const signed = await supabase.storage.from(MEMBER_MEDIA_BUCKET).createSignedUrls(uniquePaths, 300);
    if (signed.error || !signed.data) throw new Error("message_media_unavailable");
    for (const item of signed.data) if (item.signedUrl && item.path) signedByPath.set(item.path, item.signedUrl);
  }
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const attachmentsByMessage = new Map<string, MemberMessageAttachment[]>();
  for (const row of attachments) {
    const signedUrl = signedByPath.get(row.storage_path);
    if (!signedUrl) continue;
    const current = attachmentsByMessage.get(row.message_id) || [];
    current.push({ id: row.id, fileName: row.file_name, mimeType: row.mime_type, fileSizeBytes: Number(row.file_size_bytes), signedUrl, expiresAt });
    attachmentsByMessage.set(row.message_id, current);
  }
  const summary = summarizeConversation(
    conversation,
    actorId,
    identities.get(targetId) || genericMember,
    contexts.get(conversation.context_guitar_id || "") || null,
    cursor ? null : messages.at(-1) || null
  );
  const boundary = pageDescending.at(-1);
  const nextMessageCursor = fetched.length > MEMBER_MESSAGE_PAGE_SIZE && boundary
    ? encodeCursor("mm1", boundary.created_at, boundary.id)
    : null;
  return {
    ...summary,
    messages: messages.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      sentByMe: row.sender_id === actorId,
      attachments: attachmentsByMessage.get(row.id) || []
    })),
    hasOlderMessages: Boolean(nextMessageCursor),
    nextMessageCursor
  };
}
export function messagingDatabaseError(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  const code = value?.code || "";
  if (code === "MM401") return { status: 401, message: "Sign in with an active account to continue." };
  if (code === "MM403" || code === "42501" || code === "PD423") return { status: 403, message: "Messaging is unavailable for this member or conversation." };
  if (code === "MM404") return { status: 404, message: "Conversation not found." };
  if (code === "MM409" || code === "23505") return { status: 409, message: value?.message || "This action conflicts with an earlier message operation." };
  if (code === "MM422") return { status: 422, message: value?.message || "An attachment is not ready." };
  if (code === "MM429") return { status: 429, message: value?.message || "Message limit reached. Try again later." };
  if (code === "22023") return { status: 400, message: value?.message || "Check the message details and try again." };
  return { status: 503, message: "Messages are temporarily unavailable. Try again." };
}

import "server-only";

import type { User } from "@supabase/supabase-js";
import { assertAccountCanWrite, type ServerSupabaseClient } from "./admin-auth";
import {
  MEMBER_MEDIA_BUCKET,
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
  user_a_archived_at?: string | null;
  user_b_archived_at?: string | null;
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

type BlockRow = { blocker_id: string; blocked_id: string };

const genericMember: MemberIdentity = {
  publicName: "QRguitar member",
  handle: "",
  accountType: "member",
  bio: "",
  location: "",
  websiteUrl: "",
  avatarUrl: ""
};

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

async function loadBlocks(supabase: ServerSupabaseClient, actorId: string) {
  const result = await supabase.from("member_message_blocks").select("blocker_id,blocked_id")
    .or(`blocker_id.eq.${actorId},blocked_id.eq.${actorId}`);
  if (result.error) throw new Error("message_controls_unavailable");
  return (result.data || []) as BlockRow[];
}

function blockState(blocks: BlockRow[], actorId: string, targetId: string) {
  return {
    blockedByMe: blocks.some((row) => row.blocker_id === actorId && row.blocked_id === targetId),
    blocked: blocks.some((row) => (row.blocker_id === actorId && row.blocked_id === targetId) || (row.blocker_id === targetId && row.blocked_id === actorId))
  };
}

function summarizeConversation(
  conversation: ConversationRow,
  actorId: string,
  identity: MemberIdentity,
  context: MemberMessageProfileContext | null,
  lastMessage: MessageRow | null,
  blocks: BlockRow[]
): MemberConversationSummary {
  const targetId = otherMember(conversation, actorId);
  const readAt = actorValue(conversation, actorId, conversation.user_a_read_at, conversation.user_b_read_at);
  const archivedAt = actorValue(conversation, actorId, conversation.user_a_archived_at, conversation.user_b_archived_at);
  const status = blockState(blocks, actorId, targetId);
  return {
    id: conversation.id,
    member: identity,
    contextProfile: context,
    lastMessage: lastMessage ? {
      body: lastMessage.body || "Shared media",
      createdAt: lastMessage.created_at,
      sentByMe: lastMessage.sender_id === actorId
    } : null,
    unread: Boolean(conversation.last_message_at && (!readAt || new Date(conversation.last_message_at).getTime() > new Date(readAt).getTime())),
    archived: Boolean(archivedAt),
    ...status
  };
}

export async function listMemberConversations(supabase: ServerSupabaseClient, actorId: string, archived: boolean) {
  const result = await supabase.from("member_conversations")
    .select("id,user_a,user_b,context_guitar_id,created_at,updated_at,last_message_at,user_a_read_at,user_b_read_at,user_a_archived_at,user_b_archived_at")
    .or(`user_a.eq.${actorId},user_b.eq.${actorId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (result.error) throw new Error("messages_unavailable");
  const conversations = (result.data || []) as ConversationRow[];
  const visibleConversations = conversations.filter((row) => Boolean(actorValue(row, actorId, row.user_a_archived_at, row.user_b_archived_at)) === archived);
  if (!visibleConversations.length) return [];
  const ids = visibleConversations.map((row) => row.id);
  const [identities, contexts, messages, blocks] = await Promise.all([
    loadMemberIdentities(supabase, visibleConversations.map((row) => otherMember(row, actorId))),
    loadProfileContexts(supabase, visibleConversations.map((row) => row.context_guitar_id || "")),
    supabase.from("member_messages").select("id,conversation_id,sender_id,body,created_at").in("conversation_id", ids)
      .order("created_at", { ascending: false }).limit(500),
    loadBlocks(supabase, actorId)
  ]);
  if (messages.error) throw new Error("messages_unavailable");
  const latest = new Map<string, MessageRow>();
  for (const row of (messages.data || []) as MessageRow[]) if (!latest.has(row.conversation_id)) latest.set(row.conversation_id, row);
  return visibleConversations.map((conversation) => {
    const targetId = otherMember(conversation, actorId);
    return summarizeConversation(
      conversation,
      actorId,
      identities.get(targetId) || genericMember,
      contexts.get(conversation.context_guitar_id || "") || null,
      latest.get(conversation.id) || null,
      blocks
    );
  });
}

export async function requireParticipantConversation(supabase: ServerSupabaseClient, actorId: string, conversationId: string) {
  const result = await supabase.from("member_conversations")
    .select("id,user_a,user_b,context_guitar_id,created_at,updated_at,last_message_at,user_a_read_at,user_b_read_at,user_a_archived_at,user_b_archived_at")
    .eq("id", conversationId).maybeSingle<ConversationRow>();
  if (result.error || !result.data || !otherMember(result.data, actorId)) return null;
  return result.data;
}

export async function loadMemberConversation(supabase: ServerSupabaseClient, actorId: string, conversationId: string): Promise<MemberConversationThread | null> {
  const conversation = await requireParticipantConversation(supabase, actorId, conversationId);
  if (!conversation) return null;
  const targetId = otherMember(conversation, actorId);
  const messagesResult = await supabase.from("member_messages")
    .select("id,conversation_id,sender_id,body,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(201);
  if (messagesResult.error) throw new Error("messages_unavailable");
  const newest = (messagesResult.data || []) as MessageRow[];
  const hasOlderMessages = newest.length > 200;
  const messages = newest.slice(0, 200).reverse();
  const messageIds = messages.map((row) => row.id);
  const [identities, contexts, blocks, attachmentResult] = await Promise.all([
    loadMemberIdentities(supabase, [targetId]),
    loadProfileContexts(supabase, [conversation.context_guitar_id || ""]),
    loadBlocks(supabase, actorId),
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
    messages.at(-1) || null,
    blocks
  );
  return {
    ...summary,
    messages: messages.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      sentByMe: row.sender_id === actorId,
      attachments: attachmentsByMessage.get(row.id) || []
    })),
    hasOlderMessages
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

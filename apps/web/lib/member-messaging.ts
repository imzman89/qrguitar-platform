export const MEMBER_MEDIA_BUCKET = "member-message-media";
export const MEMBER_MEDIA_LIMIT = 15 * 1024 * 1024;
export const MEMBER_MEDIA_COUNT_LIMIT = 4;
export const MEMBER_MESSAGE_LIMIT = 4000;
export const MEMBER_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"] as const;

export type MemberIdentity = {
  publicName: string;
  handle: string;
  accountType: string;
  bio: string;
  location: string;
  websiteUrl: string;
  avatarUrl: string;
};

export type MemberMessageProfileContext = {
  code: string;
  title: string;
  href: string;
};

export type MemberMessageAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  signedUrl: string;
  expiresAt: string;
};

export type MemberMessage = {
  id: string;
  body: string;
  createdAt: string;
  sentByMe: boolean;
  attachments: MemberMessageAttachment[];
};

export type MemberConversationSummary = {
  id: string;
  member: MemberIdentity;
  contextProfile: MemberMessageProfileContext | null;
  lastMessage: { body: string; createdAt: string; sentByMe: boolean } | null;
  unread: boolean;
  archived: boolean;
  blockedByMe: boolean;
  blocked: boolean;
};

export type MemberConversationThread = MemberConversationSummary & {
  messages: MemberMessage[];
  hasOlderMessages: boolean;
};

export function isMessagingUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function cleanMessageBody(value: unknown) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, MEMBER_MESSAGE_LIMIT) : "";
}

export function isMemberMediaType(value: unknown): value is typeof MEMBER_MEDIA_TYPES[number] {
  return typeof value === "string" && (MEMBER_MEDIA_TYPES as readonly string[]).includes(value);
}

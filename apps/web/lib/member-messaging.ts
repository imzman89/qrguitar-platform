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
};

export type MemberConversationThread = MemberConversationSummary & {
  messages: MemberMessage[];
  hasOlderMessages: boolean;
  nextMessageCursor: string | null;
};

export type MemberConversationPage = {
  conversations: MemberConversationSummary[];
  nextCursor: string | null;
};

export function mergeMemberConversationPages(current: MemberConversationSummary[], incoming: MemberConversationSummary[]) {
  const seen = new Set<string>();
  return [...current, ...incoming].filter((conversation) => {
    if (seen.has(conversation.id)) return false;
    seen.add(conversation.id);
    return true;
  });
}

export function mergeMemberMessagePages(current: MemberMessage[], incoming: MemberMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  // Date compares timezone-normalized milliseconds; retain PostgreSQL's final
  // three fractional digits before using the ID to break a true timestamp tie.
  const subMillisecondPart = (timestamp: string) => {
    const fraction = /\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(timestamp)?.[1] || "";
    return Number(fraction.padEnd(6, "0").slice(3));
  };
  return [...byId.values()].sort((left, right) => {
    const time = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (!Number.isFinite(time)) return left.id.localeCompare(right.id);
    return time || subMillisecondPart(left.createdAt) - subMillisecondPart(right.createdAt) || left.id.localeCompare(right.id);
  });
}

export function isMessagingUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function cleanMessageBody(value: unknown) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, MEMBER_MESSAGE_LIMIT) : "";
}

export function isMemberMediaType(value: unknown): value is typeof MEMBER_MEDIA_TYPES[number] {
  return typeof value === "string" && (MEMBER_MEDIA_TYPES as readonly string[]).includes(value);
}

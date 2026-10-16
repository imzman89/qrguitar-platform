import { OwnerWorkspace } from "../../../components/OwnerWorkspace";
import type { Metadata } from "next";
import { Footer } from "../../../components/Footer";
import { MessagesClient } from "../../../components/MessagesClient";
import { Nav } from "../../../components/Nav";
import { buildPrivatePageMetadata } from "../../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata("Conversation", "A private QRguitar member conversation.");

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <><Nav /><OwnerWorkspace current="messages"><div className="owner-messages"><MessagesClient conversationId={conversationId} /></div></OwnerWorkspace><Footer /></>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { StartConversation } from "../../../components/StartConversation";
import { cleanCollectionHandle } from "../../../lib/public-collections";
import { buildPrivatePageMetadata } from "../../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata("Start a conversation", "Start a private QRguitar member conversation.");

export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ member?: string; profile?: string }> }) {
  const query = await searchParams;
  const handle = cleanCollectionHandle(query.member);
  const profileCode = /^QRG-[A-Z0-9-]{4,40}$/.test(String(query.profile || "").toUpperCase()) ? String(query.profile).toUpperCase() : "";
  return <><Nav /><main>{handle ? <StartConversation handle={handle} profileCode={profileCode} /> : <div className="page-shell"><p>Choose a member from <Link href="/collections">Member Collections</Link>.</p></div>}</main><Footer /></>;
}

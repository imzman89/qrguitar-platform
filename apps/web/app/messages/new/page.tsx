import type { Metadata } from "next";
import Link from "next/link";
import styles from "../../../components/MessagesClient.module.css";
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
  return <><Nav /><main>{handle ? <StartConversation handle={handle} profileCode={profileCode} /> : <div className={styles.state}><h1>Start a conversation</h1><p>Choose a member to start a private conversation.</p><Link className="button" href="/collections">Browse member collections</Link></div>}</main><Footer /></>;
}

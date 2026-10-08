
import { createUiText } from "../../../lib/ui-text";
import { loadPublishedSiteSettings } from "../../../lib/site-settings-server";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "../../../components/MessagesClient.module.css";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { StartConversation } from "../../../components/StartConversation";
import { cleanCollectionHandle } from "../../../lib/public-collections";
import { buildPrivatePageMetadata } from "../../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata("Start a conversation", "Start a private QRguitar member conversation.");

export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ member?: string; profile?: string; transfer?: string }> }) {
  const ui = createUiText((await loadPublishedSiteSettings()).content, "app.messages.new.page");
  const query = await searchParams;
  const handle = cleanCollectionHandle(query.member);
  const profileCode = /^QRG-[A-Z0-9-]{4,40}$/.test(String(query.profile || "").toUpperCase()) ? String(query.profile).toUpperCase() : "";
  const transferId = String(query.transfer || "");
  const validTransfer = !transferId || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transferId);
  return <><Nav /><main>{handle && validTransfer ? <StartConversation handle={handle} profileCode={transferId ? "" : profileCode} transferId={transferId} /> : <div className={styles.state}><h1>{ui("ui.app.messages.new.page.258150cb3ee4", "Start a conversation")}</h1><p>{ui("ui.app.messages.new.page.67127f31e1ba", "Choose a member to start a private conversation.")}</p><Link className="button" href="/collections">{ui("ui.app.messages.new.page.1fbba5113528", "Browse member collections")}</Link></div>}</main><Footer /></>;
}

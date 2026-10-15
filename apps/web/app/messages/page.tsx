import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { MessagesClient } from "../../components/MessagesClient";
import { Nav } from "../../components/Nav";
import { OwnerWorkspace } from "../../components/OwnerWorkspace";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata("Messages", "Private QRguitar member conversations.");

export default function MessagesPage() {
  return <><Nav /><OwnerWorkspace current="messages"><div className="owner-messages"><MessagesClient /></div></OwnerWorkspace><Footer /></>;
}

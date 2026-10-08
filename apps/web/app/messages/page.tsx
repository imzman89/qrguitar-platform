import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { MessagesClient } from "../../components/MessagesClient";
import { Nav } from "../../components/Nav";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata("Messages", "Private QRguitar member conversations.");

export default function MessagesPage() {
  return <><Nav /><main><MessagesClient /></main><Footer /></>;
}

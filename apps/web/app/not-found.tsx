import type { Metadata } from "next";
import NotFoundClient from "./NotFoundClient";
import { buildPrivatePageMetadata } from "../lib/seo";
export const metadata: Metadata = buildPrivatePageMetadata("Page not found | QRguitar", "The requested page is not available.");
export default function NotFound() { return <NotFoundClient />; }

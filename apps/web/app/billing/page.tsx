import type { Metadata } from "next";
import ProfileAccessPage from "./ProfileAccessPage";
import { buildPageMetadata } from "../../lib/seo";

export const metadata: Metadata = {
  ...buildPageMetadata(
    "Free Profiles & services",
    "Create unlimited permanent QRguitar Profiles for free. Choose optional verification and services when you need them.",
    "/billing"
  ),
  title: { absolute: "Free Profiles & services | QRguitar" }
};
export default function Page() { return <ProfileAccessPage/>; }

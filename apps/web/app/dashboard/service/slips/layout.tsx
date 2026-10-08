import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../../../lib/seo";

export const metadata: Metadata = {
  ...buildPrivatePageMetadata("Service slips", "Private workshop service records and customizable printing."),
  title: { absolute: "Service slips | QRguitar" }
};
export default function ServiceSlipsLayout({ children }: { children: ReactNode }) { return children; }

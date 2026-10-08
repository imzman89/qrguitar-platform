
"use client";
import { useUiText } from "../../../components/UiTextProvider";
import Link from "next/link";
import { UnavailablePage } from "../../../components/UnavailablePage";

export default function ProfileNotFound() {
  const ui = useUiText("app.i.code.not.found");
  return (
    <UnavailablePage
      title={ui("ui.app.i.code.not.found.67617b20be43", "This Profile isn’t available.")}
      description={ui("ui.app.i.code.not.found.10fc05c346e8", "Check the link, or explore other instrument Profiles in the Catalog.")}
    >
      <Link href="/catalog">{ui("ui.app.i.code.not.found.004ca2d8b070", "Explore the Catalog")}</Link>
      <Link href="/">{ui("ui.app.i.code.not.found.76c5505ff2e2", "Back to home")}</Link>
    </UnavailablePage>
  );
}

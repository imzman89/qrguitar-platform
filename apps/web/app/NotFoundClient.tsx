
"use client";
import { useUiText } from "../components/UiTextProvider";
import Link from "next/link";
import { UnavailablePage } from "../components/UnavailablePage";

export default function NotFound() {
  const ui = useUiText("app.not.found");
  return (
    <UnavailablePage
      title={ui("ui.app.not.found.baf03b1c0830", "This page isn’t available.")}
      description={ui("ui.app.not.found.82d8e08c8d46", "Check the address, or explore the instruments and collections on QRguitar.")}
    >
      <Link href="/catalog">{ui("ui.app.not.found.004ca2d8b070", "Explore the Catalog")}</Link>
      <Link href="/">{ui("ui.app.not.found.76c5505ff2e2", "Back to home")}</Link>
    </UnavailablePage>
  );
}

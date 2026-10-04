"use client";

import Link from "./CheckoutAwareLink";
import { useUiText } from "./UiTextProvider";

/** Informational fallback only: it makes no judgement about the current actor. */
export function AccountAccessHelp({ purpose, returnPath }: { purpose: "billing" | "claim"; returnPath: string }) {
  const ui = useUiText("components.AccountAccessHelp");
  return <div>
    <p>{purpose === "billing"
      ? ui("ui.components.AccountAccessHelp.billing", "Start with 5 free Profiles. Sign in to see your balance and buy additional permanent Profile credits. Ownership transfers are free.")
      : ui("ui.components.AccountAccessHelp.claim", "Use your account to submit evidence, follow a request, or review one sent to you. Submitting a request does not change the Profile’s owner.")}</p>
    <noscript><p>{ui("ui.components.AccountAccessHelp.javascript", "Enable JavaScript to sign in and use account tools.")}</p></noscript>
    <Link className="button secondary" href={`/login?next=${encodeURIComponent(returnPath)}`}>{ui("ui.components.AccountAccessHelp.access", "Sign in to continue")}</Link>
  </div>;
}


"use client";
import { useUiText } from "./UiTextProvider";
import Link from "./CheckoutAwareLink";
import { type ReactNode } from "react";
import { Boxes, CircleUserRound, CreditCard, MessageCircle, Plus, Wrench } from "lucide-react";
import styles from "./OwnerWorkspace.module.css";
import { getWorkspace } from "../lib/workspace-tools";

type OwnerWorkspaceProps = { current: "collection" | "create" | "account" | "messages" | "billing"; accountType?: string; children: ReactNode };
const destinations = [
  { key: "collection", href: "/dashboard", label: "My collection", icon: Boxes },
  { key: "create", href: "/create", label: "Create Profile", icon: Plus },
  { key: "messages", href: "/messages", label: "Messages", icon: MessageCircle },
  { key: "service", href: "/dashboard/service/slips", label: "Service slips", icon: Wrench },
  { key: "billing", href: "/billing", label: "Services", icon: CreditCard },
  { key: "account", href: "/account", label: "Account", icon: CircleUserRound }
];

/** Layout only. Pages retain their authentication, permissions, and mutation state. */
export function OwnerWorkspace({ current, accountType, children }: OwnerWorkspaceProps) {
  const ui = useUiText("components.OwnerWorkspace");
  const showServiceWorkbench = getWorkspace(accountType).actions.some(action => action.href === "/dashboard/service/slips");
  const links = destinations.filter(item => item.key !== "service" || showServiceWorkbench).map(({ key, href, label, icon: Icon }) => (
    <Link key={key} href={href} aria-current={current === key ? "page" : undefined}>
      <Icon size={17} aria-hidden="true" /><span>{(label === "My collection" ? ui("ui.components.OwnerWorkspace.9346fd1d6596", "My collection") : label === "Create Profile" ? ui("ui.components.OwnerWorkspace.bb758aff6f87", "Create Profile") : label === "Messages" ? ui("ui.components.OwnerWorkspace.04d7b4833927", "Messages") : label === "Service work" ? ui("ui.components.OwnerWorkspace.59c347b7f7a7", "Service work") : label === "Services" ? ui("ui.components.OwnerWorkspace.services", "Services") : label === "Account" ? ui("ui.components.OwnerWorkspace.7e1b0d5641f2", "Account") : label)}</span>
    </Link>
  ));
  return <main className={styles.workspace}>
    <div className={styles.layout}>
      <aside className={styles.rail}>
        <nav className={styles.desktopNav} aria-label={ui("ui.components.OwnerWorkspace.4d0260e6c3e7", "Your workspace")}>{links}</nav>
        <details className={styles.mobileNav}>
          <summary>{ui("ui.components.OwnerWorkspace.4d0260e6c3e7", "Your workspace")}</summary>
          <nav aria-label={ui("ui.components.OwnerWorkspace.4d0260e6c3e7", "Your workspace")}>{links}</nav>
        </details>
        <Link className={styles.explore} href="/catalog">{ui("ui.components.OwnerWorkspace.004ca2d8b070", "Explore the Catalog")}{" "}<span aria-hidden="true">↗</span></Link>
      </aside>
      <div className={styles.content}>{children}</div>
    </div>
  </main>;
}

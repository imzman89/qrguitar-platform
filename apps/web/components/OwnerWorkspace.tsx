import Link from "next/link";
import { type ReactNode } from "react";
import { Boxes, CircleUserRound, CreditCard, MessageCircle, Plus, Wrench } from "lucide-react";
import styles from "./OwnerWorkspace.module.css";

type OwnerWorkspaceProps = { current: "collection" | "create" | "account"; children: ReactNode };
const destinations = [
  { key: "collection", href: "/dashboard", label: "My collection", icon: Boxes },
  { key: "create", href: "/create", label: "Create Profile", icon: Plus },
  { key: "messages", href: "/messages", label: "Messages", icon: MessageCircle },
  { key: "service", href: "/dashboard/service", label: "Service work", icon: Wrench },
  { key: "billing", href: "/billing", label: "Profile credits", icon: CreditCard },
  { key: "account", href: "/account", label: "Account", icon: CircleUserRound }
];

/** Layout only. Pages retain their authentication, permissions, and mutation state. */
export function OwnerWorkspace({ current, children }: OwnerWorkspaceProps) {
  const links = destinations.map(({ key, href, label, icon: Icon }) => (
    <Link key={key} href={href} aria-current={current === key ? "page" : undefined}>
      <Icon size={17} aria-hidden="true" /><span>{label}</span>
    </Link>
  ));
  return <main className={styles.workspace}>
    <div className={styles.layout}>
      <aside className={styles.rail}>
        <nav className={styles.desktopNav} aria-label="Your workspace">{links}</nav>
        <details className={styles.mobileNav}>
          <summary>Your workspace</summary>
          <nav aria-label="Your workspace">{links}</nav>
        </details>
        <Link className={styles.explore} href="/catalog">Explore the Catalog <span aria-hidden="true">↗</span></Link>
      </aside>
      <div className={styles.content}>{children}</div>
    </div>
  </main>;
}

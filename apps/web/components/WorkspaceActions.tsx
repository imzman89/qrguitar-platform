import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getWorkspace } from "../lib/workspace-tools";
import styles from "./WorkspaceActions.module.css";

export function WorkspaceActions({ accountType }: { accountType: string }) {
  const workspace = getWorkspace(accountType);
  return <section className={styles.section} aria-label="Daily workspace tools">
    <div className={styles.heading}><h2>Tools for your day</h2><Link href="/account?section=profile">Change workspace type</Link></div>
    <div className={styles.grid}>{workspace.actions.map((action) => <Link className={styles.action} href={action.href} key={action.href}>
      <div><h3>{action.title}</h3><p>{action.description}</p></div><ArrowUpRight size={18} aria-hidden="true" />
    </Link>)}</div>
  </section>;
}

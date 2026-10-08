
"use client";
import { useUiText } from "./UiTextProvider";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useUiTextContent } from "./UiTextProvider";
import { getWorkspace } from "../lib/workspace-tools";
import styles from "./WorkspaceActions.module.css";

export function WorkspaceActions({ accountType }: { accountType: string }) {
  const ui = useUiText("components.WorkspaceActions");
  const workspace = getWorkspace(accountType, useUiTextContent());
  return <section className={styles.section} aria-label={ui("ui.components.WorkspaceActions.5b2a2c7763d2", "Daily workspace tools")}>
    <div className={styles.heading}><h2>{ui("ui.components.WorkspaceActions.4af5dab92546", "Tools for your day")}</h2><Link href="/account?section=profile">{ui("ui.components.WorkspaceActions.be6bf5712015", "Change workspace type")}</Link></div>
    <div className={styles.grid}>{workspace.actions.map((action) => <Link className={styles.action} href={action.href} key={action.href}>
      <div><h3>{action.title}</h3><p>{action.description}</p></div><ArrowUpRight size={18} aria-hidden="true" />
    </Link>)}</div>
  </section>;
}

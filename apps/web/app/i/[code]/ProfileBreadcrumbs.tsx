
"use client";
import { useUiText } from "../../../components/UiTextProvider";
import Link from "next/link";
import styles from "./ProfileBreadcrumbs.module.css";

export function ProfileBreadcrumbs({ current }: { current: string }) {
  const ui = useUiText("app.i.code.ProfileBreadcrumbs");
  return (
    <nav className={styles.breadcrumbs} aria-label={ui("ui.app.i.code.ProfileBreadcrumbs.2bd873d6c734", "Breadcrumb")}>
      <ol>
        <li><Link href="/">{ui("ui.app.i.code.ProfileBreadcrumbs.3a78695388b3", "Home")}</Link><span aria-hidden="true">/</span></li>
        <li><Link href="/catalog">{ui("ui.app.i.code.ProfileBreadcrumbs.3877d14889a9", "Catalog")}</Link><span aria-hidden="true">/</span></li>
        <li><span className={styles.current} aria-current="page" title={current}>{current}</span></li>
      </ol>
    </nav>
  );
}


"use client";
import { useUiText } from "./UiTextProvider";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";
import styles from "./UnavailablePage.module.css";

type UnavailablePageProps = {
  title: string;
  description: string;
  children: ReactNode;
  alert?: boolean;
};

/** A self-contained recovery screen: no account or content requests are needed. */
export function UnavailablePage({ title, description, children, alert = false }: UnavailablePageProps) {
  const ui = useUiText("components.UnavailablePage");
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={ui("ui.components.UnavailablePage.33b14c935c51", "QRguitar homepage")}>
          <BrandLogo className={styles.logo} appearance="dark" />
        </Link>
        <nav className={styles.navigation} aria-label={ui("ui.components.UnavailablePage.7b06d0dd6977", "Site navigation")}>
          <Link href="/catalog">{ui("ui.components.UnavailablePage.3877d14889a9", "Catalog")}</Link>
          <Link href="/collections">{ui("ui.components.UnavailablePage.9f9feade761d", "Collections")}</Link>
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.content} role={alert ? "alert" : undefined}>
          <h1>{title}</h1>
          <p>{description}</p>
          <div className={styles.actions}>{children}</div>
        </div>
      </main>
    </div>
  );
}

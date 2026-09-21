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
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="QRguitar homepage">
          <BrandLogo className={styles.logo} />
        </Link>
        <nav className={styles.navigation} aria-label="Site navigation">
          <Link href="/catalog">Catalog</Link>
          <Link href="/collections">Collections</Link>
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

import Link from "next/link";
import styles from "./ProfileBreadcrumbs.module.css";

export function ProfileBreadcrumbs({ current }: { current: string }) {
  return (
    <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
      <ol>
        <li><Link href="/">Home</Link><span aria-hidden="true">/</span></li>
        <li><Link href="/catalog">Catalog</Link><span aria-hidden="true">/</span></li>
        <li><span className={styles.current} aria-current="page" title={current}>{current}</span></li>
      </ol>
    </nav>
  );
}

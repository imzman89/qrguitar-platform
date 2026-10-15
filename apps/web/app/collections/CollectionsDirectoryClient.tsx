"use client";
import { useUiText } from "../../components/UiTextProvider";


import Link from "next/link";
import { ArrowUpRight, Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { FallbackImage } from "../../components/FallbackImage";
import { collectionRoleLabel, collectionRoles, filterCollectionDirectory, type DirectoryCollection } from "../../lib/collection-directory";
import styles from "./collections.module.css";

export function CollectionsDirectoryClient({ collections }: { collections: DirectoryCollection[] }) {
  const ui = useUiText("app.collections.CollectionsDirectoryClient");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const visible = useMemo(() => filterCollectionDirectory(collections, query, role), [collections, query, role]);
  const filtered = Boolean(query.trim()) || role !== "all";
  const clear = () => { setQuery(""); setRole("all"); };

  if (!collections.length) return <div className={styles.empty}>
    <UsersRound size={30} aria-hidden="true" /><h2>{ui("ui.app.collections.CollectionsDirectoryClient.8bf60f64c1e2", "No collections yet.")}</h2>
    <p>{ui("ui.app.collections.empty.intro", "A collection brings your instruments and their stories together. You choose which Profiles to make public.")}</p>
    <ol className={styles.emptySteps}>
      <li><strong>{ui("ui.app.collections.empty.addTitle", "Add your instruments")}</strong><span>{ui("ui.app.collections.empty.addBody", "Create a free Profile with photographs, details and history.")}</span></li>
      <li><strong>{ui("ui.app.collections.empty.curateTitle", "Make it yours")}</strong><span>{ui("ui.app.collections.empty.curateBody", "Set your collection name, image and introduction in Collection settings.")}</span></li>
      <li><strong>{ui("ui.app.collections.empty.shareTitle", "Share on your terms")}</strong><span>{ui("ui.app.collections.empty.shareBody", "Choose what becomes public. Private files and ownership controls stay separate.")}</span></li>
    </ol>
    <div className="form-actions"><Link className="button" href="/account?section=collection">{ui("ui.app.collections.CollectionsDirectoryClient.82a7887fd1d5", "Collection settings")}</Link><Link className="button secondary" href="/catalog">{ui("ui.app.collections.CollectionsDirectoryClient.f507fb6c23a7", "Catalog")}</Link></div>
  </div>;

  return <>
    <div className={styles.filters}>
      <label htmlFor="collection-search">{ui("ui.app.collections.CollectionsDirectoryClient.76e4997eae2f", "Search")}<div className={styles.search}><Search size={18} aria-hidden="true" /><input id="collection-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ui("ui.app.collections.CollectionsDirectoryClient.a274dd64efe8", "Name or handle")} /></div></label>
      <label htmlFor="collection-role">{ui("ui.app.collections.CollectionsDirectoryClient.0311fcdf5ef9", "Collection type")}<select id="collection-role" value={role} onChange={(event) => setRole(event.target.value)}><option value="all">{ui("ui.app.collections.CollectionsDirectoryClient.3d6fe3e703f6", "All members")}</option>{Object.entries(collectionRoles).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    </div>
    <div className={styles.results}><p role="status">{filtered ? ui("ui.app.collections.CollectionsDirectoryClient.a48c498b8725", "{{value1}} of {{value2}}", { value1: visible.length, value2: collections.length }) : collections.length}{" "}{collections.length === 1 ? ui("ui.app.collections.CollectionsDirectoryClient.fa7496e4ae84", "collection") : ui("ui.app.collections.CollectionsDirectoryClient.00699f600cf5", "collections")}</p>{filtered && visible.length > 0 && <button className="button secondary" type="button" onClick={clear}>{ui("ui.app.collections.CollectionsDirectoryClient.7179ea0035fc", "Clear filters")}</button>}</div>
    {visible.length ? <div className={styles.grid}>{visible.map((collection) => <Link className={styles.card} href={`/collections/${encodeURIComponent(collection.handle)}`} key={collection.handle}>
      <FallbackImage
        src={collection.image}
        alt=""
        loading="lazy"
        fetchPriority="low"
        decoding="async"
        width={640}
        height={480}
        referrerPolicy="no-referrer"
        fallback={<div className={styles.placeholder} aria-hidden="true"><UsersRound size={38} /></div>}
      />
      <div className={styles.cardBody}><span className={styles.role}>{collectionRoleLabel(collection.accountType)}</span><h2>{collection.name}</h2><p>@{collection.handle}</p><div className={styles.cardFooter}><span>{collection.count}{" "}{collection.count === 1 ? ui("ui.app.collections.CollectionsDirectoryClient.d696a35bdd18", "Profile") : ui("ui.app.collections.CollectionsDirectoryClient.535e52e4a261", "Profiles")}</span><span>{ui("ui.app.collections.CollectionsDirectoryClient.2a2a60fc79fd", "View collection")}{" "}<ArrowUpRight size={16} aria-hidden="true" /></span></div></div>
    </Link>)}</div> : <div className={styles.empty}><h2>{ui("ui.app.collections.CollectionsDirectoryClient.0baf1df98cbe", "No collections found.")}</h2><button className="button secondary" type="button" onClick={clear}>{ui("ui.app.collections.CollectionsDirectoryClient.a73e9c9ae150", "Clear filters")}</button></div>}
  </>;
}

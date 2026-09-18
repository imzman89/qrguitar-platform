"use client";

import Link from "next/link";
import { ArrowUpRight, Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { FallbackImage } from "../../components/FallbackImage";
import { collectionRoleLabel, collectionRoles, filterCollectionDirectory, type DirectoryCollection } from "../../lib/collection-directory";
import styles from "./collections.module.css";

export function CollectionsDirectoryClient({ collections }: { collections: DirectoryCollection[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const visible = useMemo(() => filterCollectionDirectory(collections, query, role), [collections, query, role]);
  const filtered = Boolean(query.trim()) || role !== "all";
  const clear = () => { setQuery(""); setRole("all"); };

  if (!collections.length) return <div className={styles.empty}>
    <UsersRound size={30} aria-hidden="true" /><h2>The first public collection starts with you.</h2>
    <p>Turn on your public collection and make at least one instrument Profile public to appear here. Private and unlisted Profiles stay hidden.</p>
    <div className="form-actions"><Link className="button" href="/account?section=collection">Publish your collection</Link><Link className="button secondary" href="/catalog">Browse instrument Profiles</Link></div>
  </div>;

  return <>
    <div className={styles.filters}>
      <label htmlFor="collection-search">Find a member or business<div className={styles.search}><Search size={18} aria-hidden="true" /><input id="collection-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Public name, collection handle, or role" /></div></label>
      <label htmlFor="collection-role">Collection type<select id="collection-role" value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All members</option>{Object.entries(collectionRoles).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    </div>
    <div className={styles.results}><p role="status">{filtered ? `${visible.length} of ${collections.length}` : collections.length} public {collections.length === 1 ? "collection" : "collections"}</p>{filtered && <button className="button secondary" type="button" onClick={clear}>Clear filters</button>}</div>
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
      <div className={styles.cardBody}><span className={styles.role}>{collectionRoleLabel(collection.accountType)}</span><h2>{collection.name}</h2><p>@{collection.handle}</p><div className={styles.cardFooter}><span>{collection.count} public {collection.count === 1 ? "Profile" : "Profiles"}</span><span>View collection <ArrowUpRight size={16} aria-hidden="true" /></span></div></div>
    </Link>)}</div> : <div className={styles.empty}><h2>No collections match these filters.</h2><p>Try another public name or collection type.</p><button className="button secondary" type="button" onClick={clear}>Show all collections</button></div>}
  </>;
}

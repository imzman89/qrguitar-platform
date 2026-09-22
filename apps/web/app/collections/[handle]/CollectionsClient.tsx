"use client";
import { useUiText } from "../../../components/UiTextProvider";


import { Search } from "lucide-react";
import styles from "../collections.module.css";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CollectibleRecordCard } from "../../../components/CollectibleRecordCard";
import { getContentValue } from "../../../lib/content-registry";
import { getInstrumentCondition, type DemoInstrument } from "../../../lib/local-demo";

export function CollectionsClient({ records, content }: { records: DemoInstrument[]; content: Record<string, string> }) {
  const ui = useUiText("app.collections.handle.CollectionsClient");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("All brands");
  const [condition, setCondition] = useState("All conditions");
  const [availability, setAvailability] = useState("All availability");
  const [type, setType] = useState("All types");
  const [sort, setSort] = useState("Newest");
  const hasFilters = Boolean(query.trim()) || brand !== "All brands" || condition !== "All conditions" || availability !== "All availability" || type !== "All types";
  function clearFilters() { setQuery(""); setBrand("All brands"); setCondition("All conditions"); setAvailability("All availability"); setType("All types"); }
  const brands = useMemo(() => ["All brands", ...Array.from(new Set(records.map((record) => record.brand).filter(Boolean))).sort()], [records]);
  const types = useMemo(() => ["All types", ...Array.from(new Set(records.map((record) => record.instrumentType).filter(Boolean) as string[])).sort()], [records]);
  const visible = records.filter((record) => {
    const haystack = [record.name, record.brand, record.model, record.year, record.location, record.qrCode].join(" ").toLowerCase();
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;
    if (brand !== "All brands" && record.brand !== brand) return false;
    if (condition !== "All conditions" && getInstrumentCondition(record) !== condition.toLowerCase()) return false;
    if (availability === "For sale" && record.saleStatus !== "for_sale") return false;
    if (availability === "Not for sale" && record.saleStatus === "for_sale") return false;
    if (type !== "All types" && record.instrumentType !== type) return false;
    return true;
  }).sort((first, second) => sort === "Oldest" ? Date.parse(first.createdAt) - Date.parse(second.createdAt) : sort === "Title" ? first.name.localeCompare(second.name) : Date.parse(second.createdAt) - Date.parse(first.createdAt));

  if (!records.length) return <div className="empty-state"><h2>{ui("ui.app.collections.handle.CollectionsClient.ac53f9376264", "No public instrument Profiles yet.")}</h2><p>{ui("ui.app.collections.handle.CollectionsClient.af746895fcef", "This member hasn’t added any instruments to their public collection yet.")}</p><Link className="button secondary" href="/collections">{ui("ui.app.collections.handle.CollectionsClient.2cbb876d08c4", "Explore other collections")}</Link></div>;

  return <>
    <div className={styles.memberFilters} aria-label={ui("ui.app.collections.handle.CollectionsClient.06981cabadd7", "Collection filters")}>
      <label><span>{ui("ui.app.collections.handle.CollectionsClient.49c266baaaa7", "Search")}</span><div className={styles.search}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ui("ui.app.collections.handle.CollectionsClient.a2723ce46a9a", "Title, brand, year, location...")} /></div></label>
      <label><span>{ui("ui.app.collections.handle.CollectionsClient.090ed4316f1d", "Brand")}</span><select value={brand} onChange={(event) => setBrand(event.target.value)}>{brands.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>{ui("ui.app.collections.handle.CollectionsClient.bec69036aa27", "Sort")}</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="Newest">{ui("ui.app.collections.handle.CollectionsClient.d15efa178cf6", "Newest")}</option><option value="Oldest">{ui("ui.app.collections.handle.CollectionsClient.505dc450753e", "Oldest")}</option><option value="Title">{ui("ui.app.collections.handle.CollectionsClient.7e8cd2056da7", "Title")}</option></select></label>
    </div>
    <details className={styles.memberAdvanced}>
      <summary>{ui("ui.app.collections.handle.CollectionsClient.b1ab49a6fedc", "More filters")}{condition !== "All conditions" || availability !== "All availability" || type !== "All types" ? ui("ui.app.collections.handle.CollectionsClient.75d3a0a839f9", " · Active") : ""}</summary>
      <div className={styles.memberFilterFields}>
      <label><span>{ui("ui.app.collections.handle.CollectionsClient.39b36d38d6eb", "Condition")}</span><select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="All conditions">{ui("ui.app.collections.handle.CollectionsClient.7c403b64e552", "All conditions")}</option><option value="New">{ui("ui.app.collections.handle.CollectionsClient.18fdd549b2ed", "New")}</option><option value="Used">{ui("ui.app.collections.handle.CollectionsClient.ae7d8dfac9ff", "Used")}</option></select></label>
      <label><span>{ui("ui.app.collections.handle.CollectionsClient.12f67f8539c4", "Availability")}</span><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="All availability">{ui("ui.app.collections.handle.CollectionsClient.2ac0f50706fa", "All availability")}</option><option value="For sale">{ui("ui.app.collections.handle.CollectionsClient.aedf56fc02b4", "For sale")}</option><option value="Not for sale">{ui("ui.app.collections.handle.CollectionsClient.323d22588945", "Not for sale")}</option></select></label>
      <label><span>{ui("ui.app.collections.handle.CollectionsClient.baaddf70fb5d", "Type")}</span><select value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
    </details>
    <p className="collection-result-count" role="status">
      {getContentValue(content, "collections.results.count").replace("{count}", String(visible.length))}
    </p>
    {hasFilters && <div className="form-actions"><button className="button secondary" type="button" onClick={clearFilters}>{ui("ui.app.collections.handle.CollectionsClient.7179ea0035fc", "Clear filters")}</button></div>}
    <div className={`${styles.profileGrid} catalog-record-grid collection-record-grid`}>
      {visible.map((record) => <CollectibleRecordCard key={record.qrCode} record={record} content={content} />)}
    </div>
    {!visible.length ? (
      <div className="empty-state">
        <h2>{getContentValue(content, "collections.empty.filteredTitle")}</h2>
        <p>{getContentValue(content, "collections.empty.filteredBody")}</p>
        <button className="button secondary" type="button" onClick={clearFilters}>{ui("ui.app.collections.handle.CollectionsClient.a3da4386e1c1", "Show all public Profiles")}</button>
      </div>
    ) : null}
  </>;
}

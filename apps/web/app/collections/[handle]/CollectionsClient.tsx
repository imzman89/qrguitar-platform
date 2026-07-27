"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CollectibleRecordCard } from "../../../components/CollectibleRecordCard";
import { getContentValue } from "../../../lib/content-registry";
import { getInstrumentCondition, type DemoInstrument } from "../../../lib/local-demo";

export function CollectionsClient({ records, content }: { records: DemoInstrument[]; content: Record<string, string> }) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("All brands");
  const [condition, setCondition] = useState("All conditions");
  const [availability, setAvailability] = useState("All availability");
  const [type, setType] = useState("All types");
  const [sort, setSort] = useState("Newest");
  const brands = useMemo(() => ["All brands", ...Array.from(new Set(records.map((record) => record.brand).filter(Boolean))).sort()], [records]);
  const types = useMemo(() => ["All types", ...Array.from(new Set(records.map((record) => record.instrumentType).filter(Boolean) as string[])).sort()], [records]);
  const visible = records.filter((record) => {
    const haystack = [record.name, record.brand, record.model, record.year, record.location, record.qrCode].join(" ").toLowerCase();
    if (query && !haystack.includes(query.toLowerCase())) return false;
    if (brand !== "All brands" && record.brand !== brand) return false;
    if (condition !== "All conditions" && getInstrumentCondition(record) !== condition.toLowerCase()) return false;
    if (availability === "For sale" && record.saleStatus !== "for_sale") return false;
    if (availability === "Not for sale" && record.saleStatus === "for_sale") return false;
    if (type !== "All types" && record.instrumentType !== type) return false;
    return true;
  }).sort((first, second) => sort === "Oldest" ? Date.parse(first.createdAt) - Date.parse(second.createdAt) : sort === "Title" ? first.name.localeCompare(second.name) : Date.parse(second.createdAt) - Date.parse(first.createdAt));

  return <>
    <div className="collection-filters" aria-label="Collection filters">
      <label><span>Search</span><div className="search-input"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, brand, year, location..." /></div></label>
      <label><span>Brand</span><select value={brand} onChange={(event) => setBrand(event.target.value)}>{brands.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Condition</span><select value={condition} onChange={(event) => setCondition(event.target.value)}><option>All conditions</option><option>New</option><option>Used</option></select></label>
      <label><span>Availability</span><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option>All availability</option><option>For sale</option><option>Not for sale</option></select></label>
      <label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option>Newest</option><option>Oldest</option><option>Title</option></select></label>
    </div>
    <p className="collection-result-count">
      {getContentValue(content, "collections.results.count").replace("{count}", String(visible.length))}
    </p>
    <div className="catalog-record-grid collection-record-grid">
      {visible.map((record) => <CollectibleRecordCard key={record.qrCode} record={record} content={content} />)}
    </div>
    {!visible.length ? (
      <div className="empty-state">
        <h2>{getContentValue(content, "collections.empty.filteredTitle")}</h2>
        <p>{getContentValue(content, "collections.empty.filteredBody")}</p>
      </div>
    ) : null}
  </>;
}

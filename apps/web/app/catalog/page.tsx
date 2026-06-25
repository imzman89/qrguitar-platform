"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import {
  demoInstrument,
  getPublicDemoInstruments,
  instrumentDisplayName,
  instrumentToProfileUrl,
  type DemoInstrument
} from "../../lib/local-demo";

const fallbackRecords: DemoInstrument[] = [demoInstrument];

export default function CatalogPage() {
  const [records, setRecords] = useState<DemoInstrument[]>(fallbackRecords);
  const [brand, setBrand] = useState("All brands");
  const [region, setRegion] = useState("All regions");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"Newest" | "Oldest" | "Brand A-Z" | "Region A-Z">("Newest");
  const [catalogToolsText, setCatalogToolsText] = useState("");
  const [catalogToolsMessage, setCatalogToolsMessage] = useState("");
  const recordsStorageKey = "qrguitar.demoInstruments";

  useEffect(() => {
    const publicRecords = getPublicDemoInstruments();
    if (publicRecords.length) {
      setRecords(publicRecords);
    }
  }, []);

  const brands = useMemo(() => ["All brands", ...unique(records.map((record) => record.brand).filter(Boolean))], [records]);
  const regions = useMemo(() => ["All regions", ...unique(records.map(regionFromRecord).filter(Boolean))], [records]);

  const hasFilterOrSearch = brand !== "All brands" || region !== "All regions" || query.trim().length > 0;

  const filtered = records
    .filter((record) => brand === "All brands" || record.brand === brand)
    .filter((record) => region === "All regions" || regionFromRecord(record) === region)
    .filter((record) => {
      const haystack = [record.qrCode, record.name, record.brand, record.model, record.serial, record.location]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.toLowerCase());
    });

  const visibleRecords = [...filtered].sort((a, b) => {
    if (sortMode === "Newest") {
      return Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
    }

    if (sortMode === "Oldest") {
      return Date.parse(a.createdAt || "") - Date.parse(b.createdAt || "");
    }

    if (sortMode === "Brand A-Z") {
      return instrumentDisplayName(a).localeCompare(instrumentDisplayName(b));
    }

    return regionFromRecord(a).localeCompare(regionFromRecord(b));
  });

  const visibleCount = visibleRecords.length;
  const totalCount = records.length;

  const topBrands = useMemo(() => {
    return unique(records.map((record) => record.brand).filter(Boolean));
  }, [records]);

  const topRegions = useMemo(() => {
    return unique(records.map(regionFromRecord).filter(Boolean));
  }, [records]);

  function refreshRecordsFromStorage() {
    const publicRecords = getPublicDemoInstruments();
    if (publicRecords.length) {
      setRecords(publicRecords);
    } else {
      setRecords(fallbackRecords);
    }
  }

  function exportRecords() {
    const current = localStorage.getItem(recordsStorageKey) || "[]";
    setCatalogToolsText(current);
    setCatalogToolsMessage("Copied local records JSON to the form. Paste this into the other browser.");
    void navigator.clipboard.writeText(current);
  }

  function importRecords() {
    try {
      const parsed = JSON.parse(catalogToolsText || "[]");
      if (!Array.isArray(parsed)) {
        throw new Error("Invalid JSON list");
      }

      localStorage.setItem(recordsStorageKey, JSON.stringify(parsed));
      refreshRecordsFromStorage();
      setCatalogToolsMessage(`Imported ${parsed.length} records. Refresh catalog now.`);
    } catch {
      setCatalogToolsMessage("Paste a valid JSON array from another browser first.");
    }
  }

  return (
    <>
      <Nav />
      <main className="section catalog-page">
        <div className="shell">
          <div className="dashboard-hero">
            <div>
              <div className="eyebrow">Public catalog</div>
              <h2>Browse public QRguitar records.</h2>
              <p>Public profiles are discoverable by default. Owners can make a record private when privacy matters.</p>
            </div>
            <Link className="button" href="/create">
              Register Instrument
            </Link>
          </div>

          <section className="catalog-filters" aria-label="Catalog filters">
            <label>
              Brand
              <select value={brand} onChange={(event) => setBrand(event.target.value)}>
                {brands.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Region
              <select value={region} onChange={(event) => setRegion(event.target.value)}>
                {regions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Sort
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
                <option>Newest</option>
                <option>Oldest</option>
                <option>Brand A-Z</option>
                <option>Region A-Z</option>
              </select>
            </label>
            <label className="catalog-search">
              Search
              <span>
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Serial, model, brand..." />
              </span>
            </label>
          </section>

          <section className="card" aria-label="Catalog discovery highlights">
            <div className="catalog-toolbar">
              <p>
                <strong>{visibleCount}</strong> of <strong>{totalCount}</strong> public records.
              </p>
              <button className="button secondary" type="button" onClick={() => {
                setBrand("All brands");
                setRegion("All regions");
                setQuery("");
              }} disabled={!hasFilterOrSearch}>
                <SlidersHorizontal size={14} />
                Reset filters
              </button>
            </div>
            <div className="catalog-highlights">
              <span>{topBrands.slice(0, 2).join(" / ") || "Premium catalog"}</span>
              <span>{topRegions.slice(0, 2).join(" / ") || "Global collection"} | {totalCount} instruments</span>
            </div>
          </section>

          <section className="card" aria-label="Local catalog migration">
            <div className="eyebrow">Catalog sync (optional)</div>
            <p>Useful for local testing across different browsers. Your public catalog still works without using this.</p>
            <details className="advanced-panel">
              <summary>Advanced: sync data between browsers</summary>
              <div className="form-grid">
                <button className="button secondary" type="button" onClick={exportRecords}>
                  Export local catalog records
                </button>
                <button className="button secondary" type="button" onClick={importRecords}>
                  Import records into this browser
                </button>
              </div>
              <div className="field">
                <label htmlFor="catalog-sync">Catalog data</label>
                <textarea
                  id="catalog-sync"
                  rows={4}
                  value={catalogToolsText}
                  onChange={(event) => setCatalogToolsText(event.target.value)}
                  placeholder='Paste JSON array from another browser (from Export local catalog records)'
                />
              </div>
              <small>{catalogToolsMessage}</small>
            </details>
          </section>

          <section className="catalog-grid" aria-label="Public QRguitar records">
            {visibleRecords.length ? (
              visibleRecords.map((record) => (
              <Link className="catalog-card" href={instrumentToProfileUrl(record)} key={record.qrCode}>
                <div
                  className="catalog-card-image"
                  style={
                    record.heroImageDataUrl
                      ? { backgroundImage: `linear-gradient(180deg, rgba(3,5,6,.05), rgba(3,5,6,.86)), url(${record.heroImageDataUrl})` }
                      : undefined
                  }
                >
                  <span>{record.qrCode}</span>
                </div>
                <div>
                  <h3>{instrumentDisplayName(record)}</h3>
                  <p>{record.brand} - {record.serial}</p>
                  <div className="catalog-meta">
                    <span>{record.year || "Year unknown"}</span>
                    <span>{regionFromRecord(record) || "Region unknown"}</span>
                  </div>
                </div>
              </Link>
              ))
            ) : (
              <div className="card catalog-empty">
                <div className="eyebrow">No records found</div>
                <h3>No matching records in the catalog.</h3>
                <p>Try clearing filters or searching without punctuation.</p>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function regionFromRecord(record: DemoInstrument) {
  const pieces = (record.location || "").split(",").map((piece) => piece.trim()).filter(Boolean);
  return pieces.length >= 2 ? pieces[pieces.length - 2] : pieces[0] || "";
}

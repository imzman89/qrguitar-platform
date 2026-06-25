"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import {
  demoInstrument,
  getInstrumentCondition,
  getInstrumentVerificationStatus,
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
      const haystack = [record.qrCode, record.name, record.brand, record.model, record.serial, record.location].join(" ").toLowerCase();
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

  return (
    <>
      <Nav />
      <main className="section catalog-page">
        <div className="shell">
          <div className="dashboard-hero">
            <div>
              <div className="eyebrow">Public catalog</div>
              <h2>Search public instrument records.</h2>
              <p>Browse guitars, amps, pedals, and shop inventory that owners have chosen to make public.</p>
            </div>
            <div className="dashboard-buttons">
              <Link className="button" href="/create">
                Register Instrument
              </Link>
              <Link className="button secondary" href="/bot">
                QRguitar Bot
              </Link>
            </div>
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

          <section className="catalog-summary" aria-label="Catalog discovery highlights">
            <div className="catalog-toolbar">
              <p>
                <strong>{visibleCount}</strong> of <strong>{totalCount}</strong> public records.
              </p>
              {hasFilterOrSearch ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setBrand("All brands");
                    setRegion("All regions");
                    setQuery("");
                  }}
                >
                  <SlidersHorizontal size={14} />
                  Reset filters
                </button>
              ) : null}
            </div>
            <div className="catalog-highlights">
              <span>{topBrands.slice(0, 2).join(" / ") || "No brands listed yet"}</span>
              <span>{topRegions.slice(0, 2).join(" / ") || "No regions listed yet"} | {totalCount} records</span>
            </div>
          </section>

          <section className="catalog-grid" aria-label="Public QRguitar records">
            {visibleRecords.length ? (
              visibleRecords.map((record) => {
                const verificationStatus = getInstrumentVerificationStatus(record);
                const condition = getInstrumentCondition(record);

                return (
                  <Link
                    className="catalog-card"
                    href={instrumentToProfileUrl(record)}
                    key={record.qrCode}
                    aria-label={`View ${instrumentDisplayName(record)} public profile`}
                  >
                    <article className="catalog-card-media">
                      <img
                        className="catalog-card-image"
                        src={record.heroImageDataUrl || "/media/reptile-hero.jpg"}
                        alt={`${instrumentDisplayName(record)} main image`}
                      />
                      <span className="catalog-card-code">{record.qrCode}</span>
                    </article>
                    <div className="catalog-card-content">
                      <h3>{instrumentDisplayName(record)}</h3>
                      <p className="catalog-meta-line">{record.brand} - {record.serial}</p>
                      <p className="catalog-card-summary">{record.summary || "Owner has not added public notes yet."}</p>
                      <div className="catalog-meta">
                        <span className={`catalog-chip catalog-chip--${condition}`}>{condition === "new" ? "New" : "Used"}</span>
                        <span className={`catalog-chip ${verificationStatus === "verified" ? "catalog-chip--verified" : "catalog-chip--unverified"}`}>
                          {verificationStatus === "verified" ? "Verified record" : "Unverified record"}
                        </span>
                        <span>{record.year || "Year unknown"}</span>
                        <span>{regionFromRecord(record) || "Region unknown"}</span>
                      </div>
                      <span className="catalog-card-cta">Open record</span>
                    </div>
                  </Link>
                );
              })
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

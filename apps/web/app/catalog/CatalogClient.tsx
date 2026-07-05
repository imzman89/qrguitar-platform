"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CollectibleRecordCard } from "../../components/CollectibleRecordCard";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import {
  getInstrumentVerificationStatus,
  type DemoInstrument
} from "../../lib/local-demo";

type ShowFilter = "All records" | "Verified" | "Authenticity confirmed" | "Safety alerts" | "Has photos" | "Has service history" | "Has proof documents";

export function CatalogClient({ initialRecords }: { initialRecords: DemoInstrument[] }) {
  const [records, setRecords] = useState<DemoInstrument[]>(dedupeByCodeAndDate(initialRecords));
  const [brand, setBrand] = useState("All brands");
  const [showFilter, setShowFilter] = useState<ShowFilter>("All records");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"Newest" | "Oldest" | "Title" | "Year">("Newest");

  const loadRecords = useCallback(async () => {
    try {
      const response = await fetch("/api/instruments", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; instruments?: DemoInstrument[] }
        | null;

      if (!response.ok || !payload?.ok || !Array.isArray(payload.instruments)) {
        return;
      }

      setRecords(dedupeByCodeAndDate(payload.instruments));
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadRecords();

    const onRefresh = async () => {
      if (document.visibilityState === "hidden" || cancelled) {
        return;
      }

      await loadRecords();
    };

    window.addEventListener("focus", onRefresh);
    window.addEventListener("qrguitar:catalog-updated", onRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("qrguitar:catalog-updated", onRefresh);
    };
  }, [loadRecords]);

  const brands = useMemo(() => ["All brands", ...unique(records.map((record) => record.brand).filter(Boolean))], [records]);

  const hasFilterOrSearch = brand !== "All brands" || showFilter !== "All records" || query.trim().length > 0;

  const filtered = records
    .filter((record) => brand === "All brands" || record.brand === brand)
    .filter((record) => {
      if (showFilter === "Verified") {
        return getInstrumentVerificationStatus(record) === "verified";
      }

      if (showFilter === "Authenticity confirmed") {
        return record.authenticityStatus === "confirmed";
      }

      if (showFilter === "Safety alerts") {
        return record.safetyStatus === "lost" || record.safetyStatus === "stolen";
      }

      if (showFilter === "Has photos") {
        return Boolean(record.heroImageDataUrl || record.galleryImageDataUrls?.length);
      }

      if (showFilter === "Has service history") {
        return Boolean(record.serviceEvents?.length);
      }

      if (showFilter === "Has proof documents") {
        return Boolean(record.documentFiles?.some((file) => file.visibility !== "hidden"));
      }

      return true;
    })
    .filter((record) => {
      const haystack = [record.qrCode, record.name, record.brand, record.model, record.serial, record.location, record.instrumentType].join(" ").toLowerCase();
      return haystack.includes(query.toLowerCase());
    });

  const visibleRecords = [...filtered].sort((a, b) => {
    if (sortMode === "Newest") {
      return Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
    }

    if (sortMode === "Oldest") {
      return Date.parse(a.createdAt || "") - Date.parse(b.createdAt || "");
    }

    if (sortMode === "Title") {
      return (a.name || a.model || a.qrCode).localeCompare(b.name || b.model || b.qrCode);
    }

    if (sortMode === "Year") {
      return Number(b.year || 0) - Number(a.year || 0);
    }

    return 0;
  });

  const visibleCount = visibleRecords.length;
  const totalCount = records.length;

  const topBrands = useMemo(() => {
    return unique(records.map((record) => record.brand).filter(Boolean));
  }, [records]);

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
              Create Record
            </Link>
          </div>

          <section className="catalog-filters" aria-label="Catalog filters">
            <label className="catalog-search">
              Search
              <span>
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Serial, model, brand..." />
              </span>
            </label>
            <label>
              Brand
              <select value={brand} onChange={(event) => setBrand(event.target.value)}>
                {brands.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Show
              <select value={showFilter} onChange={(event) => setShowFilter(event.target.value as ShowFilter)}>
                <option>All records</option>
                <option>Verified</option>
                <option>Authenticity confirmed</option>
                <option>Safety alerts</option>
                <option>Has photos</option>
                <option>Has service history</option>
                <option>Has proof documents</option>
              </select>
            </label>
            <label>
              Sort
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
                <option>Newest</option>
                <option>Oldest</option>
                <option>Title</option>
                <option>Year</option>
              </select>
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
                    setShowFilter("All records");
                    setQuery("");
                  }}
                >
                  <SlidersHorizontal size={14} />
                  Reset filters
                </button>
              ) : null}
            </div>
            <div className="catalog-highlights">
              <span>{topBrands.slice(0, 2).join(" / ") || "Premium catalog"}</span>
              <span>{totalCount} public {totalCount === 1 ? "record" : "records"}</span>
            </div>
          </section>

          <section className="catalog-grid" aria-label="Public QRguitar records">
            {visibleRecords.length ? (
              visibleRecords.map((record) => (
                <CollectibleRecordCard record={record} variant="catalog" eyebrow="Public record" key={record.qrCode} />
              ))
            ) : (
              <div className="card catalog-empty">
                <div className="eyebrow">No records found</div>
                <h3>No matching records in the catalog.</h3>
                <p>Try clearing filters, changing status, or searching by serial, brand, model, or type.</p>
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

function dedupeByCodeAndDate(records: DemoInstrument[]) {
  const latestByCode = new Map<string, DemoInstrument>();

  for (const record of records.filter((record) => record?.qrCode)) {
    const key = record.qrCode.toUpperCase();
    const candidateDate = Date.parse(record.createdAt || "");
    const existing = latestByCode.get(key);
    const existingDate = existing ? Date.parse(existing.createdAt || "") : Number.NEGATIVE_INFINITY;

    if (!existing || candidateDate > existingDate) {
      latestByCode.set(key, record);
    }
  }

  return Array.from(latestByCode.values()).sort(
    (first, second) => Date.parse(second.createdAt || "") - Date.parse(first.createdAt || "")
  );
}

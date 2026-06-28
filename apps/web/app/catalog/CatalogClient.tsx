"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { RecordShareButton } from "../../components/RecordShareButton";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  instrumentDisplayName,
  instrumentSubtitle,
  instrumentToProfileUrl,
  type DemoInstrument
} from "../../lib/local-demo";
import { formatRecordLocation } from "../../lib/record-location";

export function CatalogClient({ initialRecords }: { initialRecords: DemoInstrument[] }) {
  const [records, setRecords] = useState<DemoInstrument[]>(dedupeByCodeAndDate(initialRecords));
  const [brand, setBrand] = useState("All brands");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"Newest" | "Oldest">("Newest");

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

  const hasFilterOrSearch = brand !== "All brands" || query.trim().length > 0;

  const filtered = records
    .filter((record) => brand === "All brands" || record.brand === brand)
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
              Sort
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
                <option>Newest</option>
                <option>Oldest</option>
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
              visibleRecords.map((record) => {
                const verificationStatus = getInstrumentVerificationStatus(record);
                const condition = getInstrumentCondition(record);
                const imageUrl = record.heroImageDataUrl || record.galleryImageDataUrls?.[0] || "";

                return (
                  <article
                    className="catalog-card"
                    key={record.qrCode}
                    aria-label={`View ${instrumentDisplayName(record)} public profile`}
                  >
                    <Link className="catalog-card-main" href={instrumentToProfileUrl(record)}>
                      <div className="catalog-card-media">
                        {imageUrl ? (
                          <img
                            className="catalog-card-image"
                            src={imageUrl}
                            alt={`${instrumentDisplayName(record)} main image`}
                          />
                        ) : (
                          <div className="catalog-card-image catalog-card-image--empty">
                            <strong>{record.brand?.slice(0, 2).toUpperCase() || "QR"}</strong>
                            <span>No public photo yet</span>
                          </div>
                        )}
                        <span className="catalog-card-code">{record.qrCode}</span>
                      </div>
                      <div className="catalog-card-content">
                        <h3>{instrumentDisplayName(record)}</h3>
                        <p className="catalog-meta-line">{instrumentSubtitle(record)}</p>
                        <p className="catalog-card-summary">{record.summary || "Record details will appear as the owner adds photos, specs, and history."}</p>
                        <div className="catalog-meta">
                          <span className={`catalog-chip catalog-chip--${condition}`}>{condition === "new" ? "New" : "Used"}</span>
                          <span className={`catalog-chip ${verificationStatus === "verified" ? "catalog-chip--verified" : "catalog-chip--unverified"}`}>
                            {verificationStatus === "verified" ? "Verified" : "Unverified"}
                          </span>
                          <span>{record.year || "Year unknown"}</span>
                          <span>{formatRecordLocation(record) || "Location unknown"}</span>
                          <span>{record.galleryImageDataUrls?.length || (record.heroImageDataUrl ? 1 : 0)} photos</span>
                          <span>{record.documentFiles?.filter((file) => file.visibility !== "hidden").length || 0} docs</span>
                        </div>
                        <span className="catalog-card-cta">View Record</span>
                      </div>
                    </Link>
                    <RecordShareButton className="catalog-card-share" code={record.qrCode} title={instrumentDisplayName(record)} />
                  </article>
                );
              })
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

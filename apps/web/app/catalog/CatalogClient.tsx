"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CollectibleRecordCard } from "../../components/CollectibleRecordCard";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  type DemoInstrument
} from "../../lib/local-demo";

type ShowFilter = "All profiles" | "For Sale" | "Not for Sale" | "New" | "Used" | "Verified" | "Unverified" | "Authenticity confirmed" | "Authenticity unconfirmed" | "All original" | "Modified" | "Safety alerts" | "Service history";

export function CatalogClient({ initialRecords }: { initialRecords: DemoInstrument[] }) {
  const [records, setRecords] = useState<DemoInstrument[]>(dedupeByCodeAndDate(initialRecords));
  const [hasLoadedRecords, setHasLoadedRecords] = useState(initialRecords.length > 0);
  const [brand, setBrand] = useState("All brands");
  const [showFilter, setShowFilter] = useState<ShowFilter>("All profiles");
  const [query, setQuery] = useState("");
  const [exactMatchCode, setExactMatchCode] = useState("");
  const [serialLookupMessage, setSerialLookupMessage] = useState("");
  const [protectedSerialMatch, setProtectedSerialMatch] = useState(false);
  const [serialLookupBusy, setSerialLookupBusy] = useState(false);
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
    } finally {
      setHasLoadedRecords(true);
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

  const hasFilterOrSearch = brand !== "All brands" || showFilter !== "All profiles" || query.trim().length > 0;

  const filtered = records
    .filter((record) => !exactMatchCode || record.qrCode === exactMatchCode)
    .filter((record) => Boolean(exactMatchCode) || brand === "All brands" || record.brand === brand)
    .filter((record) => {
      if (exactMatchCode) {
        return true;
      }

      if (showFilter === "Verified") {
        return getInstrumentVerificationStatus(record) === "verified";
      }

      if (showFilter === "Unverified") {
        return getInstrumentVerificationStatus(record) !== "verified";
      }

      if (showFilter === "Authenticity confirmed") {
        return record.authenticityStatus === "confirmed";
      }

      if (showFilter === "Authenticity unconfirmed") {
        return record.authenticityStatus !== "confirmed";
      }

      if (showFilter === "Safety alerts") {
        return record.safetyStatus === "lost" || record.safetyStatus === "stolen";
      }

      if (showFilter === "For Sale") {
        return record.saleStatus === "for_sale";
      }

      if (showFilter === "Not for Sale") {
        return record.saleStatus !== "for_sale";
      }

      if (showFilter === "New") {
        return getInstrumentCondition(record) === "new";
      }

      if (showFilter === "Used") {
        return getInstrumentCondition(record) === "used";
      }

      if (showFilter === "All original") {
        return record.originalityStatus === "all_original";
      }

      if (showFilter === "Modified") {
        return record.originalityStatus === "modified";
      }

      if (showFilter === "Service history") {
        return Boolean(record.serviceEvents?.length);
      }

      return true;
    })
    .filter((record) => {
      if (exactMatchCode) {
        return true;
      }
      const haystack = [record.qrCode, record.name, record.brand, record.model, record.serial, record.location, record.instrumentType, record.saleStatus, record.originalityStatus].join(" ").toLowerCase();
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

  async function searchExactSerial() {
    const serial = query.trim();
    if (serial.length < 4) {
      setSerialLookupMessage("Enter at least four letters or numbers for an exact serial lookup.");
      return;
    }

    setSerialLookupBusy(true);
    setSerialLookupMessage("");
    setProtectedSerialMatch(false);
    setExactMatchCode("");
    try {
      const response = await fetch("/api/instruments/serial-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial })
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        match?: "public" | "protected" | "none";
        message?: string;
        instrument?: DemoInstrument;
      } | null;

      if (!response.ok || !payload?.ok) {
        setSerialLookupMessage(payload?.message || "Exact serial lookup is temporarily unavailable.");
        return;
      }
      if (payload.match === "public" && payload.instrument) {
        setRecords((current) => dedupeByCodeAndDate([payload.instrument as DemoInstrument, ...current]));
        setExactMatchCode(payload.instrument.qrCode);
        setSerialLookupMessage("Exact serial match found. The serial remains hidden when the owner has chosen privacy.");
        return;
      }
      setProtectedSerialMatch(payload.match === "protected");
      setSerialLookupMessage(payload.message || "No QRguitar Profile matches that exact serial.");
    } catch {
      setSerialLookupMessage("Exact serial lookup is temporarily unavailable.");
    } finally {
      setSerialLookupBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="section catalog-page">
        <div className="shell">
          <div className="dashboard-hero">
            <div>
              <div className="eyebrow">The Catalog</div>
              <h2>Browse QRguitar Profiles.</h2>
              <p>Find instruments by brand, model, year, condition, verification, originality, safety status, service history, proof, or Availability.</p>
            </div>
            <Link className="button" href="/create">
              Create Profile
            </Link>
          </div>

          <section className="catalog-filters" aria-label="Catalog filters">
            <label className="catalog-search">
              Search profiles
              <span>
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setExactMatchCode("");
                    setSerialLookupMessage("");
                    setProtectedSerialMatch(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchExactSerial();
                    }
                  }}
                  placeholder="Brand, model, or exact serial"
                />
                <button
                  type="button"
                  className="catalog-exact-search"
                  onClick={() => void searchExactSerial()}
                  disabled={serialLookupBusy}
                  aria-label="Find exact serial"
                  title="Find exact serial"
                >
                  <Search size={16} />
                </button>
              </span>
            </label>
            <label>
              Brand
              <select value={brand} onChange={(event) => setBrand(event.target.value)}>
                {brands.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Filter
              <select value={showFilter} onChange={(event) => setShowFilter(event.target.value as ShowFilter)}>
                <option>All profiles</option>
                <optgroup label="Availability">
                  <option>For Sale</option>
                  <option>Not for Sale</option>
                </optgroup>
                <optgroup label="Condition">
                  <option>New</option>
                  <option>Used</option>
                </optgroup>
                <optgroup label="Trust">
                  <option>Verified</option>
                  <option>Unverified</option>
                  <option>Authenticity confirmed</option>
                  <option>Authenticity unconfirmed</option>
                </optgroup>
                <optgroup label="Originality">
                  <option>All original</option>
                  <option>Modified</option>
                </optgroup>
                <optgroup label="History">
                  <option>Safety alerts</option>
                  <option>Service history</option>
                </optgroup>
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

          {serialLookupMessage ? (
            <div className={exactMatchCode ? "catalog-lookup-result is-match" : "catalog-lookup-result"} role="status">
              <span>{serialLookupMessage}</span>
              {protectedSerialMatch ? <Link className="button secondary" href="/ownership-claim">Request ownership</Link> : null}
            </div>
          ) : null}

          <section className="catalog-summary" aria-label="Catalog discovery highlights">
            <div className="catalog-toolbar">
              <p>
                <strong>{visibleCount}</strong> of <strong>{totalCount}</strong> visible profiles.
              </p>
              {hasFilterOrSearch ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setBrand("All brands");
                    setShowFilter("All profiles");
                    setQuery("");
                    setExactMatchCode("");
                    setSerialLookupMessage("");
                    setProtectedSerialMatch(false);
                  }}
                >
                  <SlidersHorizontal size={14} />
                  Reset filters
                </button>
              ) : null}
            </div>
            <div className="catalog-highlights">
              <span>{topBrands.slice(0, 2).join(" / ") || "Premium catalog"}</span>
              <span>{totalCount} visible {totalCount === 1 ? "profile" : "profiles"}</span>
            </div>
          </section>

          <section className="catalog-grid" aria-label="QRguitar Profiles">
            {!hasLoadedRecords ? (
              <div className="card catalog-empty">
                <div className="eyebrow">Loading QRguitar Profiles</div>
                <h3>Opening the catalog.</h3>
                <p>Fetching the latest visible profiles now.</p>
              </div>
            ) : visibleRecords.length ? (
              visibleRecords.map((record) => (
                <CollectibleRecordCard record={record} variant="catalog" key={record.qrCode} />
              ))
            ) : (
              <div className="card catalog-empty">
                <div className="eyebrow">No profiles found</div>
                <h3>No matching profiles in the catalog.</h3>
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

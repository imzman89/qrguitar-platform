"use client";

import { matchesCatalogQuery } from "../../lib/catalog-search";

import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CollectibleRecordCard } from "../../components/CollectibleRecordCard";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  type DemoInstrument
} from "../../lib/local-demo";
import { getServiceHistoryEntries } from "../../lib/instrument-profile-contract";
import { getContentValue } from "../../lib/content-registry";
import type { EditorialComposition } from "../../lib/site-settings";
import { catalogFilterUrl, defaultCatalogFilters, readCatalogFilters, type CatalogFilters } from "../../lib/catalog-filter-state";
import styles from "./CatalogClient.module.css";

export function CatalogClient({ initialRecords, content }: { initialRecords: DemoInstrument[]; content: Record<string, string>; composition: EditorialComposition["catalog"] }) {
  const [records, setRecords] = useState<DemoInstrument[]>(dedupeByCodeAndDate(initialRecords));
  const [hasLoadedRecords, setHasLoadedRecords] = useState(initialRecords.length > 0);
  const [filters, setFilters] = useState<CatalogFilters>({ ...defaultCatalogFilters });
  const { brand, availability, condition, trust, authenticity, originality, safety, service, query, sortMode } = filters;
  const serialLookupRevision = useRef(0);
  const [exactMatchCode, setExactMatchCode] = useState("");
  const [serialLookupMessage, setSerialLookupMessage] = useState("");
  const [showOwnershipClaim, setShowOwnershipClaim] = useState(false);
  const [serialLookupBusy, setSerialLookupBusy] = useState(false);

  function clearSerialLookup() {
    serialLookupRevision.current++;
    setExactMatchCode(""); setSerialLookupMessage(""); setShowOwnershipClaim(false); setSerialLookupBusy(false);
  }
  function updateFilters(patch: Partial<CatalogFilters>, replace = false) {
    const next = { ...filters, ...patch };
    setFilters(next);
    clearSerialLookup();
    const url = catalogFilterUrl(window.location.pathname, window.location.search, next) + window.location.hash;
    if (url !== window.location.pathname + window.location.search + window.location.hash) {
      window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
    }
  }
  function resetFilters() { updateFilters({ ...defaultCatalogFilters }); }
  useEffect(() => {
    const lookupRevisionRef = serialLookupRevision;
    const restore = () => { setFilters(readCatalogFilters(window.location.search)); clearSerialLookup(); };
    restore();
    window.addEventListener("popstate", restore);
    return () => { lookupRevisionRef.current++; window.removeEventListener("popstate", restore); };
  }, []);


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

  const brands = useMemo(() => ["All brands", ...unique([...records.map((record) => record.brand), brand === "All brands" ? "" : brand].filter(Boolean))], [records, brand]);

  const hasFilterOrSearch = brand !== "All brands"
    || availability !== "All availability"
    || condition !== "All conditions"
    || trust !== "All trust statuses"
    || authenticity !== "All authenticity statuses"
    || originality !== "All originality statuses"
    || safety !== "All safety statuses"
    || service !== "All service histories"
    || query.trim().length > 0;

  const filtered = records
    .filter((record) => !exactMatchCode || record.qrCode === exactMatchCode)
    .filter((record) => Boolean(exactMatchCode) || brand === "All brands" || record.brand === brand)
    .filter((record) => {
      if (exactMatchCode) return true;
      const verificationStatus = getInstrumentVerificationStatus(record);
      const instrumentCondition = getInstrumentCondition(record);
      const hasSafetyAlert = record.safetyStatus === "lost" || record.safetyStatus === "stolen";
      const hasServiceHistory = getServiceHistoryEntries(record).length > 0;
      return (trust === "All trust statuses" || (trust === "Verified" ? verificationStatus === "verified" : verificationStatus !== "verified"))
        && (authenticity === "All authenticity statuses" || (authenticity === "Authenticity Confirmed" ? record.authenticityStatus === "confirmed" : record.authenticityStatus !== "confirmed"))
        && (safety === "All safety statuses" || hasSafetyAlert)
        && (availability === "All availability" || (availability === "For Sale" ? record.saleStatus === "for_sale" : record.saleStatus !== "for_sale"))
        && (condition === "All conditions" || (condition === "New" ? instrumentCondition === "new" : instrumentCondition === "used"))
        && (originality === "All originality statuses" || (originality === "All Original" ? record.originalityStatus === "all_original" : record.originalityStatus === "modified"))
        && (service === "All service histories" || hasServiceHistory);
    })
    .filter((record) => {
      if (exactMatchCode) {
        return true;
      }
      return matchesCatalogQuery(record, query);
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
  const availableFilters = {
    availability: records.some((record) => Boolean(record.saleStatus)),
    condition: records.some((record) => Boolean(getInstrumentCondition(record))),
    trust: records.length > 0,
    authenticity: records.some((record) => Boolean(record.authenticityStatus)),
    originality: records.some((record) => Boolean(record.originalityStatus)),
    safety: records.some((record) => record.safetyStatus === "lost" || record.safetyStatus === "stolen"),
    service: records.some((record) => getServiceHistoryEntries(record).length > 0)
  };
  const hasAdvancedFilters = Object.values(availableFilters).some(Boolean);

  const filterLabels: Record<keyof CatalogFilters, string> = { query: "Search", brand: "Brand", availability: "Availability", condition: "Condition", trust: "Trust", authenticity: "Authenticity", originality: "Originality", safety: "Safety", service: "Service", sortMode: "Sort" };
  const activeFilters = (Object.keys(filters) as Array<keyof CatalogFilters>).filter((key) => key !== "sortMode" && filters[key] !== defaultCatalogFilters[key]);

  async function searchExactSerial() {
    const serial = query.trim();
    if (serial.length < 4) {
      setSerialLookupMessage("Enter at least four letters or numbers for an exact serial lookup.");
      return;
    }

    const lookupRevision = ++serialLookupRevision.current;
    setSerialLookupBusy(true);
    setSerialLookupMessage("");
    setShowOwnershipClaim(false);
    setExactMatchCode("");
    try {
      const response = await fetch("/api/instruments/serial-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial })
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        match?: "public" | "none";
        message?: string;
        instrument?: DemoInstrument;
      } | null;

      if (lookupRevision !== serialLookupRevision.current) return;
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
      setShowOwnershipClaim(payload.match === "none");
      setSerialLookupMessage(payload.message || "No public QRguitar Profile matches that exact serial.");
    } catch {
      if (lookupRevision !== serialLookupRevision.current) return;
      setSerialLookupMessage("Exact serial lookup is temporarily unavailable.");
    } finally {
      if (lookupRevision === serialLookupRevision.current) setSerialLookupBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <main className={styles["catalog-page"]}>
        <div className={styles["shell"]}>
          <div className={styles["dashboard-hero"]}>
            <div>
              <div className={styles["eyebrow"]}>{getContentValue(content, "catalog.hero.eyebrow")}</div>
              <h1>{getContentValue(content, "catalog.hero.headline")}</h1>
              <p>{getContentValue(content, "catalog.hero.body")}</p>
            </div>
            <div className={styles["catalog-hero-actions"]}>
              <Link className="button" href="/create">{getContentValue(content, "catalog.actions.create")}</Link>
              <Link className="text-link" href="/collections">Browse member collections</Link>
            </div>
          </div>

          <section className={styles["catalog-filters"]} aria-label="Catalog filters">
            <label className={styles["catalog-search"]}>
              Search
              <span>
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => {
                    updateFilters({ query: event.target.value }, true);
                    setExactMatchCode("");
                    setSerialLookupMessage("");
                    setShowOwnershipClaim(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchExactSerial();
                    }
                  }}
                  placeholder={getContentValue(content, "catalog.search.placeholder")}
                />
                <button
                  type="button"
                  className={styles["catalog-exact-search"]}
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
              <select value={brand} onChange={(event) => updateFilters({ brand: event.target.value })}>
                {brands.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Sort
              <select value={sortMode} onChange={(event) => updateFilters({ sortMode: event.target.value as typeof sortMode })}>
                <option>Newest</option>
                <option>Oldest</option>
                <option>Title</option>
                <option>Year</option>
              </select>
            </label>
          </section>

          {hasAdvancedFilters ? (
            <details className={styles["catalog-more-filters"]}>
              <summary><SlidersHorizontal size={15} /> Filters{activeFilters.length ? <span>{activeFilters.length}</span> : null}</summary>
              <div className={styles["catalog-filter-grid"]}>
                {availableFilters.availability ? <label>Availability<select value={availability} onChange={(event) => updateFilters({ availability: event.target.value })}><option>All availability</option><option>For Sale</option><option>Not for Sale</option></select></label> : null}
                {availableFilters.condition ? <label>Condition<select value={condition} onChange={(event) => updateFilters({ condition: event.target.value })}><option>All conditions</option><option>New</option><option>Used</option></select></label> : null}
                {availableFilters.trust ? <label>Trust<select value={trust} onChange={(event) => updateFilters({ trust: event.target.value })}><option>All trust statuses</option><option>Verified</option><option>Unverified</option></select></label> : null}
                {availableFilters.authenticity ? <label>Authenticity<select value={authenticity} onChange={(event) => updateFilters({ authenticity: event.target.value })}><option>All authenticity statuses</option><option>Authenticity Confirmed</option><option>Authenticity Unconfirmed</option></select></label> : null}
                {availableFilters.originality ? <label>Originality<select value={originality} onChange={(event) => updateFilters({ originality: event.target.value })}><option>All originality statuses</option><option>All Original</option><option>Modified</option></select></label> : null}
                {availableFilters.safety ? <label>Safety<select value={safety} onChange={(event) => updateFilters({ safety: event.target.value })}><option>All safety statuses</option><option>Safety Alert</option></select></label> : null}
                {availableFilters.service ? <label>Service History<select value={service} onChange={(event) => updateFilters({ service: event.target.value })}><option>All service histories</option><option>Has Service History</option></select></label> : null}
              </div>
            </details>
          ) : null}

          {activeFilters.length ? (
            <div className={styles["catalog-active-filters"]} aria-label="Active filters">
              {activeFilters.map((key) => <button key={key} type="button" onClick={() => updateFilters({ [key]: defaultCatalogFilters[key] })} aria-label={`Remove ${filterLabels[key]} filter: ${filters[key]}`}><span>{filterLabels[key]}: {filters[key]}</span><X size={12} aria-hidden="true" /></button>)}
            </div>
          ) : null}

          {serialLookupMessage ? (
            <div className={styles["catalog-lookup-result"]} role="status">
              <span>{serialLookupMessage}</span>
              {showOwnershipClaim ? <Link className="button secondary" href="/ownership-claim">Start ownership claim</Link> : null}
            </div>
          ) : null}

          <section className={styles["catalog-summary"]} aria-label="Catalog discovery highlights">
            <div className={styles["catalog-toolbar"]} aria-live="polite">
              <p><strong>{formatResultLabel(
                getContentValue(content, hasFilterOrSearch ? "catalog.results.filtered" : "catalog.results.all"),
                visibleCount
              )}</strong></p>
              {hasFilterOrSearch ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={resetFilters}
                >
                  <SlidersHorizontal size={14} />
                  {getContentValue(content, "catalog.actions.reset")}
                </button>
              ) : null}
            </div>
          </section>

          <section className={styles["catalog-grid"]} aria-label="QRguitar Profiles">
            {!hasLoadedRecords ? (
              <div className={styles["catalog-empty"]}>
                <div className={styles["eyebrow"]}>Loading QRguitar Profiles</div>
                <h2>Opening the catalog.</h2>
                <p>Fetching the latest QRguitar Profiles now.</p>
              </div>
            ) : visibleRecords.length ? (
              visibleRecords.map((record, index) => (
                <CollectibleRecordCard
                  record={record}
                  variant="catalog"
                  key={record.qrCode}
                  content={content}
                  prioritizeLeadImage={index === 0}
                />
              ))
            ) : (
              <div className={styles["catalog-empty"]}>
                <div className={styles["eyebrow"]}>No profiles found</div>
                <h2>{getContentValue(content, "catalog.empty.title")}</h2>
                <p>{getContentValue(content, "catalog.empty.body")}</p>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function formatResultLabel(template: string, count: number) {
  const resolved = template.replace("{count}", String(count));
  if (count !== 1) return resolved;
  return resolved.replace(/\bProfiles\b/, "Profile").replace(/\bResults\b/, "Result");
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

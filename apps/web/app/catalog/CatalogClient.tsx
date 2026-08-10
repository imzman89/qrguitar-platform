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
import { getServiceHistoryEntries } from "../../lib/instrument-profile-contract";
import { getContentValue } from "../../lib/content-registry";
import type { EditorialComposition } from "../../lib/site-settings";

export function CatalogClient({ initialRecords, content }: { initialRecords: DemoInstrument[]; content: Record<string, string>; composition: EditorialComposition["catalog"] }) {
  const [records, setRecords] = useState<DemoInstrument[]>(dedupeByCodeAndDate(initialRecords));
  const [hasLoadedRecords, setHasLoadedRecords] = useState(initialRecords.length > 0);
  const [brand, setBrand] = useState("All brands");
  const [availability, setAvailability] = useState("All availability");
  const [condition, setCondition] = useState("All conditions");
  const [trust, setTrust] = useState("All trust statuses");
  const [authenticity, setAuthenticity] = useState("All authenticity statuses");
  const [originality, setOriginality] = useState("All originality statuses");
  const [safety, setSafety] = useState("All safety statuses");
  const [service, setService] = useState("All service histories");
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
      const haystack = [record.qrCode, record.name, record.brand, record.model, record.location, record.instrumentType, record.saleStatus, record.originalityStatus].join(" ").toLowerCase();
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
              <div className="eyebrow">{getContentValue(content, "catalog.hero.eyebrow")}</div>
              <h1>{getContentValue(content, "catalog.hero.headline")}</h1>
              <p>{getContentValue(content, "catalog.hero.body")}</p>
            </div>
            <div className="catalog-hero-actions">
              <Link className="button" href="/create">{getContentValue(content, "catalog.actions.create")}</Link>
              <Link className="text-link" href="/collections">Browse member collections</Link>
            </div>
          </div>

          <section className="catalog-filters" aria-label="Catalog filters">
            <label className="catalog-search">
              Search
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
                  placeholder={getContentValue(content, "catalog.search.placeholder")}
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
              Sort
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
                <option>Newest</option>
                <option>Oldest</option>
                <option>Title</option>
                <option>Year</option>
              </select>
            </label>
          </section>

          {hasAdvancedFilters ? (
            <details className="catalog-more-filters">
              <summary><SlidersHorizontal size={15} /> More filters</summary>
              <div className="catalog-filter-grid">
                {availableFilters.availability ? <label>Availability<select value={availability} onChange={(event) => setAvailability(event.target.value)}><option>All availability</option><option>For Sale</option><option>Not for Sale</option></select></label> : null}
                {availableFilters.condition ? <label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value)}><option>All conditions</option><option>New</option><option>Used</option></select></label> : null}
                {availableFilters.trust ? <label>Trust<select value={trust} onChange={(event) => setTrust(event.target.value)}><option>All trust statuses</option><option>Verified</option><option>Unverified</option></select></label> : null}
                {availableFilters.authenticity ? <label>Authenticity<select value={authenticity} onChange={(event) => setAuthenticity(event.target.value)}><option>All authenticity statuses</option><option>Authenticity Confirmed</option><option>Authenticity Unconfirmed</option></select></label> : null}
                {availableFilters.originality ? <label>Originality<select value={originality} onChange={(event) => setOriginality(event.target.value)}><option>All originality statuses</option><option>All Original</option><option>Modified</option></select></label> : null}
                {availableFilters.safety ? <label>Safety<select value={safety} onChange={(event) => setSafety(event.target.value)}><option>All safety statuses</option><option>Safety Alert</option></select></label> : null}
                {availableFilters.service ? <label>Service History<select value={service} onChange={(event) => setService(event.target.value)}><option>All service histories</option><option>Has Service History</option></select></label> : null}
              </div>
            </details>
          ) : null}

          {serialLookupMessage ? (
            <div className={exactMatchCode ? "catalog-lookup-result is-match" : "catalog-lookup-result"} role="status">
              <span>{serialLookupMessage}</span>
              {protectedSerialMatch ? <Link className="button secondary" href="/ownership-claim">Request ownership</Link> : null}
            </div>
          ) : null}

          <section className="catalog-summary" aria-label="Catalog discovery highlights">
            <div className="catalog-toolbar">
              <p><strong>{formatResultLabel(
                getContentValue(content, hasFilterOrSearch ? "catalog.results.filtered" : "catalog.results.all"),
                visibleCount
              )}</strong></p>
              {hasFilterOrSearch ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setBrand("All brands");
                    setAvailability("All availability");
                    setCondition("All conditions");
                    setTrust("All trust statuses");
                    setAuthenticity("All authenticity statuses");
                    setOriginality("All originality statuses");
                    setSafety("All safety statuses");
                    setService("All service histories");
                    setQuery("");
                    setExactMatchCode("");
                    setSerialLookupMessage("");
                    setProtectedSerialMatch(false);
                  }}
                >
                  <SlidersHorizontal size={14} />
                  {getContentValue(content, "catalog.actions.reset")}
                </button>
              ) : null}
            </div>
          </section>

          <section className="catalog-grid" aria-label="QRguitar Profiles">
            {!hasLoadedRecords ? (
              <div className="card catalog-empty">
                <div className="eyebrow">Loading QRguitar Profiles</div>
                <h3>Opening the catalog.</h3>
                <p>Fetching the latest QRguitar Profiles now.</p>
              </div>
            ) : visibleRecords.length ? (
              visibleRecords.map((record) => (
                <CollectibleRecordCard record={record} variant="catalog" key={record.qrCode} content={content} />
              ))
            ) : (
              <div className="card catalog-empty">
                <div className="eyebrow">No profiles found</div>
                <h3>{getContentValue(content, "catalog.empty.title")}</h3>
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

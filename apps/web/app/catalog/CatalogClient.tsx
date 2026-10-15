"use client";
import { useUiText } from "../../components/UiTextProvider";


import { requestPublicProfiles } from "../../lib/public-profile-request";
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
  const ui = useUiText("app.catalog.CatalogClient");
  const catalogHeading = getContentValue(content, "catalog.hero.headline");
  const [records, setRecords] = useState<DemoInstrument[]>(dedupeByCodeAndDate(initialRecords));
  const recordsRevision = useRef(0);
  const recordsActive = useRef(true);
  const [recordsError, setRecordsError] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
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
    const search = new URLSearchParams(window.location.search);
    search.delete("exactSerial");
    const url = catalogFilterUrl(window.location.pathname, search.toString(), next) + window.location.hash;
    if (url !== window.location.pathname + window.location.search + window.location.hash) {
      window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
    }
  }
  function resetFilters() { updateFilters({ ...defaultCatalogFilters }); }
  useEffect(() => {
    const lookupRevisionRef = serialLookupRevision;
    const restore = () => {
      const restored = readCatalogFilters(window.location.search);
      setFilters(restored);
      clearSerialLookup();
      if (new URLSearchParams(window.location.search).get("exactSerial") === "1") {
        void searchExactSerial(restored.query);
      }
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => { lookupRevisionRef.current++; window.removeEventListener("popstate", restore); };
  }, []);


  const loadRecords = useCallback(async () => {
    const revision = ++recordsRevision.current;
    setRecordsLoading(true);
    try {
      const next = await requestPublicProfiles();
      if (!recordsActive.current || revision !== recordsRevision.current) return;
      setRecords(dedupeByCodeAndDate(next));
      setRecordsError(false);
      setHasLoadedRecords(true);
    } catch {
      if (recordsActive.current && revision === recordsRevision.current) setRecordsError(true);
    } finally {
      if (recordsActive.current && revision === recordsRevision.current) setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    recordsActive.current = true;
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
      recordsActive.current = false;
      recordsRevision.current++;
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

  async function searchExactSerial(serialQuery = query) {
    const serial = serialQuery.trim();
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
        publicReviewSnapshot?: boolean;
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
        const search = new URLSearchParams(window.location.search);
        search.set("q", serial);
        search.set("exactSerial", "1");
        window.history.replaceState(window.history.state, "", window.location.pathname + "?" + search.toString() + window.location.hash);
        setSerialLookupMessage("Exact serial match found.");
        return;
      }
      if (!payload.publicReviewSnapshot) setShowOwnershipClaim(payload.match === "none");
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
      <main className={styles["catalog-page"] + " boutique-gallery"}>
        <div className={styles["shell"]}>
          <div className={styles["dashboard-hero"]} data-long-heading={catalogHeading.trim().length > 24 ? "true" : undefined}>
            <div>
              <h1>{catalogHeading}</h1>
            </div>
            <div className={styles["catalog-hero-actions"]}>
              <Link className="button secondary" href="/create">{getContentValue(content, "catalog.actions.create")}</Link>
              <Link className="text-link" href="/collections">{ui("ui.app.catalog.CatalogClient.1fbba5113528", "Collections")}</Link>
            </div>
          </div>

          <section className={styles["catalog-filters"]} aria-label={ui("ui.app.catalog.CatalogClient.10d44ee84f0d", "Catalog filters")}>
            <label className={styles["catalog-search"]}>{ui("ui.app.catalog.CatalogClient.49c266baaaa7", "Search")}<span>
                <Search size={16} />
                <input
                  aria-label={ui("ui.app.catalog.CatalogClient.49c266baaaa7", "Search")}
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
                      // Ordinary search already filters the catalog as you type.
                    }
                  }}
                  placeholder={getContentValue(content, "catalog.search.placeholder")}
                />
                <button
                  type="button"
                  className={styles["catalog-exact-search"]}
                  onClick={() => void searchExactSerial()}
                  disabled={serialLookupBusy}
                  aria-label={ui("ui.app.catalog.CatalogClient.0e626c38e0fe", "Find exact serial")}
                  title={ui("ui.app.catalog.CatalogClient.0e626c38e0fe", "Find exact serial")}
                >
                  {ui("ui.app.catalog.CatalogClient.0e626c38e0fe", "Find exact serial")}
                </button>
              </span>
            </label>
            <label>{ui("ui.app.catalog.CatalogClient.090ed4316f1d", "Brand")}<select value={brand} onChange={(event) => updateFilters({ brand: event.target.value })}>
                {brands.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>{ui("ui.app.catalog.CatalogClient.bec69036aa27", "Sort")}<select value={sortMode} onChange={(event) => updateFilters({ sortMode: event.target.value as typeof sortMode })}>
                <option value="Newest">{ui("ui.app.catalog.CatalogClient.d15efa178cf6", "Newest")}</option>
                <option value="Oldest">{ui("ui.app.catalog.CatalogClient.505dc450753e", "Oldest")}</option>
                <option value="Title">{ui("ui.app.catalog.CatalogClient.7e8cd2056da7", "Title")}</option>
                <option value="Year">{ui("ui.app.catalog.CatalogClient.89f6832560de", "Year")}</option>
              </select>
            </label>
          </section>

          <div className={styles["catalog-refinements"]}>
          {hasAdvancedFilters ? (
            <details className={styles["catalog-more-filters"]}>
              <summary><SlidersHorizontal size={15} />{" "}{ui("ui.app.catalog.CatalogClient.546ebb8eb993", "Filters")}{activeFilters.length ? <span>{activeFilters.length}</span> : null}</summary>
              <div className={styles["catalog-filter-grid"]}>
                {availableFilters.availability ? <label>{ui("ui.app.catalog.CatalogClient.12f67f8539c4", "Availability")}<select value={availability} onChange={(event) => updateFilters({ availability: event.target.value })}><option value="All availability">{ui("ui.app.catalog.CatalogClient.2ac0f50706fa", "All availability")}</option><option value="For Sale">{ui("ui.app.catalog.CatalogClient.1a83dec1476e", "For Sale")}</option><option value="Not for Sale">{ui("ui.app.catalog.CatalogClient.e063cbea64ad", "Not for Sale")}</option></select></label> : null}
                {availableFilters.condition ? <label>{ui("ui.app.catalog.CatalogClient.39b36d38d6eb", "Condition")}<select value={condition} onChange={(event) => updateFilters({ condition: event.target.value })}><option value="All conditions">{ui("ui.app.catalog.CatalogClient.7c403b64e552", "All conditions")}</option><option value="New">{ui("ui.app.catalog.CatalogClient.18fdd549b2ed", "New")}</option><option value="Used">{ui("ui.app.catalog.CatalogClient.ae7d8dfac9ff", "Used")}</option></select></label> : null}
                {availableFilters.trust ? <label>{ui("ui.app.catalog.CatalogClient.ade9248e0132", "Trust")}<select value={trust} onChange={(event) => updateFilters({ trust: event.target.value })}><option value="All trust statuses">{ui("ui.app.catalog.CatalogClient.27667eed8c6f", "All trust statuses")}</option><option value="Verified">{ui("ui.app.catalog.CatalogClient.4f7838402f37", "Verified")}</option><option value="Unverified">{ui("ui.app.catalog.CatalogClient.33c8e8de41c3", "Unverified")}</option></select></label> : null}
                {availableFilters.authenticity ? <label>{ui("ui.app.catalog.CatalogClient.4f531ef9e6ae", "Authenticity")}<select value={authenticity} onChange={(event) => updateFilters({ authenticity: event.target.value })}><option value="All authenticity statuses">{ui("ui.app.catalog.CatalogClient.868c29e856d3", "All authenticity statuses")}</option><option value="Authenticity Confirmed">{ui("ui.app.catalog.CatalogClient.eb95c24a9590", "Authenticity Confirmed")}</option><option value="Authenticity Unconfirmed">{ui("ui.app.catalog.CatalogClient.a54f9b625886", "Authenticity Unconfirmed")}</option></select></label> : null}
                {availableFilters.originality ? <label>{ui("ui.app.catalog.CatalogClient.faafda16cc4c", "Originality")}<select value={originality} onChange={(event) => updateFilters({ originality: event.target.value })}><option value="All originality statuses">{ui("ui.app.catalog.CatalogClient.ad110c7da01e", "All originality statuses")}</option><option value="All Original">{ui("ui.app.catalog.CatalogClient.8894d64075bf", "All Original")}</option><option value="Modified">{ui("ui.app.catalog.CatalogClient.e8ce5dcaf408", "Modified")}</option></select></label> : null}
                {availableFilters.safety ? <label>{ui("ui.app.catalog.CatalogClient.726d11bd5b23", "Safety")}<select value={safety} onChange={(event) => updateFilters({ safety: event.target.value })}><option value="All safety statuses">{ui("ui.app.catalog.CatalogClient.47303c7f8431", "All safety statuses")}</option><option value="Safety Alert">{ui("ui.app.catalog.CatalogClient.ebcc11e6a438", "Safety Alert")}</option></select></label> : null}
                {availableFilters.service ? <label>{ui("ui.app.catalog.CatalogClient.8b0adc9c9815", "Service History")}<select value={service} onChange={(event) => updateFilters({ service: event.target.value })}><option value="All service histories">{ui("ui.app.catalog.CatalogClient.30a6538fc556", "All service histories")}</option><option value="Has Service History">{ui("ui.app.catalog.CatalogClient.021890177ff6", "Has Service History")}</option></select></label> : null}
              </div>
            </details>
          ) : null}

          <section className={styles["catalog-summary"]} aria-label={ui("ui.app.catalog.CatalogClient.435a56a2ed07", "Catalog discovery highlights")}>
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
          </div>

          {activeFilters.length ? (
            <div className={styles["catalog-active-filters"]} aria-label={ui("ui.app.catalog.CatalogClient.213a9822c38a", "Active filters")}>
              {activeFilters.map((key) => <button key={key} type="button" onClick={() => updateFilters({ [key]: defaultCatalogFilters[key] })} aria-label={ui("ui.app.catalog.CatalogClient.b6b852bd01cc", "Remove {{value1}} filter: {{value2}}", { value1: filterLabels[key], value2: filters[key] })}><span>{filterLabels[key]}: {filters[key]}</span><X size={12} aria-hidden="true" /></button>)}
            </div>
          ) : null}

          {serialLookupMessage ? (
            <div className={styles["catalog-lookup-result"]} role="status">
              <span>{serialLookupMessage}</span>
              {showOwnershipClaim ? <Link className="button secondary" href="/ownership-claim">{ui("ui.app.catalog.CatalogClient.ac3e01b95dc6", "Start ownership claim")}</Link> : null}
            </div>
          ) : null}



          {recordsError ? <div className={styles["catalog-lookup-result"]} role="alert">
            <span>{ui("ui.app.catalog.CatalogClient.loadUnavailable", "The catalog could not be refreshed. Try again.")}</span>
            <button className="button secondary" type="button" disabled={recordsLoading} onClick={() => void loadRecords()}>{ui("ui.app.catalog.CatalogClient.retryLoad", "Retry")}</button>
          </div> : null}
          <section className={styles["catalog-grid"]} aria-label={ui("ui.app.catalog.CatalogClient.8ecdd04d045f", "QRguitar Profiles")}>
            {!hasLoadedRecords && recordsError ? null : !hasLoadedRecords ? (
              <div className={styles["catalog-empty"]}>
                <div className={styles["eyebrow"]}>{ui("ui.app.catalog.CatalogClient.92e7dcc9f7b7", "Loading QRguitar Profiles")}</div>
                <h2>{ui("ui.app.catalog.CatalogClient.46d89b1c639e", "Opening the catalog.")}</h2>
                <p>{ui("ui.app.catalog.CatalogClient.9235ded50850", "Fetching the latest QRguitar Profiles now.")}</p>
              </div>
            ) : visibleRecords.length ? (
              visibleRecords.map((record, index) => (
                <CollectibleRecordCard
                  record={record}
                  variant="catalog"
                  key={record.qrCode}
                  content={content}
                  compactMobilePhotos
                  returnTo={catalogFilterUrl("/catalog", exactMatchCode ? "exactSerial=1" : "", filters)}
                  deferAdjacentPhotos
                  prioritizeLeadImage={index === 0}
                />
              ))
            ) : (
              <div className={styles["catalog-empty"]}>
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

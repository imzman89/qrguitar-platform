"use client";

import { ownerProfileHref } from "../../../lib/owner-profile";

import { loadHandoutInstrument } from "../../../lib/handout-load";

import Link from "next/link";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, Maximize, Printer, QrCode, RotateCcw, ShieldCheck, Siren, SlidersHorizontal, X, ZoomIn, ZoomOut } from "lucide-react";
import QRCode from "qrcode";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  instrumentDisplayName,
  type DemoInstrument,
  type ServiceHistoryEntry
} from "../../../lib/local-demo";
import { formatRecordLocation } from "../../../lib/record-location";
import { getSupabaseAccessToken } from "../../../lib/supabase-browser";
import { resolveInstrumentPresentation } from "../../../lib/instrument-profile-contract";
import { getContentValue } from "../../../lib/content-registry";
import { useSiteContent } from "../../../lib/use-site-content";
import styles from "./print-suite.module.css";
import { PrintDocument } from "./PrintDocument";
import { publicProfileUrl } from "../../../lib/profile-url";
import { normalizePrintOptions, printDetailFacts, printFormats as formatConfig, printGeometry, printReadiness, type PrintMode, type PrintSize, type PrintOrientation } from "../../../lib/print-layout";

type PrintScope = "public" | "owner";

const modeOrder: PrintMode[] = ["label", "hangtag", "handout", "service"];

const modeDescriptions: Record<PrintMode, string> = {
  label: "A small QR label for a case, hang tag, or instrument paperwork.",
  hangtag: "A photo, identity, and QR card for a counter, case, or retail display.",
  handout: "A complete one-page customer handout with photo, facts, status, and QR.",
  service: "A printable summary of one approved service-history entry."
};

const printSizeLabels: Record<PrintSize, string> = {
  letter: "US Letter",
  a4: "A4",
  "4x6": "4 x 6",
  compact: "3.5 x 2.25 label"
};

function formatServiceDate(entry: ServiceHistoryEntry) {
  if (!entry.serviceDate) return "Date not recorded";
  const date = new Date(`${entry.serviceDate}T12:00:00`);
  return Number.isNaN(date.getTime()) ? entry.serviceDate : date.toLocaleDateString("en-US", { month: "long", day: entry.datePrecision === "day" ? "numeric" : undefined, year: "numeric" });
}

function serviceProvenance(entry: ServiceHistoryEntry) {
  if (entry.sourceKind === "provider_submitted_owner_approved") {
    const labels = ["Provider-submitted", "Owner-approved"];
    if (entry.providerVerifiedAt) labels.push("Verified Service Provider");
    if (entry.evidenceReviewedAt) labels.push("QRguitar-reviewed service evidence");
    return labels.join(" - ");
  }
  return "Owner-reported service";
}
function humanizeStatus(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "for_sale") return "For Sale";
  if (normalized === "not_for_sale") return "Not for Sale";
  if (normalized === "all_original") return "All Original";
  if (normalized === "modified") return "Modified";
  if (normalized === "new") return "New";
  if (normalized === "used") return "Used";
  if (!normalized || normalized === "unknown" || normalized === "not_listed") return "";
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Badge({ children, tone = "neutral", icon }: { children: ReactNode; tone?: "verified" | "auth" | "safety" | "neutral"; icon?: ReactNode }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

export default function HandoutPage() {
  const params = useParams<{ code: string }>();
  const content = useSiteContent();
  const code = String(params.code || "").trim().toUpperCase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = modeOrder.includes(searchParams.get("format") as PrintMode)
    ? searchParams.get("format") as PrintMode
    : "handout";
  const requested = normalizePrintOptions(requestedMode, searchParams.get("size"), searchParams.get("orientation"));
  const [instrument, setInstrument] = useState<DemoInstrument | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [mode, setMode] = useState<PrintMode>(requestedMode);
  const [ownerAuthorized, setOwnerAuthorized] = useState(false);
  const [printScope, setPrintScope] = useState<PrintScope>("public");
  const [printSize, setPrintSize] = useState<PrintSize>(requested.size);
  const [orientation, setOrientation] = useState<PrintOrientation>(requested.orientation);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [zoom, setZoom] = useState(100);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [includePhoto, setIncludePhoto] = useState(true);
  const [includeSerial, setIncludeSerial] = useState(true);
  const [includeAvailability, setIncludeAvailability] = useState(true);
  const [includeLogo, setIncludeLogo] = useState(true);
  const [includeAttribution, setIncludeAttribution] = useState(true);
  const [includeSpecifications, setIncludeSpecifications] = useState(true);
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [includeUrlLabel, setIncludeUrlLabel] = useState(true);
  const [includeScanInstruction, setIncludeScanInstruction] = useState(true);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState("");
  const [photoFit, setPhotoFit] = useState<"contain" | "cover">("contain");
  const [printNote, setPrintNote] = useState("");
  const [printTitle, setPrintTitle] = useState<string | null>(null);
  const [includeServiceDetails, setIncludeServiceDetails] = useState(true);
  const [qrError, setQrError] = useState("");
  const [printState, setPrintState] = useState("Preparing the selected page.");
  const [printing, setPrinting] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(700);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const canonicalCode = instrument?.qrCode || code;
  const profileUrl = publicProfileUrl(canonicalCode);

  useEffect(() => {
    setPrintNote("");
    setPrintTitle(null);
    setSelectedPhoto("");
  }, [code]);

  useEffect(() => {
    if (!mobileControlsOpen) return;
    const sheet = document.getElementById("print-suite-controls");
    const media = window.matchMedia("(max-width: 1000px)");
    if (!sheet || !media.matches) { setMobileControlsOpen(false); return; }
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const controls = () => Array.from(sheet.querySelectorAll<HTMLElement>("button:not(:disabled), select, input, textarea, [tabindex='0']")).filter((element) => element.getClientRects().length > 0);
    controls()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setMobileControlsOpen(false); }
      if (event.key !== "Tab") return;
      const items = controls(), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    const onResize = () => { if (!media.matches) setMobileControlsOpen(false); };
    document.addEventListener("keydown", onKey);
    media.addEventListener("change", onResize);
    return () => { document.documentElement.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); media.removeEventListener("change", onResize); previousFocus?.focus(); };
  }, [mobileControlsOpen]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setMessage("");
    setInstrument(null);
    setOwnerAuthorized(false);
    setPrintScope("public");
    setSelectedServiceId("");

    async function loadHandoutProfile() {
      try {
        const result = await loadHandoutInstrument({ code, readToken: getSupabaseAccessToken, signal: controller.signal });
        if (cancelled) return;
        setInstrument(result.instrument);
        setOwnerAuthorized(result.ownerAuthorized);
        if (result.instrument.qrCode && result.instrument.qrCode !== code) {
          const query = searchParams.toString();
          router.replace(`/handout/${encodeURIComponent(result.instrument.qrCode)}${query ? `?${query}` : ""}`);
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "This Profile could not be loaded. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadHandoutProfile();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [code, router, searchParams, loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl("");
    setQrError("");
    QRCode.toDataURL(profileUrl, {
      errorCorrectionLevel: "H",
      margin: 4,
      width: 720,
      color: {
        dark: "#071014",
        light: "#ffffff"
      }
    }).then((url) => {
      if (!cancelled) {
        setQrDataUrl(url);
      }
    }).catch(() => { if (!cancelled) setQrError("The QR code could not be prepared. Reload the page and try again."); });

    return () => {
      cancelled = true;
    };
  }, [profileUrl]);

  const title = instrument ? instrumentDisplayName(instrument) : code;
  const printedTitle = printTitle?.trim() || title;
  const galleryImages = useMemo(
    () => instrument ? Array.from(new Set([instrument.heroImageDataUrl, ...(instrument.galleryImageDataUrls || [])].filter(Boolean) as string[])) : [],
    [instrument]
  );
  const photoUrl = galleryImages.includes(selectedPhoto) ? selectedPhoto : galleryImages[0] || "";
  const location = instrument ? formatRecordLocation(instrument) : "";
  const verification = instrument ? getInstrumentVerificationStatus(instrument) : "unverified";
  const authenticity = instrument?.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed";
  const condition = instrument ? humanizeStatus(getInstrumentCondition(instrument)) : "";
  const saleStatus = humanizeStatus(instrument?.saleStatus);
  const originalityStatus = humanizeStatus(instrument?.originalityStatus);
  const safety = instrument?.safetyStatus === "lost" || instrument?.safetyStatus === "stolen" || instrument?.safetyStatus === "recovered" ? instrument.safetyStatus : "";
  const presentation = useMemo(
    () => instrument ? resolveInstrumentPresentation(instrument, printScope === "owner" && ownerAuthorized ? "owner" : "public") : null,
    [instrument, ownerAuthorized, printScope]
  );
  const serialDisplay = includeSerial ? presentation?.serialNumber || "" : "";
  const printableServiceEntries = useMemo(
    () => presentation?.serviceEntries.filter((entry) => !entry.isSystem) || [],
    [presentation]
  );
  const selectedService = printableServiceEntries.find((entry) => entry.id === selectedServiceId) || printableServiceEntries[0] || null;
  const timelineEntries = presentation?.meaningfulTimelineEvents || [];
  const printableSpecs = instrument ? [
    ["Type", instrument.instrumentType],
    ["Finish", instrument.finish],
    ["Body", instrument.bodyWood],
    ["Neck", instrument.neckWood],
    ["Pickups", instrument.pickups],
    ...(instrument.customFields || []).map((field) => [field.label, field.value])
  ].filter((entry): entry is string[] => Boolean(entry[0] && entry[1])).slice(0, 8) : [];
  const primaryFacts = instrument ? [instrument.brand, instrument.year, location].filter(Boolean) : [];
  const detailFacts = printDetailFacts(condition, originalityStatus, saleStatus, includeAvailability);
  const isPrivate = instrument?.visibility === "private";
  const activeFormat = formatConfig[mode];
  const availableModes = modeOrder.filter((candidate) => candidate !== "service" || printableServiceEntries.length > 0);
  const geometry = printGeometry(printSize, orientation);
  const resolvedPageDimensions = `${geometry.width}in ${geometry.height}in`;
  const previewScale = Math.min(1, Math.max(0.1, (viewportWidth - 32) / (geometry.width * 96))) * zoom / 100;
  const optionKey = JSON.stringify([mode, printSize, orientation, theme, photoUrl, photoFit, printScope, serialDisplay, includePhoto, includeLogo, includeAvailability, includeAttribution, includeSpecifications, includeTimeline, includeUrlLabel, includeScanInstruction, selectedServiceId, includeServiceDetails, printNote, printedTitle]);
  const readyToPrint = !loading && Boolean(instrument && qrDataUrl) && !qrError && printState === "Ready to print.";

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => setViewportWidth(viewport.clientWidth));
    observer.observe(viewport);
    setViewportWidth(viewport.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = canvasRef.current?.querySelector<HTMLElement>("[data-print-document]");
    setPrintState("Preparing the selected page.");
    if (!root || !instrument || !qrDataUrl) return;
    let active = true;
    let timedOut = false;
    const images = Array.from(root.querySelectorAll("img"));
    function check() {
      if (!active || !root) return;
      setPrintState(printReadiness(images, root.scrollHeight > root.clientHeight + 2 || root.scrollWidth > root.clientWidth + 2, timedOut));
    }
    images.forEach((image) => { image.addEventListener("load", check); image.addEventListener("error", check); });
    const observer = new ResizeObserver(check);
    observer.observe(root);
    if (root.firstElementChild) observer.observe(root.firstElementChild);
    void document.fonts.ready.then(check);
    check();
    const timeout = window.setTimeout(() => { timedOut = true; check(); }, 15000);
    return () => { active = false; window.clearTimeout(timeout); observer.disconnect(); images.forEach((image) => { image.removeEventListener("load", check); image.removeEventListener("error", check); }); };
  }, [instrument, qrDataUrl, optionKey]);

  function printSelectedPage() {
    if (!readyToPrint || printing) return;
    const root = canvasRef.current?.querySelector<HTMLElement>("[data-print-document]");
    if (!root) return;
    const currentReadiness = printReadiness(Array.from(root.querySelectorAll("img")), root.scrollHeight > root.clientHeight + 2 || root.scrollWidth > root.clientWidth + 2);
    if (currentReadiness !== "Ready to print.") { setPrintState(currentReadiness); return; }
    setPrinting(true);
    try { window.print(); }
    catch { setPrintState("The print dialog could not open. Please try again."); }
    finally { setPrinting(false); }
  }

  useEffect(() => {
    if (!selectedServiceId && printableServiceEntries[0]) setSelectedServiceId(printableServiceEntries[0].id);
    if (selectedServiceId && !printableServiceEntries.some((entry) => entry.id === selectedServiceId)) setSelectedServiceId(printableServiceEntries[0]?.id || "");
    if (!loading && mode === "service" && !printableServiceEntries.length) setMode("handout");
  }, [loading, mode, printableServiceEntries, selectedServiceId]);

  useEffect(() => {
    const config = formatConfig[mode];
    if (!config.sizes.includes(printSize)) setPrintSize(config.defaultSize);
    if (!config.orientations.includes(orientation)) setOrientation(config.orientations[0]);
    if (!config.photo) setIncludePhoto(false);
    if (!config.availability) setIncludeAvailability(false);
    if (!config.attribution) setIncludeAttribution(false);
  }, [mode, orientation, printSize]);

  function selectPrintMode(nextMode: PrintMode) {
    const config = formatConfig[nextMode];
    setMode(nextMode);
    setPrintSize(config.defaultSize);
    setOrientation(config.orientations[0]);
    setIncludePhoto(config.photo);
    setIncludeAvailability(config.availability);
    setIncludeAttribution(config.attribution);
    setIncludeSpecifications(config.specifications);
    setIncludeTimeline(config.timeline);
  }

  function resetPrintOptions() {
    setPrintScope("public");
    const config = formatConfig[mode];
    setPrintSize(config.defaultSize);
    setOrientation(config.orientations[0]);
    setTheme("light");
    setSelectedPhoto("");
    setPhotoFit("contain");
    setPrintNote("");
    setPrintTitle(null);
    setIncludeServiceDetails(true);
    setIncludePhoto(config.photo);
    setIncludeSerial(true);
    setIncludeAvailability(config.availability);
    setIncludeLogo(true);
    setIncludeAttribution(config.attribution);
    setIncludeSpecifications(config.specifications);
    setIncludeTimeline(config.timeline);
    setIncludeUrlLabel(true);
    setIncludeScanInstruction(true);
    setZoom(100);
  }

  function printModeLabel(value: PrintMode) {
    if (value === "label") return getContentValue(content, "printWorkspace.label");
    if (value === "hangtag") return getContentValue(content, "printWorkspace.hangtag");
    if (value === "handout") return getContentValue(content, "printWorkspace.handout");
    return getContentValue(content, "printWorkspace.service");
  }

  function renderBadges() {
    if (!instrument) return null;
    return (
      <div className={styles.badges}>
        {instrument.showVerificationBadge !== false ? (
          <Badge tone={verification === "verified" ? "verified" : "neutral"} icon={<ShieldCheck size={12} />}>
            {verification === "verified" ? "Verified by QRguitar" : "Unverified"}
          </Badge>
        ) : null}
        {instrument.showAuthenticityBadge !== false ? (
          <Badge tone={authenticity === "confirmed" ? "auth" : "neutral"} icon={<ShieldCheck size={12} />}>
            {authenticity === "confirmed" ? "Authenticity Confirmed" : "Authenticity Unconfirmed"}
          </Badge>
        ) : null}
        {safety ? (
          <Badge tone="safety" icon={<Siren size={12} />}>
            {safety === "lost" ? "Reported Lost" : safety === "stolen" ? "Reported Stolen" : "Recovered"}
          </Badge>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <style>{`@media print { @page { size: ${resolvedPageDimensions}; margin: ${geometry.margin}in; } }`}</style>
      <div className={`no-print ${styles.screenChrome}`}><Nav /></div>
      <main className={`section handout-page ${styles.root}`} data-print-page-size={printSize}>
        <div className="shell handout-shell" data-print-ready={readyToPrint} data-print-mode={mode} data-print-size={printSize} data-print-orientation={orientation} data-print-theme={theme}>
          <div className="print-kit-toolbar no-print">
            <div>
              <Link className="print-kit-back-link" href="/dashboard">
                <ArrowLeft size={15} />
                Dashboard
              </Link>
              <div className="eyebrow">QR and print</div>
              <h1>{getContentValue(content, "printWorkspace.title")}</h1>
              <p>{getContentValue(content, "printWorkspace.body")}</p>
            </div>
            <div className="print-kit-toolbar-actions">
              <Link className="button secondary" href={instrument ? ownerProfileHref(instrument) : "/dashboard"} target="_blank">
                <ExternalLink size={16} />
                Open Profile
              </Link>
              <button className="button" type="button" onClick={printSelectedPage} disabled={!readyToPrint || printing}>
                <Printer size={16} />
                {printing ? "Opening print..." : "Print " + printModeLabel(mode)}
              </button>
            </div>
          </div>

          <button
            className={`${styles.mobileControlsButton} no-print`}
            type="button"
            aria-expanded={mobileControlsOpen}
            aria-controls="print-suite-controls"
            onClick={() => setMobileControlsOpen((current) => !current)}
          >
            <SlidersHorizontal size={16} />
            {mobileControlsOpen ? "Close print options" : "Print options"}
          </button>

          {mobileControlsOpen ? <button type="button" className={`${styles.mobileControlsBackdrop} no-print`} aria-label="Close print options" onClick={() => setMobileControlsOpen(false)} /> : null}

          <div className={styles.workspace} data-print-frame>
            {instrument ? (
              <aside className={`${styles.controlRail} ${mobileControlsOpen ? styles.controlRailOpen : ""} no-print`} id="print-suite-controls" aria-label="Print Suite controls" role={mobileControlsOpen ? "dialog" : undefined} aria-modal={mobileControlsOpen || undefined}>
                <div className={styles.mobileControlsHeader}>
                  <strong>Print options</strong>
                  <button type="button" aria-label="Close print options" onClick={() => setMobileControlsOpen(false)}><X size={17} /></button>
                </div>
                <div className={styles.controlSection}>
                  <span className={styles.controlLabel}>Format</span>
                  <div className={styles.formatList} role="group" aria-label="Print format">
                    {availableModes.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={mode === key ? styles.selectedFormat : ""}
                        aria-pressed={mode === key}
                        onClick={() => selectPrintMode(key)}
                      >
                        <strong>{printModeLabel(key)}</strong>
                        <span>{modeDescriptions[key]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.controlGrid}>
                  <label>Paper<select value={printSize} onChange={(event) => setPrintSize(event.target.value as PrintSize)}>{activeFormat.sizes.map((size) => <option value={size} key={size}>{printSizeLabels[size]}</option>)}</select></label>
                  {activeFormat.orientations.length > 1 ? <label>Orientation<select value={orientation} onChange={(event) => setOrientation(event.target.value as PrintOrientation)}>{activeFormat.orientations.map((value) => <option value={value} key={value}>{value === "portrait" ? "Portrait" : "Landscape"}</option>)}</select></label> : null}
                  <label>Appearance<select value={theme} onChange={(event) => setTheme(event.target.value as "light" | "dark")}><option value="light">White paper (low ink)</option><option value="dark">Dark background</option></select></label>
                </div>

                {ownerAuthorized ? (
                  <fieldset className={styles.controlSection}>
                    <legend className={styles.controlLabel}>Copy type</legend>
                    <label className={styles.choice}><input type="radio" name="print-scope" checked={printScope === "public"} onChange={() => setPrintScope("public")} /><span><strong>Public-safe copy</strong><small>Includes only information allowed on the public Profile.</small></span></label>
                    <label className={styles.choice}><input type="radio" name="print-scope" checked={printScope === "owner"} onChange={() => setPrintScope("owner")} /><span><strong>Owner copy</strong><small>May include a hidden Serial Number. Do not share this copy if it contains private information.</small></span></label>
                  </fieldset>
                ) : null}

                {mode === "service" ? <label className={styles.controlSection}><span className={styles.controlLabel}>Service Entry</span><select value={selectedService?.id || ""} onChange={(event) => setSelectedServiceId(event.target.value)}>{printableServiceEntries.map((entry) => <option value={entry.id} key={entry.id}>{formatServiceDate(entry)} - {entry.title}</option>)}</select></label> : null}

                <fieldset className={styles.controlSection}>
                  <legend className={styles.controlLabel}>Fields</legend>
                  <div className={styles.toggleGrid}>
                    <label><input type="checkbox" checked={includeLogo} onChange={(event) => setIncludeLogo(event.target.checked)} /> Logo</label>
                    {activeFormat.photo && photoUrl ? <label><input type="checkbox" checked={includePhoto} onChange={(event) => setIncludePhoto(event.target.checked)} /> Photograph</label> : null}
                    {presentation?.serialNumber ? <label><input type="checkbox" checked={includeSerial} onChange={(event) => setIncludeSerial(event.target.checked)} /> Serial Number</label> : null}
                    {activeFormat.availability && saleStatus ? <label><input type="checkbox" checked={includeAvailability} onChange={(event) => setIncludeAvailability(event.target.checked)} /> Availability</label> : null}
                    {activeFormat.attribution && instrument.publicCollection?.publicName ? <label><input type="checkbox" checked={includeAttribution} onChange={(event) => setIncludeAttribution(event.target.checked)} /> Attribution</label> : null}
                    {activeFormat.specifications && printableSpecs.length ? <label><input type="checkbox" checked={includeSpecifications} onChange={(event) => setIncludeSpecifications(event.target.checked)} /> Specifications</label> : null}
                    {activeFormat.timeline && timelineEntries.length ? <label><input type="checkbox" checked={includeTimeline} onChange={(event) => setIncludeTimeline(event.target.checked)} /> Timeline summary</label> : null}
                  </div>
                </fieldset>

                {activeFormat.photo && includePhoto && galleryImages.length ? <div className={styles.controlGrid}>
                  {galleryImages.length > 1 ? <label>Photograph<select value={photoUrl} onChange={(event) => setSelectedPhoto(event.target.value)}>{galleryImages.map((url, index) => <option value={url} key={url}>{index === 0 ? "Main photograph" : `Photograph ${index + 1}`}</option>)}</select></label> : null}
                  <label>Photo framing<select value={photoFit} onChange={(event) => setPhotoFit(event.target.value as "contain" | "cover")}><option value="contain">Show whole instrument</option><option value="cover">Fill photo area</option></select></label>
                </div> : null}
                {mode === "service" ? <label className={styles.choice}><input type="checkbox" checked={includeServiceDetails} onChange={(event) => setIncludeServiceDetails(event.target.checked)} /> Full service details</label> : null}
                <label className={styles.controlSection}><span className={styles.controlLabel}>Title on this printout</span><input type="text" maxLength={120} value={printTitle ?? title} onChange={(event) => setPrintTitle(event.target.value)} /></label>
                {mode !== "label" ? <label className={styles.controlSection}><span className={styles.controlLabel}>Note on this printout</span><textarea rows={3} maxLength={240} value={printNote} placeholder="Care advice, collection details or a message for the recipient" onChange={(event) => setPrintNote(event.target.value)} /><small>{printNote.length}/240</small></label> : null}

                <fieldset className={styles.controlSection}>
                  <legend className={styles.controlLabel}>QR</legend>
                  <div className={styles.toggleGrid}>
                    <label><input type="checkbox" checked={includeUrlLabel} onChange={(event) => setIncludeUrlLabel(event.target.checked)} /> URL label</label>
                    <label><input type="checkbox" checked={includeScanInstruction} onChange={(event) => setIncludeScanInstruction(event.target.checked)} /> Scan instruction</label>
                  </div>
                </fieldset>

                <div className={styles.controlActions}>
                  <button type="button" className={styles.resetButton} onClick={resetPrintOptions}><RotateCcw size={14} /> {getContentValue(content, "printWorkspace.reset")}</button>
                  <button type="button" className={styles.doneButton} onClick={() => setMobileControlsOpen(false)}>Done</button>
                </div>
              </aside>
            ) : null}

            <section className={styles.previewStage} data-print-frame aria-label="Print preview stage">
              <div className={`${styles.previewToolbar} no-print`}>
                <div><strong>{printModeLabel(mode)}</strong><span>{printSizeLabels[printSize]} / {orientation}{readyToPrint ? " / 1 page" : ""}</span></div>
                <div className={styles.zoomControls} aria-label="Preview zoom">
                  <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 75} onClick={() => setZoom((current) => Math.max(75, current - 25))}><ZoomOut size={17} /></button>
                  <button type="button" aria-label="Fit page" title="Fit page" onClick={() => setZoom(100)}><Maximize size={17} /></button>
                  <output aria-live="polite" aria-label="Preview scale">{Math.round(previewScale * 100)}%</output>
                  <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 300} onClick={() => setZoom((current) => Math.min(300, current + 25))}><ZoomIn size={17} /></button>
                </div>
              </div>

              <div className={`${styles.validation} no-print`} role="status">
                {readyToPrint ? <CheckCircle2 size={16} /> : <FileText size={16} />}
                <span>{qrError || (loading ? "Loading the selected Profile." : !instrument ? message : printState)}</span>
              </div>

              {isPrivate ? <p className={`${styles.scopeNotice} no-print`}>This Profile is private. The printed QR will not open for customers until you change its visibility.</p> : null}
              {printScope === "owner" ? <p className={`${styles.scopeNotice} no-print`}>Owner copy: may contain information hidden from the public Profile.</p> : null}
              <div className={styles.canvasViewport} data-print-frame ref={viewportRef}>
                <div className={styles.paperSpace} data-print-frame style={{ width: geometry.width * 96 * previewScale, height: geometry.height * 96 * previewScale }}>
                <div className={styles.pageCanvas} data-print-frame ref={canvasRef} style={{ "--paper-width": `${geometry.width}in`, "--paper-height": `${geometry.height}in`, "--paper-margin": `${geometry.margin}in`, "--print-content-width": `${geometry.contentWidth}in`, "--print-content-height": `${geometry.contentHeight}in`, "--preview-scale": previewScale } as CSSProperties}>

                  {loading ? <section className="handout-status no-print"><QrCode /><h2>Preparing Print Suite...</h2></section> : !instrument ? <section className="handout-status no-print"><FileText /><h2>Print Suite unavailable.</h2><p>{message}</p><button type="button" className="button button-primary no-print" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</button></section> : (
                    <PrintDocument
                      mode={mode} size={printSize} orientation={orientation} theme={theme}
                      title={printedTitle} code={canonicalCode} serial={serialDisplay}
                      facts={primaryFacts}
                      details={[
                        ...(detailFacts.length ? [["Details", detailFacts.join(" / ")] as [string, string]] : []),
                        ...(includeAttribution && instrument.publicCollection?.publicName ? [["Collection", instrument.publicCollection.publicName] as [string, string]] : [])
                      ]}
                      specifications={activeFormat.specifications && includeSpecifications ? printableSpecs.map(([label, value]) => [label, value]) : []}
                      timeline={activeFormat.timeline && includeTimeline ? timelineEntries.slice(0, 2).map((entry) => `${formatServiceDate(entry)} - ${entry.title}`) : []}
                      badges={renderBadges()} photo={activeFormat.photo && includePhoto ? photoUrl : ""} photoFit={photoFit}
                      qrDataUrl={qrDataUrl} profileUrl={profileUrl}
                      includeLogo={includeLogo} includeUrl={includeUrlLabel} includeInstruction={includeScanInstruction} note={printNote}
                      service={selectedService ? {
                        title: selectedService.title, date: formatServiceDate(selectedService),
                        category: selectedService.category || selectedService.eventType || "Service",
                        description: includeServiceDetails ? selectedService.publicDescription || "" : "",
                        details: includeServiceDetails ? [
                          ["Provider / shop", selectedService.providerDisplayName || selectedService.shopName || ""],
                          ["Work order", selectedService.workOrderReference || ""],
                          ["Parts installed", selectedService.partsInstalled || ""],
                          ["Setup measurements", selectedService.setupMeasurements || ""]
                        ].filter((entry): entry is [string, string] => Boolean(entry[1])) : [],
                        provenance: serviceProvenance(selectedService)
                      } : null}
                    />
                  )}
                  <p className={styles.printUnavailable}>Print unavailable. Return to QRguitar and resolve the print readiness message before printing.</p>
                </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      <div className={`no-print ${styles.screenChrome}`}><Footer /></div>
    </>
  );
}

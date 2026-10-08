"use client";
import { useUiText } from "../../../components/UiTextProvider";


import { ownerProfileHref } from "../../../lib/owner-profile";

import { loadHandoutInstrument } from "../../../lib/handout-load";

import Link from "next/link";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, Maximize, Printer, QrCode, RotateCcw, ShieldCheck, Siren, SlidersHorizontal, X, ZoomIn, ZoomOut } from "lucide-react";
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
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import { resolveInstrumentPresentation, sanitizePublicInstrument } from "../../../lib/instrument-profile-contract";
import { getContentValue } from "../../../lib/content-registry";
import { useSiteContent } from "../../../lib/use-site-content";
import styles from "./print-suite.module.css";
import { PrintDocument } from "./PrintDocument";
import { publicProfileUrl } from "../../../lib/profile-url";
import { normalizePrintOptions, printFormats as formatConfig, printGeometry, printReadiness, printSpecifications, printPlacement, qrSideMillimeters, type PrintMode, type PrintSize, type PrintOrientation } from "../../../lib/print-layout";
import { beginQrRender } from "../../../lib/qr-output";
import { printQrSvg, printQrPng, qrPrintMetrics, svgDataUrl } from "../../../lib/qr-print-output";

type PrintScope = "public" | "owner";

const modeOrder: PrintMode[] = ["handout", "hangtag", "label", "qr", "service"];


const printSizeLabels: Record<PrintSize, string> = {
  letter: "US Letter · 8.5 × 11 in",
  a4: "A4 · 210 × 297 mm",
  "4x6": "4 × 6 in",
  compact: "3.5 × 2.25 in",
  qr25: "25 × 25 mm (0.98 in)",
  qr32: "32 × 32 mm (1.26 in)",
  qr38: "38 × 38 mm (1.496 in)",
  qr381: "1.5 × 1.5 in · 38.1 mm"
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
  const ui = useUiText("app.handout.code.page");
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
  const [loadedCode, setLoadedCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [qrRendered, setQrRendered] = useState({ key: "", url: "", error: "" });
  const [pngRendered, setPngRendered] = useState({ key: "", url: "", error: "" });
  const [qrRetry, setQrRetry] = useState(0);
  const [mode, setMode] = useState<PrintMode>(requestedMode);
  const [ownerAuthorized, setOwnerAuthorized] = useState(false);
  const [printScope, setPrintScope] = useState<PrintScope>("public");
  const [printSize, setPrintSize] = useState<PrintSize>(requested.size);
  const [orientation, setOrientation] = useState<PrintOrientation>(requested.orientation);
  const theme = "light" as const;
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
  const [printState, setPrintState] = useState("Preparing the selected page.");
  const [printing, setPrinting] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(700);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const loadRevision = useRef(0);
  const renderedRevision = useRef(-1);
  const profileReturnHref = useMemo(() => {
    if (!instrument) return "/dashboard";
    const returnTo = searchParams.get("returnTo");
    const href = ownerProfileHref(instrument, returnTo === "/dashboard" ? "/dashboard" : undefined);
    if (!returnTo || returnTo.length > 2048) return href;
    const url = new URL(href, "https://qrguitar.invalid");
    url.searchParams.set("returnTo", returnTo);
    return url.pathname + url.search + url.hash;
  }, [instrument, searchParams]);
  const canonicalCode = instrument?.qrCode || code;
  const profileUrl = publicProfileUrl(canonicalCode);
  const qrSideMm = qrSideMillimeters(printSize);
  const qrRenderKey = JSON.stringify([canonicalCode, qrSideMm, qrRetry]);
  const qrDataUrl = qrRendered.key === qrRenderKey ? qrRendered.url : "";
  const qrError = qrRendered.key === qrRenderKey ? qrRendered.error : "";
  const pngDataUrl = pngRendered.key === qrRenderKey ? pngRendered.url : "";
  const pngError = pngRendered.key === qrRenderKey ? pngRendered.error : "";

  useEffect(() => {
    setPrintNote("");
    setPrintTitle(null);
    setSelectedPhoto("");
  }, [code]);

  useEffect(() => {
    if (!mobileControlsOpen) return;
    const sheet = document.getElementById("print-suite-controls");
    if (!sheet) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const controls = () => Array.from(sheet.querySelectorAll<HTMLElement>("button:not(:disabled), select, input, textarea, summary, [tabindex='0']")).filter((element) => element.getClientRects().length > 0);
    controls()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setMobileControlsOpen(false); }
      if (event.key !== "Tab") return;
      const items = controls(), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.documentElement.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, [mobileControlsOpen]);

  useEffect(() => {
    let cancelled = false;
    let authResolved = false;
    let currentActor: string | undefined;
    let sessionRevision = 0;
    let restoring = false;
    let controller: AbortController | undefined;
    const requestRevision = loadRevision;
    const visibleRevision = renderedRevision;

    function invalidatePrivateState() {
      requestRevision.current++;
      visibleRevision.current = -1;
      controller?.abort();
      setLoading(true);
      setMessage("");
      setInstrument(null);
      setLoadedCode("");
      setOwnerAuthorized(false);
      setPrintScope("public");
      setSelectedServiceId("");
      setSelectedPhoto("");
      setPrintTitle(null);
      setPrintNote("");
      setPrinting(false);
      setPrintState("Preparing the selected page.");
      setMobileControlsOpen(false);
    }
    invalidatePrivateState();

    async function loadHandoutProfile(token: string) {
      const revision = requestRevision.current;
      const requestController = new AbortController();
      controller = requestController;
      const isCurrent = () => !cancelled && requestRevision.current === revision && !requestController.signal.aborted;
      try {
        const result = await loadHandoutInstrument({ code, readToken: async () => token, signal: requestController.signal });
        if (!isCurrent()) return;
        visibleRevision.current = revision;
        setInstrument(result.instrument);
        setLoadedCode(code);
        setOwnerAuthorized(result.ownerAuthorized);
        if (result.instrument.qrCode && result.instrument.qrCode !== code) {
          const query = searchParams.toString();
          router.replace(`/handout/${encodeURIComponent(result.instrument.qrCode)}${query ? `?${query}` : ""}`);
        }
      } catch (error) {
        if (isCurrent()) setMessage(error instanceof Error ? error.message : ui("ui.app.handout.code.page.5cf97593870f", "This Profile could not be loaded. Please try again."));
      } finally {
        if (isCurrent()) setLoading(false);
      }
    }

    function applySession(session: { user?: { id?: string }; access_token?: string } | null, force = false) {
      if (cancelled) return;
      sessionRevision++;
      authResolved = true;
      window.clearTimeout(authTimeout);
      const nextActor = session?.user?.id || "";
      const recheckOwnership = force || restoring;
      restoring = false;
      if (currentActor === nextActor && !recheckOwnership) return;
      currentActor = nextActor;
      invalidatePrivateState();
      void loadHandoutProfile(nextActor ? session?.access_token || "" : "");
    }

    // A failed or unavailable session check must still permit anonymous public printing.
    let authTimeout = window.setTimeout(() => applySession(null), 2500);
    let unsubscribe: (() => void) | undefined;
    let removeRestoreListener: (() => void) | undefined;
    try {
      const supabase = createBrowserSupabaseClient();
      function restoreFromCache(event: PageTransitionEvent) {
        if (!event.persisted || cancelled) return;
        // A restored page is a memory snapshot, not a fresh ownership read.
        authResolved = true;
        restoring = true;
        const revision = ++sessionRevision;
        invalidatePrivateState();
        window.clearTimeout(authTimeout);
        authTimeout = window.setTimeout(() => {
          if (!cancelled && revision === sessionRevision) applySession(null, true);
        }, 2500);
        void supabase.auth.getSession().then(({ data, error }) => {
          if (!cancelled && revision === sessionRevision) applySession(error ? null : data.session, true);
        }).catch(() => {
          if (!cancelled && revision === sessionRevision) applySession(null, true);
        });
      }
      window.addEventListener("pageshow", restoreFromCache);
      removeRestoreListener = () => window.removeEventListener("pageshow", restoreFromCache);
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => applySession(session, event === "SIGNED_OUT"));
      unsubscribe = () => listener.subscription.unsubscribe();
      void supabase.auth.getSession().then(({ data }) => {
        if (!authResolved) applySession(data.session);
      }).catch(() => { if (!authResolved) applySession(null); });
    } catch { applySession(null); }

    return () => {
      cancelled = true;
      requestRevision.current++;
      visibleRevision.current = -1;
      controller?.abort();
      window.clearTimeout(authTimeout);
      removeRestoreListener?.();
      unsubscribe?.();
    };
  }, [code, router, searchParams, loadAttempt]);

  useEffect(() => {
    return beginQrRender(
      async () => svgDataUrl(await printQrSvg(canonicalCode, qrSideMm)),
      result => setQrRendered({ key: qrRenderKey, ...result, error: result.error ? "The QR code could not be prepared. Try again." : "" })
    );
  }, [canonicalCode, qrSideMm, qrRenderKey]);

  useEffect(() => {
    if (mode !== "qr" || !instrument || loading) return;
    return beginQrRender(
      () => printQrPng(canonicalCode, qrSideMm),
      result => setPngRendered({ key: qrRenderKey, ...result, error: result.error ? "The PNG could not be prepared. Try again." : "" })
    );
  }, [canonicalCode, qrSideMm, qrRenderKey, mode, instrument, loading]);

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
  const printableInstrument = instrument && !(printScope === "owner" && ownerAuthorized) ? sanitizePublicInstrument(instrument) : instrument;
  const printableSpecs = printableInstrument ? printSpecifications(printableInstrument) : [];
  const primaryFacts = instrument ? [instrument.instrumentType, instrument.brand, instrument.year, location].filter((value): value is string => Boolean(value)) : [];
  const activeFormat = formatConfig[mode];
  const availableModes = modeOrder.filter((candidate) => candidate !== "service" || printableServiceEntries.length > 0 || (loading && candidate === mode));
  const geometry = printGeometry(printSize, orientation);
  const resolvedPageDimensions = `${geometry.width}in ${geometry.height}in`;
  const previewScale = Math.min(1, Math.max(0.1, (viewportWidth - 32) / (geometry.width * 96))) * zoom / 100;
  const optionKey = JSON.stringify([mode, printSize, orientation, theme, photoUrl, photoFit, printScope, serialDisplay, includePhoto, includeLogo, includeAvailability, includeAttribution, includeSpecifications, includeTimeline, includeUrlLabel, includeScanInstruction, selectedServiceId, includeServiceDetails, printNote, printedTitle]);
  const readyToPrint = loadedCode === code && !loading && renderedRevision.current === loadRevision.current && Boolean(instrument && qrDataUrl) && !qrError && printState === "Ready to print.";

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
    const revision = loadRevision.current;
    let active = true;
    let timedOut = false;
    const images = Array.from(root.querySelectorAll("img"));
    function check() {
      if (!active || !root || revision !== loadRevision.current) return;
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
    if (!readyToPrint || loadedCode !== code || printing || renderedRevision.current !== loadRevision.current) return;
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
    setZoom(100);
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
    if (value === "label") return ui("ui.app.handout.code.page.formatLabel", "Label");
    if (value === "hangtag") return ui("ui.app.handout.code.page.formatHangTag", "Hang tag");
    if (value === "handout") return ui("ui.app.handout.code.page.formatProfileSheet", "Profile sheet");
    if (value === "qr") return ui("ui.app.handout.code.page.formatQrOnly", "QR only");
    return ui("ui.app.handout.code.page.formatService", "Service summary");
  }

  function renderBadges() {
    if (!instrument) return null;
    return (
      <div className={styles.badges}>
        {instrument.showVerificationBadge !== false ? (
          <Badge tone={verification === "verified" ? "verified" : "neutral"} icon={<ShieldCheck size={12} />}>
            {verification === "verified" ? ui("ui.app.handout.code.page.d8d9a98cd0e8", "Verified by QRguitar") : ui("ui.app.handout.code.page.33c8e8de41c3", "Unverified")}
          </Badge>
        ) : null}
        {instrument.showAuthenticityBadge !== false ? (
          <Badge tone={authenticity === "confirmed" ? "auth" : "neutral"} icon={<ShieldCheck size={12} />}>
            {authenticity === "confirmed" ? ui("ui.app.handout.code.page.eb95c24a9590", "Authenticity Confirmed") : ui("ui.app.handout.code.page.a54f9b625886", "Authenticity Unconfirmed")}
          </Badge>
        ) : null}
        {safety ? (
          <Badge tone="safety" icon={<Siren size={12} />}>
            {safety === "lost" ? ui("ui.app.handout.code.page.299f098db192", "Reported Lost") : safety === "stolen" ? ui("ui.app.handout.code.page.44d0eeb2a64d", "Reported Stolen") : ui("ui.app.handout.code.page.37ce0a91ee27", "Recovered")}
          </Badge>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <style>{ui("ui.app.handout.code.page.edca82c0915c", "@media print { @page { size: {{value1}}; margin: {{value2}}in; } }", { value1: resolvedPageDimensions, value2: geometry.margin })}</style>
      <div className={`no-print ${styles.screenChrome}`}><Nav /></div>
      <main className={`section handout-page ${styles.root}`} data-print-page-size={printSize} aria-label={ui("ui.app.handout.code.page.3eed152bf351", "QR and print")}>
        <div className="shell handout-shell" data-print-ready={readyToPrint} data-print-mode={mode} data-print-size={printSize} data-print-orientation={orientation} data-print-theme={theme}>
          <div className="print-kit-toolbar no-print">
            <div className={styles.workspaceHeading}>
              <Link className={styles.backButton} href={profileReturnHref} aria-label={instrument ? "Back to Profile" : "Back to Dashboard"} title={instrument ? "Back to Profile" : "Back to Dashboard"}>
                <ArrowLeft size={20} /></Link>
              <h1>{getContentValue(content, "printWorkspace.title")}</h1>
            </div>
            <div className="print-kit-toolbar-actions">
              {mode === "qr" && readyToPrint ? <a className="button secondary" href={qrDataUrl} download={`qrguitar-${canonicalCode}-${qrSideMm}mm.svg`}>{ui("ui.app.handout.code.page.downloadSvg", "Download SVG")}</a> : null}
              {mode === "qr" ? pngDataUrl && readyToPrint ? <a className="button secondary" href={pngDataUrl} download={`qrguitar-${canonicalCode}-${qrSideMm}mm.png`}>{ui("ui.app.handout.code.page.downloadPng", "Download PNG")}</a> : <button className="button secondary" type="button" disabled>{pngError ? "PNG unavailable" : "Preparing PNG"}</button> : null}
              {ownerAuthorized ? <Link className={styles.profileLink} href={`/print/qr?code=${encodeURIComponent(canonicalCode)}`}>QR label batch</Link> : null}
              <Link className={styles.profileLink} href={profileReturnHref} target="_blank">
                <ExternalLink size={16} />{ui("ui.app.handout.code.page.f9d77f6cb2f2", "Open Profile")}</Link>
              <button className="button" type="button" onClick={printSelectedPage} disabled={!readyToPrint || printing}>
                <Printer size={16} />
                {printing ? ui("ui.app.handout.code.page.ab31856edf15", "Opening print...") : "Print " + printModeLabel(mode)}
              </button>
            </div>
          </div>

          <div className={`${styles.formatToolbar} no-print`} role="group" aria-label={ui("ui.app.handout.code.page.2b60a18bae15", "Print format")}>
            <label className={styles.formatSelect}>
              <span>{ui("ui.app.handout.code.page.2f343666aaa8", "Format")}</span>
              <select value={mode} disabled={!instrument || loading} onChange={(event) => selectPrintMode(event.target.value as PrintMode)}>
                {availableModes.map((key) => <option key={key} value={key}>{printModeLabel(key)}</option>)}
              </select>
            </label>
          <button
            className={`${styles.mobileControlsButton} no-print`}
            type="button"
            aria-expanded={mobileControlsOpen}
            aria-controls="print-suite-controls"
            disabled={!instrument || loading}
            onClick={() => setMobileControlsOpen((current) => !current)}
          >
            <SlidersHorizontal size={16} />
            {mobileControlsOpen ? ui("ui.app.handout.code.page.f14f3c9238ed", "Close print options") : ui("ui.app.handout.code.page.45e209da028e", "Print options")}
          </button>
          </div>

          {mobileControlsOpen ? <button type="button" className={`${styles.mobileControlsBackdrop} no-print`} aria-label={ui("ui.app.handout.code.page.f14f3c9238ed", "Close print options")} onClick={() => setMobileControlsOpen(false)} /> : null}

          <div className={styles.workspace} data-print-frame>
            {instrument ? (
              <aside className={`${styles.controlRail} ${mobileControlsOpen ? styles.controlRailOpen : ""} no-print`} id="print-suite-controls" aria-label={ui("ui.app.handout.code.page.16ac699a5f21", "Print Suite controls")} role={mobileControlsOpen ? "dialog" : undefined} aria-modal={mobileControlsOpen || undefined}>
                <div className={styles.mobileControlsHeader}>
                  <strong>{ui("ui.app.handout.code.page.45e209da028e", "Print options")}</strong>
                  <button type="button" aria-label={ui("ui.app.handout.code.page.f14f3c9238ed", "Close print options")} onClick={() => setMobileControlsOpen(false)}><X size={17} /></button>
                </div>
                <div className={styles.controlGrid}>
                  {activeFormat.sizes.length > 1 ? <label>{mode === "qr" ? ui("ui.app.handout.code.page.qrSize", "QR size") : ui("ui.app.handout.code.page.35045eff549e", "Paper")}<select value={printSize} onChange={(event) => setPrintSize(event.target.value as PrintSize)}>{activeFormat.sizes.map((size) => <option value={size} key={size}>{printSizeLabels[size]}</option>)}</select></label> : null}
                  {activeFormat.orientations.length > 1 ? <label>{ui("ui.app.handout.code.page.e3d11242200f", "Orientation")}<select value={orientation} onChange={(event) => setOrientation(event.target.value as PrintOrientation)}>{activeFormat.orientations.map((value) => <option value={value} key={value}>{value === "portrait" ? ui("ui.app.handout.code.page.f71094c30160", "Portrait") : ui("ui.app.handout.code.page.e658d3ae034a", "Landscape")}</option>)}</select></label> : null}
                </div>

                {ownerAuthorized && mode !== "qr" ? (
                  <fieldset className={styles.controlSection}>
                    <legend className={styles.controlLabel}>{ui("ui.app.handout.code.page.2b4946ae1386", "Copy type")}</legend>
                    <label className={styles.choice}><input type="radio" name="print-scope" checked={printScope === "public"} onChange={() => setPrintScope("public")} /><span><strong>{ui("ui.app.handout.code.page.sharedCopy", "Shared copy")}</strong><small>{ui("ui.app.handout.code.page.sharedCopyDescription", "Includes the information shown on the Profile.")}</small></span></label>
                    <label className={styles.choice}><input type="radio" name="print-scope" checked={printScope === "owner"} onChange={() => setPrintScope("owner")} /><span><strong>{ui("ui.app.handout.code.page.9732ac52e538", "Owner copy")}</strong><small>{ui("ui.app.handout.code.page.ownerCopyDescription", "May include a hidden serial number and purchase details. Keep this copy for your records.")}</small></span></label>
                  </fieldset>
                ) : null}

                {mode === "service" ? <label className={styles.controlSection}><span className={styles.controlLabel}>{ui("ui.app.handout.code.page.cd06117a4a90", "Service Entry")}</span><select value={selectedService?.id || ""} onChange={(event) => setSelectedServiceId(event.target.value)}>{printableServiceEntries.map((entry) => <option value={entry.id} key={entry.id}>{formatServiceDate(entry)} - {entry.title}</option>)}</select></label> : null}

                {mode !== "qr" ? <details className={styles.optionGroup}>
                  <summary>{ui("ui.app.handout.code.page.616f48c1db19", "Fields")}</summary>
                  <div className={styles.toggleGrid}>
                    <label><input type="checkbox" checked={includeLogo} onChange={(event) => setIncludeLogo(event.target.checked)} />{" "}{ui("ui.app.handout.code.page.d707dc2f1936", "Logo")}</label>
                    {activeFormat.photo && photoUrl ? <label><input type="checkbox" checked={includePhoto} onChange={(event) => setIncludePhoto(event.target.checked)} />{" "}{ui("ui.app.handout.code.page.bb1de9720797", "Photograph")}</label> : null}
                    {presentation?.serialNumber ? <label><input type="checkbox" checked={includeSerial} onChange={(event) => setIncludeSerial(event.target.checked)} />{" "}{ui("ui.app.handout.code.page.14b1b3c5b151", "Serial Number")}</label> : null}
                    {activeFormat.availability && saleStatus ? <label><input type="checkbox" checked={includeAvailability} onChange={(event) => setIncludeAvailability(event.target.checked)} />{" "}{ui("ui.app.handout.code.page.12f67f8539c4", "Availability")}</label> : null}
                    {activeFormat.attribution && instrument.publicCollection?.publicName ? <label><input type="checkbox" checked={includeAttribution} onChange={(event) => setIncludeAttribution(event.target.checked)} />{" "}{ui("ui.app.handout.code.page.a902dcce0886", "Attribution")}</label> : null}
                    {activeFormat.specifications && printableSpecs.length ? <label><input type="checkbox" checked={includeSpecifications} onChange={(event) => setIncludeSpecifications(event.target.checked)} />{" "}{ui("ui.app.handout.code.page.015b4e0a76e5", "Specifications")}</label> : null}
                    {activeFormat.timeline && timelineEntries.length ? <label><input type="checkbox" checked={includeTimeline} onChange={(event) => setIncludeTimeline(event.target.checked)} />{" "}{ui("ui.app.handout.code.page.a7a952cb15e6", "Timeline summary")}</label> : null}
                  </div>
                </details> : null}

                {activeFormat.photo && includePhoto && galleryImages.length ? <div className={styles.controlGrid}>
                  {galleryImages.length > 1 ? <label>{ui("ui.app.handout.code.page.bb1de9720797", "Photograph")}<select value={photoUrl} onChange={(event) => setSelectedPhoto(event.target.value)}>{galleryImages.map((url, index) => <option value={url} key={url}>{index === 0 ? ui("ui.app.handout.code.page.7cbea1608d56", "Main photograph") : ui("ui.app.handout.code.page.db641bc07db6", "Photograph {{value1}}", { value1: index + 1 })}</option>)}</select></label> : null}
                  <label>{ui("ui.app.handout.code.page.a27757d6372e", "Photo framing")}<select value={photoFit} onChange={(event) => setPhotoFit(event.target.value as "contain" | "cover")}><option value="contain">{ui("ui.app.handout.code.page.732c51dcff54", "Show whole photo")}</option><option value="cover">{ui("ui.app.handout.code.page.33d0dc3a81a2", "Fill photo area")}</option></select></label>
                </div> : null}
                {mode === "service" ? <label className={styles.choice}><input type="checkbox" checked={includeServiceDetails} onChange={(event) => setIncludeServiceDetails(event.target.checked)} />{" "}{ui("ui.app.handout.code.page.b7a17f6da566", "Full service details")}</label> : null}
                {mode !== "qr" ? <label className={styles.controlSection}><span className={styles.controlLabel}>{ui("ui.app.handout.code.page.eaea51b2ef4f", "Title on this printout")}</span><input type="text" maxLength={120} value={printTitle ?? title} onChange={(event) => setPrintTitle(event.target.value)} /></label> : null}
                {mode !== "label" && mode !== "qr" ? <label className={styles.controlSection}><span className={styles.controlLabel}>{ui("ui.app.handout.code.page.e100b01df2b6", "Note on this printout")}</span><textarea rows={3} maxLength={240} value={printNote} placeholder={ui("ui.app.handout.code.page.2faf4e50e727", "Care advice, collection details or a message for the recipient")} onChange={(event) => setPrintNote(event.target.value)} /><small>{printNote.length}/240</small></label> : null}

                {mode !== "qr" ? <details className={styles.optionGroup}>
                  <summary>{ui("ui.app.handout.code.page.a439fba430a3", "QR")}</summary>
                  <div className={styles.toggleGrid}>
                    <label><input type="checkbox" checked={includeUrlLabel} onChange={(event) => setIncludeUrlLabel(event.target.checked)} />{" "}{ui("ui.app.handout.code.page.b36c5aceb02f", "URL label")}</label>
                    <label><input type="checkbox" checked={includeScanInstruction} onChange={(event) => setIncludeScanInstruction(event.target.checked)} />{" "}{ui("ui.app.handout.code.page.eaf0a0e32cc3", "Scan instruction")}</label>
                  </div>
                </details> : null}

                <p className={styles.printAdvice}>{ui("ui.app.handout.code.page.placement", "{{value1}}", { value1: printPlacement(instrument.instrumentType) })}</p>

                <div className={styles.controlActions}>
                  <button type="button" className={styles.resetButton} onClick={resetPrintOptions}><RotateCcw size={14} /> {getContentValue(content, "printWorkspace.reset")}</button>
                  <button type="button" className={styles.doneButton} onClick={() => setMobileControlsOpen(false)}>{ui("ui.app.handout.code.page.11a6767d5674", "Done")}</button>
                </div>
              </aside>
            ) : null}

            <section className={`${styles.previewStage} ${!instrument ? styles.previewStageEmpty : ""}`} data-print-frame aria-label={ui("ui.app.handout.code.page.d0f8e8312681", "Print preview stage")}>
              <div className={`${styles.previewToolbar} no-print`}>
                <div><strong>{printModeLabel(mode)}</strong><span>{printSizeLabels[printSize]} / {orientation}{readyToPrint ? ui("ui.app.handout.code.page.3fb0090fff7a", " / 1 page") : ""}</span></div>
                {instrument ? <details className={styles.previewZoom}>
                  <summary aria-label={ui("ui.app.handout.code.page.317ab210624d", "Preview zoom")} title={ui("ui.app.handout.code.page.317ab210624d", "Preview zoom")}><ZoomIn size={17} /><output aria-live="polite" aria-label={ui("ui.app.handout.code.page.aeffe78362f7", "Preview scale")}>{Math.round(previewScale * 100)}%</output></summary>
                  <div className={styles.zoomControls}>
                  <button type="button" aria-label={ui("ui.app.handout.code.page.bc7b631a689b", "Zoom out")} title={ui("ui.app.handout.code.page.bc7b631a689b", "Zoom out")} disabled={zoom <= 75} onClick={() => setZoom((current) => Math.max(75, current - 25))}><ZoomOut size={17} /></button>
                  <button type="button" aria-label={ui("ui.app.handout.code.page.3626161a4685", "Fit page")} title={ui("ui.app.handout.code.page.3626161a4685", "Fit page")} onClick={() => setZoom(100)}><Maximize size={17} /></button>
                  <button type="button" aria-label={ui("ui.app.handout.code.page.0e47f09a748f", "Zoom in")} title={ui("ui.app.handout.code.page.0e47f09a748f", "Zoom in")} disabled={zoom >= 300} onClick={() => setZoom((current) => Math.min(300, current + 25))}><ZoomIn size={17} /></button>
                  </div>
                </details> : null}
              </div>

              {instrument ? <div className={`${styles.validation} no-print`} role="status">
                {readyToPrint ? <CheckCircle2 size={16} /> : <FileText size={16} />}
                <span>{qrError || printState}</span>
                {qrError ? <button type="button" className={styles.resetButton} onClick={() => setQrRetry(value => value + 1)}>{ui("ui.app.handout.code.page.d8b8392e2c54", "Try again")}</button> : null}
              </div> : null}

              {instrument ? <p className={`${styles.printAdvice} no-print`}>{ui("ui.app.handout.code.page.printScale", "Print at 100% or Actual size. Match the paper size and turn off headers and footers. Choose Save as PDF in the print dialog.")}{mode === "qr" ? <> {ui("ui.app.handout.code.page.qrDimensions", "Size includes the white border. Keep it clear; test a print before making more.")} {ui("ui.app.handout.code.page.pngPixels", "PNG: {{value1}} × {{value1}} pixels. Set the selected size when placing it; SVG includes dimensions.", { value1: qrPrintMetrics(canonicalCode, qrSideMm).pixelWidth })}</> : null}</p> : null}
              {mode === "qr" && pngError ? <p className={`${styles.printAdvice} no-print`} role="alert">{pngError} <button type="button" className={styles.resetButton} onClick={() => setQrRetry(value => value + 1)}>{ui("ui.app.handout.code.page.d8b8392e2c54", "Try again")}</button></p> : null}
              {mode !== "qr" && printScope === "owner" ? <p className={`${styles.scopeNotice} no-print`}>{ui("ui.app.handout.code.page.ownerCopyNotice", "Owner copy: may contain information hidden from the Profile.")}</p> : null}
              <div className={styles.canvasViewport} data-print-frame ref={viewportRef}>
                {loading || !instrument ? (
                  <section className={`${styles.loadStatus} no-print`} role="status" aria-live="polite" aria-atomic="true">
                    {loading ? <QrCode aria-hidden="true" /> : <FileText aria-hidden="true" />}
                    <h2>{loading ? ui("ui.app.handout.code.page.d1e2cf07f226", "Preparing Print Suite...") : ui("ui.app.handout.code.page.a8e29add002d", "Print Suite unavailable.")}</h2>
                    <p>{loading ? ui("ui.app.handout.code.page.2ce160648f07", "Loading the selected Profile.") : message || ui("ui.app.handout.code.page.5cf97593870f", "This Profile could not be loaded. Please try again.")}</p>
                    {!loading ? <button type="button" className={styles.retryButton} onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{ui("ui.app.handout.code.page.d8b8392e2c54", "Try again")}</button> : null}
                  </section>
                ) : (
                <div className={styles.paperSpace} data-print-frame style={{ width: geometry.width * 96 * previewScale, height: geometry.height * 96 * previewScale }}>
                <div className={styles.pageCanvas} data-print-frame ref={canvasRef} style={{ "--paper-width": `${geometry.width}in`, "--paper-height": `${geometry.height}in`, "--paper-margin": `${geometry.margin}in`, "--print-content-width": `${geometry.contentWidth}in`, "--print-content-height": `${geometry.contentHeight}in`, "--preview-scale": previewScale } as CSSProperties}>
                    <PrintDocument
                      mode={mode} size={printSize} orientation={orientation} theme={theme}
                      title={printedTitle} code={canonicalCode} serial={serialDisplay}
                      facts={primaryFacts}
                      details={[
                        ...(condition ? [["Condition", condition] as [string, string]] : []),
                        ...(originalityStatus ? [["Originality", originalityStatus] as [string, string]] : []),
                        ...(includeAvailability && saleStatus ? [["Availability", saleStatus] as [string, string]] : []),
                        ...(includeAttribution && instrument.publicCollection?.publicName ? [["Collection", instrument.publicCollection.publicName] as [string, string]] : [])
                      ]}
                      specifications={activeFormat.specifications && includeSpecifications ? printableSpecs.map(([label, value]) => [label, value]) : []}
                      timeline={activeFormat.timeline && includeTimeline ? timelineEntries.slice(0, 2).map((entry) => `${formatServiceDate(entry)} - ${entry.title}`) : []}
                      badges={renderBadges()} photo={activeFormat.photo && includePhoto ? photoUrl : ""} photoFit={photoFit}
                      qrDataUrl={qrDataUrl} profileUrl={profileUrl}
                      includeLogo={includeLogo} includeUrl={includeUrlLabel} includeInstruction={includeScanInstruction}
                      scanInstruction={getContentValue(content, "printWorkspace.scanInstruction")} note={printNote}
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
                </div>
                </div>
                )}
                <p className={styles.printUnavailable}>{ui("ui.app.handout.code.page.2b25a25a833f", "Print unavailable. Return to QRguitar and resolve the print readiness message before printing.")}</p>
              </div>
            </section>
          </div>
        </div>
      </main>
      <div className={`no-print ${styles.screenChrome}`}><Footer /></div>
    </>
  );
}

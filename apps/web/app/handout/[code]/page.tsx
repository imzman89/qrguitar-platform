"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, Printer, QrCode, RotateCcw, ShieldCheck, Siren, SlidersHorizontal, Wrench, ZoomIn, ZoomOut } from "lucide-react";
import QRCode from "qrcode";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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

type HandoutPayload = {
  ok?: boolean;
  instrument?: DemoInstrument;
  message?: string;
};

type PrintMode = "label" | "hangtag" | "handout" | "service";
type PrintScope = "public" | "owner";
type PrintSize = "letter" | "a4" | "4x6" | "compact";
type PrintOrientation = "portrait" | "landscape";

type FormatConfig = {
  sizes: PrintSize[];
  defaultSize: PrintSize;
  orientations: PrintOrientation[];
  photo: boolean;
  availability: boolean;
  attribution: boolean;
  specifications: boolean;
  timeline: boolean;
};

const modeOrder: PrintMode[] = ["label", "hangtag", "handout", "service"];

const modeDescriptions: Record<PrintMode, string> = {
  label: "A compact label for an instrument case, hang tag, or paperwork.",
  hangtag: "An image-led counter card for a case, display, or service handoff.",
  handout: "A one-page Profile sheet for an owner, buyer, or service customer.",
  service: "A one-page summary of one canonical service-history entry."
};

const formatConfig: Record<PrintMode, FormatConfig> = {
  label: { sizes: ["compact", "letter"], defaultSize: "compact", orientations: ["portrait"], photo: false, availability: false, attribution: false, specifications: false, timeline: false },
  hangtag: { sizes: ["4x6", "letter"], defaultSize: "4x6", orientations: ["portrait", "landscape"], photo: true, availability: true, attribution: true, specifications: false, timeline: false },
  handout: { sizes: ["letter", "a4"], defaultSize: "letter", orientations: ["portrait"], photo: true, availability: true, attribution: true, specifications: true, timeline: true },
  service: { sizes: ["letter", "a4"], defaultSize: "letter", orientations: ["portrait"], photo: true, availability: false, attribution: false, specifications: false, timeline: false }
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
    <span className={`print-kit-badge ${tone}`}>
      {icon}
      {children}
    </span>
  );
}

export default function HandoutPage({ params }: { params: { code: string } }) {
  const content = useSiteContent();
  const code = String(params.code || "").trim().toUpperCase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = modeOrder.includes(searchParams.get("format") as PrintMode)
    ? searchParams.get("format") as PrintMode
    : "handout";
  const requestedSize = ["letter", "a4", "4x6", "compact"].includes(searchParams.get("size") || "")
    ? searchParams.get("size") as PrintSize
    : formatConfig[requestedMode].defaultSize;
  const requestedOrientation = searchParams.get("orientation") === "landscape" ? "landscape" : "portrait";
  const [instrument, setInstrument] = useState<DemoInstrument | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [mode, setMode] = useState<PrintMode>(requestedMode);
  const [ownerAuthorized, setOwnerAuthorized] = useState(false);
  const [printScope, setPrintScope] = useState<PrintScope>("public");
  const [printSize, setPrintSize] = useState<PrintSize>(requestedSize);
  const [orientation, setOrientation] = useState<PrintOrientation>(requestedOrientation);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [zoom, setZoom] = useState(82);
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
  const canonicalCode = instrument?.qrCode || code;
  const profileUrl = `https://www.qrguitar.com/i/${encodeURIComponent(canonicalCode)}`;

  useEffect(() => {
    let cancelled = false;

    async function loadHandoutProfile() {
      setLoading(true);
      setMessage("");

      const token = await Promise.race([
        getSupabaseAccessToken().catch(() => ""),
        new Promise<string>((resolve) => window.setTimeout(() => resolve(""), 2500))
      ]);
      if (token) {
        const ownerResponse = await fetch(`/api/instruments?scope=mine&code=${encodeURIComponent(code)}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            authorization: `Bearer ${token}`
          }
        });
        const ownerPayload = (await ownerResponse.json().catch(() => null)) as HandoutPayload | null;
        if (!cancelled && ownerResponse.ok && ownerPayload?.ok && ownerPayload.instrument) {
          setOwnerAuthorized(true);
          setInstrument(ownerPayload.instrument);
          if (ownerPayload.instrument.qrCode && ownerPayload.instrument.qrCode !== code) {
            router.replace(`/handout/${encodeURIComponent(ownerPayload.instrument.qrCode)}`);
          }
          setLoading(false);
          return;
        }
      }

      const publicResponse = await fetch(`/api/instruments?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      const publicPayload = (await publicResponse.json().catch(() => null)) as HandoutPayload | null;
      if (!cancelled && publicResponse.ok && publicPayload?.ok && publicPayload.instrument) {
        setOwnerAuthorized(false);
        setInstrument(publicPayload.instrument);
        if (publicPayload.instrument.qrCode && publicPayload.instrument.qrCode !== code) {
          router.replace(`/handout/${encodeURIComponent(publicPayload.instrument.qrCode)}`);
        }
        setLoading(false);
        return;
      }

      if (!cancelled) {
        setInstrument(null);
        setMessage(publicPayload?.message || "This QRguitar Profile is unavailable or requires the owner account to print.");
        setLoading(false);
      }
    }

    void loadHandoutProfile();
    return () => {
      cancelled = true;
    };
  }, [code, router]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(profileUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 720,
      color: {
        dark: "#071014",
        light: "#ffffff"
      }
    }).then((url) => {
      if (!cancelled) {
        setQrDataUrl(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [profileUrl]);

  const title = instrument ? instrumentDisplayName(instrument) : code;
  const galleryImages = useMemo(
    () => instrument ? Array.from(new Set([instrument.heroImageDataUrl, ...(instrument.galleryImageDataUrls || [])].filter(Boolean) as string[])) : [],
    [instrument]
  );
  const photoUrl = galleryImages[0] || "";
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
  const photoCount = galleryImages.length;
  const docCount = presentation?.counts.documents || 0;
  const serviceCount = presentation?.counts.service || 0;
  const timelineEntries = presentation?.meaningfulTimelineEvents || [];
  const printableSpecs = instrument ? [
    ["Type", instrument.instrumentType],
    ["Finish", instrument.finish],
    ["Body", instrument.bodyWood],
    ["Neck", instrument.neckWood],
    ["Pickups", instrument.pickups],
    ...(instrument.customFields || []).map((field) => [field.label, field.value])
  ].filter((entry): entry is string[] => Boolean(entry[0] && entry[1])).slice(0, 8) : [];
  const primaryFacts = instrument ? [instrument.brand, instrument.model, instrument.year, location].filter(Boolean) : [];
  const detailFacts = [
    condition,
    saleStatus,
    originalityStatus,
    photoCount ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : "",
    docCount ? `${docCount} public document${docCount === 1 ? "" : "s"}` : "",
    serviceCount ? `${serviceCount} service entr${serviceCount === 1 ? "y" : "ies"}` : ""
  ].filter(Boolean);
  const isPrivate = instrument?.visibility === "private";
  const activeFormat = formatConfig[mode];
  const availableModes = modeOrder.filter((candidate) => candidate !== "service" || printableServiceEntries.length > 0);
  const pageDimensions = {
    letter: ["8.5in", "11in"],
    a4: ["210mm", "297mm"],
    "4x6": ["4in", "6in"],
    compact: ["3.5in", "2.25in"]
  }[printSize];
  const resolvedPageDimensions = orientation === "landscape"
    ? `${pageDimensions[1]} ${pageDimensions[0]}`
    : `${pageDimensions[0]} ${pageDimensions[1]}`;

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

  function resetPrintOptions() {
    setPrintScope("public");
    const config = formatConfig[mode];
    setPrintSize(config.defaultSize);
    setOrientation(config.orientations[0]);
    setTheme("dark");
    setIncludePhoto(config.photo);
    setIncludeSerial(true);
    setIncludeAvailability(config.availability);
    setIncludeLogo(true);
    setIncludeAttribution(config.attribution);
    setIncludeSpecifications(config.specifications);
    setIncludeTimeline(config.timeline);
    setIncludeUrlLabel(true);
    setIncludeScanInstruction(true);
    setZoom(82);
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
      <div className="print-kit-badges">
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
      <style>{`@media print { @page { size: ${resolvedPageDimensions}; margin: ${printSize === "compact" ? "0" : "0.3in"}; } }`}</style>
      <Nav />
      <main className="section handout-page" data-print-page-size={printSize}>
        <div className="shell handout-shell" data-print-mode={mode} data-print-size={printSize} data-print-orientation={orientation} data-print-theme={theme}>
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
              <Link className="button secondary" href={`/i/${encodeURIComponent(canonicalCode)}`} target="_blank">
                <ExternalLink size={16} />
                Open Profile
              </Link>
              <button className="button" type="button" onClick={() => window.print()} disabled={!instrument || !qrDataUrl}>
                <Printer size={16} />
                {getContentValue(content, "printWorkspace.print")}
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

          <div className={styles.workspace} data-print-frame>
            {instrument ? (
              <aside className={`${styles.controlRail} ${mobileControlsOpen ? styles.controlRailOpen : ""} no-print`} id="print-suite-controls" aria-label="Print Suite controls">
                <div className={styles.controlSection}>
                  <span className={styles.controlLabel}>Format</span>
                  <div className={styles.formatList} role="group" aria-label="Print format">
                    {availableModes.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={mode === key ? styles.selectedFormat : ""}
                        aria-pressed={mode === key}
                        onClick={() => {
                          setMode(key);
                          setMobileControlsOpen(false);
                        }}
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
                  <label>Appearance<select value={theme} onChange={(event) => setTheme(event.target.value as "light" | "dark")}><option value="light">Light</option><option value="dark">Dark</option></select></label>
                </div>

                <fieldset className={styles.controlSection}>
                  <legend className={styles.controlLabel}>Copy type</legend>
                  <label className={styles.choice}><input type="radio" name="print-scope" checked={printScope === "public"} onChange={() => setPrintScope("public")} /><span><strong>Public-safe copy</strong><small>Includes only information allowed on the public Profile.</small></span></label>
                  {ownerAuthorized ? <label className={styles.choice}><input type="radio" name="print-scope" checked={printScope === "owner"} onChange={() => setPrintScope("owner")} /><span><strong>Owner copy</strong><small>Can include owner-visible information when you choose it.</small></span></label> : null}
                </fieldset>

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

                <fieldset className={styles.controlSection}>
                  <legend className={styles.controlLabel}>QR</legend>
                  <div className={styles.toggleGrid}>
                    <label><input type="checkbox" checked={includeUrlLabel} onChange={(event) => setIncludeUrlLabel(event.target.checked)} /> URL label</label>
                    <label><input type="checkbox" checked={includeScanInstruction} onChange={(event) => setIncludeScanInstruction(event.target.checked)} /> Scan instruction</label>
                  </div>
                </fieldset>

                <button type="button" className={styles.resetButton} onClick={resetPrintOptions}><RotateCcw size={14} /> {getContentValue(content, "printWorkspace.reset")}</button>
              </aside>
            ) : null}

            <section className={styles.previewStage} data-print-frame aria-label="Print preview stage">
              <div className={`${styles.previewToolbar} no-print`}>
                <div><strong>{printModeLabel(mode)}</strong><span>{printSizeLabels[printSize]} / {orientation} / 1 page</span></div>
                <div className={styles.zoomControls} aria-label="Preview zoom">
                  <button type="button" aria-label="Zoom out" onClick={() => setZoom((current) => Math.max(55, current - 5))}><ZoomOut size={15} /></button>
                  <span>{zoom}%</span>
                  <button type="button" aria-label="Zoom in" onClick={() => setZoom((current) => Math.min(100, current + 5))}><ZoomIn size={15} /></button>
                </div>
              </div>

              <div className={`${styles.validation} no-print`} role="status">
                <CheckCircle2 size={16} />
                <span>{serialDisplay ? "QR, identity, and Serial Number are ready to print." : "QR and public-safe identity are ready. No Serial Number will print."}</span>
              </div>

              <div className={styles.canvasViewport} data-print-frame>
                <div className={styles.pageCanvas} data-print-frame style={{ "--print-preview-zoom": zoom / 100 } as CSSProperties}>

          {isPrivate ? (
            <div className="print-kit-warning no-print">
              This Profile is private. Its QR code will open only for an authorized account until visibility changes.
            </div>
          ) : null}

          {loading ? (
            <section className="card handout-status">
              <QrCode />
              <h2>Preparing Print Suite...</h2>
            </section>
          ) : !instrument ? (
            <section className="card handout-status">
              <FileText />
              <h2>Print Suite unavailable.</h2>
              <p>{message || "This QRguitar Profile could not be loaded."}</p>
            </section>
          ) : mode === "label" ? (
            <article className="print-kit print-kit--label" id="qrguitar-print-root" data-print-document aria-label={`Printable QR label for ${title}`}>
              <section className="print-label-card">
                <div className="print-label-qr">
                  {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${title}`} /> : <QrCode />}
                </div>
                <div className="print-label-info">
                  {includeLogo ? <div className="print-label-wordmark">QR<span>guitar</span></div> : null}
                  {includeScanInstruction ? <p>Scan Profile</p> : null}
                  <h2>{title}</h2>
                  <strong>{canonicalCode}</strong>
                  {serialDisplay ? <small>Serial Number: {serialDisplay}</small> : null}
                  {includeUrlLabel ? <small>{profileUrl}</small> : null}
                </div>
              </section>
            </article>
          ) : mode === "hangtag" ? (
            <article className="print-kit print-kit--hangtag" id="qrguitar-print-root" data-print-document aria-label={`Printable hang tag for ${title}`}>
              <header className="print-kit-header">
                {includeLogo ? <div className="print-kit-wordmark">QR<span>guitar</span></div> : <div />}
                <div>{includeScanInstruction ? <span>Scan the Profile</span> : null}<strong>{canonicalCode}</strong></div>
              </header>
              {includePhoto ? <div className="print-hangtag-photo">{photoUrl ? <img src={photoUrl} alt={`${title} main photo`} /> : <span>No photo available</span>}</div> : null}
              <section className="print-hangtag-info">
                <div><p className="print-kit-id-label">QRguitar Profile</p><h2>{title}</h2><p>{primaryFacts.join(" / ")}</p>{renderBadges()}</div>
                <div className="print-hangtag-qr">{qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${title}`} /> : <QrCode />}</div>
              </section>
              <dl className="print-kit-details">
                <div><dt>QRguitar ID</dt><dd>{canonicalCode}</dd></div>
                {serialDisplay ? <div><dt>Serial Number</dt><dd>{serialDisplay}</dd></div> : null}
                {includeAvailability && saleStatus ? <div><dt>Availability</dt><dd>{saleStatus}</dd></div> : null}
                {includeAttribution && instrument.publicCollection?.publicName ? <div><dt>Collection</dt><dd>{instrument.publicCollection.publicName}</dd></div> : null}
              </dl>
              <footer className="print-kit-footer">{includeScanInstruction ? <span>Scan for identity, history, and updates.</span> : <span />}{includeUrlLabel ? <strong>{profileUrl}</strong> : null}</footer>
            </article>
          ) : mode === "service" ? selectedService ? (
            <article className="print-kit print-kit--service" id="qrguitar-print-root" data-print-document aria-label={`Printable service summary for ${title}`}>
              <header className="print-kit-header">
                {includeLogo ? <div className="print-kit-wordmark">QR<span>guitar</span></div> : <div />}
                <div><span>Service Summary</span><strong>{canonicalCode}</strong></div>
              </header>
              <section className="print-service-profile">
                {includePhoto ? <div className="print-service-photo">{photoUrl ? <img src={photoUrl} alt={`${title} main photo`} /> : <span>No photo available</span>}</div> : null}
                <div><p className="print-kit-id-label">Permanent QRguitar Profile</p><h2>{title}</h2><p>{primaryFacts.join(" / ")}</p><dl className="print-kit-details"><div><dt>QRguitar ID</dt><dd>{canonicalCode}</dd></div>{serialDisplay ? <div><dt>Serial Number</dt><dd>{serialDisplay}</dd></div> : null}</dl></div>
              </section>
              <section className="print-service-work">
                <div className="print-service-title"><div><span>{selectedService.category || selectedService.eventType || "Service"}</span><h3>{selectedService.title}</h3></div><strong>{formatServiceDate(selectedService)}</strong></div>
                {selectedService.publicDescription ? <p>{selectedService.publicDescription}</p> : null}
                <dl className="print-service-details">
                  {selectedService.shopName || selectedService.providerDisplayName ? <div><dt>Provider / shop</dt><dd>{selectedService.providerDisplayName || selectedService.shopName}</dd></div> : null}
                  {selectedService.workOrderReference ? <div><dt>Work order</dt><dd>{selectedService.workOrderReference}</dd></div> : null}
                  {selectedService.partsInstalled ? <div><dt>Parts installed</dt><dd>{selectedService.partsInstalled}</dd></div> : null}
                  {selectedService.setupMeasurements ? <div><dt>Setup measurements</dt><dd>{selectedService.setupMeasurements}</dd></div> : null}
                </dl>
                <p className="print-service-provenance"><ShieldCheck size={15} /> {serviceProvenance(selectedService)}</p>
              </section>
              <section className="print-kit-qr-panel print-service-qr"><div className="print-kit-qr-code">{qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${title}`} /> : <QrCode />}</div><div>{includeScanInstruction ? <><p className="print-kit-scan-label">Scan to open the permanent Profile</p><h3>Keep service history connected.</h3></> : null}{includeUrlLabel ? <strong>{profileUrl}</strong> : null}</div></section>
              <footer className="print-kit-footer"><span>Private evidence and internal notes are not included.</span><strong>qrguitar.com</strong></footer>
            </article>
          ) : (
            <section className="card handout-status"><Wrench /><h2>No canonical service entry is available.</h2><p>Only owner-created or provider-submitted, owner-approved service history can be printed.</p></section>
          ) : (
            <article className="print-kit print-kit--handout" id="qrguitar-print-root" data-print-document aria-label={`Printable QRguitar handout for ${title}`}>
              <header className="print-kit-header">
                {includeLogo ? <div className="print-kit-wordmark">QR<span>guitar</span></div> : <div />}
                <div>
                  <span>QRguitar Profile Sheet</span>
                  <strong>{canonicalCode}</strong>
                </div>
              </header>

              <section className={`print-kit-profile${includePhoto ? " has-photo" : ""}`}>
                {includePhoto ? <div className="print-kit-photo">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={`${title} main photo`}
                      loading="eager"
                      decoding="sync"
                      fetchPriority="high"
                    />
                  ) : (
                    <span>No photo available</span>
                  )}
                </div> : null}
                <div className="print-kit-info">
                  <p className="print-kit-id-label">Permanent QRguitar Profile</p>
                  <h2>{title}</h2>
                  {primaryFacts.length ? <p className="print-kit-primary-facts">{primaryFacts.join(" / ")}</p> : null}
                  {renderBadges()}
                  <dl className="print-kit-details">
                    <div><dt>QRguitar ID</dt><dd>{canonicalCode}</dd></div>
                    {serialDisplay ? <div><dt>Serial Number</dt><dd>{serialDisplay}</dd></div> : null}
                    {includeAvailability && saleStatus ? <div><dt>Availability</dt><dd>{saleStatus}</dd></div> : null}
                    {includeAttribution && instrument.publicCollection?.publicName ? <div><dt>Collection</dt><dd>{instrument.publicCollection.publicName}</dd></div> : null}
                  </dl>
                  {detailFacts.length ? (
                    <div className="print-kit-fact-grid">
                      {detailFacts.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  ) : null}
                </div>
              </section>

              {includeSpecifications && printableSpecs.length ? (
                <section className="print-kit-summary-grid" aria-label="Profile specifications">
                  {printableSpecs.map(([label, value]) => <span key={`${label}-${value}`}><strong>{label}</strong>{value}</span>)}
                </section>
              ) : null}

              {includeTimeline && timelineEntries.length ? (
                <section className="print-kit-timeline-summary" aria-label="Timeline summary">
                  <strong>Recent history</strong>
                  {timelineEntries.slice(0, 2).map((entry) => <span key={entry.id}>{formatServiceDate(entry)} · {entry.title}</span>)}
                </section>
              ) : null}

              <section className="print-kit-qr-panel">
                <div className="print-kit-qr-code">
                  {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${title}`} /> : <QrCode />}
                </div>
                <div>
                  {includeScanInstruction ? <><p className="print-kit-scan-label">Scan this code</p><h3>{getContentValue(content, "printWorkspace.scanInstruction")}</h3><p>Photos, identity, service history, documents, and future ownership updates stay connected to this QRguitar ID.</p></> : null}
                  {includeUrlLabel ? <strong>{profileUrl}</strong> : null}
                </div>
              </section>

              <section className="print-kit-handoff">
                <strong>Receiving this instrument?</strong>
                <p>Use the secure ownership handoff sent by the current owner. The Profile URL and QR code stay the same after transfer.</p>
              </section>

              <footer className="print-kit-footer">
                <span>Keep this sheet with the instrument paperwork.</span>
                <strong>qrguitar.com</strong>
              </footer>
            </article>
          )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

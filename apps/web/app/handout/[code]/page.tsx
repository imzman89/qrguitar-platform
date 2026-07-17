"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Printer, QrCode, ShieldCheck, Siren } from "lucide-react";
import QRCode from "qrcode";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  instrumentDisplayName,
  type DemoInstrument
} from "../../../lib/local-demo";
import { formatRecordLocation } from "../../../lib/record-location";
import { getSupabaseAccessToken } from "../../../lib/supabase-browser";
import { getServiceHistoryEntries } from "../../../lib/instrument-profile-contract";

type HandoutPayload = {
  ok?: boolean;
  instrument?: DemoInstrument;
  message?: string;
};

type PrintMode = "handout" | "label";

const modeLabels: Record<PrintMode, string> = {
  handout: "Customer Handout",
  label: "QR Label"
};

const modeOrder: PrintMode[] = ["handout", "label"];

const modeDescriptions: Record<PrintMode, string> = {
  handout: "A one-page Profile summary for an owner, buyer, or service customer.",
  label: "A compact label for an instrument case, hang tag, or paperwork."
};
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

function publicDocumentCount(instrument: DemoInstrument) {
  return (instrument.documentFiles || []).filter((document) => document.visibility === "public").length;
}

function publicServiceCount(instrument: DemoInstrument) {
  return getServiceHistoryEntries(instrument).filter((event) => event.isPublic !== false).length;
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
  const code = String(params.code || "").trim().toUpperCase();
  const router = useRouter();
  const [instrument, setInstrument] = useState<DemoInstrument | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [mode, setMode] = useState<PrintMode>("handout");
  const canonicalCode = instrument?.qrCode || code;
  const profileUrl = `https://www.qrguitar.com/i/${encodeURIComponent(canonicalCode)}`;

  useEffect(() => {
    let cancelled = false;

    async function loadHandoutProfile() {
      setLoading(true);
      setMessage("");

      const publicResponse = await fetch(`/api/instruments?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      const publicPayload = (await publicResponse.json().catch(() => null)) as HandoutPayload | null;
      if (!cancelled && publicResponse.ok && publicPayload?.ok && publicPayload.instrument) {
        setInstrument(publicPayload.instrument);
        if (publicPayload.instrument.qrCode && publicPayload.instrument.qrCode !== code) {
          router.replace(`/handout/${encodeURIComponent(publicPayload.instrument.qrCode)}`);
        }
        setLoading(false);
        return;
      }

      const token = await getSupabaseAccessToken().catch(() => "");
      if (!token) {
        if (!cancelled) {
          setInstrument(null);
          setMessage("This QRguitar Profile is unavailable or requires the owner account to print.");
          setLoading(false);
        }
        return;
      }

      const ownerResponse = await fetch(`/api/instruments?scope=mine&code=${encodeURIComponent(code)}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          authorization: `Bearer ${token}`
        }
      });
      const ownerPayload = (await ownerResponse.json().catch(() => null)) as HandoutPayload | null;
      if (!cancelled && ownerResponse.ok && ownerPayload?.ok && ownerPayload.instrument) {
        setInstrument(ownerPayload.instrument);
        if (ownerPayload.instrument.qrCode && ownerPayload.instrument.qrCode !== code) {
          router.replace(`/handout/${encodeURIComponent(ownerPayload.instrument.qrCode)}`);
        }
        setLoading(false);
        return;
      }

      if (!cancelled) {
        setInstrument(null);
        setMessage(ownerPayload?.message || publicPayload?.message || "This QRguitar Profile could not be loaded.");
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
  const serialDisplay = instrument?.showSerialPublic === true && instrument?.serial ? instrument.serial : "";
  const photoCount = galleryImages.length;
  const docCount = instrument ? publicDocumentCount(instrument) : 0;
  const serviceCount = instrument ? publicServiceCount(instrument) : 0;
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
      <Nav />
      <main className="section handout-page">
        <div className="shell handout-shell" data-print-mode={mode}>
          <div className="print-kit-toolbar no-print">
            <div>
              <Link className="print-kit-back-link" href="/dashboard">
                <ArrowLeft size={15} />
                Dashboard
              </Link>
              <div className="eyebrow">QRguitar Print Kit</div>
              <h1>Print the right piece.</h1>
              <p>Use the handout for a customer or owner. Use the label for a case, tag, or paperwork.</p>
            </div>
            <div className="print-kit-toolbar-actions">
              <Link className="button secondary" href={`/i/${encodeURIComponent(canonicalCode)}`} target="_blank">
                <ExternalLink size={16} />
                Open Profile
              </Link>
              <button className="button" type="button" onClick={() => window.print()} disabled={!instrument || !qrDataUrl}>
                <Printer size={16} />
                Print {mode === "handout" ? "Handout" : "Label"}
              </button>
            </div>
          </div>

          {instrument ? (
            <div className="print-mode-toggle no-print" aria-label="Print format">
              {modeOrder.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={mode === key ? "active" : ""}
                  aria-pressed={mode === key}
                  onClick={() => setMode(key)}
                >
                  {modeLabels[key]}
                </button>
              ))}
              <p className="print-mode-description">{modeDescriptions[mode]}</p>
            </div>
          ) : null}

          {isPrivate ? (
            <div className="print-kit-warning no-print">
              This Profile is private. Its QR code will open only for an authorized account until visibility changes.
            </div>
          ) : null}

          {loading ? (
            <section className="card handout-status">
              <QrCode />
              <h2>Preparing Print Kit...</h2>
            </section>
          ) : !instrument ? (
            <section className="card handout-status">
              <FileText />
              <h2>Print Kit unavailable.</h2>
              <p>{message || "This QRguitar Profile could not be loaded."}</p>
            </section>
          ) : mode === "label" ? (
            <article className="print-kit print-kit--label" aria-label={`Printable QR label for ${title}`}>
              <section className="print-label-card">
                <div className="print-label-qr">
                  {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${title}`} /> : <QrCode />}
                </div>
                <div className="print-label-info">
                  <div className="print-label-wordmark">QR<span>guitar</span></div>
                  <p>Scan Profile</p>
                  <h2>{title}</h2>
                  <strong>{canonicalCode}</strong>
                  <small>{profileUrl}</small>
                </div>
              </section>
            </article>
          ) : (
            <article className="print-kit print-kit--handout" aria-label={`Printable QRguitar handout for ${title}`}>
              <header className="print-kit-header">
                <div className="print-kit-wordmark">QR<span>guitar</span></div>
                <div>
                  <span>Instrument Profile Handout</span>
                  <strong>{canonicalCode}</strong>
                </div>
              </header>

              <section className="print-kit-profile">
                <div className="print-kit-photo">
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
                </div>
                <div className="print-kit-info">
                  <p className="print-kit-id-label">Permanent QRguitar Profile</p>
                  <h2>{title}</h2>
                  {primaryFacts.length ? <p className="print-kit-primary-facts">{primaryFacts.join(" / ")}</p> : null}
                  {renderBadges()}
                  <dl className="print-kit-details">
                    <div><dt>QRguitar ID</dt><dd>{canonicalCode}</dd></div>
                    {serialDisplay ? <div><dt>Serial Number</dt><dd>{serialDisplay}</dd></div> : null}
                  </dl>
                  {detailFacts.length ? (
                    <div className="print-kit-fact-grid">
                      {detailFacts.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="print-kit-qr-panel">
                <div className="print-kit-qr-code">
                  {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${title}`} /> : <QrCode />}
                </div>
                <div>
                  <p className="print-kit-scan-label">Scan this code</p>
                  <h3>Open the permanent Profile.</h3>
                  <p>Photos, identity, service history, documents, and future ownership updates stay connected to this QRguitar ID.</p>
                  <strong>{profileUrl}</strong>
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
      </main>
      <Footer />
    </>
  );
}

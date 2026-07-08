"use client";

import Link from "next/link";
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

type HandoutPayload = {
  ok?: boolean;
  instrument?: DemoInstrument;
  message?: string;
};

type PrintMode = "full" | "shop" | "label";

const modeLabels: Record<PrintMode, string> = {
  full: "Full Page",
  shop: "Shop Card",
  label: "QR Label"
};

function humanizeStatus(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "for_sale") return "For sale";
  if (normalized === "not_for_sale") return "Not for sale";
  if (normalized === "all_original") return "All original";
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
  return (instrument.serviceEvents || []).filter((event) => event.isPublic !== false).length;
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
  const [instrument, setInstrument] = useState<DemoInstrument | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [mode, setMode] = useState<PrintMode>("full");
  const profileUrl = `https://www.qrguitar.com/i/${encodeURIComponent(code)}`;

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
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(profileUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 720,
      color: {
        dark: "#071014",
        light: "#f8f6f2"
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
  const serialDisplay = instrument?.showSerialPublic === true && instrument?.serial
    ? instrument.serial
    : instrument?.serialExceptionApproved
      ? "No serial/build ID used"
      : "";
  const photoCount = galleryImages.length;
  const docCount = instrument ? publicDocumentCount(instrument) : 0;
  const serviceCount = instrument ? publicServiceCount(instrument) : 0;
  const primaryFacts = instrument ? [instrument.brand, instrument.model, instrument.year, location].filter(Boolean) : [];
  const detailFacts = [condition, saleStatus, originalityStatus, photoCount ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : "", docCount ? `${docCount} public doc${docCount === 1 ? "" : "s"}` : "", serviceCount ? `${serviceCount} service entr${serviceCount === 1 ? "y" : "ies"}` : ""].filter(Boolean);
  const isPrivate = instrument?.visibility === "private";

  function renderBadges(compact = false) {
    if (!instrument) return null;
    return (
      <div className={compact ? "print-kit-badges compact" : "print-kit-badges"}>
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
        <div className="shell handout-shell">
          <div className="print-kit-toolbar no-print">
            <div>
              <div className="eyebrow">Selected profile print kit</div>
              <h1>QRguitar Print Kit</h1>
              <p>{instrument ? title : "Prepare one selected QRguitar Profile for a customer handout, shop card, or QR label."}</p>
            </div>
            <div className="print-kit-toolbar-actions">
              <Link className="button secondary" href="/dashboard">
                <ArrowLeft size={16} />
                Back to Dashboard
              </Link>
              <Link className="button secondary" href={`/i/${encodeURIComponent(code)}`} target="_blank">
                <ExternalLink size={16} />
                Open Profile
              </Link>
              <button className="button" type="button" onClick={() => window.print()} disabled={!instrument || !qrDataUrl}>
                <Printer size={16} />
                Print
              </button>
            </div>
          </div>

          {instrument ? (
            <div className="print-mode-toggle no-print" aria-label="Print format">
              {(Object.keys(modeLabels) as PrintMode[]).map((key) => (
                <button key={key} type="button" className={mode === key ? "active" : ""} onClick={() => setMode(key)}>
                  {modeLabels[key]}
                </button>
              ))}
            </div>
          ) : null}

          {isPrivate ? (
            <div className="print-kit-warning no-print">
              This profile is private. The QR link will not be publicly viewable until you make it public.
            </div>
          ) : null}

          {loading ? (
            <section className="card handout-status">
              <QrCode />
              <h2>Loading QRguitar Profile...</h2>
              <p>Preparing the selected print kit.</p>
            </section>
          ) : !instrument ? (
            <section className="card handout-status">
              <FileText />
              <h2>Handout unavailable.</h2>
              <p>{message || "This QRguitar Profile could not be loaded."}</p>
            </section>
          ) : (
            <article className={`print-kit print-kit--${mode}`} aria-label={`Printable QRguitar Profile for ${title}`}>
              <header className="print-kit-header">
                <div className="print-kit-wordmark">QR<span>guitar</span></div>
                <div>
                  <span>Permanent QRguitar Profile</span>
                  <strong>{code}</strong>
                </div>
              </header>

              {mode === "label" ? (
                <section className="print-label-card">
                  <div className="print-label-qr">
                    {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${title}`} /> : <QrCode />}
                  </div>
                  <div>
                    <p>Scan QRguitar Profile</p>
                    <h2>{title}</h2>
                    <strong>{code}</strong>
                    <span>{profileUrl}</span>
                  </div>
                </section>
              ) : (
                <>
                  <section className="print-kit-profile">
                    <div className="print-kit-photo">
                      {photoUrl ? <img src={photoUrl} alt={`${title} main photo`} /> : <span>No photo available</span>}
                    </div>
                    <div className="print-kit-info">
                      <p className="print-kit-id-label">QRguitar ID / Instrument ID</p>
                      <strong className="print-kit-id">{code}</strong>
                      <h2>{title}</h2>
                      {primaryFacts.length ? (
                        <p className="print-kit-primary-facts">{primaryFacts.join(" / ")}</p>
                      ) : null}
                      {renderBadges(mode === "shop")}
                      <div className="print-kit-fact-grid">
                        {detailFacts.map((item) => <span key={item}>{item}</span>)}
                        {serialDisplay ? <span>Serial / Build ID: {serialDisplay}</span> : null}
                      </div>
                    </div>
                  </section>

                  <section className="print-kit-qr-panel">
                    <div className="print-kit-qr-code">
                      {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${title}`} /> : <QrCode />}
                    </div>
                    <div>
                      <h3>Scan to open this QRguitar Profile.</h3>
                      <p>This QR code opens the permanent profile URL for this instrument.</p>
                      <strong>{profileUrl}</strong>
                    </div>
                  </section>
                </>
              )}

              <footer className="print-kit-footer">
                <span>Permanent QRguitar Profile at qrguitar.com</span>
                <strong>Keep this with the instrument paperwork.</strong>
              </footer>
            </article>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

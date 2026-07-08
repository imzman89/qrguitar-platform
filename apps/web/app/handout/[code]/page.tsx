"use client";

import { FileText, Printer, QrCode, ShieldCheck, Siren } from "lucide-react";
import QRCode from "qrcode";
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

export default function HandoutPage({ params }: { params: { code: string } }) {
  const code = String(params.code || "").trim().toUpperCase();
  const [instrument, setInstrument] = useState<DemoInstrument | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
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
  const condition = instrument ? getInstrumentCondition(instrument) : "used";
  const safety = instrument?.safetyStatus === "lost" || instrument?.safetyStatus === "stolen" ? instrument.safetyStatus : "";
  const serialDisplay = instrument?.showSerialPublic !== false && instrument?.serial
    ? instrument.serial
    : instrument?.serialExceptionApproved
      ? "No serial/build ID used"
      : "";

  return (
    <>
      <Nav />
      <main className="section handout-page">
        <div className="shell handout-shell">
          <div className="handout-toolbar no-print">
            <div>
              <div className="eyebrow">QRguitar handout</div>
              <h1>Print selected profile</h1>
            </div>
            <button className="button" type="button" onClick={() => window.print()} disabled={!instrument || !qrDataUrl}>
              <Printer size={16} />
              Print
            </button>
          </div>

          {loading ? (
            <section className="card handout-status">
              <QrCode />
              <h2>Loading QRguitar Profile...</h2>
              <p>Preparing the selected handout.</p>
            </section>
          ) : !instrument ? (
            <section className="card handout-status">
              <FileText />
              <h2>Handout unavailable.</h2>
              <p>{message || "This QRguitar Profile could not be loaded."}</p>
            </section>
          ) : (
            <article className="profile-handout" aria-label={`Printable handout for ${title}`}>
              <header className="profile-handout-header">
                <div className="profile-handout-brand">QR<span>guitar</span></div>
                <div>
                  <span>Scan-ready instrument profile</span>
                  <strong>{code}</strong>
                </div>
              </header>

              <section className="profile-handout-main">
                <div className="profile-handout-photo">
                  {photoUrl ? <img src={photoUrl} alt={`${title} main photo`} /> : <span>No photo available</span>}
                </div>
                <div className="profile-handout-info">
                  <p className="profile-handout-code">QRguitar ID / Instrument ID</p>
                  <strong className="profile-handout-id">{code}</strong>
                  <h2>{title}</h2>
                  <div className="profile-handout-facts">
                    {[instrument.brand, instrument.model, instrument.year, location, condition === "new" ? "New" : "Used"].filter(Boolean).map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                    {serialDisplay ? <span>Serial / Build ID: {serialDisplay}</span> : null}
                  </div>
                  <div className="profile-handout-badges">
                    {instrument.showVerificationBadge !== false ? (
                      <span className={verification === "verified" ? "verified" : "neutral"}><ShieldCheck size={13} /> {verification === "verified" ? "Verified by QRguitar" : "Unverified"}</span>
                    ) : null}
                    {instrument.showAuthenticityBadge !== false ? (
                      <span className={authenticity === "confirmed" ? "auth" : "neutral"}><ShieldCheck size={13} /> {authenticity === "confirmed" ? "Authenticity Confirmed" : "Authenticity Unconfirmed"}</span>
                    ) : null}
                    {safety ? <span className="safety"><Siren size={13} /> {safety === "lost" ? "Reported Lost" : "Reported Stolen"}</span> : null}
                  </div>
                </div>
              </section>

              <section className="profile-handout-qr">
                <div className="profile-handout-qr-code">
                  {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${title}`} /> : <QrCode />}
                </div>
                <div>
                  <h3>Scan to open this QRguitar Profile.</h3>
                  <p>This QR code opens the permanent profile URL for this instrument.</p>
                  <strong>{profileUrl}</strong>
                </div>
              </section>

              <footer className="profile-handout-footer">
                <span>Keep this handout with the instrument paperwork.</span>
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

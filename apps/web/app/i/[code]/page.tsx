"use client";

import { Clock3, DollarSign, Download, FileText, Home, Image, Menu, MessageCircle, QrCode, Repeat2, Share2, ShieldCheck, SlidersHorizontal, UserCircle } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  defaultQrStyle,
  demoInstrument,
  findDemoInstrument,
  getInstrumentVerificationStatus,
  instrumentDisplayName,
  type DemoInstrument
} from "../../../lib/local-demo";
import { calculateMarketEstimate, formatMoney, getComparableSalesForInstrument, type MarketEstimate } from "../../../lib/pricing-intelligence";

const fallbackInstrument: DemoInstrument = demoInstrument;
type ProfileTab = "overview" | "specs" | "timeline" | "ownership" | "media" | "repairs" | "documents";

const profileTabs: Array<{ id: ProfileTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "specs", label: "Specifications" },
  { id: "timeline", label: "Timeline" },
  { id: "ownership", label: "Ownership" },
  { id: "media", label: "Media" },
  { id: "repairs", label: "Repairs" },
  { id: "documents", label: "Documents" }
];

export default function PublicProfilePage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const [stored, setStored] = useState<DemoInstrument | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const code = params.code || demoInstrument.qrCode;
  const isDemoRecord = code.toUpperCase() === demoInstrument.qrCode;

  useEffect(() => {
    setStored(findDemoInstrument(code));
  }, [code]);

  const instrument = useMemo<DemoInstrument>(() => {
    if (stored) {
      const isLegacyDemoPlaceholder =
        isDemoRecord && stored.model === "Custom Offset" && stored.brand === fallbackInstrument.brand && stored.serial === fallbackInstrument.serial;
      const verificationStatus = stored.verificationStatus === "verified" || isLegacyDemoPlaceholder ? "verified" : "unverified";

      return {
        ...fallbackInstrument,
        ...stored,
        verificationStatus,
        model: isLegacyDemoPlaceholder ? fallbackInstrument.model : stored.model,
        builder: isLegacyDemoPlaceholder ? fallbackInstrument.builder : stored.builder,
        summary: isLegacyDemoPlaceholder ? fallbackInstrument.summary : stored.summary
      };
    }

    if (isDemoRecord) {
      return fallbackInstrument;
    }

    return {
      qrCode: code.toUpperCase(),
      permanentPath: `/i/${code.toUpperCase()}`,
      name: searchParams.get("name") || fallbackInstrument.name,
      brand: searchParams.get("brand") || fallbackInstrument.brand,
      model: searchParams.get("model") || fallbackInstrument.model,
      serial: searchParams.get("serial") || fallbackInstrument.serial,
      year: searchParams.get("year") || fallbackInstrument.year,
      instrumentType: searchParams.get("instrumentType") || fallbackInstrument.instrumentType,
      builder: searchParams.get("builder") || fallbackInstrument.builder,
      owner: searchParams.get("owner") || fallbackInstrument.owner,
      location: searchParams.get("location") || fallbackInstrument.location,
      summary: searchParams.get("summary") || fallbackInstrument.summary,
      heroImageDataUrl: fallbackInstrument.heroImageDataUrl,
      galleryImageDataUrls: fallbackInstrument.galleryImageDataUrls,
      finish: fallbackInstrument.finish,
      bodyWood: fallbackInstrument.bodyWood,
      neckWood: fallbackInstrument.neckWood,
      pickups: fallbackInstrument.pickups,
      websiteUrl: fallbackInstrument.websiteUrl,
      shopUrl: fallbackInstrument.shopUrl,
      customFields: fallbackInstrument.customFields,
      customLinks: fallbackInstrument.customLinks,
      qrStyle: defaultQrStyle,
      createdAt: fallbackInstrument.createdAt
    };
  }, [code, isDemoRecord, searchParams, stored]);

  const heroStyle = instrument.heroImageDataUrl
    ? ({ "--scan-hero-image": `url("${instrument.heroImageDataUrl}")` } as CSSProperties)
    : undefined;
  const galleryImages = Array.from(
    new Set([instrument.heroImageDataUrl, ...(instrument.galleryImageDataUrls || [])].filter(Boolean) as string[])
  ).slice(0, 20);
  const marketEstimate = calculateMarketEstimate(instrument, getComparableSalesForInstrument(instrument));
  const isVerifiedRecord = getInstrumentVerificationStatus(instrument) === "verified";

  const specs = [
    { label: "Instrument ID", value: instrument.qrCode },
    { label: "Status", value: isVerifiedRecord ? "Verified record" : "Unverified record" },
    { label: "Owner", value: instrument.owner || "Unclaimed" },
    { label: "Built", value: instrument.year ? `June ${instrument.year}` : "Unknown" },
    { label: "Make / Model", value: [instrument.brand, instrument.model].filter(Boolean).join(" ") },
    { label: "Serial", value: instrument.serial },
    { label: "Builder", value: instrument.builder || "Not listed" },
    { label: "Transferable", value: "Yes" },
    { label: "Location", value: instrument.location || "Not listed" }
  ];

  const optionalSpecs = [
    { label: "Type", value: instrument.instrumentType },
    { label: "Finish", value: instrument.finish },
    { label: "Body", value: instrument.bodyWood },
    { label: "Neck", value: instrument.neckWood },
    { label: "Pickups", value: instrument.pickups },
    ...(instrument.customFields || [])
  ].filter((spec) => spec.value);

  const profileLinks = [
    { label: "Website", href: instrument.websiteUrl },
    { label: "Instagram", href: instrument.instagramUrl },
    { label: "Facebook", href: instrument.facebookUrl },
    { label: "YouTube", href: instrument.youtubeUrl },
    { label: "Reverb", href: instrument.reverbUrl },
    { label: "Shop", href: instrument.shopUrl },
    ...(instrument.customLinks || []).map((link) => ({ label: link.label, href: link.url }))
  ].filter((link) => link.href);

  return (
    <main className="scan-profile">
      <section className="scan-shell">
        <div className="scan-topbar">
          <button aria-label="Menu"><Menu size={30} /></button>
          <div className="scan-brand">QR<span>guitar</span></div>
          <button aria-label="Share"><Share2 size={24} /></button>
        </div>

        <section className="scan-hero" style={heroStyle}>
          <div className="builder-mark">
            <strong>{instrument.brand || "QRguitar"}</strong>
            <span>{instrument.model || instrument.instrumentType || "Instrument"}</span>
          </div>
          <h1>{instrumentDisplayName(instrument)}</h1>
          <div className="verified-badge">
            <ShieldCheck size={23} />
            <span>{isVerifiedRecord ? "Verified Identity" : "Unverified Record"}</span>
          </div>
        </section>

        <section className="identity-card">
          <div className="identity-grid">
            {specs.map((spec) => (
              <Meta label={spec.label} value={spec.value || "Not listed"} key={spec.label} />
            ))}
          </div>
          <div className="scan-qr">
            <ProfileQr code={instrument.qrCode} />
            <div>
              <strong>Scan to view</strong>
              <span>qrguitar.com/i/{instrument.qrCode.toLowerCase()}</span>
            </div>
          </div>
        </section>

        <section className="scan-actions" aria-label="Profile actions">
          <Action icon={<Repeat2 />} label="Transfer Ownership" active={activeTab === "ownership"} onClick={() => setActiveTab("ownership")} />
          <Action icon={<Clock3 />} label="View History" active={activeTab === "timeline"} onClick={() => setActiveTab("timeline")} />
          <Action icon={<Image />} label="Media" active={activeTab === "media"} onClick={() => setActiveTab("media")} />
          <Action icon={<Download />} label="Certificate" active={activeTab === "documents"} onClick={() => setActiveTab("documents")} />
        </section>

        <nav className="scan-tabs" aria-label="Instrument profile sections">
          {profileTabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : undefined}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              key={tab.id}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <ProfilePanel
          activeTab={activeTab}
          instrument={instrument}
          specs={specs}
          optionalSpecs={optionalSpecs}
          profileLinks={profileLinks}
          galleryImages={galleryImages}
          marketEstimate={marketEstimate}
        />

        {galleryImages.length ? (
          <section className="public-gallery" aria-label="Instrument photo gallery">
            <div>
              <span className="mini-eyebrow">Media</span>
              <h2>Photos</h2>
            </div>
            <div className="public-gallery-grid">
              {galleryImages.map((imageUrl, index) => (
                <img src={imageUrl} alt={`${instrumentDisplayName(instrument)} photo ${index + 1}`} key={`${imageUrl}-${index}`} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="scan-tags" aria-label="Instrument badges">
          <span>One of One</span>
          <span>Handmade</span>
          <span>{instrument.location?.split(",")[0] || "Registered"}</span>
          <span>Verified</span>
          <span>Lifetime Record</span>
        </section>

        <nav className="scan-bottom-nav" aria-label="Mobile profile navigation">
          <button className={activeTab === "overview" ? "active" : undefined} type="button" onClick={() => setActiveTab("overview")}><Home size={24} />Overview</button>
          <button className={activeTab === "specs" ? "active" : undefined} type="button" onClick={() => setActiveTab("specs")}><SlidersHorizontal size={24} />Specs</button>
          <button className={activeTab === "timeline" ? "active" : undefined} type="button" onClick={() => setActiveTab("timeline")}><Clock3 size={24} />Timeline</button>
          <button className={activeTab === "media" ? "active" : undefined} type="button" onClick={() => setActiveTab("media")}><Image size={24} />Media</button>
          <button className={activeTab === "ownership" ? "active" : undefined} type="button" onClick={() => setActiveTab("ownership")}><UserCircle size={24} />Owner</button>
        </nav>
      </section>
    </main>
  );
}

function ProfilePanel({
  activeTab,
  instrument,
  specs,
  optionalSpecs,
  profileLinks,
  galleryImages,
  marketEstimate
}: {
  activeTab: ProfileTab;
  instrument: DemoInstrument;
  specs: Array<{ label: string; value?: string }>;
  optionalSpecs: Array<{ label: string; value?: string }>;
  profileLinks: Array<{ label: string; href?: string }>;
  galleryImages: string[];
  marketEstimate: MarketEstimate;
}) {
  if (activeTab === "specs") {
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<SlidersHorizontal />} label="Specifications" title="Serial, build specs, setup measurements, and custom fields." />
        <div className="profile-data-grid">
          {[...specs, ...optionalSpecs].map((spec) => (
            <span key={spec.label}><strong>{spec.label}</strong>{spec.value || "Not listed"}</span>
          ))}
        </div>
      </section>
    );
  }

  if (activeTab === "timeline") {
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<Clock3 />} label="Timeline" title="Key events attached to this instrument record." />
        <div className="timeline-list">
          <TimelineItem date="June 2026" title="Build completed" copy={`${instrument.brand} finished ${instrumentDisplayName(instrument)} and attached the first QRguitar record.`} />
          <TimelineItem date="June 2026" title="Delivered to Cranston Guitars" copy="Retail listing, floor tag, case card, photos, and buyer handoff use the same permanent record." />
          <TimelineItem date="Future sale" title="Ownership transfer available" copy="The buyer can claim the record so warranty notes, documents, and service history stay with the instrument." />
        </div>
      </section>
    );
  }

  if (activeTab === "ownership") {
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<Repeat2 />} label="Ownership" title="Builder, retailer, owner, and future buyer are tied to the same record." />
        <div className="ownership-grid">
          <span><strong>Current owner</strong>{instrument.owner || "Unclaimed"}</span>
          <span><strong>Builder</strong>{instrument.builder || "Not listed"}</span>
          <span><strong>Retail shop</strong>Cranston Guitars</span>
          <span><strong>Transfer status</strong>Ready for buyer claim</span>
        </div>
        <CollaborationThread />
      </section>
    );
  }

  if (activeTab === "media") {
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<Image />} label="Media" title="Photos and videos that document condition, originality, and included items." />
        {galleryImages.length ? (
          <div className="public-gallery-grid">
            {galleryImages.map((imageUrl, index) => (
              <img src={imageUrl} alt={`${instrumentDisplayName(instrument)} photo ${index + 1}`} key={`${imageUrl}-${index}`} />
            ))}
          </div>
        ) : (
          <div className="media-placeholder-grid">
            <span>No main photo uploaded</span>
            <span>No detail photos uploaded</span>
            <span>No demo video linked</span>
            <span>No condition photos attached</span>
          </div>
        )}
      </section>
    );
  }

  if (activeTab === "repairs") {
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<MessageCircle />} label="Repairs" title="Service notes for setup work, electronics, fretwork, inspections, and warranty claims." />
        <div className="timeline-list">
          <TimelineItem date="Setup card" title="Factory setup" copy="10-46 strings, low action, intonated June 2026." />
          <TimelineItem date="Service log" title="Repair notes" copy="Fretwork, electronics changes, warranty work, and inspection photos should be added with dates and shop names." />
        </div>
        <CollaborationThread compact />
      </section>
    );
  }

  if (activeTab === "documents") {
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<FileText />} label="Documents" title="Receipts, build sheets, warranty terms, certificates, and case paperwork." />
        <div className="document-list">
          <DocumentItem title="QRguitar certificate" copy="Printable certificate showing the permanent QRguitar record ID." />
          <DocumentItem title="Build spec sheet" copy="Pickup set, wiring, neck shape, finish, weight, and setup measurements." />
          <DocumentItem title="Warranty record" copy="Builder warranty terms, claim status, repair approvals, and service notes." />
          <DocumentItem title="Receipts and case candy" copy="Receipts, manuals, appraisals, hang tags, certificates, and supporting paperwork." />
        </div>
      </section>
    );
  }

  return (
    <section className="scan-tab-panel scan-overview">
      <div>
        <h2>About this instrument</h2>
        <p>{instrument.summary}</p>
        <div className="profile-market-card">
          <span><DollarSign size={16} /> Market estimate</span>
          <strong>{formatMoney(marketEstimate.low)} - {formatMoney(marketEstimate.high)}</strong>
          <p>
            Fair center: {formatMoney(marketEstimate.fair)}. Based on {marketEstimate.compCount} sold/manual comps entered for this demo.
            Not an official appraisal.
          </p>
        </div>
        {optionalSpecs.length ? (
          <div className="public-spec-list">
            {optionalSpecs.slice(0, 6).map((spec) => (
              <span key={spec.label}><strong>{spec.label}</strong>{spec.value}</span>
            ))}
          </div>
        ) : null}
        {profileLinks.length ? (
          <div className="public-link-list">
            {profileLinks.map((link) => (
              <a href={link.href} target="_blank" rel="noreferrer" key={link.label}>{link.label}</a>
            ))}
          </div>
        ) : null}
      </div>
      <div className="maker-signature">
        <strong>{instrument.brand?.slice(0, 1) || "P"}</strong>
        <span>{instrument.brand || "Proper Instruments"}</span>
        <em>{instrument.builder ? "Verified Builder" : "Verified Record"}</em>
      </div>
    </section>
  );
}

function PanelHeader({ icon, label, title }: { icon: ReactNode; label: string; title: string }) {
  return (
    <div className="panel-header">
      <span>{icon}{label}</span>
      <h2>{title}</h2>
    </div>
  );
}

function TimelineItem({ date, title, copy }: { date: string; title: string; copy: string }) {
  return (
    <article className="timeline-item">
      <span>{date}</span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  );
}

function CollaborationThread({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "collaboration-thread compact" : "collaboration-thread"}>
      <div className="panel-header">
        <span><MessageCircle size={18} /> Record discussion</span>
        <h2>Builder, shop, repair staff, and owner notes stay attached to this instrument.</h2>
      </div>
      <div className="message-list">
        <Message role="Builder" name="Proper Instruments" copy="Warranty card and original setup are attached. Contact us before any finish work." />
        <Message role="Retailer" name="Cranston Guitars" copy="Buyer asked about pickup output and case contents. Spec sheet and photos are attached in Documents." />
        <Message role="Owner" name="Future owner" copy="Claim link received. Service notes, receipts, and transfer history can stay with the record after purchase." />
      </div>
    </div>
  );
}

function Message({ role, name, copy }: { role: string; name: string; copy: string }) {
  return (
    <article className="message-item">
      <span>{role}</span>
      <strong>{name}</strong>
      <p>{copy}</p>
    </article>
  );
}

function DocumentItem({ title, copy }: { title: string; copy: string }) {
  return (
    <article className="document-item">
      <FileText size={22} />
      <div>
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
      <button type="button">View</button>
    </article>
  );
}

function ProfileQr({ code }: { code: string }) {
  const [dataUrl, setDataUrl] = useState("");
  const profilePath = `/i/${code}`;

  useEffect(() => {
    let cancelled = false;
    const url = typeof window === "undefined" ? profilePath : `${window.location.origin}${profilePath}`;

    QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 180,
      color: {
        dark: "#f8f6f2",
        light: "#071014"
      }
    }).then((generated) => {
      if (!cancelled) {
        setDataUrl(generated);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, profilePath]);

  return (
    <div className="qr-placeholder" aria-label={`QR code for ${code}`}>
      {dataUrl ? <img src={dataUrl} alt={`QR code for ${code}`} /> : <QrCode size={52} />}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="identity-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Action({ icon, label, active, onClick }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button className={active ? "active" : undefined} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

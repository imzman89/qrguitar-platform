"use client";

import {
  ArrowLeft,
  Clock3,
  Download,
  Copy,
  FileText,
  Home,
  Image,
  MessageCircle,
  QrCode,
  Repeat2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  X
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "../../../components/BrandLogo";
import { RecordShareButton } from "../../../components/RecordShareButton";
import {
  getDemoTransfers,
  getInstrumentVerificationStatus,
  type DemoTransfer,
  instrumentDisplayName,
  type DemoInstrument,
  type ServiceHistoryEntry
} from "../../../lib/local-demo";
import { formatRecordLocation } from "../../../lib/record-location";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";

type ProfileTab = "overview" | "specs" | "timeline" | "ownership" | "media" | "repairs" | "documents";

const profileTabs: Array<{ id: ProfileTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "specs", label: "Specifications" },
  { id: "timeline", label: "Timeline" },
  { id: "media", label: "Media" },
  { id: "documents", label: "Documents" }
];

export function ProfileClient({ code: codeParam, initialInstrument }: { code: string; initialInstrument: DemoInstrument | null }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [stored, setStored] = useState<DemoInstrument | null>(initialInstrument);
  const [resolved, setResolved] = useState(true);
  const [transfers, setTransfers] = useState<DemoTransfer[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [shareNotice, setShareNotice] = useState<"idle" | "copied" | "failed">("idle");
  const [actionNotice, setActionNotice] = useState<"transfer" | "documents" | "owner" | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [activeMedia, setActiveMedia] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const code = codeParam || initialInstrument?.qrCode || "";
  const queryTab = searchParams.get("tab");
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  const switchTab = (tab: ProfileTab) => {
    setActiveTab(tab);
    setActiveMedia(null);

    if (typeof window !== "undefined" && router) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    }
  };

  useEffect(() => {
    let cancelled = false;
    setResolved(Boolean(initialInstrument));
    setStored(initialInstrument);

    async function loadInstrument() {
      const normalizedCode = String(code || "").trim().toUpperCase();

      let settled = false;

      const markResolved = (nextRecord: DemoInstrument | null, allowUpdate = false) => {
        if (cancelled || (settled && !allowUpdate)) {
          return;
        }
        settled = true;
        setStored(nextRecord);
        setTransfers(
          nextRecord
            ? getDemoTransfers().filter((transfer) => transfer.guitarQrCode.toUpperCase() === nextRecord.qrCode.toUpperCase())
            : []
        );
        setResolved(true);
      };

      const fallbackNow = () => {
        markResolved(null);
      };

      const timeout = setTimeout(() => {
        if (!cancelled && !settled) {
          fallbackNow();
        }
      }, 1800);

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1800);

        const response = await fetch(`/api/instruments?code=${encodeURIComponent(normalizedCode)}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => null)) as
          | ({ ok?: boolean; instrument?: DemoInstrument; message?: string } | null)
          | null;

        clearTimeout(timer);
        clearTimeout(timeout);

        if (!cancelled) {
          if (response.ok && payload?.ok && payload.instrument) {
            markResolved(payload.instrument, true);
          } else if (!settled) {
            markResolved(null);
          }
        }
      } catch {
        clearTimeout(timeout);
        if (!cancelled && !settled) {
          fallbackNow();
        }
      }
    }

    void loadInstrument();

    return () => {
      cancelled = true;
    };
  }, [code, initialInstrument]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setCurrentUserEmail(data.session?.user.email?.toLowerCase() || ""));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserEmail(session?.user.email?.toLowerCase() || "");
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const instrument = useMemo<DemoInstrument | null>(() => {
    if (stored) {
      return {
        ...stored,
        qrCode: (stored.qrCode || code).toUpperCase(),
        permanentPath: stored.permanentPath || `/i/${(stored.qrCode || code).toUpperCase()}`,
        name: stored.name || "",
        brand: stored.brand || "",
        model: stored.model || "",
        serial: stored.serial || "",
        year: stored.year || "",
        instrumentType: stored.instrumentType || "",
        builder: stored.builder || "",
        owner: stored.owner || "Unclaimed",
        location: stored.location || "",
        summary: stored.summary || "",
        finish: stored.finish || "",
        bodyWood: stored.bodyWood || "",
        neckWood: stored.neckWood || "",
        pickups: stored.pickups || "",
        instrumentCondition: stored.instrumentCondition === "new" ? "new" : "used",
        creatorAccountType: stored.creatorAccountType || "customer",
        verificationStatus: stored.verificationStatus || "unverified",
        authenticityStatus: stored.authenticityStatus || "unconfirmed",
        showVerificationBadge: stored.showVerificationBadge !== false,
        showAuthenticityBadge: stored.showAuthenticityBadge !== false,
        publicVerificationNote: stored.publicVerificationNote || "",
        publicAuthenticityNote: stored.publicAuthenticityNote || "",
        safetyStatus: stored.safetyStatus === "lost" || stored.safetyStatus === "stolen" || stored.safetyStatus === "recovered" ? stored.safetyStatus : "clear",
        publicSafetyNote: stored.publicSafetyNote || "",
        safetyStatusUpdatedAt: stored.safetyStatusUpdatedAt || "",
        heroImageDataUrl: stored.heroImageDataUrl || "",
        galleryImageDataUrls: stored.galleryImageDataUrls && stored.galleryImageDataUrls.length
          ? stored.galleryImageDataUrls
          : [],
        documentFiles: stored.documentFiles && stored.documentFiles.length
          ? stored.documentFiles
          : [],
        serviceEvents: stored.serviceEvents && stored.serviceEvents.length
          ? stored.serviceEvents
          : []
      };
    }

    return null;
  }, [code, stored]);

  const canEdit = Boolean(currentUserEmail && instrument?.ownerUserEmail && currentUserEmail === instrument.ownerUserEmail.toLowerCase());

  const galleryImages = instrument
    ? Array.from(
      new Set([instrument.heroImageDataUrl, ...(instrument.galleryImageDataUrls || [])].filter(Boolean) as string[])
    ).slice(0, 20)
    : [];
  const documentFiles = instrument
    ? (instrument.documentFiles || []).filter((file) => {
      if (instrument.visibility === "private") {
        return true;
      }

      return file.visibility === "public";
    })
    : [];
  const isVerifiedRecord = instrument ? getInstrumentVerificationStatus(instrument) === "verified" : false;
  const isAuthenticityConfirmed = instrument?.authenticityStatus === "confirmed";
  const showVerificationBadge = instrument?.showVerificationBadge !== false;
  const showAuthenticityBadge = instrument?.showAuthenticityBadge !== false;
  const safetyStatus = instrument?.safetyStatus === "lost" || instrument?.safetyStatus === "stolen" ? instrument.safetyStatus : "clear";
  const formattedLocation = instrument ? formatRecordLocation(instrument) : "";
  const transferMessage = "Owner-transfer tools are in beta. Contact support for manual help.";
  const latestTransfers = instrument
    ? [...transfers]
      .filter((transfer) => transfer.guitarQrCode.toUpperCase() === instrument.qrCode.toUpperCase())
      .sort((first, second) => Date.parse(second.createdAt || "") - Date.parse(first.createdAt || ""))
    : [];
  const latestTransfer = latestTransfers[0];

  useEffect(() => {
    if (!instrument) {
      return;
    }

    setMediaIndex(0);
  }, [instrument?.qrCode, galleryImages.length]);

  useEffect(() => {
    if (!instrument || typeof window === "undefined") {
      return;
    }

    setShareUrl(`${window.location.origin}${instrument.permanentPath}`);
  }, [instrument?.permanentPath]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("qrguitar-bot-context", {
        detail: {
          instrument,
          code: instrument?.qrCode
        }
      })
    );
  }, [instrument]);

  useEffect(() => {
    if (queryTab && (profileTabs.some((tab) => tab.id === queryTab))) {
      setActiveTab(queryTab as ProfileTab);
    }
  }, [queryTab]);

  if (!resolved) {
    return (
      <main className="scan-profile">
        <section className="scan-shell">
          <section className="scan-tab-panel" aria-label="Loading profile">
            <h2>Loading instrument profile</h2>
            <p>Checking the record now.</p>
          </section>
        </section>
      </main>
    );
  }

  if (!instrument) {
    return (
      <main className="scan-profile">
        <section className="scan-shell">
          <section className="scan-tab-panel" aria-label="Profile not found">
            <h2>Instrument profile not found</h2>
            <p>This QR code record has not been published yet.</p>
            <div className="scan-actions">
              <Action icon={<Home />} label="Go to homepage" onClick={() => router.push("/")} />
              <Action icon={<Download />} label="Browse catalog" onClick={() => router.push("/catalog")} />
            </div>
          </section>
        </section>
      </main>
    );
  }

  async function copyProfileUrl() {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus("copied");
      setShareNotice("copied");
      setTimeout(() => {
        setCopyStatus("idle");
        setShareNotice("idle");
      }, 1400);
    } catch {
      setCopyStatus("idle");
      setShareNotice("failed");
      setTimeout(() => setShareNotice("idle"), 1800);
    }
  }

  const specs = [
    { label: "Instrument ID", value: instrument.qrCode },
    ...(showVerificationBadge ? [{ label: "Verification", value: isVerifiedRecord ? "Verified by QRguitar" : "Unverified" }] : []),
    ...(showAuthenticityBadge ? [{ label: "Authenticity", value: isAuthenticityConfirmed ? "Authenticity Confirmed" : "Authenticity Unconfirmed" }] : []),
    { label: "Owner", value: publicOwnerDisplay(instrument) },
    { label: "Built", value: instrument.year || "Unknown" },
    { label: "Make / Model", value: [instrument.brand, instrument.model].filter(Boolean).join(" ") },
    { label: "Serial / Build ID", value: instrument.serial },
    { label: "Builder", value: instrument.builder || "Not listed" },
    { label: "Location", value: formattedLocation || "Not listed" }
  ];

  const stalePublicValues = new Set(["custom reptile finish", "custom offset", "alder", "maple neck, rosewood board"]);

  const optionalSpecs = [
    { label: "Type", value: instrument.instrumentType },
    { label: "Finish", value: instrument.finish },
    { label: "Body", value: instrument.bodyWood },
    { label: "Neck", value: instrument.neckWood },
    { label: "Pickups", value: instrument.pickups },
    ...(instrument.customFields || [])
  ].filter((spec) => {
    const value = String(spec.value || "").trim();
    return value && !stalePublicValues.has(value.toLowerCase());
  });

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
          <button type="button" aria-label="Back to homepage" onClick={() => router.push("/")}>
            <ArrowLeft size={24} />
          </button>
          <BrandLogo className="scan-brand" />
          <RecordShareButton className="scan-share-button" code={instrument.qrCode} title={instrumentDisplayName(instrument)} />
        </div>

        <section className="scan-hero">
          <div className="scan-hero-media">
            {instrument.heroImageDataUrl ? (
              <img src={instrument.heroImageDataUrl} alt={`${instrumentDisplayName(instrument)} main photo`} />
            ) : (
              <div className="scan-hero-empty">No main photo yet</div>
            )}
          </div>
          <div className="scan-hero-info">
            <div className="builder-mark">
              <strong>{instrument.brand || "QRguitar"}</strong>
              <span>{instrument.model || instrument.instrumentType || "Instrument"}</span>
            </div>
            <h1>{instrumentDisplayName(instrument)}</h1>
            <div className="verified-badge">
              {showVerificationBadge ? (
                <span><ShieldCheck size={20} /> {isVerifiedRecord ? "Verified by QRguitar" : "Unverified"}</span>
              ) : null}
              {showAuthenticityBadge ? (
                <span><ShieldCheck size={20} /> {isAuthenticityConfirmed ? "Authenticity Confirmed" : "Authenticity Unconfirmed"}</span>
              ) : null}
            </div>
          </div>
        </section>

        {safetyStatus === "lost" || safetyStatus === "stolen" ? (
          <section className={`scan-safety-alert scan-safety-alert--${safetyStatus}`} aria-label={`Reported ${safetyStatus}`}>
            <strong>{safetyStatus === "lost" ? "Reported Lost" : "Reported Stolen"}</strong>
            <p>
              {safetyStatus === "lost"
                ? "This instrument has been marked lost by the current record owner."
                : "This instrument has been marked stolen by the current record owner."}
            </p>
            {instrument.publicSafetyNote ? <p>{instrument.publicSafetyNote}</p> : null}
          </section>
        ) : null}

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
              <span>{shareUrl ? shareUrl.replace(/^https?:\/\//, "") : `qrguitar.com/i/${instrument.qrCode.toLowerCase()}`}</span>
            </div>
            <button className="button secondary" type="button" onClick={copyProfileUrl}>
              <Copy size={14} />
              {copyStatus === "copied" ? "Copied" : "Copy URL"}
            </button>
          </div>
          {shareNotice === "failed" ? (
            <small className="scan-copy-notice">Copy failed. You can copy the URL from your browser bar.</small>
          ) : null}
        </section>

        {showVerificationBadge && isVerifiedRecord ? (
          <section className="scan-action-panel" aria-label="Verification note">
            <div>
              <span className="scan-action-icon"><ShieldCheck size={16} /> Verified by QRguitar</span>
              <p>{instrument.publicVerificationNote || "Verified by QRguitar means this record has been reviewed for identity, ownership, build details, photos, documents, or provenance details available at the time of review. It is not a guarantee of future condition."}</p>
            </div>
          </section>
        ) : null}

        {showAuthenticityBadge && isAuthenticityConfirmed ? (
          <section className="scan-action-panel" aria-label="Authenticity note">
            <div>
              <span className="scan-action-icon"><ShieldCheck size={16} /> Authenticity Confirmed</span>
              <p>{instrument.publicAuthenticityNote || "Authenticity Confirmed means QRguitar reviewed available evidence supporting the instrument's identity and authenticity at the time of review. It is not a guarantee against hidden issues, future changes, or undisclosed modifications."}</p>
            </div>
          </section>
        ) : null}

        {canEdit ? (
        <section className="scan-actions" aria-label="Owner profile actions">
          {canEdit ? (
            <Action
              icon={<SlidersHorizontal />}
              label="Edit Profile"
              onClick={() => {
                router.push(`/edit/${instrument.qrCode}`);
              }}
            />
          ) : null}
          {canEdit ? (
            <Action
              icon={<Repeat2 />}
              label="Ownership Tools"
              active={activeTab === "ownership"}
              onClick={() => {
                switchTab("ownership");
                setActionNotice("transfer");
              }}
            />
          ) : null}
        </section>
        ) : null}

        {actionNotice ? (
          <section className="scan-action-panel" role="status" aria-live="polite">
            <div>
              {actionNotice === "transfer" ? (
                <>
                  <span className="scan-action-icon"><Share2 size={16} /> Ownership tools are in beta</span>
                  <p>This record is ready for future owner-change support. For launch, contact support@qrguitar.com if you need manual help with an ownership change.</p>
                </>
              ) : null}
              {actionNotice === "documents" ? (
                <>
                  <span className="scan-action-icon"><FileText size={16} /> Documents and proof</span>
                  <p>Public files appear here for buyers and shops. The owner controls which records stay private and which files are visible.</p>
                </>
              ) : null}
              {actionNotice === "owner" ? (
                <>
                  <span className="scan-action-icon"><ShieldCheck size={16} /> Owner/admin access required</span>
                  <p>Only the owner or admin can edit this record right now. Sign in as a record owner to make changes.</p>
                </>
              ) : null}
            </div>
            <button className="button secondary" type="button" onClick={() => setActionNotice(null)}><X size={14} />Close</button>
          </section>
        ) : null}

        <nav className="scan-tabs" aria-label="Instrument profile sections">
          {profileTabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : undefined}
              type="button"
              onClick={() => {
                setActionNotice(null);
                switchTab(tab.id);
              }}
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
          documentFiles={documentFiles}
          mediaIndex={mediaIndex}
          onPickMedia={setMediaIndex}
          onOpenMedia={setActiveMedia}
          onDocumentView={() => setActionNotice("documents")}
          transferMessage={transferMessage}
          latestTransfer={latestTransfer}
          isVerifiedRecord={isVerifiedRecord}
          serviceEvents={instrument.serviceEvents || []}
        />

        <section className="scan-tags" aria-label="Instrument badges">
          <span>{instrument.visibility === "private" ? "Private" : "Public"}</span>
          <span>{instrument.instrumentCondition ? instrument.instrumentCondition.toUpperCase() : "USED"}</span>
          <span>{formattedLocation || "Registered"}</span>
          {safetyStatus === "lost" ? <span>Reported Lost</span> : null}
          {safetyStatus === "stolen" ? <span>Reported Stolen</span> : null}
          {showVerificationBadge ? <span>{isVerifiedRecord ? "Verified by QRguitar" : "Unverified"}</span> : null}
          {showAuthenticityBadge ? <span>{isAuthenticityConfirmed ? "Authenticity Confirmed" : "Authenticity Unconfirmed"}</span> : null}
        </section>

        {activeMedia ? (
          <div className="media-overlay" role="dialog" aria-label="Media preview">
            <div className="media-overlay-backdrop" onClick={() => setActiveMedia(null)} />
            <section className="media-overlay-content">
              <button className="media-overlay-close" type="button" onClick={() => setActiveMedia(null)}>
                <X size={14} /> Close
              </button>
              <img src={activeMedia} alt={`${instrumentDisplayName(instrument)} preview`} />
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function publicOwnerDisplay(instrument: DemoInstrument) {
  const owner = String(instrument.owner || "").trim();
  const personalFallback = /^(gary|greg|owner)$/i.test(owner);

  if (!owner || personalFallback) {
    return instrument.builder || instrument.brand || "Unclaimed";
  }

  return owner;
}

function ProfilePanel({
  activeTab,
  instrument,
  specs,
  optionalSpecs,
  profileLinks,
  galleryImages,
  documentFiles,
  mediaIndex,
  onPickMedia,
  onOpenMedia,
  onDocumentView,
  transferMessage,
  latestTransfer,
  isVerifiedRecord,
  serviceEvents
}: {
  activeTab: ProfileTab;
  instrument: DemoInstrument;
  specs: Array<{ label: string; value?: string }>;
  optionalSpecs: Array<{ label: string; value?: string }>;
  profileLinks: Array<{ label: string; href?: string }>;
  galleryImages: string[];
  documentFiles: Array<{ name: string; url: string }>;
  mediaIndex: number;
  onPickMedia: (index: number) => void;
  onOpenMedia: (imageUrl: string) => void;
  onDocumentView: () => void;
  transferMessage: string;
  latestTransfer?: DemoTransfer;
  isVerifiedRecord: boolean;
  serviceEvents: ServiceHistoryEntry[];
}) {
  if (activeTab === "specs") {
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<SlidersHorizontal />} label="Specifications" title="Build details, setup notes, and serial info." />
        <div className="profile-data-grid">
          {[...specs, ...optionalSpecs].map((spec) => (
            <span key={spec.label}><strong>{spec.label}</strong>{spec.value || "Not listed"}</span>
          ))}
        </div>
      </section>
    );
  }

  if (activeTab === "timeline") {
    const createdDate = formatProfileDate(instrument.createdAt);
    const transferDate = latestTransfer ? formatProfileDate(latestTransfer.createdAt) : null;
    const publicServiceEvents = serviceEvents.filter((entry) => entry.isPublic);

    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<Clock3 />} label="Timeline" title="The record stays useful as the instrument moves through the world." />
        <div className="timeline-list">
          <TimelineItem date={createdDate} title="Record created" copy={`${instrument.brand} attached this instrument identity for ${instrumentDisplayName(instrument)}.`} />
          {publicServiceEvents.map((entry) => (
            <TimelineItem
              date={formatProfileDate(entry.serviceDate || entry.createdAt)}
              title={entry.title}
              copy={[
                entry.eventType,
                entry.publicDescription,
                [entry.shopName, entry.location].filter(Boolean).join(" · ")
              ].filter(Boolean).join(" · ")}
              key={entry.id}
            />
          ))}
          {latestTransfer ? (
            <TimelineItem
              date={transferDate || "Pending"}
              title="Ownership transfer started"
              copy={
                latestTransfer.status === "accepted"
                  ? `Ownership was accepted by ${latestTransfer.toName || latestTransfer.toEmail}.`
                  : `An ownership-change claim was started for ${latestTransfer.toName || latestTransfer.toEmail}.`
              }
            />
          ) : null}
          {!publicServiceEvents.length ? (
            <TimelineItem date="Ongoing" title="No public service history yet." copy="Setups, repairs, inspections, and maintenance can be added by the owner or admin." />
          ) : null}
        </div>
      </section>
    );
  }

  if (activeTab === "ownership") {
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<Repeat2 />} label="Ownership" title="Brand, retailer, owner, and future buyer stay connected around the same instrument." />
        <div className="ownership-grid">
          <span><strong>Current owner</strong>{instrument.owner || "Unclaimed"}</span>
          <span><strong>Builder</strong>{instrument.builder || "Not listed"}</span>
          <span><strong>Visibility</strong>{instrument.visibility === "private" ? "Private record" : "Public record"}</span>
                </div>
                <EmptyPanel
                  title="Transfer tools live here."
                  copy={transferMessage}
                />
      </section>
    );
  }

  if (activeTab === "media") {
    const selectedMedia = galleryImages[mediaIndex] || "";
    const hasMultipleMedia = galleryImages.length > 1;

    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<Image />} label="Media" title="Photos and videos that help a buyer, shop, or owner understand the instrument." />
        {galleryImages.length ? (
          <div className="media-preview-panel">
            {selectedMedia ? (
              <button
                className="media-preview-button"
                type="button"
                onClick={() => onOpenMedia(selectedMedia)}
                aria-label="Open selected media in larger view"
              >
                <img src={selectedMedia} className="media-preview" alt={`${instrumentDisplayName(instrument)} preview`} />
              </button>
            ) : null}
            {hasMultipleMedia ? (
              <div className="public-gallery-grid">
                {galleryImages.map((imageUrl, index) => (
                  <button
                    type="button"
                    className={mediaIndex === index ? "active" : undefined}
                    onClick={() => {
                      onPickMedia(index);
                      onOpenMedia(imageUrl);
                    }}
                    aria-label={`Select media ${index + 1}`}
                    key={`${imageUrl}-${index}`}
                  >
                    <img src={imageUrl} alt={`${instrumentDisplayName(instrument)} photo ${index + 1}`} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="media-placeholder-grid">
            <span>No media uploaded yet.</span>
            <span>Use the dashboard tool to add photos and documents.</span>
          </div>
        )}
      </section>
    );
  }

  if (activeTab === "repairs") {
    const serviceNotes = optionalSpecs.filter((spec) => /service|setup|repair/i.test(spec.label));

    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<MessageCircle />} label="Repairs" title="A repair bench can see what happened before and add what happened today." />
        {serviceNotes.length ? (
          <div className="profile-data-grid">
            {serviceNotes.map((spec) => (
              <span key={spec.label}><strong>{spec.label}</strong>{spec.value || "Not listed"}</span>
            ))}
          </div>
        ) : (
          <EmptyPanel
            title="No repair history posted yet."
            copy="Setup work, repairs, fretwork, electronics changes, and inspection notes can be added here as the instrument is serviced."
          />
        )}
      </section>
    );
  }

  if (activeTab === "documents") {
    const hasVisibleDocuments = documentFiles.length > 0;
    const isPrivateListing = instrument.visibility === "private";
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<FileText />} label="Documents" title="The important paperwork follows the instrument." />
        {hasVisibleDocuments ? (
          <div className="document-list">
            {documentFiles.map((file, index) => (
              <DocumentItem key={`${file.name}-${index}`} title={file.name} copy="Tap to open the file." href={file.url} />
            ))}
          </div>
        ) : isPrivateListing ? (
          <div className="media-placeholder-grid">
            <span>No documents uploaded yet.</span>
            <span>Private listings keep paperwork with the owner until it is shared.</span>
          </div>
        ) : (
          <div className="media-placeholder-grid">
            <span>No public documents posted yet.</span>
            <span>Owners can mark certificates, receipts, or spec sheets as public later.</span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="scan-tab-panel scan-overview">
      <div>
        <h2>About this instrument</h2>
        <p>{instrument.summary || "This QRguitar record keeps the core facts, media, paperwork, and ownership history with the instrument."}</p>
        {optionalSpecs.length ? (
          <div className="public-spec-list">
            {optionalSpecs.map((spec) => (
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
        <em>{isVerifiedRecord ? "Verified" : "Unverified"}</em>
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

function EmptyPanel({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="collaboration-thread compact">
      <div className="panel-header">
        <span><MessageCircle size={18} /> Record note</span>
        <h2>{title}</h2>
      </div>
      <p>{copy}</p>
    </div>
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

function formatProfileDate(value?: string) {
  if (!value) {
    return "Date unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="identity-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Action({ icon, label, active, disabled, onClick }: { icon: ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className={[active ? "active" : undefined, disabled ? "disabled" : undefined].filter(Boolean).join(" ") || undefined}
      type="button"
      disabled={Boolean(disabled)}
      onClick={onClick}
      aria-disabled={disabled || false}
      title={disabled ? `${label} is owner/admin only` : undefined}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function DocumentItem({ title, copy, onView, href }: { title: string; copy: string; onView?: () => void; href?: string }) {
  return (
    <article className="document-item">
      <FileText size={22} />
      <div>
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="button secondary">
          View
        </a>
      ) : (
        <button type="button" onClick={() => onView?.()} disabled={!onView} className={!onView ? "disabled" : undefined}>
          {onView ? "View" : "Coming soon"}
        </button>
      )}
    </article>
  );
}

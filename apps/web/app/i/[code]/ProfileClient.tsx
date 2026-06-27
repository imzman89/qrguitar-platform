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
  UserCircle,
  X
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "../../../components/BrandLogo";
import {
  defaultQrStyle,
  demoInstrument,
  getDemoTransfers,
  findDemoInstrument,
  getInstrumentVerificationStatus,
  type DemoTransfer,
  instrumentDisplayName,
  type DemoInstrument
} from "../../../lib/local-demo";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";

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
  const code = codeParam || initialInstrument?.qrCode || demoInstrument.qrCode;
  const isDemoRecord = code.toUpperCase() === demoInstrument.qrCode.toUpperCase();
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
      const normalizedCode = String(code || fallbackInstrument.qrCode).trim().toUpperCase();
      const localRecord = findDemoInstrument(normalizedCode);
      const demoFallback = localRecord ?? (isDemoRecord ? fallbackInstrument : null);
      const hasFallbackFromDemo = Boolean(demoFallback);
      const shouldFallback = hasFallbackFromDemo;
      const queryHasContext = Boolean(searchParams.get("name") || searchParams.get("brand") || searchParams.get("serial"));

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
        if (isDemoRecord && demoFallback) {
          markResolved(demoFallback);
          return;
        }

        if (!queryHasContext) {
          markResolved(null);
        } else {
          markResolved(null);
        }
      };

      const timeout = setTimeout(() => {
        if (!cancelled && !settled) {
          fallbackNow();
        }
      }, 1800);

      if (!initialInstrument && demoFallback) {
        markResolved(demoFallback);
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1800);

        const response = await fetch(`/api/instruments?code=${encodeURIComponent(normalizedCode)}`, { signal: controller.signal });
        const payload = (await response.json().catch(() => null)) as
          | ({ ok?: boolean; instrument?: DemoInstrument; message?: string } | null)
          | null;

        clearTimeout(timer);
        clearTimeout(timeout);

        if (!cancelled) {
          if (response.ok && payload?.ok && payload.instrument) {
            markResolved(payload.instrument, true);
          } else if (!settled && shouldFallback && demoFallback) {
            markResolved(demoFallback);
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
  }, [code, isDemoRecord, searchParams, initialInstrument]);

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
        qrCode: (stored.qrCode || fallbackInstrument.qrCode).toUpperCase(),
        permanentPath: stored.permanentPath || `/i/${(stored.qrCode || fallbackInstrument.qrCode).toUpperCase()}`,
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
        verificationStatus: stored.verificationStatus || (isDemoRecord ? "verified" : "unverified"),
        heroImageDataUrl: stored.heroImageDataUrl || (isDemoRecord ? fallbackInstrument.heroImageDataUrl : ""),
        galleryImageDataUrls: stored.galleryImageDataUrls && stored.galleryImageDataUrls.length
          ? stored.galleryImageDataUrls
          : isDemoRecord
            ? fallbackInstrument.galleryImageDataUrls
            : [],
        documentFiles: stored.documentFiles && stored.documentFiles.length
          ? stored.documentFiles
          : isDemoRecord
            ? fallbackInstrument.documentFiles
            : []
      };
    }

    if (isDemoRecord) {
      return fallbackInstrument;
    }

    if (!searchParams.get("name") && !searchParams.get("brand") && !searchParams.get("serial")) {
      return null;
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
      documentFiles: fallbackInstrument.documentFiles,
      qrStyle: defaultQrStyle,
      createdAt: fallbackInstrument.createdAt
    };
  }, [code, isDemoRecord, searchParams, stored]);

  const canEdit = Boolean(currentUserEmail && instrument?.ownerUserEmail && currentUserEmail === instrument.ownerUserEmail.toLowerCase());

  const heroStyle = instrument?.heroImageDataUrl
    ? ({ "--scan-hero-image": `url("${instrument.heroImageDataUrl}")` } as CSSProperties)
    : undefined;
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
  const transferMessage = "Ownership handoff support is in beta. Contact support for manual help.";
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
    { label: "Status", value: isVerifiedRecord ? "Verified record" : "Unverified record" },
    { label: "Owner", value: instrument.owner || "Unclaimed" },
    { label: "Built", value: instrument.year || "Unknown" },
    { label: "Make / Model", value: [instrument.brand, instrument.model].filter(Boolean).join(" ") },
    { label: "Serial / Build ID", value: instrument.serial },
    { label: "Builder", value: instrument.builder || "Not listed" },
    { label: "Transfer policy", value: "Ownership handoff support is in beta." },
    { label: "Location", value: instrument.location || "Not listed" }
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
          <button type="button" aria-label="Share this profile" onClick={copyProfileUrl}>
            <Share2 size={24} />
          </button>
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

        <section className="scan-actions" aria-label="Profile actions">
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
          <Action icon={<Clock3 />} label="View History" active={activeTab === "timeline"} onClick={() => {
            setActionNotice(null);
            switchTab("timeline");
          }} />
          <Action
            icon={<Image />}
            label="Media"
            active={activeTab === "media"}
            onClick={() => {
              setActionNotice(null);
              switchTab("media");
              setMediaIndex(0);
            }}
          />
          <Action icon={<Download />} label="Certificate" active={activeTab === "documents"} onClick={() => {
            setActionNotice("documents");
            switchTab("documents");
          }} />
        </section>

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
        />

        <section className="scan-tags" aria-label="Instrument badges">
          <span>{instrument.visibility === "private" ? "Private" : "Public"}</span>
          <span>{instrument.instrumentCondition ? instrument.instrumentCondition.toUpperCase() : "USED"}</span>
          <span>{instrument.location?.split(",")[0] || "Registered"}</span>
          <span>{isVerifiedRecord ? "Verified" : "Unverified"}</span>
          <span>{transferMessage}</span>
        </section>

        <nav className="scan-bottom-nav" aria-label="Mobile profile navigation">
          <button className={activeTab === "overview" ? "active" : undefined} type="button" onClick={() => switchTab("overview")}><Home size={24} />Overview</button>
          <button className={activeTab === "specs" ? "active" : undefined} type="button" onClick={() => switchTab("specs")}><SlidersHorizontal size={24} />Specs</button>
          <button className={activeTab === "timeline" ? "active" : undefined} type="button" onClick={() => switchTab("timeline")}><Clock3 size={24} />Timeline</button>
          <button className={activeTab === "media" ? "active" : undefined} type="button" onClick={() => switchTab("media")}><Image size={24} />Media</button>
          <button className={activeTab === "ownership" ? "active" : undefined} type="button" onClick={() => switchTab("ownership")}><UserCircle size={24} />Owner</button>
        </nav>

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
  latestTransfer
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

    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<Clock3 />} label="Timeline" title="The record stays useful as the instrument moves through the world." />
        <div className="timeline-list">
          <TimelineItem date={createdDate} title="Record created" copy={`${instrument.brand} attached this instrument identity for ${instrumentDisplayName(instrument)}.`} />
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
          <TimelineItem date="Ongoing" title="Service and ownership updates" copy="Repair notes, service events, and ownership-change activity stay with this record." />
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
                  <span><strong>Transfer policy</strong>{transferMessage}</span>
                </div>
                <EmptyPanel
                  title="Transfer tools live here."
                  copy="Ownership handoff support is in beta. For now, keep transfer records private until the handoff is accepted."
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

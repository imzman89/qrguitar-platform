"use client";

import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Download,
  Copy,
  FileText,
  Home,
  Image as ImageIcon,
  MessageCircle,
  QrCode,
  Repeat2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  X
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "../../../components/BrandLogo";
import { buildProfileIdentityFields, ProfileIdentity } from "../../../components/ProfileIdentity";
import { ProfileStatusBadges } from "../../../components/ProfileStatusBadges";
import { RecordShareButton } from "../../../components/RecordShareButton";
import {
  getInstrumentVerificationStatus,
  type DemoTransfer,
  type ExternalMediaItem,
  instrumentDisplayName,
  type DemoInstrument,
  type ServiceHistoryEntry
} from "../../../lib/local-demo";
import { formatRecordLocation } from "../../../lib/record-location";
import { fetchPublishedSiteSettings, normalizeBrandLogoKey } from "../../../lib/site-settings";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../../lib/supabase-browser";
import { resolveInstrumentPresentation } from "../../../lib/instrument-profile-contract";
import { getContentValue } from "../../../lib/content-registry";

type ProfileTab = "overview" | "specs" | "timeline" | "service" | "ownership" | "media" | "repairs" | "documents";
const PROFILE_FETCH_TIMEOUT_MS = 28000;

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
  const galleryDialogRef = useRef<HTMLElement | null>(null);
  const galleryTriggerRef = useRef<HTMLElement | null>(null);
  const galleryTouchStartX = useRef<number | null>(null);
  const heroPointerStartX = useRef<number | null>(null);
  const heroThumbnailRailRef = useRef<HTMLDivElement | null>(null);
  const heroThumbnailDragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number } | null>(null);
  const heroThumbnailDidDragRef = useRef(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({});
  const [publicContent, setPublicContent] = useState<Record<string, string>>({});
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
      const pathCode =
        typeof window !== "undefined" ? decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() || "") : "";
      const normalizedCode = String(code || pathCode || "").trim().toUpperCase();

      let settled = false;

      const markResolved = (nextRecord: DemoInstrument | null, allowUpdate = false) => {
        if (cancelled || (settled && !allowUpdate)) {
          return;
        }
        settled = true;
        setStored(nextRecord);
        setResolved(true);
      };

      const fallbackNow = () => {
        markResolved(null);
      };

      const timeout = setTimeout(() => {
        if (!cancelled && !settled) {
          fallbackNow();
        }
      }, PROFILE_FETCH_TIMEOUT_MS);

      try {
        let lastStatus = 0;
        let foundInstrument: DemoInstrument | null = null;

        for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), PROFILE_FETCH_TIMEOUT_MS);

          try {
            const response = await fetch(`/api/instruments?code=${encodeURIComponent(normalizedCode)}`, {
              cache: "no-store",
              headers: { "Cache-Control": "no-cache" },
              signal: controller.signal
            });
            lastStatus = response.status;
            const payload = (await response.json().catch(() => null)) as
              | ({ ok?: boolean; instrument?: DemoInstrument; message?: string } | null)
              | null;

            if (response.ok && payload?.ok && payload.instrument) {
              foundInstrument = payload.instrument;
              break;
            }

            if (response.status === 404) {
              break;
            }
          } finally {
            clearTimeout(timer);
          }

          await new Promise((resolve) => setTimeout(resolve, 750));
        }

        clearTimeout(timeout);

        if (!cancelled) {
          if (foundInstrument) {
            markResolved(foundInstrument, true);
          } else if (!settled || lastStatus === 404) {
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
    let cancelled = false;

    async function loadOwnerContext() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (cancelled) return;

      setCurrentUserEmail(session?.user.email?.toLowerCase() || "");
      if (!session) {
        setTransfers([]);
        return;
      }

      const token = session.access_token || await getSupabaseAccessToken();
      if (!token || cancelled) return;

      const [recordResponse, transferResponse] = await Promise.all([
        fetch(`/api/instruments?scope=mine&code=${encodeURIComponent(code)}`, {
          cache: "no-store",
          headers: { authorization: `Bearer ${token}` }
        }),
        fetch("/api/transfers?scope=mine", {
          cache: "no-store",
          headers: { authorization: `Bearer ${token}` }
        })
      ]);

      const recordPayload = (await recordResponse.json().catch(() => null)) as { ok?: boolean; instruments?: DemoInstrument[] } | null;
      const transferPayload = (await transferResponse.json().catch(() => null)) as { ok?: boolean; transfers?: DemoTransfer[] } | null;

      if (cancelled) return;
      const ownerInstrument = recordPayload?.instruments?.[0];
      if (recordResponse.ok && recordPayload?.ok && ownerInstrument) {
        setStored(ownerInstrument);
      }
      setTransfers((transferResponse.ok && transferPayload?.ok ? transferPayload.transfers || [] : [])
        .filter((transfer) => transfer.guitarQrCode.toUpperCase() === code.toUpperCase()));
    }

    void loadOwnerContext();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserEmail(session?.user.email?.toLowerCase() || "");
      if (!session) {
        setTransfers([]);
        return;
      }
      void loadOwnerContext();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [code]);

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
        timelineEvents: stored.timelineEvents && stored.timelineEvents.length
          ? stored.timelineEvents
          : stored.serviceEvents || [],
        serviceEvents: stored.serviceEvents && stored.serviceEvents.length
          ? stored.serviceEvents
          : [],
        externalMedia: stored.externalMedia && stored.externalMedia.length ? stored.externalMedia : []
      };
    }

    return null;
  }, [code, stored]);

  const canEdit = Boolean(currentUserEmail && instrument?.ownerUserEmail && currentUserEmail === instrument.ownerUserEmail.toLowerCase());
  const canSubmitService = Boolean(currentUserEmail && instrument && !canEdit && instrument.visibility !== "private");

  const presentation = useMemo(
    () => instrument ? resolveInstrumentPresentation(instrument, "public") : null,
    [instrument]
  );
  const galleryImages = useMemo(() => presentation?.photos || [], [presentation?.photos]);
  const documentFiles = presentation?.documents || [];
  const externalMedia = presentation?.supplementalMedia || [];
  const timelineEvents = presentation?.timelineEvents || [];
  const meaningfulTimelineEvents = presentation?.meaningfulTimelineEvents || [];
  const visibleTabs = useMemo<Array<{ id: ProfileTab; label: string; count?: number }>>(() => {
    const tabs: Array<{ id: ProfileTab; label: string; count?: number }> = [
      { id: "overview", label: getContentValue(publicContent, "profile.tabs.overview") },
      { id: "specs", label: getContentValue(publicContent, "profile.tabs.specifications") }
    ];

    if (presentation?.tabs.timeline) {
      tabs.push({
        id: "timeline",
        label: getContentValue(publicContent, "profile.tabs.timeline"),
        count: meaningfulTimelineEvents.length + Number(instrument?.ownershipTransferCount || 0)
      });
    }
    if (presentation?.tabs.service) {
      tabs.push({ id: "service", label: getContentValue(publicContent, "profile.tabs.service"), count: presentation.counts.service });
    }
    if (presentation?.tabs.media) {
      tabs.push({ id: "media", label: getContentValue(publicContent, "profile.tabs.media"), count: externalMedia.length });
    }
    if (presentation?.tabs.documents) {
      tabs.push({ id: "documents", label: getContentValue(publicContent, "profile.tabs.documents"), count: documentFiles.length });
    }

    return tabs;
  }, [
    documentFiles.length,
    externalMedia.length,
    instrument?.ownershipTransferCount,
    meaningfulTimelineEvents.length,
    presentation?.counts.service,
    presentation?.tabs.documents,
    presentation?.tabs.media,
    presentation?.tabs.service,
    presentation?.tabs.timeline,
    publicContent
  ]);
  const isVerifiedRecord = instrument ? getInstrumentVerificationStatus(instrument) === "verified" : false;
  const isAuthenticityConfirmed = instrument?.authenticityStatus === "confirmed";
  const showVerificationBadge = instrument?.showVerificationBadge !== false;
  const showAuthenticityBadge = instrument?.showAuthenticityBadge !== false;
  const safetyStatus = instrument?.safetyStatus === "lost" || instrument?.safetyStatus === "stolen" ? instrument.safetyStatus : "clear";
  const formattedLocation = instrument ? formatRecordLocation(instrument) : "";
  const transferMessage = canEdit
    ? "Use your dashboard to send a secure transfer email. The recipient signs in with that email and accepts the claim; this QRguitar ID stays with the instrument."
    : "Ownership can change without changing the permanent QRguitar ID tied to this instrument.";
  const latestTransfers = instrument
    ? [...transfers]
      .filter((transfer) => transfer.guitarQrCode.toUpperCase() === instrument.qrCode.toUpperCase())
      .sort((first, second) => Date.parse(second.createdAt || "") - Date.parse(first.createdAt || ""))
    : [];
  const latestTransfer = latestTransfers[0];

  const instrumentQrCode = instrument?.qrCode;
  const instrumentPermanentPath = instrument?.permanentPath;

  useEffect(() => {
    if (!instrumentQrCode) {
      return;
    }

    setMediaIndex(0);
  }, [instrumentQrCode, galleryImages.length]);

  useEffect(() => {
    if (!instrumentPermanentPath || typeof window === "undefined") {
      return;
    }

    setShareUrl(`${window.location.origin}${instrumentPermanentPath}`);
  }, [instrumentPermanentPath]);

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
    if (queryTab && visibleTabs.some((tab) => tab.id === queryTab)) {
      setActiveTab(queryTab as ProfileTab);
      return;
    }

    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, queryTab, visibleTabs]);

  useEffect(() => {
    let cancelled = false;
    fetchPublishedSiteSettings().then((settings) => {
      if (!cancelled) {
        setBrandLogos(settings?.brandLogos || {});
        setPublicContent(settings?.content || {});
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const activeThumbnail = heroThumbnailRailRef.current?.querySelector<HTMLElement>(".active");
    activeThumbnail?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });

    [galleryImages[mediaIndex - 1], galleryImages[mediaIndex + 1]].filter(Boolean).forEach((source) => {
      const image = new window.Image();
      image.src = source;
    });
  }, [galleryImages, mediaIndex]);

  useEffect(() => {
    if (!activeMedia) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    galleryDialogRef.current?.focus();

    const currentIndex = Math.max(0, galleryImages.indexOf(activeMedia));
    [galleryImages[currentIndex - 1], galleryImages[currentIndex + 1]].filter(Boolean).forEach((source) => {
      const image = new window.Image();
      image.src = source;
    });

    function movePhoto(direction: 1 | -1) {
      const currentIndex = Math.max(0, galleryImages.indexOf(activeMedia || ""));
      const nextIndex = direction > 0
        ? (currentIndex >= galleryImages.length - 1 ? 0 : currentIndex + 1)
        : (currentIndex <= 0 ? galleryImages.length - 1 : currentIndex - 1);
      setActiveMedia(galleryImages[nextIndex]);
      setMediaIndex(nextIndex);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveMedia(null);
      }
      if (event.key === "ArrowRight" && galleryImages.length > 1) {
        movePhoto(1);
      }
      if (event.key === "ArrowLeft" && galleryImages.length > 1) {
        movePhoto(-1);
      }
      if (event.key === "Tab" && galleryDialogRef.current) {
        const focusable = Array.from(
          galleryDialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      galleryTriggerRef.current?.focus();
    };
  }, [activeMedia, galleryImages]);

  useEffect(() => {
    if (!activeMedia) return;
    const activeThumbnail = galleryDialogRef.current?.querySelector<HTMLElement>(".media-gallery-strip .active");
    activeThumbnail?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeMedia]);

  function openGallery(imageUrl: string) {
    galleryTriggerRef.current = document.activeElement as HTMLElement | null;
    setActiveMedia(imageUrl);
  }

  function moveHeroPhoto(direction: -1 | 1) {
    if (galleryImages.length < 2) return;
    setMediaIndex((current) => (current + direction + galleryImages.length) % galleryImages.length);
  }

  if (!resolved) {
    return (
      <main className="scan-profile">
        <section className="scan-shell">
          <section className="scan-tab-panel" aria-label="Loading profile">
            <h2>Loading instrument profile</h2>
            <p>Checking the Profile now.</p>
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
            <p>This QRguitar Profile has not been published.</p>
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

  const trustItems = [
    showVerificationBadge && isVerifiedRecord
      ? {
          label: getContentValue(publicContent, "profile.verification.title"),
          note: instrument.publicVerificationNote || getContentValue(publicContent, "profile.verification.body")
        }
      : null,
    showAuthenticityBadge && isAuthenticityConfirmed
      ? {
          label: getContentValue(publicContent, "profile.authenticity.title"),
          note: instrument.publicAuthenticityNote || getContentValue(publicContent, "profile.authenticity.body")
        }
      : null
  ].filter((item): item is { label: string; note: string } => Boolean(item));

  const stalePublicValues = new Set(["custom offset", "alder", "maple neck, rosewood board"]);
  const identityValues = {
    qrGuitarId: instrument.qrCode,
    brand: instrument.brand,
    model: instrument.model,
    serialNumber: instrument.serial,
    showSerial: Boolean(instrument.serial),
    noSerialNumber: instrument.serialExceptionApproved && !instrument.serial,
    year: instrument.year,
    location: formattedLocation,
    type: instrument.instrumentType,
    availability: instrument.saleStatus === "for_sale" ? "For Sale" : "Not for Sale"
  };
  const specs = buildProfileIdentityFields(identityValues);

  const optionalSpecs = [
    ...(instrument.originalityStatus && instrument.originalityStatus !== "unknown"
      ? [{ label: "Originality", value: instrument.originalityStatus === "all_original" ? "All Original" : "Modified" }]
      : []),
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
  const officialBrandLogoUrl = instrument.brand ? brandLogos[normalizeBrandLogoKey(instrument.brand)] || "" : "";

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
          <section
            className="scan-hero-gallery"
            aria-label={getContentValue(publicContent, "profile.gallery.label")}
            onPointerDown={(event) => {
              heroPointerStartX.current = event.clientX;
            }}
            onPointerUp={(event) => {
              const start = heroPointerStartX.current;
              heroPointerStartX.current = null;
              if (start == null || Math.abs(event.clientX - start) < 48) return;
              moveHeroPhoto(event.clientX < start ? 1 : -1);
            }}
          >
            <div className="scan-hero-media-frame">
              <button
                className="scan-hero-media"
                type="button"
                onClick={() => {
                  if (galleryImages.length) {
                    openGallery(galleryImages[mediaIndex]);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    moveHeroPhoto(event.key === "ArrowRight" ? 1 : -1);
                  }
                }}
                disabled={!galleryImages.length}
                aria-label={galleryImages.length ? `Open ${instrumentDisplayName(instrument)} photo ${mediaIndex + 1} in fullscreen` : undefined}
              >
                {galleryImages[mediaIndex] ? (
                  <img src={galleryImages[mediaIndex]} alt={`${instrumentDisplayName(instrument)} photo ${mediaIndex + 1} of ${galleryImages.length}`} />
                ) : (
                  <div className="scan-hero-empty">No main photo yet</div>
                )}
                {galleryImages.length ? (
                  <span className="scan-hero-photo-count">
                    {mediaIndex + 1}/{galleryImages.length}
                  </span>
                ) : null}
              </button>
              {galleryImages.length > 1 ? (
                <div className="scan-hero-gallery-controls">
                  <button type="button" onClick={() => moveHeroPhoto(-1)} aria-label={getContentValue(publicContent, "profile.gallery.previous")}>
                    <ArrowLeft size={18} />
                  </button>
                  <button type="button" onClick={() => moveHeroPhoto(1)} aria-label={getContentValue(publicContent, "profile.gallery.next")}>
                    <ArrowRight size={18} />
                  </button>
                </div>
              ) : null}
            </div>
            {galleryImages.length > 1 ? (
              <div
                className="scan-hero-thumbnails"
                ref={heroThumbnailRailRef}
                aria-label="Choose a photograph"
                onWheel={(event) => {
                  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
                  event.currentTarget.scrollLeft += event.deltaX;
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== "mouse") return;
                  event.stopPropagation();
                  heroThumbnailDidDragRef.current = false;
                  heroThumbnailDragRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    scrollLeft: event.currentTarget.scrollLeft
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = heroThumbnailDragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  if (Math.abs(event.clientX - drag.startX) > 6) {
                    heroThumbnailDidDragRef.current = true;
                  }
                  event.currentTarget.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
                }}
                onPointerUp={(event) => {
                  if (event.pointerType !== "mouse") return;
                  event.stopPropagation();
                  heroThumbnailDragRef.current = null;
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
                onPointerCancel={() => {
                  heroThumbnailDragRef.current = null;
                  heroThumbnailDidDragRef.current = false;
                }}
              >
                {galleryImages.map((imageUrl, index) => (
                  <button
                    className={index === mediaIndex ? "active" : undefined}
                    type="button"
                    onClick={() => {
                      if (heroThumbnailDidDragRef.current) {
                        heroThumbnailDidDragRef.current = false;
                        return;
                      }
                      setMediaIndex(index);
                    }}
                    aria-label={`Show photo ${index + 1} of ${galleryImages.length}`}
                    aria-current={index === mediaIndex ? "true" : undefined}
                    key={`${imageUrl}-${index}`}
                  >
                    <img src={imageUrl} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : null}
          </section>
          <div className="scan-hero-info">
            <div className="builder-mark">
              <span>{instrument.brand || "QRguitar"}</span>
            </div>
            <h1>{instrumentDisplayName(instrument)}</h1>
            {instrument.publicCollection ? (
              <Link className="profile-collection-link" href={`/collections/${instrument.publicCollection.handle}`}>
                {getContentValue(publicContent, "profile.attribution.collection")} {instrument.publicCollection.publicName}
              </Link>
            ) : null}
            <ProfileStatusBadges
              record={{
                ...instrument,
                showVerificationBadge,
                showAuthenticityBadge
              }}
              includeCondition={false}
              className="profile-hero-badges"
            />
          </div>
        </section>

        {safetyStatus === "lost" || safetyStatus === "stolen" ? (
          <section className={`scan-safety-alert scan-safety-alert--${safetyStatus}`} aria-label={`Reported ${safetyStatus}`}>
            <strong>{safetyStatus === "lost" ? "Reported Lost" : "Reported Stolen"}</strong>
            <p>
              {safetyStatus === "lost"
                ? "This instrument has been marked lost by the current owner."
                : "This instrument has been marked stolen by the current owner."}
            </p>
            {isDistinctSafetyNote(instrument.publicSafetyNote, safetyStatus) ? <p>{instrument.publicSafetyNote}</p> : null}
          </section>
        ) : null}

        <ProfileIdentity
          values={identityValues}
          excludeLabels={["Make / Model"]}
          mediaSummary={[
            galleryImages.length ? `${galleryImages.length} ${galleryImages.length === 1 ? "photo" : "photos"}` : "",
            documentFiles.length ? `${documentFiles.length} ${documentFiles.length === 1 ? "document" : "documents"}` : ""
          ].filter(Boolean).join(" / ")}
        >
          {trustItems.length ? (
            <div className="profile-trust-summary" aria-label="Trust review">
              {trustItems.map((item) => (
                <details key={item.label}>
                  <summary><ShieldCheck size={15} /> {item.label}</summary>
                  <p>{item.note}</p>
                </details>
              ))}
            </div>
          ) : null}
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
        </ProfileIdentity>

        {!canEdit ? (
          <aside className="profile-claim-entry" aria-label="Ownership help">
            <div>
              <strong>Need ownership help?</strong>
              <span>Scanning the QR code never changes ownership. Start a private request when the current owner cannot send a transfer.</span>
            </div>
            <Link className="button secondary" href={`/ownership-claim?code=${encodeURIComponent(instrument.qrCode)}`}>Start ownership request</Link>
          </aside>
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
                router.push("/dashboard");
              }}
            />
          ) : null}
        </section>
        ) : null}

        {canSubmitService ? (
          <section className="scan-actions" aria-label="Service provider actions">
            <Action
              icon={<Wrench />}
              label="Submit service record"
              onClick={() => router.push(`/service-work/${instrument.qrCode}`)}
            />
          </section>
        ) : null}

        {actionNotice ? (
          <section className="scan-action-panel" role="status" aria-live="polite">
            <div>
              {actionNotice === "transfer" ? (
                <>
                  <span className="scan-action-icon"><Share2 size={16} /> Ownership tools are in beta</span>
                  <p>Contact support@qrguitar.com if you need help with an ownership change.</p>
                </>
              ) : null}
              {actionNotice === "documents" ? (
                <>
                  <span className="scan-action-icon"><FileText size={16} /> Documents</span>
                  <p>Public files appear here for buyers and shops. The owner controls which files stay private and which are public.</p>
                </>
              ) : null}
              {actionNotice === "owner" ? (
                <>
                  <span className="scan-action-icon"><ShieldCheck size={16} /> Owner/admin access required</span>
                  <p>Only the owner or admin can edit this profile. Sign in as the profile owner to make changes.</p>
                </>
              ) : null}
            </div>
            <button className="button secondary" type="button" onClick={() => setActionNotice(null)}><X size={14} />Close</button>
          </section>
        ) : null}

        <nav className="scan-tabs" aria-label="Instrument profile sections" role="tablist">
          {visibleTabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : undefined}
              data-profile-tab={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => {
                setActionNotice(null);
                switchTab(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const currentIndex = visibleTabs.findIndex((item) => item.id === tab.id);
                const direction = event.key === "ArrowRight" ? 1 : -1;
                const nextTab = visibleTabs[(currentIndex + direction + visibleTabs.length) % visibleTabs.length];
                switchTab(nextTab.id);
                requestAnimationFrame(() => {
                  document.querySelector<HTMLButtonElement>(`.scan-tabs button[data-profile-tab="${nextTab.id}"]`)?.focus();
                });
              }}
              key={tab.id}
            >
              {tab.label}{tab.count ? <span className="scan-tab-count">{tab.count}</span> : null}
            </button>
          ))}
        </nav>

          <ProfilePanel
          activeTab={activeTab}
          instrument={instrument}
          specs={specs}
          optionalSpecs={optionalSpecs}
          profileLinks={profileLinks}
          officialBrandLogoUrl={officialBrandLogoUrl}
          externalMedia={externalMedia}
          documentFiles={documentFiles}
          onDocumentView={() => setActionNotice("documents")}
          transferMessage={transferMessage}
          latestTransfer={latestTransfer}
          isVerifiedRecord={isVerifiedRecord}
          timelineEvents={timelineEvents}
          serviceEntries={presentation?.serviceEntries || []}
        />

        {activeMedia ? (
          <div className="media-overlay">
            <div className="media-overlay-backdrop" onClick={() => setActiveMedia(null)} />
            <section
              className="media-overlay-content media-gallery-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label="Media preview"
              tabIndex={-1}
              ref={galleryDialogRef}
              onTouchStart={(event) => { galleryTouchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
              onTouchEnd={(event) => {
                const start = galleryTouchStartX.current;
                const end = event.changedTouches[0]?.clientX;
                galleryTouchStartX.current = null;
                if (start == null || end == null || Math.abs(end - start) < 48 || galleryImages.length < 2) return;
                const currentIndex = Math.max(0, galleryImages.indexOf(activeMedia));
                const nextIndex = end < start
                  ? (currentIndex >= galleryImages.length - 1 ? 0 : currentIndex + 1)
                  : (currentIndex <= 0 ? galleryImages.length - 1 : currentIndex - 1);
                setActiveMedia(galleryImages[nextIndex]);
                setMediaIndex(nextIndex);
              }}
            >
              <header className="media-gallery-header">
                <strong>{instrumentDisplayName(instrument)}</strong>
                <span>{Math.max(1, galleryImages.indexOf(activeMedia) + 1)} / {galleryImages.length}</span>
                <button className="media-overlay-close" type="button" onClick={() => setActiveMedia(null)}>
                  <X size={14} /> Close
                </button>
              </header>
              <div className="media-gallery-stage">
                {galleryImages.length > 1 ? (
                  <button
                    className="media-gallery-nav media-gallery-nav--prev"
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => {
                      const currentIndex = Math.max(0, galleryImages.indexOf(activeMedia));
                      const nextIndex = currentIndex <= 0 ? galleryImages.length - 1 : currentIndex - 1;
                      setActiveMedia(galleryImages[nextIndex]);
                      setMediaIndex(nextIndex);
                    }}
                  >
                    Previous
                  </button>
                ) : null}
                <img src={activeMedia} alt={`${instrumentDisplayName(instrument)} preview`} />
                {galleryImages.length > 1 ? (
                  <button
                    className="media-gallery-nav media-gallery-nav--next"
                    type="button"
                    aria-label="Next photo"
                    onClick={() => {
                      const currentIndex = Math.max(0, galleryImages.indexOf(activeMedia));
                      const nextIndex = currentIndex >= galleryImages.length - 1 ? 0 : currentIndex + 1;
                      setActiveMedia(galleryImages[nextIndex]);
                      setMediaIndex(nextIndex);
                    }}
                  >
                    Next
                  </button>
                ) : null}
              </div>
              {galleryImages.length > 1 ? (
                <div className="media-gallery-strip" aria-label="Photo thumbnails">
                  {galleryImages.map((imageUrl, index) => (
                    <button
                      className={imageUrl === activeMedia ? "active" : undefined}
                      type="button"
                      onClick={() => {
                        setActiveMedia(imageUrl);
                        setMediaIndex(index);
                      }}
                      aria-label={`Open photo ${index + 1}`}
                      key={`${imageUrl}-lightbox-${index}`}
                    >
                      <img src={imageUrl} alt="" />
                    </button>
                  ))}
                </div>
              ) : null}
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

function hasMeaningfulPublicValue(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized && normalized !== "not listed" && normalized !== "unknown");
}

function ProfilePanel({
  activeTab,
  instrument,
  specs,
  optionalSpecs,
  profileLinks,
  externalMedia,
  documentFiles,
  officialBrandLogoUrl,
  onDocumentView,
  transferMessage,
  latestTransfer,
  isVerifiedRecord,
  timelineEvents,
  serviceEntries
}: {
  activeTab: ProfileTab;
  instrument: DemoInstrument;
  specs: Array<{ label: string; value?: string }>;
  optionalSpecs: Array<{ label: string; value?: string }>;
  profileLinks: Array<{ label: string; href?: string }>;
  externalMedia: ExternalMediaItem[];
  documentFiles: Array<{ name: string; url: string; documentType?: string; issuerSource?: string; documentDate?: string; description?: string; publicDescription?: string }>;
  officialBrandLogoUrl: string;
  onDocumentView: () => void;
  transferMessage: string;
  latestTransfer?: DemoTransfer;
  isVerifiedRecord: boolean;
  timelineEvents: ServiceHistoryEntry[];
  serviceEntries: ServiceHistoryEntry[];
}) {
  if (activeTab === "specs") {
    const visibleSpecs = [...specs, ...optionalSpecs].filter((spec) => hasMeaningfulPublicValue(spec.value));

    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<SlidersHorizontal />} label="Profile details" title="Specifications, setup notes, and Serial Number." />
        <div className="profile-data-grid">
          {visibleSpecs.map((spec) => (
            <span key={spec.label}><strong>{spec.label}</strong>{spec.value}</span>
          ))}
        </div>
      </section>
    );
  }

  if (activeTab === "timeline") {
    const createdDate = formatProfileDate(instrument.createdAt);
    const transferDate = latestTransfer ? formatProfileDate(latestTransfer.createdAt) : null;
    const publicTimelineEvents = timelineEvents.filter((entry) =>
      entry.isPublic &&
      !entry.isSystem &&
      !/^(qrguitar )?profile created$/i.test(entry.title.trim()) &&
      !serviceEntries.some((service) => service.id === entry.id)
    );
    const ownershipTransferCount = Math.max(0, Number(instrument.ownershipTransferCount || 0));

    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<Clock3 />} label="Timeline" title="Events recorded for this instrument." />
        <div className="timeline-list">
          {publicTimelineEvents.map((entry) => (
            <TimelineItem
              date={formatTimelineEntryDate(entry)}
              title={entry.title}
              copy={timelineEntryCopy(entry, false)}
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
          {ownershipTransferCount > 0 && !latestTransfer ? (
            <TimelineItem
              date="Recorded"
              title={`${ownershipTransferCount} ownership transfer${ownershipTransferCount === 1 ? "" : "s"} recorded`}
              copy="QRguitar keeps the permanent profile with the instrument while prior-owner details stay private."
            />
          ) : null}
          <div className="timeline-origin-marker">
            <Clock3 aria-hidden="true" />
            <span><strong>Profile created</strong>{createdDate}</span>
          </div>
        </div>
      </section>
    );
  }

  if (activeTab === "service") {
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<Wrench />} label="Service" title="Owner-approved work connected to this instrument." />
        <div className="timeline-list">
          {serviceEntries.map((entry) => (
            <TimelineItem
              date={formatTimelineEntryDate(entry)}
              title={entry.title}
              copy={timelineEntryCopy(entry, true)}
              key={entry.id}
            />
          ))}
        </div>
      </section>
    );
  }

  if (activeTab === "ownership") {
    const ownershipTransferCount = Math.max(0, Number(instrument.ownershipTransferCount || 0));
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<Repeat2 />} label="Ownership" title="Brand, retailer, owner, and future buyer stay connected around the same instrument." />
        <div className="ownership-grid">
          <span><strong>Current owner</strong>{instrument.owner || "Unclaimed"}</span>
          {instrument.builder ? <span><strong>Builder</strong>{instrument.builder}</span> : null}
          <span><strong>Recorded transfers</strong>{ownershipTransferCount || "None yet"}</span>
          <span><strong>Visibility</strong>{instrument.visibility === "private" ? "Private profile" : instrument.visibility === "unlisted" ? "Unlisted profile" : "Public profile"}</span>
                </div>
                <EmptyPanel
                  title="Ownership transfer"
                  copy={transferMessage}
                />
      </section>
    );
  }

  if (activeTab === "media") {
    return (
      <section className="scan-tab-panel">
        <PanelHeader icon={<ImageIcon />} label="Media" title="Public video, audio, and external media connected to this instrument." />
        <div className="external-media-grid">
          {externalMedia.map((item) => {
            const embedUrl = externalMediaEmbedUrl(item);
            return (
              <article className="external-media-card" key={item.id}>
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    title={item.title}
                    loading="lazy"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : null}
                <div>
                  <strong>{item.title}</strong>
                  {item.caption ? <p>{item.caption}</p> : null}
                  {!embedUrl ? <a href={item.canonicalUrl} target="_blank" rel="noreferrer">Open media</a> : null}
                </div>
              </article>
            );
          })}
        </div>
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
              <span key={spec.label}><strong>{spec.label}</strong>{spec.value}</span>
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
              <DocumentItem
                key={`${file.name}-${index}`}
                title={file.name}
                copy={[
                  file.documentType,
                  file.issuerSource ? `Source: ${file.issuerSource}` : "",
                  file.documentDate ? `Dated ${formatDocumentDate(file.documentDate)}` : "",
                  file.description || file.publicDescription || "Tap to open the file."
                ].filter(Boolean).join(" - ")}
                href={file.url}
              />
            ))}
          </div>
        ) : isPrivateListing ? (
          <div className="media-placeholder-grid">
            <span>No documents uploaded yet.</span>
            <span>Private listings keep paperwork with the owner until it is shared.</span>
          </div>
        ) : (
          <div className="media-placeholder-grid">
            <span>No public documents yet.</span>
            <span>Owners can mark certificates, receipts, or spec sheets as public later.</span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="scan-tab-panel scan-overview">
      <div>
        {meaningfulProfileSummary(instrument.summary) ? (
          <>
            <h2>About this instrument</h2>
            <p>{meaningfulProfileSummary(instrument.summary)}</p>
          </>
        ) : null}
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
      {instrument.brand ? (
        <div className={`maker-signature ${officialBrandLogoUrl ? "maker-signature--logo" : "maker-signature--text"}`}>
          {officialBrandLogoUrl ? <img src={officialBrandLogoUrl} alt={`${instrument.brand} official logo`} /> : <span>Brand</span>}
          <strong>{instrument.brand}</strong>
          <em>{isVerifiedRecord ? "Verified by QRguitar" : "Unverified"}</em>
        </div>
      ) : null}
    </section>
  );
}

function meaningfulProfileSummary(summary?: string | null) {
  const value = String(summary || "").trim();
  if (!value || /^QRguitar Profile with photos, specs, and instrument details\.?$/i.test(value)) {
    return "";
  }
  return value;
}

function isDistinctSafetyNote(note: string | undefined, status: string) {
  const value = String(note || "").trim();
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/[.!]+$/g, "");
  return normalized !== `this instrument has been reported ${status}` &&
    normalized !== `this instrument has been marked ${status} by the current owner`;
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
        <span><MessageCircle size={18} /> Profile note</span>
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
    return "Date not recorded";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatDocumentDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function formatTimelineEntryDate(entry: ServiceHistoryEntry) {
  if (entry.datePrecision === "unknown" || !entry.serviceDate) {
    return entry.createdAt && entry.isSystem ? formatProfileDate(entry.createdAt) : "Date not recorded";
  }

  if (entry.datePrecision === "year") {
    return entry.serviceDate.slice(0, 4);
  }

  const parsed = new Date(`${entry.serviceDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return entry.serviceDate;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: entry.datePrecision === "month" ? "long" : "short",
    year: "numeric",
    ...(entry.datePrecision === "day" ? { day: "numeric" } : {})
  }).format(parsed);
}

function serviceSourceLabel(entry: ServiceHistoryEntry) {
  if (entry.sourceKind === "provider_submitted_owner_approved") {
    const labels = ["Provider-submitted", "Owner-approved"];
    if (entry.providerVerifiedAt) labels.push("Verified Service Provider");
    if (entry.evidenceReviewedAt) labels.push("QRguitar-reviewed evidence");
    return labels.join(" - ");
  }
  return entry.isSystem ? "" : "Owner-reported service";
}

function timelineEntryCopy(entry: ServiceHistoryEntry, preferProvider: boolean) {
  const source = serviceSourceLabel(entry);
  const category = String(entry.category || entry.eventType || "").trim();
  const provider = String((preferProvider ? entry.providerDisplayName : "") || entry.shopName || "").trim();
  const location = String(entry.location || "").trim();
  const attribution = [provider, location].filter(Boolean).join(" in ");
  const context = [source, !/^other$/i.test(category) ? category : ""].filter(Boolean).join(" - ");

  return [context, entry.publicDescription, attribution].filter(Boolean).map((part) => {
    const value = String(part).trim();
    return /[.!?]$/.test(value) ? value : `${value}.`;
  }).join(" ");
}

function externalMediaEmbedUrl(item: ExternalMediaItem) {
  if (item.provider === "youtube" && item.providerId) {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.providerId)}`;
  }
  if (item.provider === "vimeo" && item.providerId) {
    return `https://player.vimeo.com/video/${encodeURIComponent(item.providerId)}`;
  }
  return "";
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
          {onView ? "View" : "Unavailable"}
        </button>
      )}
    </article>
  );
}

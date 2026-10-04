"use client";
import { useUiText } from "../../../components/UiTextProvider";


import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Download,
  Copy,
  FileText,
  Home,
  Image as ImageIcon,
  MessageCircle,
  Repeat2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  X
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "../../../components/BrandLogo";
import { CompactQr } from "../../../components/CompactQr";
import { FallbackImage } from "../../../components/FallbackImage";
import { PhotoViewer } from "../../../components/PhotoViewer";
import { buildProfileIdentityFields, ProfileIdentity } from "../../../components/ProfileIdentity";
import { ProfileStatusBadges } from "../../../components/ProfileStatusBadges";
import { RecordShareButton } from "../../../components/RecordShareButton";
import { SellerWebsiteLink } from "../../../components/SellerWebsiteLink";
import { MemberMessageLink } from "../../../components/MemberMessageLink";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  type DemoTransfer,
  type ExternalMediaItem,
  instrumentDisplayName,
  type DemoInstrument,
  type ServiceHistoryEntry
} from "../../../lib/local-demo";
import { formatRecordLocation } from "../../../lib/record-location";
import { fetchPublishedSiteSettings, normalizeBrandLogoKey } from "../../../lib/site-settings";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import { fetchOwnerProfile, OwnerProfileError } from "../../../lib/owner-profile";
import { resolveInstrumentPresentation } from "../../../lib/instrument-profile-contract";
import { getContentValue } from "../../../lib/content-registry";
import { publicProfileUrl } from "../../../lib/profile-url";
import { cleanProfileSupportingUrl, isPurchaseProfileLink } from "../../../lib/profile-purchase-link";
import { isSaleDetail, profileSaleOffer } from "../../../lib/profile-sale";
import { dispatchOptionalTrackingProductEvent, optionalTrackingProductEvents } from "../../../lib/optional-tracking-consent";
import { appendFailedImageSource, filterAvailableImageSources } from "../../../lib/image-fallback";
import { publicMediaVariantSrcSet, publicMediaVariantUrl } from "../../../lib/public-media-variant";
import { ProfileBreadcrumbs } from "./ProfileBreadcrumbs";
import styles from "./ProfileClient.module.css";

type ProfileTab = "overview" | "specs" | "timeline" | "service" | "ownership" | "media" | "repairs" | "documents";
const PROFILE_FETCH_TIMEOUT_MS = 28000;

export function ProfileClient({ code: codeParam, initialInstrument, ownerPreview = false }: { code: string; initialInstrument: DemoInstrument | null; ownerPreview?: boolean }) {
  const ui = useUiText("app.i.code.ProfileClient");
  const searchParams = useSearchParams();
  const router = useRouter();
  const [stored, setStored] = useState<DemoInstrument | null>(initialInstrument);
  const [ownerRecord, setOwnerRecord] = useState<DemoInstrument | null>(null);
  const [resolved, setResolved] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [transfers, setTransfers] = useState<DemoTransfer[]>([]);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [shareNotice, setShareNotice] = useState<"idle" | "copied" | "failed">("idle");
  const copyRevisionRef = useRef(0);
  const copyActiveRef = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [actionNotice, setActionNotice] = useState<"transfer" | "documents" | "owner" | null>(null);
  const [requestedMediaIndex, setMediaIndex] = useState(0);
  const [failedGalleryImages, setFailedGalleryImages] = useState<string[]>([]);
  const [activeMedia, setActiveMedia] = useState<string | null>(null);
  const heroGestureRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const heroDidSwipeRef = useRef(false);
  const heroThumbnailRailRef = useRef<HTMLDivElement | null>(null);
  const heroThumbnailDragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number } | null>(null);
  const heroThumbnailDidDragRef = useRef(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({});
  const [publicContent, setPublicContent] = useState<Record<string, string>>({});
  const code = codeParam || initialInstrument?.qrCode || "";
  const queryTab = searchParams.get("tab");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const trackedProfileView = useRef("");

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
    setProfileLoadError(false);

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
        if (cancelled) return;
        // A failed refresh must not erase a Profile already loaded by the server.
        settled = true;
        setProfileLoadError(true);
        setResolved(true);
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
            setProfileLoadError(false);
            markResolved(foundInstrument, true);
          } else if (lastStatus === 404) {
            setProfileLoadError(false);
            markResolved(null, true);
          } else {
            fallbackNow();
          }
        }
      } catch {
        clearTimeout(timeout);
        if (!cancelled && !settled) {
          fallbackNow();
        }
      }
    }

    if (!ownerPreview) void loadInstrument();

    return () => {
      cancelled = true;
    };
  }, [code, initialInstrument, loadAttempt, ownerPreview]);

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    let controller: AbortController | undefined;
    let supabase: ReturnType<typeof createBrowserSupabaseClient>;
    setOwnerRecord(null);
    setTransfers([]);
    setCurrentUserEmail("");
    try { supabase = createBrowserSupabaseClient(); }
    catch {
      if (ownerPreview) { setStored(null); setProfileLoadError(true); setResolved(true); }
      return;
    }

    async function loadOwnerContext(session: { access_token: string; user: { email?: string } } | null, authChanged = false) {
      const request = ++generation;
      controller?.abort();
      setOwnerRecord(null);
      setTransfers([]);
      setActiveMedia(null);
      if (ownerPreview && authChanged) setStored(null);
      setCurrentUserEmail(session?.user.email?.toLowerCase() || "");
      if (!session?.access_token) {
        if (ownerPreview) setStored(null);
        return;
      }
      const requestController = new AbortController();
      controller = requestController;
      const timer = setTimeout(() => requestController.abort(), PROFILE_FETCH_TIMEOUT_MS);
      try {
        const [recordResult, transferResult] = await Promise.allSettled([
          fetchOwnerProfile(code, session.access_token, requestController.signal),
          fetch("/api/transfers?scope=mine", {
            cache: "no-store", headers: { authorization: `Bearer ${session.access_token}` }, signal: requestController.signal
          }).then(async (response) => {
            const payload = await response.json().catch(() => null) as { ok?: boolean; transfers?: DemoTransfer[] } | null;
            return response.ok && payload?.ok && Array.isArray(payload.transfers) ? payload.transfers : [];
          })
        ]);
        if (cancelled || request !== generation) return;
        if (recordResult.status === "fulfilled") {
          setOwnerRecord(recordResult.value);
          setProfileLoadError(false);
          setResolved(true);
        } else if (ownerPreview) {
          setStored(null);
          setProfileLoadError(!(recordResult.reason instanceof OwnerProfileError && [401, 404].includes(recordResult.reason.status)));
          setResolved(true);
        }
        setTransfers((transferResult.status === "fulfilled" ? transferResult.value : [])
          .filter((transfer) => typeof transfer?.guitarQrCode === "string" && transfer.guitarQrCode.toUpperCase() === code.toUpperCase()));
      } catch {
        if (!cancelled && request === generation) {
          setTransfers([]);
          if (ownerPreview) { setOwnerRecord(null); setStored(null); setProfileLoadError(true); setResolved(true); }
        }
      } finally { clearTimeout(timer); }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && generation === 0) void loadOwnerContext(data.session);
    }).catch(() => {
      if (!cancelled && generation === 0 && ownerPreview) { setStored(null); setProfileLoadError(true); setResolved(true); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) void loadOwnerContext(session, true);
    });
    return () => { cancelled = true; generation++; controller?.abort(); listener.subscription.unsubscribe(); };
  }, [code, initialInstrument, ownerPreview, loadAttempt]);
  const instrument = useMemo<DemoInstrument | null>(() => {
    const candidate = ownerRecord || stored;
    const displayRecord = candidate?.qrCode?.toUpperCase() === code.toUpperCase() ? candidate : null;
    if (displayRecord) {
      return {
        ...displayRecord,
        qrCode: (displayRecord.qrCode || code).toUpperCase(),
        permanentPath: displayRecord.permanentPath || `/i/${(displayRecord.qrCode || code).toUpperCase()}`,
        name: displayRecord.name || "",
        brand: displayRecord.brand || "",
        model: displayRecord.model || "",
        serial: displayRecord.serial || "",
        year: displayRecord.year || "",
        instrumentType: displayRecord.instrumentType || "",
        builder: displayRecord.builder || "",
        owner: displayRecord.owner || "",
        location: displayRecord.location || "",
        summary: displayRecord.summary || "",
        finish: displayRecord.finish || "",
        bodyWood: displayRecord.bodyWood || "",
        neckWood: displayRecord.neckWood || "",
        pickups: displayRecord.pickups || "",
        instrumentCondition: displayRecord.instrumentCondition === "new" ? "new" : "used",
        creatorAccountType: displayRecord.creatorAccountType || "customer",
        verificationStatus: displayRecord.verificationStatus || "unverified",
        authenticityStatus: displayRecord.authenticityStatus || "unconfirmed",
        showVerificationBadge: displayRecord.showVerificationBadge !== false,
        showAuthenticityBadge: displayRecord.showAuthenticityBadge !== false,
        publicVerificationNote: displayRecord.publicVerificationNote || "",
        publicAuthenticityNote: displayRecord.publicAuthenticityNote || "",
        safetyStatus: displayRecord.safetyStatus === "lost" || displayRecord.safetyStatus === "stolen" || displayRecord.safetyStatus === "recovered" ? displayRecord.safetyStatus : "clear",
        publicSafetyNote: displayRecord.publicSafetyNote || "",
        safetyStatusUpdatedAt: displayRecord.safetyStatusUpdatedAt || "",
        heroImageDataUrl: displayRecord.heroImageDataUrl || "",
        galleryImageDataUrls: displayRecord.galleryImageDataUrls && displayRecord.galleryImageDataUrls.length
          ? displayRecord.galleryImageDataUrls
          : [],
        documentFiles: displayRecord.documentFiles && displayRecord.documentFiles.length
          ? displayRecord.documentFiles
          : [],
        timelineEvents: displayRecord.timelineEvents && displayRecord.timelineEvents.length
          ? displayRecord.timelineEvents
          : displayRecord.serviceEvents || [],
        serviceEvents: displayRecord.serviceEvents && displayRecord.serviceEvents.length
          ? displayRecord.serviceEvents
          : [],
        externalMedia: displayRecord.externalMedia && displayRecord.externalMedia.length ? displayRecord.externalMedia : []
      };
    }

    return null;
  }, [code, stored, ownerRecord]);

  const canEdit = Boolean(currentUserEmail && instrument?.ownerUserEmail && currentUserEmail === instrument.ownerUserEmail.toLowerCase());
  const canSubmitService = Boolean(currentUserEmail && instrument && !canEdit && instrument.visibility !== "private");

  const presentation = useMemo(
    () => instrument ? resolveInstrumentPresentation(instrument, ownerPreview || ownerRecord ? "owner" : "public") : null,
    [instrument, ownerPreview, ownerRecord]
  );
  const allGalleryImages = useMemo(() => presentation?.photos || [], [presentation?.photos]);
  const gallerySourceKey = allGalleryImages.join("\u001f");
  const galleryImages = useMemo(
    () => filterAvailableImageSources(allGalleryImages, failedGalleryImages),
    [allGalleryImages, failedGalleryImages]
  );
  const mediaIndex = Math.min(requestedMediaIndex, Math.max(0, galleryImages.length - 1));
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
  const shareUrl = instrumentQrCode ? publicProfileUrl(instrumentQrCode) : "";

  useEffect(() => {
    if (ownerPreview || !instrumentQrCode || !instrument || instrument.visibility === "private" || trackedProfileView.current === instrumentQrCode) return;
    trackedProfileView.current = instrumentQrCode;
    void dispatchOptionalTrackingProductEvent({
      name: optionalTrackingProductEvents.publicProfileViewed,
      properties: { visibility: instrument.visibility === "unlisted" ? "unlisted" : "public" }
    });
  }, [instrument, instrumentQrCode, ownerPreview]);

  useEffect(() => {
    const activeRef = copyActiveRef;
    const revisionRef = copyRevisionRef;
    const timerRef = copyTimerRef;
    activeRef.current = true;
    setCopyStatus("idle");
    setShareNotice("idle");
    return () => {
      activeRef.current = false;
      revisionRef.current++;
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      timerRef.current = undefined;
    };
  }, [shareUrl]);

  useEffect(() => {
    if (!instrumentQrCode) {
      return;
    }

    setMediaIndex(0);
    setFailedGalleryImages((current) => current.length ? [] : current);
    setActiveMedia(null);
  }, [instrumentQrCode, gallerySourceKey]);

  useEffect(() => {
    if (activeMedia && !galleryImages.includes(activeMedia)) {
      setActiveMedia(galleryImages[mediaIndex] || null);
    }
  }, [activeMedia, galleryImages, mediaIndex]);

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
    const activeThumbnail = heroThumbnailRailRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    activeThumbnail?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });

    [galleryImages[mediaIndex - 1], galleryImages[mediaIndex + 1]].filter(Boolean).forEach((source) => {
      const image = new window.Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.referrerPolicy = "no-referrer";
      const srcSet = publicMediaVariantSrcSet(source);
      if (srcSet) {
        image.srcset = srcSet;
        image.sizes = "(max-width: 900px) 360px, 720px";
      }
      image.src = publicMediaVariantUrl(source, 1200);
    });
  }, [galleryImages, mediaIndex]);

  function openGallery(imageUrl: string) {
    setActiveMedia(imageUrl);
  }

  function markGalleryImageFailed(imageUrl: string) {
    setFailedGalleryImages((current) => appendFailedImageSource(current, imageUrl));
  }

  function moveHeroPhoto(direction: -1 | 1) {
    if (galleryImages.length < 2) return;
    setMediaIndex((current) => {
      const safeCurrent = Math.min(current, galleryImages.length - 1);
      return (safeCurrent + direction + galleryImages.length) % galleryImages.length;
    });
  }

  if (!resolved) {
    return (
      <main className={styles["scan-profile"]}>
        <section className={styles["scan-shell"]}>
          <section className={styles["scan-tab-panel"]} aria-label={ui("ui.app.i.code.ProfileClient.3535ababfaeb", "Loading profile")}>
            <h2>{ui("ui.app.i.code.ProfileClient.d7e30b9a3297", "Loading instrument profile")}</h2>
            <p>{ui("ui.app.i.code.ProfileClient.dca536847bc1", "Checking the Profile now.")}</p>
          </section>
        </section>
      </main>
    );
  }

  if (!instrument) {
    return (
      <main className={styles["scan-profile"]}>
        <section className={styles["scan-shell"]}>
          <section className={styles["scan-tab-panel"]} aria-label={profileLoadError ? ui("ui.app.i.code.ProfileClient.158e5a22a48c", "Profile unavailable") : ui("ui.app.i.code.ProfileClient.999930725d06", "Profile not found")}>
            <h2>{profileLoadError ? ui("ui.app.i.code.ProfileClient.6dc65e966b93", "Profile temporarily unavailable") : ui("ui.app.i.code.ProfileClient.6cbb97fa27b9", "Instrument profile not found")}</h2>
            <p>{profileLoadError ? ui("ui.app.i.code.ProfileClient.7014d09f16ad", "We could not load this Profile. Please try again.") : ui("ui.app.i.code.ProfileClient.752375372cfd", "This QRguitar Profile has not been published.")}</p>
            {profileLoadError ? <button type="button" className="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{ui("ui.app.i.code.ProfileClient.d8b8392e2c54", "Try again")}</button> : null}
            <div className={styles["scan-actions"]}>
              <Action icon={<Home />} label={ui("ui.app.i.code.ProfileClient.c022da0f1a15", "Go to homepage")} onClick={() => router.push("/")} />
              <Action icon={<Download />} label={ui("ui.app.i.code.ProfileClient.4d05dc6da837", "Browse catalog")} onClick={() => router.push("/catalog")} />
            </div>
          </section>
        </section>
      </main>
    );
  }

  async function copyProfileUrl() {
    if (!shareUrl || !copyActiveRef.current) {
      return;
    }

    const attempt = ++copyRevisionRef.current;
    const isCurrent = () => copyActiveRef.current && copyRevisionRef.current === attempt;
    if (copyTimerRef.current !== undefined) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = undefined;
    setCopyStatus("idle");
    setShareNotice("idle");

    try {
      await navigator.clipboard.writeText(shareUrl);
      if (!isCurrent()) return;
      setCopyStatus("copied");
      setShareNotice("copied");
      copyTimerRef.current = setTimeout(() => {
        if (!isCurrent()) return;
        setCopyStatus("idle");
        setShareNotice("idle");
        copyTimerRef.current = undefined;
      }, 1400);
    } catch {
      if (!isCurrent()) return;
      setCopyStatus("idle");
      setShareNotice("failed");
      copyTimerRef.current = setTimeout(() => {
        if (!isCurrent()) return;
        setShareNotice("idle");
        copyTimerRef.current = undefined;
      }, 1800);
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

  const identityValues = {
    qrGuitarId: instrument.qrCode,
    brand: instrument.brand,
    model: instrument.model,
    serialNumber: presentation?.serialNumber || "",
    showSerial: Boolean(presentation?.serialNumber),
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
    ...(instrument.customFields || []).filter((field) => !isSaleDetail(field.label))
  ].filter((spec) => {
    const value = String(spec.value || "").trim();
    return Boolean(value);
  });

  const saleOffer = profileSaleOffer(instrument);
  const purchaseLink = saleOffer?.target;
  const profileLinks = [
    { label: "Website", href: instrument.websiteUrl },
    { label: "Instagram", href: instrument.instagramUrl },
    { label: "Facebook", href: instrument.facebookUrl },
    { label: "YouTube", href: instrument.youtubeUrl },
    { label: "Reverb", href: instrument.reverbUrl },
    { label: "Shop", href: instrument.shopUrl },
    ...(instrument.customLinks || []).map((link) => ({ label: link.label, href: link.url }))
  ].map((link) => ({ ...link, href: cleanProfileSupportingUrl(link.href) })).filter((link) => link.href && !isPurchaseProfileLink(link.label));
  const officialBrandLogoUrl = instrument.brand ? brandLogos[normalizeBrandLogoKey(instrument.brand)] || "" : "";

  return (
    <main className={styles["scan-profile"]}>
      <section className={styles["scan-shell"]}>
        {ownerPreview && instrument ? <div className={styles["profile-refresh-notice"]} role="status"><p><strong>{ui("ui.app.i.code.ProfileClient.cca6a9866dcc", "Owner preview.")}</strong> {instrument.visibility === "private" ? ui("ui.app.i.code.ProfileClient.b1eaa5bd6fae", "This Profile is private. Visitors cannot open its QR link.") : ui("ui.app.i.code.ProfileClient.43c30bfc7680", "You are viewing this Profile from your account.")}</p><Link className="button secondary" href={"/edit/" + encodeURIComponent(instrument.qrCode)}>{ui("ui.app.i.code.ProfileClient.fec2ac0f4cf1", "Edit Profile")}</Link><Link href="/dashboard">{ui("ui.app.i.code.ProfileClient.4466f3a00b0b", "Back to collection")}</Link></div> : null}
        {profileLoadError ? (
          <div className={styles["profile-refresh-notice"]} role="status">
            <p>{ui("ui.app.i.code.ProfileClient.6e8c3c83d96f", "This is the last loaded Profile. We could not check for updates.")}</p>
            <button type="button" className="button secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{ui("ui.app.i.code.ProfileClient.d8b8392e2c54", "Try again")}</button>
          </div>
        ) : null}
        <ProfileBreadcrumbs current={instrumentDisplayName(instrument)} />
        <div className={styles["scan-topbar"]}>
          <button type="button" aria-label={ownerPreview ? ui("ui.app.i.code.ProfileClient.4466f3a00b0b", "Back to collection") : ui("ui.app.i.code.ProfileClient.cb35f7332137", "Back to homepage")} onClick={() => router.push(ownerPreview ? "/dashboard" : "/")}>
            <ArrowLeft size={24} />
          </button>
          <BrandLogo className={styles["scan-brand"]} />
          <RecordShareButton className={styles["scan-share-button"]} code={instrument.qrCode} title={instrumentDisplayName(instrument)} />
        </div>

        <section className={styles["scan-hero"]}>
          <header className={styles["profile-heading"]}>
            <p className={styles["profile-kicker"]}>{[instrument.brand, instrument.year, instrument.instrumentType].filter(Boolean).join(" · ")}</p>
            <h1>{instrumentDisplayName(instrument)}</h1>
            <p className={styles["profile-condition"]}>
              <span>{ui("ui.app.i.code.ProfileClient.conditionLabel", "Condition")}</span>
              <strong>{getInstrumentCondition(instrument) === "new"
                ? ui("ui.app.i.code.ProfileClient.conditionNew", "New")
                : ui("ui.app.i.code.ProfileClient.conditionUsed", "Used")}</strong>
            </p>
            <ProfileStatusBadges
              record={{
                ...instrument,
                showVerificationBadge,
                showAuthenticityBadge
              }}
              includeCondition={false}
              hideConfirmedTrust={true}
              className={styles["profile-hero-badges"]}
              ownerCollection={instrument.publicCollection}
            />
            {saleOffer ? <section className={styles["profile-sale-area"]} aria-label={ui("ui.app.i.code.ProfileClient.saleDetails", "Sale details")}>
              <div className={styles["profile-sale-price"]}>
                <span>{ui("ui.app.i.code.ProfileClient.askingPrice", "Asking price")}</span>
                {saleOffer.price ? <strong>{saleOffer.price}</strong> : <span>{purchaseLink ? ui("ui.app.i.code.ProfileClient.priceAtStore", "Price at {{store}}", { store: saleOffer.storeName }) : ui("ui.app.i.code.ProfileClient.noPrice", "Price not provided")}</span>}
              </div>
              {purchaseLink ? <a className={styles["profile-purchase-link"]} href={purchaseLink.href} target="_blank" rel="ugc nofollow noopener noreferrer" aria-label={ui("ui.app.i.code.ProfileClient.buyFromStoreAccessible", "Buy from {{store}} (opens in a new tab)", { store: saleOffer.storeName })}>
                <span><strong>{ui("ui.app.i.code.ProfileClient.buyFromStore", "Buy from {{store}}", { store: saleOffer.storeName })}</strong><small>{purchaseLink.host}</small></span><ArrowUpRight size={19} aria-hidden="true" />
              </a> : <p>{ui("ui.app.i.code.ProfileClient.noPurchaseLink", "Purchase details unavailable.")}</p>}
              {purchaseLink ? <p className={styles["profile-sale-note"]}>{ui("ui.app.i.code.ProfileClient.storeConfirms", "Store confirms price and availability.")}</p> : null}
            </section> : null}
            {instrument.publicCollection ? <div className={styles["profile-member-actions"]}>
              {!saleOffer ? <SellerWebsiteLink {...instrument.publicCollection} /> : null}
              {instrument.publicCollection?.allowMessages ? <MemberMessageLink className={styles["profile-message-link"]} handle={instrument.publicCollection.handle} profileCode={instrument.qrCode} label={ui("ui.app.i.code.ProfileClient.577c10d6f210", "Message {{value1}}", { value1: instrument.publicCollection.publicName })} /> : null}
            </div> : null}

        {safetyStatus === "lost" || safetyStatus === "stolen" ? (
          <section className={styles["scan-safety-alert"]} aria-label={ui("ui.app.i.code.ProfileClient.88e9f0875799", "Reported {{value1}}", { value1: safetyStatus })}>
            <strong>{safetyStatus === "lost" ? ui("ui.app.i.code.ProfileClient.299f098db192", "Reported Lost") : ui("ui.app.i.code.ProfileClient.44d0eeb2a64d", "Reported Stolen")}</strong>
            <p>
              {safetyStatus === "lost"
                ? ui("ui.app.i.code.ProfileClient.911804584a25", "This instrument has been marked lost by the current owner.")
                : ui("ui.app.i.code.ProfileClient.f724a4ca52d7", "This instrument has been marked stolen by the current owner.")}
            </p>
            {isDistinctSafetyNote(instrument.publicSafetyNote, safetyStatus) ? <p>{instrument.publicSafetyNote}</p> : null}
          </section>
        ) : null}
          </header>
          <section
            className={styles["scan-hero-gallery"]}
            aria-label={getContentValue(publicContent, "profile.gallery.label")}
          >
            <div className={styles["scan-hero-media-frame"]}>
              <button
                className={styles["scan-hero-media"]}
                data-shape={["Amplifier", "Pedal"].includes(instrument.instrumentType || "") ? "wide" : undefined}
                type="button"
                onClick={() => {
                  if (heroDidSwipeRef.current) { heroDidSwipeRef.current = false; return; }
                  if (galleryImages.length) {
                    openGallery(galleryImages[mediaIndex]);
                  }
                }}
                onPointerDown={(event) => {
                  if (!event.isPrimary || event.button !== 0) return;
                  heroDidSwipeRef.current = false;
                  heroGestureRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
                }}
                onPointerUp={(event) => {
                  const gesture = heroGestureRef.current;
                  if (!gesture || gesture.pointerId !== event.pointerId) return;
                  heroGestureRef.current = null;
                  const dx = event.clientX - gesture.x;
                  const dy = event.clientY - gesture.y;
                  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                    heroDidSwipeRef.current = true;
                    moveHeroPhoto(dx < 0 ? 1 : -1);
                  }
                }}
                onPointerCancel={() => { heroGestureRef.current = null; heroDidSwipeRef.current = true; }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    moveHeroPhoto(event.key === "ArrowRight" ? 1 : -1);
                  }
                }}
                disabled={!galleryImages.length}
                aria-label={galleryImages.length ? ui("ui.app.i.code.ProfileClient.816663403268", "Open {{value1}} photo {{value2}} in fullscreen", { value1: instrumentDisplayName(instrument), value2: mediaIndex + 1 }) : undefined}
              >
                {galleryImages[mediaIndex] ? (
                  <img
                    key={galleryImages[mediaIndex]}
                    src={publicMediaVariantUrl(galleryImages[mediaIndex], 1200)}
                    srcSet={publicMediaVariantSrcSet(galleryImages[mediaIndex])}
                    sizes="(max-width: 540px) calc(100vw - 32px), (max-width: 760px) calc(100vw - 40px), (max-width: 900px) 720px, 684px"
                    alt={ui("ui.app.i.code.ProfileClient.c6bd3192c759", "{{value1}} photo {{value2}} of {{value3}}", { value1: instrumentDisplayName(instrument), value2: mediaIndex + 1, value3: galleryImages.length })}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    width={1200}
                    height={900}
                    referrerPolicy="no-referrer"
                    onError={() => markGalleryImageFailed(galleryImages[mediaIndex])}
                  />
                ) : (
                  <div className={styles["scan-hero-empty"]}>{allGalleryImages.length ? ui("ui.app.i.code.ProfileClient.44cebddc8ad6", "Photos are currently unavailable") : ui("ui.app.i.code.ProfileClient.c58a02ccbadd", "No main photo yet")}</div>
                )}
              </button>
              {galleryImages.length ? (
                <div className={styles["scan-hero-gallery-footer"]}>
                  <span className={styles["scan-hero-photo-count"]} aria-live="polite" aria-atomic="true">
                    {mediaIndex + 1} / {galleryImages.length}
                  </span>
                  {galleryImages.length > 1 ? (
                    <div className={styles["scan-hero-gallery-controls"]}>
                      <button type="button" onClick={() => moveHeroPhoto(-1)} aria-label={getContentValue(publicContent, "profile.gallery.previous")}>
                        <ArrowLeft size={18} />
                      </button>
                      <button type="button" onClick={() => moveHeroPhoto(1)} aria-label={getContentValue(publicContent, "profile.gallery.next")}>
                        <ArrowRight size={18} />
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {galleryImages.length > 1 ? (
              <div
                className={styles["scan-hero-thumbnails"]}
                ref={heroThumbnailRailRef}
                aria-label={ui("ui.app.i.code.ProfileClient.29afaa1f472b", "Choose a photograph")}
                onWheel={(event) => {
                  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
                  event.currentTarget.scrollLeft += event.deltaX;
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== "mouse") return;
                  if ((event.target as HTMLElement).closest("button")) {
                    heroThumbnailDragRef.current = null;
                    heroThumbnailDidDragRef.current = false;
                    return;
                  }
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
                    className={index === mediaIndex ? styles.active : undefined}
                    type="button"
                    onClick={() => {
                      if (heroThumbnailDidDragRef.current) {
                        heroThumbnailDidDragRef.current = false;
                        return;
                      }
                      setMediaIndex(index);
                    }}
                    aria-label={ui("ui.app.i.code.ProfileClient.06b590801f02", "Show photo {{value1}} of {{value2}}", { value1: index + 1, value2: galleryImages.length })}
                    aria-current={index === mediaIndex ? "true" : undefined}
                    key={`${imageUrl}-${index}`}
                  >
                    <img
                      src={publicMediaVariantUrl(imageUrl, 160)}
                      alt=""
                      loading="lazy"
                      fetchPriority="low"
                      decoding="async"
                      width={168}
                      height={126}
                      referrerPolicy="no-referrer"
                      onError={() => markGalleryImageFailed(imageUrl)}
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </section>
          <div className={styles["scan-hero-info"]}>
            <ProfileIdentity
              values={identityValues}
              excludeLabels={["Make / Model", "Year", "Type", "QRguitar ID"]}
              mediaSummary={[
                galleryImages.length ? `${galleryImages.length} ${galleryImages.length === 1 ? "photo" : "photos"}` : "",
                documentFiles.length ? `${documentFiles.length} ${documentFiles.length === 1 ? "document" : "documents"}` : ""
              ].filter(Boolean).join(" / ")}
            >
              {trustItems.length ? (
                <div className={styles["profile-trust-summary"]} aria-label={ui("ui.app.i.code.ProfileClient.66e1c9549fde", "Trust review")}>
                  {trustItems.map((item) => (
                    <details key={item.label}>
                      <summary><ShieldCheck size={15} /> {item.label}</summary>
                      <p>{item.note}</p>
                    </details>
                  ))}
                </div>
              ) : null}
              <div className={styles["scan-qr"]}>
                <ProfileQr code={instrument.qrCode} />
                <div>
                  <strong>{ui("ui.app.i.code.ProfileClient.5139e0f92e71", "Scan to view")}</strong>
                  <span>{shareUrl ? shareUrl.replace(/^https?:\/\//, "") : ui("ui.app.i.code.ProfileClient.58a595439cb9", "qrguitar.com/i/{{value1}}", { value1: instrument.qrCode.toLowerCase() })}</span>
                </div>
                <button className="button secondary" type="button" onClick={copyProfileUrl}>
                  <Copy size={14} />
                  {copyStatus === "copied" ? ui("ui.app.i.code.ProfileClient.8d525e5f158b", "Copied") : ui("ui.app.i.code.ProfileClient.b26d1037f1c2", "Copy URL")}
                </button>
              </div>
              {shareNotice === "failed" ? (
                <small className={styles["scan-copy-notice"]}>{ui("ui.app.i.code.ProfileClient.0854b0c9c202", "Copy failed. You can copy the URL from your browser bar.")}</small>
              ) : null}
            </ProfileIdentity>
          </div>
        </section>





        <div className={styles["scan-actions"]}>
          <Link className={styles["profile-action"]} href={"/handout/" + encodeURIComponent(instrument.qrCode)}>
            <FileText size={16} aria-hidden="true" /> {getContentValue(publicContent, "printWorkspace.title")}
          </Link>
        </div>
        {canEdit ? (
        <section className={styles["scan-actions"]} aria-label={ui("ui.app.i.code.ProfileClient.bfeb7617d7e2", "Owner profile actions")}>
          {canEdit ? (
            <Action
              icon={<SlidersHorizontal />}
              label={ui("ui.app.i.code.ProfileClient.fec2ac0f4cf1", "Edit Profile")}
              onClick={() => {
                router.push(`/edit/${instrument.qrCode}`);
              }}
            />
          ) : null}
          {canEdit ? (
            <Action
              icon={<Repeat2 />}
              label={ui("ui.app.i.code.ProfileClient.7812959f873a", "Ownership Tools")}
              active={activeTab === "ownership"}
              onClick={() => {
                router.push(`/dashboard?transfer=${encodeURIComponent(instrument.qrCode)}`);
              }}
            />
          ) : null}
        </section>
        ) : null}

        {canSubmitService ? (
          <section className={styles["scan-actions"]} aria-label={ui("ui.app.i.code.ProfileClient.302d0d418ff4", "Service provider actions")}>
            <Action
              icon={<Wrench />}
              label={ui("ui.app.i.code.ProfileClient.5686ec9fdd1b", "Submit service record")}
              onClick={() => router.push(`/service-work/${instrument.qrCode}`)}
            />
          </section>
        ) : null}

        {actionNotice ? (
          <section className={styles["scan-action-panel"]} role="status" aria-live="polite">
            <div>
              {actionNotice === "transfer" ? (
                <>
                  <span className={styles["scan-action-icon"]}><Share2 size={16} />{" "}{ui("ui.app.i.code.ProfileClient.2fb69e84e91b", "Ownership tools")}</span>
                  <p>{ui("ui.app.i.code.ProfileClient.498bfd464638", "Contact support@qrguitar.com if you need help with an ownership change.")}</p>
                </>
              ) : null}
              {actionNotice === "documents" ? (
                <>
                  <span className={styles["scan-action-icon"]}><FileText size={16} />{" "}{ui("ui.app.i.code.ProfileClient.b4e929d8bcfe", "Documents")}</span>
                  <p>{ui("ui.app.i.code.ProfileClient.4e3f0c54b7af", "Public files appear here for buyers and shops. The owner controls which files stay private and which are public.")}</p>
                </>
              ) : null}
              {actionNotice === "owner" ? (
                <>
                  <span className={styles["scan-action-icon"]}><ShieldCheck size={16} />{" "}{ui("ui.app.i.code.ProfileClient.dff577c32828", "Owner/admin access required")}</span>
                  <p>{ui("ui.app.i.code.ProfileClient.953a22d40e63", "Only the owner or admin can edit this profile. Sign in as the profile owner to make changes.")}</p>
                </>
              ) : null}
            </div>
            <button className="button secondary" type="button" onClick={() => setActionNotice(null)}><X size={14} />{ui("ui.app.i.code.ProfileClient.7d9eb7acb13e", "Close")}</button>
          </section>
        ) : null}

        <nav className={styles["scan-tabs"]} aria-label={ui("ui.app.i.code.ProfileClient.4d2046641397", "Instrument profile sections")} role="tablist">
          {visibleTabs.map((tab) => (
            <button
              className={activeTab === tab.id ? styles.active : undefined}
              data-profile-tab={tab.id}
              type="button"
              role="tab"
              id={`profile-tab-${tab.id}`}
              aria-controls="profile-tab-panel"
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
                  document.querySelector<HTMLButtonElement>(`[data-profile-tab="${nextTab.id}"]`)?.focus();
                });
              }}
              key={tab.id}
            >
              {tab.label}{tab.count ? <span className={styles["scan-tab-count"]}>{tab.count}</span> : null}
            </button>
          ))}
        </nav>

        <div role="tabpanel" id="profile-tab-panel" aria-labelledby={`profile-tab-${activeTab}`} tabIndex={0}>
          <ProfilePanel
            detailsHeading={getContentValue(publicContent, "profile.details.heading")}
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
        </div>

        {!canEdit ? <section className={styles["profile-claim-entry"]}>
          <h2>{ui("ui.app.i.code.ProfileClient.lifetimeProfile", "One Profile, for its whole life.")}</h2>
          <p>{ui("ui.app.i.code.ProfileClient.afterPurchase", "After you buy it, ask the seller to transfer this Profile to you for free. Its photos, specifications and history stay together.")}</p>
          <details>
            <summary>{ui("ui.app.i.code.ProfileClient.alreadyOwn", "Already own it?")}</summary>
            <p>{ui("ui.app.i.code.ProfileClient.b5c3490dde3a", "Scanning this QR code opens the Profile. It never changes ownership. Ask the current owner for a transfer, or start a private request if they cannot send one.")}</p>
            <Link href={"/ownership-claim?code=" + encodeURIComponent(instrument.qrCode)}>{ui("ui.app.i.code.ProfileClient.21f95b4c7342", "Start ownership request")} <ArrowRight size={14} aria-hidden="true" /></Link>
          </details>
        </section> : null}

        {activeMedia ? (
          <PhotoViewer
            images={galleryImages}
            initialIndex={Math.max(0, galleryImages.indexOf(activeMedia))}
            title={instrumentDisplayName(instrument)}
            onClose={() => setActiveMedia(null)}
            onIndexChange={setMediaIndex}
            onImageError={markGalleryImageFailed}
          />
        ) : null}
      </section>
    </main>
  );
}

function publicOwnerDisplay(instrument: DemoInstrument) {
  return String(instrument.publicCollection?.publicName || "").trim();
}

function hasMeaningfulPublicValue(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized && normalized !== "not listed" && normalized !== "unknown");
}

function ProfilePanel({
  detailsHeading,
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
  detailsHeading: string;
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
  const ui = useUiText("app.i.code.ProfileClient");
  const profileTypeLabel = String(instrument.instrumentType || "").trim() || "Profile";

  if (activeTab === "specs") {
    const visibleSpecs = [...specs, ...optionalSpecs].filter((spec) => hasMeaningfulPublicValue(spec.value));

    return (
      <section className={styles["scan-tab-panel"]}>
        <PanelHeader icon={<SlidersHorizontal />} label={ui("ui.app.i.code.ProfileClient.73949bb1bdba", "Profile details")} title={detailsHeading} />
        <div className={styles["profile-data-grid"]}>
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
      <section className={styles["scan-tab-panel"]}>
        <PanelHeader icon={<Clock3 />} label={ui("ui.app.i.code.ProfileClient.9dcff98e275f", "Timeline")} title={ui("ui.app.i.code.ProfileClient.1d88855f0d95", "Events recorded for this instrument.")} />
        <div className={styles["timeline-list"]}>
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
              title={ui("ui.app.i.code.ProfileClient.15f1e13d5beb", "Ownership transfer started")}
              copy={
                latestTransfer.status === "accepted"
                  ? ui("ui.app.i.code.ProfileClient.4f060ab480e4", "Ownership was accepted by {{value1}}.", {value1: latestTransfer.toName || latestTransfer.toEmail})
                  : ui("ui.app.i.code.ProfileClient.047c40a15875", "An ownership-change claim was started for {{value1}}.", {value1: latestTransfer.toName || latestTransfer.toEmail})
              }
            />
          ) : null}
          {ownershipTransferCount > 0 && !latestTransfer ? (
            <TimelineItem
              date="Recorded"
              title={ui("ui.app.i.code.ProfileClient.e4db7ca95800", "{{value1}} ownership transfer{{value2}} recorded", { value1: ownershipTransferCount, value2: ownershipTransferCount === 1 ? "" : "s" })}
              copy={ui("ui.app.i.code.ProfileClient.514cf9382473", "QRguitar keeps the permanent profile with the instrument while prior-owner details stay private.")}
            />
          ) : null}
          <div className={styles["timeline-origin-marker"]}>
            <Clock3 aria-hidden="true" />
            <span><strong>{ui("ui.app.i.code.ProfileClient.9bb4a8d57a82", "Profile created")}</strong>{createdDate}</span>
          </div>
        </div>
      </section>
    );
  }

  if (activeTab === "service") {
    return (
      <section className={styles["scan-tab-panel"]}>
        <PanelHeader icon={<Wrench />} label={ui("ui.app.i.code.ProfileClient.d677190e0a99", "Service")} title={ui("ui.app.i.code.ProfileClient.0da8a8f6f90b", "Owner-approved work connected to this instrument.")} />
        <div className={styles["timeline-list"]}>
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
      <section className={styles["scan-tab-panel"]}>
        <PanelHeader icon={<Repeat2 />} label={ui("ui.app.i.code.ProfileClient.c7d3acc826a8", "Ownership")} title={ui("ui.app.i.code.ProfileClient.db60bbe2c7c2", "Brand, retailer, owner, and future buyer stay connected around the same instrument.")} />
        <div className={styles["ownership-grid"]}>
          {publicOwnerDisplay(instrument) ? <span><strong>{ui("ui.app.i.code.ProfileClient.0abf1fda3294", "Current owner")}</strong>{publicOwnerDisplay(instrument)}</span> : null}
          {instrument.builder ? <span><strong>{ui("ui.app.i.code.ProfileClient.090940e73258", "Builder")}</strong>{instrument.builder}</span> : null}
          <span><strong>{ui("ui.app.i.code.ProfileClient.8dc96386f9b0", "Recorded transfers")}</strong>{ownershipTransferCount || ui("ui.app.i.code.ProfileClient.adb85cf22bfc", "None yet")}</span>
          <span><strong>{ui("ui.app.i.code.ProfileClient.7448611d5f93", "Visibility")}</strong>{instrument.visibility === "private" ? ui("ui.app.i.code.ProfileClient.5a024309a381", "Private profile") : instrument.visibility === "unlisted" ? ui("ui.app.i.code.ProfileClient.81c09a46b1f6", "Unlisted profile") : ui("ui.app.i.code.ProfileClient.eaad68e1f8c0", "Public profile")}</span>
                </div>
                <EmptyPanel
                  title={ui("ui.app.i.code.ProfileClient.cbfa6a5b513b", "Ownership transfer")}
                  copy={transferMessage}
                />
      </section>
    );
  }

  if (activeTab === "media") {
    return (
      <section className={styles["scan-tab-panel"]}>
        <PanelHeader icon={<ImageIcon />} label={ui("ui.app.i.code.ProfileClient.d357175cfe89", "Media")} title={ui("ui.app.i.code.ProfileClient.4a0da7d0535d", "Public video, audio, and external media connected to this instrument.")} />
        <div className={styles["external-media-grid"]}>
          {externalMedia.map((item) => {
            const embedUrl = externalMediaEmbedUrl(item);
            return (
              <article className={styles["external-media-card"]} key={item.id}>
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
                  {!embedUrl ? <a href={item.canonicalUrl} target="_blank" rel="ugc nofollow noopener noreferrer">{ui("ui.app.i.code.ProfileClient.de81e912dbeb", "Open media")}</a> : null}
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
      <section className={styles["scan-tab-panel"]}>
        <PanelHeader icon={<MessageCircle />} label={ui("ui.app.i.code.ProfileClient.1c007c29d3af", "Repairs")} title={ui("ui.app.i.code.ProfileClient.001451c63c8c", "A repair bench can see what happened before and add what happened today.")} />
        {serviceNotes.length ? (
          <div className={styles["profile-data-grid"]}>
            {serviceNotes.map((spec) => (
              <span key={spec.label}><strong>{spec.label}</strong>{spec.value}</span>
            ))}
          </div>
        ) : (
          <EmptyPanel
            title={ui("ui.app.i.code.ProfileClient.566ade929299", "No repair history posted yet.")}
            copy={ui("ui.app.i.code.ProfileClient.5c36266ae13b", "Setup work, repairs, fretwork, electronics changes, and inspection notes can be added here as the instrument is serviced.")}
          />
        )}
      </section>
    );
  }

  if (activeTab === "documents") {
    const hasVisibleDocuments = documentFiles.length > 0;
    const isPrivateListing = instrument.visibility === "private";
    return (
      <section className={styles["scan-tab-panel"]}>
        <PanelHeader icon={<FileText />} label={ui("ui.app.i.code.ProfileClient.b4e929d8bcfe", "Documents")} title={ui("ui.app.i.code.ProfileClient.38e61654fdf9", "The important paperwork follows the instrument.")} />
        {hasVisibleDocuments ? (
          <div className={styles["document-list"]}>
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
          <div className={styles["media-placeholder-grid"]}>
            <span>{ui("ui.app.i.code.ProfileClient.01b015444dd4", "No documents uploaded yet.")}</span>
            <span>{ui("ui.app.i.code.ProfileClient.9fd08e514569", "Private listings keep paperwork with the owner until it is shared.")}</span>
          </div>
        ) : (
          <div className={styles["media-placeholder-grid"]}>
            <span>{ui("ui.app.i.code.ProfileClient.8b6dfe7e7f62", "No public documents yet.")}</span>
            <span>{ui("ui.app.i.code.ProfileClient.8f8758e7e505", "Owners can mark certificates, receipts, or spec sheets as public later.")}</span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={styles["scan-tab-panel"] + " " + styles["scan-overview"]}>
      <div>
        {meaningfulProfileSummary(instrument.summary) ? (
          <>
            <h2>{ui("ui.app.i.code.ProfileClient.191c6a87f0f4", "About this")}{" "}{profileTypeLabel.toLowerCase()}</h2>
            <p>{meaningfulProfileSummary(instrument.summary)}</p>
          </>
        ) : null}
        {optionalSpecs.length ? (
          <div className={styles["public-spec-list"]}>
            {optionalSpecs.map((spec) => (
              <span key={spec.label}><strong>{spec.label}</strong>{spec.value}</span>
            ))}
          </div>
        ) : null}
        {profileLinks.length ? (
          <div className={styles["public-link-list"]}>
            {profileLinks.map((link) => (
              <a href={link.href} target="_blank" rel="ugc nofollow noopener noreferrer" key={link.label}>{link.label}</a>
            ))}
          </div>
        ) : null}
      </div>
      {officialBrandLogoUrl ? (
        <div className={styles["maker-signature"]}>
          <FallbackImage
            src={officialBrandLogoUrl}
            alt={ui("ui.app.i.code.ProfileClient.5e3a5d0c73e9", "{{value1}} official logo", { value1: instrument.brand })}
            loading="lazy"
            fetchPriority="low"
            decoding="async"
            width={520}
            height={120}
            referrerPolicy="no-referrer"
            fallback={<span>{ui("ui.app.i.code.ProfileClient.090ed4316f1d", "Brand")}</span>}
          />
          <strong>{instrument.brand}</strong>
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
    <div className={styles["panel-header"]}>
      <span>{icon}{label}</span>
      <h2>{title}</h2>
    </div>
  );
}

function TimelineItem({ date, title, copy }: { date: string; title: string; copy: string }) {
  return (
    <article className={styles["timeline-item"]}>
      <span>{date}</span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  );
}

function EmptyPanel({ title, copy }: { title: string; copy: string }) {
  const ui = useUiText("app.i.code.ProfileClient");
  return (
    <div className={styles["collaboration-thread"] + " " + styles["compact"]}>
      <div className={styles["panel-header"]}>
        <span><MessageCircle size={18} />{" "}{ui("ui.app.i.code.ProfileClient.c5a2adb04f18", "Profile note")}</span>
        <h2>{title}</h2>
      </div>
      <p>{copy}</p>
    </div>
  );
}

function ProfileQr({ code }: { code: string }) {
  const ui = useUiText("app.i.code.ProfileClient");
  return (
    <div className={styles["qr-placeholder"]} aria-label={ui("ui.app.i.code.ProfileClient.817fa9875e3c", "QR code for {{value1}}", { value1: code })}>
      <CompactQr code={code} label={code} />
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
    <div className={styles["identity-cell"]}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Action({ icon, label, active, disabled, onClick }: { icon: ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  const ui = useUiText("app.i.code.ProfileClient");
  return (
    <button
      className={[styles["profile-action"], active ? styles.active : undefined].filter(Boolean).join(" ")}
      type="button"
      disabled={Boolean(disabled)}
      onClick={onClick}
      aria-disabled={disabled || false}
      title={disabled ? ui("ui.app.i.code.ProfileClient.20f8b80ba07c", "{{value1}} is owner/admin only", { value1: label }) : undefined}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function DocumentItem({ title, copy, onView, href }: { title: string; copy: string; onView?: () => void; href?: string }) {
  const ui = useUiText("app.i.code.ProfileClient");
  return (
    <article className={styles["document-item"]}>
      <FileText size={22} />
      <div>
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="button secondary">{ui("ui.app.i.code.ProfileClient.dcc839a4015c", "View")}</a>
      ) : (
        <button type="button" onClick={() => onView?.()} disabled={!onView} className={!onView ? "disabled" : undefined}>
          {onView ? ui("ui.app.i.code.ProfileClient.dcc839a4015c", "View") : ui("ui.app.i.code.ProfileClient.ca1844969742", "Unavailable")}
        </button>
      )}
    </article>
  );
}

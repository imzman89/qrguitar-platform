"use client";

import {
  Check,
  ChevronDown,
  Clipboard,
  Clock3,
  Cloud,
  Code2,
  Eye,
  FileClock,
  Image as ImageIcon,
  Laptop,
  LockKeyhole,
  Menu,
  Monitor,
  Paintbrush,
  PanelLeftClose,
  PanelRightClose,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Smartphone,
  Tablet,
  Upload,
  UnlockKeyhole,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { SiteCompositionEditor } from "../../components/SiteCompositionEditor";
import {
  contentAreas,
  contentCoverageManifest,
  contentCoverageSummary,
  contentPagesForArea,
  contentRegistry,
  defaultContentValues,
  validateContentValues,
  type ContentArea,
  type ContentRegistryEntry
} from "../../lib/content-registry";
import {
  applyThemeSettings,
  defaultSiteSettings,
  isSafeBrandLogoUrl,
  mergeSiteSettings,
  normalizeBrandLogoKey,
  siteSettingsKey,
  validateBrandLogoEntries,
  validateEditorialComposition,
  type EditableSiteSettings,
  type EditorialPageKey
} from "../../lib/site-settings";
import { createEditorMutationController, EditorMutationError, shouldReplaceEditorContent, type EditorMutationPayload } from "../../lib/site-editor-client";
import { settingsChangeReview } from "../../lib/site-editor-review";
import { clearSitePreviewCookie, openSiteDraftPreview, sitePreviewGeneration, sitePreviewInvalidatedEvent } from "../../lib/site-preview-client";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";

type PreviewDevice = "desktop" | "tablet" | "mobile";
type PreviewSource = "draft" | "published";
type EditorMode = "content" | "advanced";
type SpecialPage = "Theme" | "Brand assets" | "Revision history" | "Copy coverage" | "Advanced JSON";
type SelectedPage = { area: ContentArea | "Design" | "Advanced"; page: string };
type ConfirmAction = { kind: "discard" } | { kind: "publish" } | { kind: "restore"; revision: Revision };

type Revision = {
  id: string;
  updatedAt: string;
  publishedAt: string;
  publishedBy: string;
  note: string;
  area: string;
  changedFields: string[];
};

type SiteEditorPayload = {
  editorActorId?: string; publishedVersion?: string; draftVersion?: string; committed?: boolean; requestId?: string; superseded?: boolean;
  ok?: boolean;
  message?: string;
  published?: EditableSiteSettings;
  publishedAt?: string;
  draft?: EditableSiteSettings | null;
  draftMeta?: {
    basePublishedAt?: string;
    updatedAt?: string;
    updatedBy?: string;
    note?: string;
    area?: string;
    changedFields?: string[];
  } | null;
  revisions?: Revision[];
  errors?: Record<string, string>;
  conflict?: boolean;
};

const crashRecoveryKey = `${siteSettingsKey}.crashRecovery`;

const legacyContentBindings: Record<string, (settings: EditableSiteSettings, value: string) => EditableSiteSettings> = {
  "global.brand.name": (settings, value) => ({ ...settings, brandName: value }),
  "global.brand.tagline": (settings, value) => ({ ...settings, tagline: value }),
  "home.hero.eyebrow": (settings, value) => ({ ...settings, hero: { ...settings.hero, eyebrow: value } }),
  "home.hero.headline": (settings, value) => ({ ...settings, hero: { ...settings.hero, headline: value } }),
  "home.hero.body": (settings, value) => ({ ...settings, hero: { ...settings.hero, body: value } }),
  "home.hero.primaryCta": (settings, value) => ({ ...settings, hero: { ...settings.hero, primaryCta: value } }),
  "home.hero.secondaryCta": (settings, value) => ({ ...settings, hero: { ...settings.hero, secondaryCta: value } }),
  "home.lifecycle.headline": (settings, value) => ({ ...settings, sections: { ...settings.sections, howHeadline: value } }),
  "home.lifecycle.body": (settings, value) => ({ ...settings, sections: { ...settings.sections, howBody: value } }),
  "home.pricing.headline": (settings, value) => ({ ...settings, sections: { ...settings.sections, pricingHeadline: value } }),
  "home.pricing.body": (settings, value) => ({ ...settings, sections: { ...settings.sections, pricingBody: value } }),
  "dashboard.hero.headline": (settings, value) => ({ ...settings, dashboard: { ...settings.dashboard, pageTitle: value } }),
  "dashboard.hero.body": (settings, value) => ({ ...settings, dashboard: { ...settings.dashboard, subtitle: value } }),
  "dashboard.empty.title": (settings, value) => ({ ...settings, dashboard: { ...settings.dashboard, emptyCollectionTitle: value } }),
  "dashboard.empty.body": (settings, value) => ({ ...settings, dashboard: { ...settings.dashboard, emptyCollectionBody: value } }),
  "seo.global.title": (settings, value) => ({ ...settings, seo: { ...settings.seo, title: value } }),
  "seo.global.description": (settings, value) => ({ ...settings, seo: { ...settings.seo, description: value } }),
  "seo.global.image": (settings, value) => ({ ...settings, seo: { ...settings.seo, image: value } })
};

function hydrateLegacyContent(settings: EditableSiteSettings) {
  const content = { ...settings.content };
  const legacy: Record<string, string> = {
    "global.brand.name": settings.brandName,
    "global.brand.tagline": settings.tagline,
    "home.hero.eyebrow": settings.hero.eyebrow,
    "home.hero.headline": settings.hero.headline,
    "home.hero.body": settings.hero.body,
    "home.hero.primaryCta": settings.hero.primaryCta,
    "home.hero.secondaryCta": settings.hero.secondaryCta,
    "home.lifecycle.headline": settings.sections.howHeadline,
    "home.lifecycle.body": settings.sections.howBody,
    "home.pricing.headline": settings.sections.pricingHeadline,
    "home.pricing.body": settings.sections.pricingBody,
    "dashboard.hero.headline": settings.dashboard.pageTitle,
    "dashboard.hero.body": settings.dashboard.subtitle,
    "dashboard.empty.title": settings.dashboard.emptyCollectionTitle,
    "dashboard.empty.body": settings.dashboard.emptyCollectionBody,
    "seo.global.title": settings.seo.title,
    "seo.global.description": settings.seo.description,
    "seo.global.image": settings.seo.image
  };
  for (const [key, value] of Object.entries(legacy)) {
    if (content[key] === defaultContentValues[key] && value && value !== defaultContentValues[key]) content[key] = value;
  }
  return { ...settings, content };
}

function formatTime(value?: string) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not yet" : date.toLocaleString();
}

function groupEntries(entries: ContentRegistryEntry[]) {
  const groups = new Map<string, ContentRegistryEntry[]>();
  for (const entry of entries) groups.set(entry.section, [...(groups.get(entry.section) || []), entry]);
  return Array.from(groups.entries());
}

function pagePurpose(selected: SelectedPage) {
  const purposes: Record<string, string> = {
    Homepage: "Shape the first impression and guide visitors toward creating or exploring a QRguitar Profile.",
    "How It Works": "Explain the complete QRguitar lifecycle in language customers can understand quickly.",
    Catalog: "Control the discovery language surrounding Public QRguitar Profiles.",
    Dashboard: "Guide owners through their collection, actions, and next steps.",
    Contact: "Keep support paths clear, direct, and useful.",
    Privacy: "Maintain the public privacy explanation without changing protected policy behavior.",
    Terms: "Maintain the public terms copy without changing protected enforcement.",
    Theme: "Tune approved visual tokens while preserving accessible contrast.",
    "Brand assets": "Manage shared QRguitar and instrument-brand presentation.",
    "Revision history": "Review prior publications and restore a safe version into the draft.",
    "Copy coverage": "Review which customer-facing surfaces are controlled by the Content Studio.",
    "Advanced JSON": "Recovery tools for validated settings export and import."
  };
  return purposes[selected.page] || `Edit the approved customer-facing content for ${selected.page}.`;
}

function hexToRgb(value: string) {
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (value: string) => {
    const rgb = hexToRgb(value);
    if (!rgb) return null;
    const channels = rgb.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  if (first === null || second === null) return null;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function emailPreviewValue(value: string) {
  const samples: Record<string, string> = {
    profile_title: "1962 Sunburst Stratocaster",
    profile_url: "https://www.qrguitar.com/i/QRG-EXAMPLE123",
    provider_name: "Example Guitar Service",
    claim_url: "https://www.qrguitar.com/ownership-claim",
    sender_name: "Current owner",
    reset_url: "https://www.qrguitar.com/reset-password",
    safety_status: "Reported lost"
  };
  return value.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => samples[key] || match);
}

const focusableSelector = [
  "a[href]", "button:not([disabled])", "input:not([disabled])", "select:not([disabled])",
  "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])"
].join(",");

function trapFocus(container: HTMLElement | null, event: KeyboardEvent) {
  if (event.key !== "Tab" || !container) return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) { event.preventDefault(); container.focus(); return; }
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function validateEditorSettings(settings: EditableSiteSettings, rawBrandLogos: unknown = settings.brandLogos) {
  const errors: Record<string, string> = {
    ...validateBrandLogoEntries(rawBrandLogos),
    ...validateContentValues(settings.content),
    ...validateEditorialComposition(settings.composition)
  };
  for (const [key, value] of Object.entries(settings.colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) errors[`colors.${key}`] = "Use a six-digit hex color.";
  }
  if (!settings.brandName.trim()) errors.brandName = "Brand name is required.";
  try {
    const canonical = new URL(settings.seo.canonicalUrl);
    if (canonical.protocol !== "https:" || canonical.hostname !== "www.qrguitar.com" || canonical.username || canonical.password) {
      errors["seo.canonicalUrl"] = "Use the canonical QRguitar HTTPS origin.";
    }
  } catch {
    errors["seo.canonicalUrl"] = "Enter a valid canonical URL.";
  }
  return errors;
}

export default function SiteEditorPage() {
  const [selected, setSelected] = useState<SelectedPage>({ area: "Marketing", page: "Homepage" });
  const [settings, setSettingsState] = useState<EditableSiteSettings>(defaultSiteSettings);
  const settingsRef = useRef(settings);
  const setSettings = useCallback((next: EditableSiteSettings | ((current: EditableSiteSettings) => EditableSiteSettings)) => {
    const value = typeof next === "function" ? next(settingsRef.current) : next;
    settingsRef.current = value; setSettingsState(value);
  }, []);
  const versionsRef = useRef({ publishedVersion: "", draftVersion: "" });
  const actorRef = useRef("");
  const mutationsRef = useRef<ReturnType<typeof createEditorMutationController> | null>(null);
  const writeTask = useRef<Promise<void> | null>(null);
  const manualPending = useRef(false);
  const [writeBusy, setWriteBusy] = useState(false);
  const [editorIssue, setEditorIssueState] = useState<"" | "conflict" | "uncertain" | "error">("");
  const issueRef = useRef(editorIssue);
  const setEditorIssue = useCallback((value: typeof editorIssue) => { issueRef.current = value; setEditorIssueState(value); }, []);
  const [published, setPublished] = useState<EditableSiteSettings>(defaultSiteSettings);
  const [publishedAt, setPublishedAt] = useState("");
  const [draftMeta, setDraftMeta] = useState<SiteEditorPayload["draftMeta"]>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("Checking admin access…");
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "dirty" | "error">("loading");
  const [authorized, setAuthorized] = useState(false);
  const [previewSource, setPreviewSource] = useState<PreviewSource>("draft");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("content");
  const [openFieldSection, setOpenFieldSection] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [advancedJson, setAdvancedJson] = useState("");
  const [advancedUnlocked, setAdvancedUnlocked] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [copyExportFeedback, setCopyExportFeedback] = useState("");
  const copyExportAttempt = useRef(0);
  const [showCompare, setShowCompare] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const loaded = useRef(false);
  const lastServerDraft = useRef("");
  const sidebarTriggerRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const previewPanelRef = useRef<HTMLElement>(null);
  const confirmDialogRef = useRef<HTMLElement>(null);
  const confirmCloseRef = useRef<HTMLButtonElement>(null);
  const focusBeforeDialog = useRef<HTMLElement | null>(null);

  const selectedEntries = useMemo(() => {
    const search = query.trim().toLowerCase();
    return contentRegistry.filter((entry) => {
      const matchesPage = entry.area === selected.area && entry.page === selected.page;
      const matchesSearch = !search || `${entry.key} ${entry.page} ${entry.section} ${entry.label} ${entry.help}`.toLowerCase().includes(search);
      return (search ? matchesSearch : matchesPage);
    });
  }, [query, selected]);

  const currentPageEntries = contentRegistry.filter((entry) => entry.area === selected.area && entry.page === selected.page);
  const fieldGroups = useMemo(() => groupEntries(selectedEntries), [selectedEntries]);
  const compositionPageKey = useMemo<EditorialPageKey | null>(() => {
    if (query) return null;
    const supported: Partial<Record<ContentArea, Record<string, EditorialPageKey>>> = {
      Global: { Footer: "footer" },
      Marketing: { Homepage: "home", "How It Works": "howItWorks", Catalog: "catalog", Installers: "installers" },
      "Support & Legal": { Contact: "contact" }
    };
    return selected.area in supported
      ? supported[selected.area as ContentArea]?.[selected.page] || null
      : null;
  }, [query, selected]);
  const previewPath = currentPageEntries.find((entry) => entry.previewPath)?.previewPath || "/";
  const changeReview = useMemo(() => settingsChangeReview(settings, published), [published, settings]);
  const changeCount = changeReview.length;
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(published);
  const textContrast = contrastRatio(settings.colors.text, settings.colors.background);
  const actionContrast = contrastRatio(settings.colors.background, settings.colors.cream);
  const accentContrast = contrastRatio(settings.colors.gold, settings.colors.background);

  useEffect(() => {
    setCopyExportFeedback("");
    return () => { copyExportAttempt.current += 1; };
  }, [settings, advancedJson, authorized, selected.area, selected.page, writeBusy, emailSending]);

  useEffect(() => {
    setOpenFieldSection(fieldGroups[0]?.[0] || "");
  }, [fieldGroups]);

  useEffect(() => {
    const updatePreviewLayout = () => {
      if (window.innerWidth < 1000) {
        setPreviewOpen((open) => {
          if (open) {
            setPreviewUrl("");
            void clearSitePreviewCookie().catch(() => undefined);
          }
          return false;
        });
      }
      setDevice(window.innerWidth < 640 ? "mobile" : window.innerWidth < 1000 ? "tablet" : "desktop");
    };
    updatePreviewLayout();
    window.addEventListener("resize", updatePreviewLayout);
    return () => window.removeEventListener("resize", updatePreviewLayout);
  }, []);

  const applyPayload = useCallback((payload: SiteEditorPayload, preferDraft = true, submittedSnapshot?: string) => {
    if (typeof payload.publishedVersion !== "string" || typeof payload.draftVersion !== "string" || !payload.published) throw new Error("Incomplete editor snapshot.");
    versionsRef.current = { publishedVersion: payload.publishedVersion, draftVersion: payload.draftVersion };
    const nextPublished = hydrateLegacyContent(mergeSiteSettings(payload.published));
    const nextDraft = payload.draft ? hydrateLegacyContent(mergeSiteSettings(payload.draft)) : null;
    setPublished(nextPublished);
    setPublishedAt(payload.publishedAt || "");
    const next = preferDraft && nextDraft ? nextDraft : nextPublished;
    lastServerDraft.current = nextDraft ? JSON.stringify(nextDraft) : "";
    if (submittedSnapshot === undefined || shouldReplaceEditorContent(JSON.stringify(settingsRef.current), submittedSnapshot)) {
      setSettings(next); setAdvancedJson(JSON.stringify(next, null, 2)); applyThemeSettings(next);
    }
    setDraftMeta(payload.draftMeta || null); setRevisions(payload.revisions || []);
  }, [setSettings]);

  async function api() {
    const token = await getSupabaseAccessToken();
    if (!token) throw new Error("Sign in with an authorized admin account.");
    const response = await fetch("/api/site-editor", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as SiteEditorPayload;
    if (!response.ok || payload.ok !== true || typeof payload.editorActorId !== "string") throw new Error(payload.message || "Could not load Site Editor state.");
    return payload;
  }

  const initializeMutations = useCallback((actorId: string) => {
    actorRef.current = actorId;
    const controller = createEditorMutationController({ actorId, storage: window.sessionStorage, uuid: () => crypto.randomUUID(),
      send: async (body) => {
        const token = await getSupabaseAccessToken();
        if (!token) return { status: 401, payload: { ok: false, uncertain: false, message: "Sign in with an authorized admin account." } };
        const abort = new AbortController(); const timer = window.setTimeout(() => abort.abort(), 20000);
        try {
          const response = await fetch("/api/site-editor", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, cache: "no-store", body, signal: abort.signal });
          return { status: response.status, payload: await response.json().catch(() => ({})) as EditorMutationPayload };
        } finally { window.clearTimeout(timer); }
      }
    });
    mutationsRef.current = controller;
    if (controller.pending) {
      let recovered = controller.pending.localSnapshot;
      try { recovered = window.localStorage.getItem(`${crashRecoveryKey}:${actorId}`) || recovered; } catch { /* request snapshot remains available */ }
      try { setSettings(hydrateLegacyContent(mergeSiteSettings(JSON.parse(recovered)))); } catch { /* keep server copy visible */ }
      setEditorIssue("uncertain"); setStatus("error"); setMessage("A previous save needs confirmation. Retry it before making another change.");
    } else if (controller.storageProblem) {
      setEditorIssue("error"); setStatus("error"); setMessage("Recovery storage is unavailable. Export your local changes before reloading.");
    }
  }, [setEditorIssue, setSettings]);

  const executeEditor = useCallback(async (action: string, body: Record<string, unknown> = {}, manual = false, retry = false) => {
    if (manual && manualPending.current) return;
    if (manual) manualPending.current = true;
    try {
      if (writeTask.current) {
        if (!manual) return;
        await writeTask.current;
      }
      const controller = mutationsRef.current;
      if (!controller || (issueRef.current && !retry)) return;
      const localSnapshot = retry ? controller.pending?.localSnapshot || JSON.stringify(settingsRef.current) : JSON.stringify(settingsRef.current);
      const submitted = settingsRef.current;
      if (!retry && action === "publish") {
        const validation = validateEditorSettings(submitted);
        const text = contrastRatio(submitted.colors.text, submitted.colors.background);
        const buttons = contrastRatio(submitted.colors.background, submitted.colors.cream);
        setErrors(validation);
        if (Object.keys(validation).length || text === null || buttons === null || text < 4.5 || buttons < 4.5) {
          setStatus("error"); setMessage("Fix highlighted content and ensure primary text and actions meet 4.5:1 contrast before publishing."); return;
        }
      }
      const operation = (async () => {
        setWriteBusy(true); setStatus("saving");
        try {
          const payload = await (retry ? controller.retry() : controller.mutate({ action, ...body, ...(["save_draft", "publish"].includes(action) ? { settings: submitted } : {}) }, versionsRef.current, localSnapshot)) as SiteEditorPayload;
          if (mutationsRef.current !== controller) return;
          applyPayload(payload, true, localSnapshot);
          const serverSnapshot = JSON.stringify(payload.draft ? hydrateLegacyContent(mergeSiteSettings(payload.draft)) : hydrateLegacyContent(mergeSiteSettings(payload.published)));
          const newerEdits = JSON.stringify(settingsRef.current) !== serverSnapshot;
          if (payload.superseded) {
            setEditorIssue("conflict"); setStatus("error"); setMessage("Your previous change was saved. Another edit followed it; export local changes and reload before continuing.");
          } else {
            setEditorIssue(""); setStatus(newerEdits ? "dirty" : "saved");
            setMessage((payload.message || "Saved successfully.") + (newerEdits ? " Newer local edits are waiting to save." : ""));
          }
          if (!newerEdits) { try { window.localStorage.removeItem(`${crashRecoveryKey}:${actorRef.current}`); } catch { /* already committed */ } }
          setPreviewVersion((value) => value + 1);
        } catch (error) {
          if (mutationsRef.current !== controller) return;
          const failure = error instanceof EditorMutationError ? error : null;
          setEditorIssue(failure?.uncertain ? "uncertain" : failure?.payload.conflict ? "conflict" : "error");
          setErrors(failure?.payload.errors || {}); setStatus("error");
          setMessage(error instanceof Error ? error.message : "The save could not be confirmed.");
        } finally { setWriteBusy(false); }
      })();
      writeTask.current = operation;
      await operation;
      if (writeTask.current === operation) writeTask.current = null;
    } finally { if (manual) manualPending.current = false; }
  }, [applyPayload, setEditorIssue]);

  function exportLocalChanges() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(settingsRef.current, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "qrguitar-editor-local-changes.json"; anchor.click(); URL.revokeObjectURL(url);
  }

  async function issueDraftPreview(path: string) {
    return openSiteDraftPreview(path, actorRef.current, async () => {
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      return { userId: data.session?.user.id || "", accessToken: data.session?.access_token || "" };
    });
  }
  async function clearDraftPreview() { await clearSitePreviewCookie(); }
  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewUrl("");
    setPreviewError("");
    void clearSitePreviewCookie().catch((error) => {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not clear the draft preview cookie.");
    });
  }, []);

  useEffect(() => {
    const clearOnExit = () => { void clearSitePreviewCookie().catch(() => undefined); };
    window.addEventListener("pagehide", clearOnExit);
    return () => {
      window.removeEventListener("pagehide", clearOnExit);
      clearOnExit();
    };
  }, []);

  useEffect(() => {
    const invalidate = () => {
      actorRef.current = ""; mutationsRef.current = null; loaded.current = false;
      setAuthorized(false); setPreviewUrl(""); setPreviewOpen(false);
      setSettings(defaultSiteSettings); setPublished(defaultSiteSettings); setAdvancedJson("");
      setDraftMeta(null); setRevisions([]); setNote(""); setConfirmAction(null);
      setPreviewError("The signed-in account changed. Reload Site Editor before previewing.");
      setStatus("error"); setMessage("Your account changed. Reload Site Editor to continue.");
    };
    window.addEventListener(sitePreviewInvalidatedEvent, invalidate);
    return () => window.removeEventListener(sitePreviewInvalidatedEvent, invalidate);
  }, [setSettings]);

  useEffect(() => {
    let cancelled = false;
    const started = sitePreviewGeneration();
    void api()
      .then((payload) => {
        if (cancelled || started !== sitePreviewGeneration()) return;
        applyPayload(payload, true);
        setAuthorized(true);
        setStatus("saved");
        setMessage(payload.draft ? "Server draft loaded." : "Published content loaded.");
        loaded.current = true;
        initializeMutations(payload.editorActorId!);
      })
      .catch((error) => {
        if (cancelled) return;
        setAuthorized(false);
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Admin access required.");
      });
    return () => {
      cancelled = true;
    };
  }, [applyPayload, initializeMutations]);

  useEffect(() => {
    let cancelled = false;
    if (!authorized || !previewOpen) return;
    if (previewSource === "published") {
      setPreviewError("");
      setPreviewUrl("");
      void clearDraftPreview()
        .then(() => {
          if (!cancelled) setPreviewUrl(`${previewPath}?cmsPreview=published&v=${previewVersion}`);
        })
        .catch((error) => {
          if (!cancelled) setPreviewError(error instanceof Error ? error.message : "Published preview is unavailable.");
        });
      return () => {
        cancelled = true;
      };
    }
    setPreviewError("");
    setPreviewUrl("");
    void issueDraftPreview(previewPath)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch((error) => {
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : "Draft preview is unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [authorized, previewOpen, previewPath, previewSource, previewVersion]);

  useEffect(() => {
    if (!previewOpen) return;
    const trigger = previewTriggerRef.current;
    previewPanelRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !confirmAction) closePreview();
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      trigger?.focus();
    };
  }, [previewOpen, confirmAction, closePreview]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const trigger = sidebarTriggerRef.current;
    sidebarCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
      else trapFocus(sidebarRef.current, event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!loaded.current || !authorized) return;
    try { window.localStorage.setItem(`${crashRecoveryKey}:${actorRef.current}`, JSON.stringify(settings)); } catch { /* mutation recovery is independently persisted before send */ }
    if (writeBusy || editorIssue || manualPending.current) return;
    if (JSON.stringify(settings) !== lastServerDraft.current && hasChanges) setStatus("dirty");
    const timer = window.setTimeout(() => {
      if (writeTask.current || manualPending.current || issueRef.current) return;
      if (!hasChanges) {
        if (draftMeta) void executeEditor("discard_draft", { note: "Draft matched the published version" });
      } else if (JSON.stringify(settingsRef.current) !== lastServerDraft.current) {
        void executeEditor("save_draft", { note: "Autosaved draft", area: `${selected.area} / ${selected.page}` });
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [authorized, draftMeta, executeEditor, hasChanges, selected.area, selected.page, settings, writeBusy, editorIssue]);

  useEffect(() => {
    if (!confirmAction) return;
    focusBeforeDialog.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmAction(null);
      else trapFocus(confirmDialogRef.current, event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      focusBeforeDialog.current?.focus();
      focusBeforeDialog.current = null;
    };
  }, [confirmAction]);

  function updateContent(key: string, value: string) {
    const entry = contentRegistry.find((candidate) => candidate.key === key);
    if (entry && ["security-locked", "data-derived", "browser-platform"].includes(entry.classification)) return;
    setSettings((current) => {
      let next = { ...current, content: { ...current.content, [key]: value } };
      const bind = legacyContentBindings[key];
      if (bind) next = bind(next, value);
      return next;
    });
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function publish() { await executeEditor("publish", { note, area: `${selected.area} / ${selected.page}` }, true); }
  async function discardDraft() { await executeEditor("discard_draft", { note: "Discarded from Content Studio" }, true); }
  async function restoreRevision(revision: Revision) { await executeEditor("restore_revision", { revisionId: revision.id, note: `Restored revision from ${revision.publishedAt}`, area: "Revision history" }, true); }

  function loadAdvancedJson() {
    if (!advancedUnlocked) {
      setMessage("Unlock Settings JSON before loading an import.");
      setStatus("error");
      return;
    }
    try {
      const parsed = JSON.parse(advancedJson) as Partial<EditableSiteSettings>;
      const next = hydrateLegacyContent(mergeSiteSettings(parsed));
      const validation = validateEditorSettings(next, parsed.brandLogos);
      if (Object.keys(validation).length) {
        setErrors(validation);
        setMessage("JSON is valid, but the imported settings need corrections before they can be loaded.");
        setStatus("error");
        return;
      }
      setSettings(next);
      applyThemeSettings(next);
      setMessage("Validated JSON loaded. Autosave will store it as the shared draft.");
      setStatus("dirty");
    } catch {
      setMessage("Settings JSON is not valid JSON.");
      setStatus("error");
    }
  }

  function downloadSettingsBackup() {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qrguitar-content-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Settings backup downloaded.");
  }

  async function copySettingsExport() {
    if (!authorized || !actorRef.current) return;
    const attempt = ++copyExportAttempt.current;
    const actor = actorRef.current, snapshot = settingsRef.current, generation = sitePreviewGeneration();
    const isCurrent = () => copyExportAttempt.current === attempt && actorRef.current === actor
      && settingsRef.current === snapshot && sitePreviewGeneration() === generation;
    setCopyExportFeedback("Copying export…");
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      if (isCurrent()) setCopyExportFeedback("Settings export copied.");
    } catch {
      if (isCurrent()) setCopyExportFeedback("Could not copy automatically. Use Download backup to save the settings export.");
    }
  }

  function saveBrandLogo() {
    const key = normalizeBrandLogoKey(brandName);
    const url = brandLogoUrl.trim();
    if (!key || !isSafeBrandLogoUrl(url)) {
      setMessage("Enter a brand and a valid https URL or site-relative path.");
      setStatus("error");
      return;
    }
    setSettings((current) => ({ ...current, brandLogos: { ...current.brandLogos, [key]: url } }));
    setBrandName("");
    setBrandLogoUrl("");
    setStatus("dirty");
    setMessage("Brand logo added to the draft.");
  }

  async function sendEmailTest() {
    setEmailSending(true);
    setMessage("Sending a safe test to the authenticated admin…");
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Sign in with an authorized admin account.");
      const fields = Object.fromEntries(selectedEntries.map((entry) => [entry.key, settings.content[entry.key] ?? entry.defaultValue]));
      const response = await fetch("/api/site-editor/test-email", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ fields })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Test email failed.");
      setStatus("saved");
      setMessage(payload.message || "Test email sent to the authenticated admin.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Test email failed.");
    } finally {
      setEmailSending(false);
    }
  }

  const tree = (
    <nav className="cms-tree" aria-label="Content sections">
      <div className="cms-mode-switch" role="group" aria-label="Editing mode">
        <button
          type="button"
          className={editorMode === "content" ? "active" : ""}
          onClick={() => {
            setEditorMode("content");
            if (selected.area === "Advanced" || selected.area === "Emails" || selected.area === "SEO" || selected.page === "Theme") {
              setSelected({ area: "Marketing", page: "Homepage" });
            }
          }}
        >
          Content
        </button>
        <button
          type="button"
          className={editorMode === "advanced" ? "active" : ""}
          onClick={() => {
            setEditorMode("advanced");
            setSelected({ area: "Emails", page: contentPagesForArea("Emails")[0] || "Service" });
          }}
        >
          Advanced
        </button>
      </div>
      <div className="cms-tree-search">
        <Search size={16} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search content" aria-label="Search content" />
      </div>
      {contentAreas.filter((area) => editorMode === "content" ? !["Emails", "SEO"].includes(area) : ["Emails", "SEO"].includes(area)).map((area) => (
        <details open={Boolean(query) || area === selected.area} key={area}>
          <summary>{area}</summary>
          <div>
            {contentPagesForArea(area).map((page) => (
              <button
                type="button"
                className={selected.area === area && selected.page === page ? "active" : ""}
                onClick={() => { setSelected({ area, page }); setQuery(""); setSidebarOpen(false); }}
                key={page}
              >
                {page}
              </button>
            ))}
          </div>
        </details>
      ))}
      {editorMode === "content" ? (
        <details open={selected.area === "Design"}>
          <summary>Design</summary>
          <div>
            <button type="button" className={selected.page === "Brand assets" ? "active" : ""} onClick={() => { setSelected({ area: "Design", page: "Brand assets" }); setSidebarOpen(false); }}>Brand assets</button>
          </div>
        </details>
      ) : (
        <>
          <details open={selected.area === "Design"}>
            <summary>Design</summary>
            <div>
              {(["Theme", "Brand assets"] as SpecialPage[]).map((page) => (
                <button type="button" className={selected.page === page ? "active" : ""} onClick={() => { setSelected({ area: "Design", page }); setSidebarOpen(false); }} key={page}>{page}</button>
              ))}
            </div>
          </details>
          <details open={selected.area === "Advanced"}>
            <summary>Advanced</summary>
            <div>
              {(["Revision history", "Copy coverage", "Advanced JSON"] as SpecialPage[]).map((page) => (
                <button type="button" className={selected.page === page ? "active" : ""} onClick={() => { setSelected({ area: "Advanced", page }); setSidebarOpen(false); }} key={page}>{page}</button>
              ))}
            </div>
          </details>
        </>
      )}
      {changeCount ? <div className="cms-recent-edit"><span>Draft activity</span><strong>{changeCount} unpublished {changeCount === 1 ? "change" : "changes"}</strong><small>{selected.page} is open</small></div> : null}
    </nav>
  );

  const standardEditor = (
    <div className="cms-fields">
      {compositionPageKey ? (
        <SiteCompositionEditor
          pageKey={compositionPageKey}
          sections={settings.composition[compositionPageKey].sections}
          onChange={(sections) => setSettings((current) => ({
            ...current,
            composition: {
              ...current.composition,
              [compositionPageKey]: { sections }
            }
          }))}
        />
      ) : null}
      {fieldGroups.map(([section, entries]) => {
        const isOpen = section === openFieldSection;
        return (
        <section className={`cms-field-group cms-content-section${isOpen ? " is-open" : ""}`} key={section}>
          <button type="button" className="cms-content-section-head" aria-expanded={isOpen} onClick={() => setOpenFieldSection(isOpen ? "" : section)}>
            <span><small>{selected.page}</small><strong>{section}</strong><em>{entries.length} {entries.length === 1 ? "field" : "fields"}</em></span>
            <ChevronDown className={isOpen ? "is-open" : ""} size={18} />
          </button>
          {isOpen ? <div className="cms-field-list">
            {entries.map((entry) => {
              const value = settings.content[entry.key] ?? entry.defaultValue;
              const id = `content-${entry.key.replace(/[^a-z0-9]+/gi, "-")}`;
              const locked = ["security-locked", "data-derived", "browser-platform"].includes(entry.classification);
              return (
                <label className={`${errors[entry.key] ? "cms-field has-error" : "cms-field"}${locked ? " is-locked" : ""}`} htmlFor={id} key={entry.key}>
                  <span className="cms-field-label">
                    <strong>{entry.label}</strong>
                    <span>{locked ? <small className="cms-classification is-locked">Managed by system</small> : null}<small>{value.length}/{entry.maxLength}</small></span>
                  </span>
                  {entry.type === "textarea" ? (
                    <textarea id={id} value={value} rows={4} maxLength={entry.maxLength} readOnly={locked} aria-readonly={locked} onChange={(event) => updateContent(entry.key, event.target.value)} />
                  ) : entry.type === "select" ? (
                    <select id={id} value={value} disabled={locked} aria-disabled={locked} onChange={(event) => updateContent(entry.key, event.target.value)}>
                      {(entry.allowedValues || []).map((option) => <option value={option} key={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input id={id} type={entry.type === "email" ? "email" : "text"} value={value} maxLength={entry.maxLength} readOnly={locked} aria-readonly={locked} onChange={(event) => updateContent(entry.key, event.target.value)} />
                  )}
                  <span className="cms-field-help">{errors[entry.key] || (locked ? `${entry.help} This value is intentionally read-only.` : entry.help)}</span>
                  {entry.allowedVariables?.length ? (
                    <span className="cms-variable-list">Allowed variables: {entry.allowedVariables.map((variable) => <code key={variable}>{`{{${variable}}}`}</code>)}</span>
                  ) : null}
                  {!locked && value !== entry.defaultValue ? <button type="button" className="cms-field-reset" onClick={(event) => { event.preventDefault(); updateContent(entry.key, entry.defaultValue); }}><RotateCcw size={13} /> Reset field</button> : null}
                </label>
              );
            })}
          </div> : null}
        </section>
      )})}
      {!selectedEntries.length ? <div className="cms-empty"><Search size={22} /><h2>No content matched.</h2><p>Try a page name, field label, or content key.</p></div> : null}
    </div>
  );

  const emailSubject = selectedEntries.find((entry) => entry.key.endsWith(".subject"));
  const emailPreheader = selectedEntries.find((entry) => entry.key.endsWith(".preheader"));
  const emailHeading = selectedEntries.find((entry) => entry.key.endsWith(".heading"));
  const emailBody = selectedEntries.find((entry) => entry.key.endsWith(".body"));
  const emailCta = selectedEntries.find((entry) => entry.key.endsWith(".cta"));
  const emailFooter = selectedEntries.find((entry) => entry.key.endsWith(".footer"));
  const emailEditor = (
    <div className="cms-fields">
      {standardEditor}
      <section className="cms-field-group cms-email-studio">
        <header><div><span>Safe preview</span><h2>Email preview</h2></div><Send size={20} /></header>
        <p className="cms-section-intro">Whitelisted variables are replaced with sample values here. Previewing never sends an email or exposes a real token.</p>
        <div className="cms-email-preview">
          <div className="cms-email-envelope">
            <span>Subject</span>
            <strong>{emailPreviewValue(emailSubject ? settings.content[emailSubject.key] : `${selected.page} notification`)}</strong>
            <small>{emailPreviewValue(emailPreheader ? settings.content[emailPreheader.key] : "A secure QRguitar update is ready.")}</small>
          </div>
          <article>
            <div className="cms-email-brand">QR<span>guitar</span></div>
            <p className="cms-email-kicker">QRguitar notification</p>
            <h3>{emailPreviewValue(emailHeading ? settings.content[emailHeading.key] : selected.page)}</h3>
            <p>{emailPreviewValue(emailBody ? settings.content[emailBody.key] : "Review this QRguitar update securely from your account.")}</p>
            <span className="cms-email-button">{emailCta ? settings.content[emailCta.key] : "Open QRguitar"}</span>
            <small>{emailPreviewValue(emailFooter ? settings.content[emailFooter.key] : "QRguitar · Permanent instrument identity and history")}</small>
          </article>
          <div className="cms-plain-preview">
            <strong>Plain-text preview</strong>
            <pre>{`${emailPreviewValue(emailPreheader ? settings.content[emailPreheader.key] : "A secure QRguitar update is ready.")}\n\n${emailPreviewValue(emailHeading ? settings.content[emailHeading.key] : selected.page)}\n\n${emailPreviewValue(emailBody ? settings.content[emailBody.key] : "Review this QRguitar update securely from your account.")}\n\n${emailCta ? settings.content[emailCta.key] : "Open QRguitar"}\n\n${emailPreviewValue(emailFooter ? settings.content[emailFooter.key] : "QRguitar · Permanent instrument identity and history")}`}</pre>
          </div>
        </div>
        <div className="cms-email-actions">
          <button type="button" className="button secondary" onClick={() => void sendEmailTest()} disabled={emailSending}>
            <Send size={16} /> {emailSending ? "Sending test…" : "Send test to my admin email"}
          </button>
          <small>The recipient is fixed to the authenticated admin account. Addresses cannot be entered here.</small>
        </div>
      </section>
    </div>
  );

  const seoTitleEntry = selectedEntries.find((entry) => entry.key.endsWith(".title"));
  const seoDescriptionEntry = selectedEntries.find((entry) => entry.key.endsWith(".description"));
  const seoOgTitleEntry = selectedEntries.find((entry) => entry.key.endsWith(".ogTitle"));
  const seoOgDescriptionEntry = selectedEntries.find((entry) => entry.key.endsWith(".ogDescription"));
  const seoImageEntry = selectedEntries.find((entry) => entry.key.endsWith(".image"));
  const seoIndexingEntry = selectedEntries.find((entry) => entry.key.endsWith(".indexing"));
  const seoTitle = seoTitleEntry ? settings.content[seoTitleEntry.key] : settings.seo.title;
  const seoDescription = seoDescriptionEntry ? settings.content[seoDescriptionEntry.key] : settings.seo.description;
  const seoOgTitle = seoOgTitleEntry ? settings.content[seoOgTitleEntry.key] : seoTitle;
  const seoOgDescription = seoOgDescriptionEntry ? settings.content[seoOgDescriptionEntry.key] : seoDescription;
  const seoIndexingValue = seoIndexingEntry ? settings.content[seoIndexingEntry.key] : "index, follow";
  const seoIndexingValid = !seoIndexingEntry || seoIndexingEntry.allowedValues?.includes(seoIndexingValue) === true;
  const seoEditor = (
    <div className="cms-fields">
      {standardEditor}
      <section className="cms-field-group cms-seo-studio">
        <header><div><span>Search and social</span><h2>Live SEO preview</h2></div><Search size={20} /></header>
        <div className="cms-seo-guidance">
          <span className={seoTitle.length >= 30 && seoTitle.length <= 60 ? "is-pass" : "is-warning"}>Title {seoTitle.length}/60</span>
          <span className={seoDescription.length >= 70 && seoDescription.length <= 160 ? "is-pass" : "is-warning"}>Description {seoDescription.length}/160</span>
          <span className={seoImageEntry && settings.content[seoImageEntry.key] ? "is-pass" : "is-warning"}>{seoImageEntry ? "Social image set" : "Using global social image"}</span>
          <span className={!seoIndexingValid || seoIndexingValue.startsWith("noindex") ? "is-warning" : "is-pass"}>{seoIndexingValid ? seoIndexingValue : "Invalid indexing value — page blocked"}</span>
        </div>
        <div className="cms-search-preview">
          <span>https://www.qrguitar.com{previewPath === "/" ? "" : previewPath}</span>
          <h3>{seoTitle || "Untitled QRguitar page"}</h3>
          <p>{seoDescription || "Add a clear description for search results."}</p>
        </div>
        <div className="cms-social-preview">
          <div>{seoImageEntry ? settings.content[seoImageEntry.key] : settings.seo.image}</div>
          <strong>{seoOgTitle || "QRguitar"}</strong>
          <p>{seoOgDescription || "Add a social description."}</p>
          <small>qrguitar.com</small>
        </div>
      </section>
    </div>
  );

  const themeEditor = (
    <section className="cms-field-group">
      <header><div><span>Design system</span><h2>Theme</h2></div><Paintbrush size={20} /></header>
      <p className="cms-section-intro">Change the small set of approved QRguitar color tokens. Preview contrast before publishing.</p>
      <div className="cms-color-grid">
        {Object.entries(settings.colors).map(([key, value]) => (
          <label className="cms-color-field" key={key}>
            <span><i style={{ background: value }} />{key.replace(/([A-Z])/g, " $1")}</span>
            <input type="text" value={value} maxLength={7} onChange={(event) => {
              const next = { ...settings, colors: { ...settings.colors, [key]: event.target.value } };
              setSettings(next);
              applyThemeSettings(next);
            }} />
          </label>
        ))}
      </div>
      <div className="cms-contrast-grid" aria-label="Theme contrast checks">
        {[
          ["Primary text", textContrast, 4.5],
          ["Primary action", actionContrast, 4.5],
          ["Accent text", accentContrast, 3]
        ].map(([label, ratio, minimum]) => {
          const numericRatio = typeof ratio === "number" ? ratio : null;
          const passes = numericRatio !== null && numericRatio >= Number(minimum);
          return <div className={passes ? "is-pass" : "is-warning"} key={String(label)}><span>{label}</span><strong>{numericRatio ? `${numericRatio.toFixed(2)}:1` : "Invalid color"}</strong><small>{passes ? "Readable" : `Needs ${minimum}:1`}</small></div>;
        })}
      </div>
      <div className="cms-theme-sample" style={{ background: settings.colors.background, color: settings.colors.text, borderColor: settings.colors.gold }}>
        <span style={{ color: settings.colors.gold }}>Live token preview</span>
        <h3>Clear, calm, unmistakably QRguitar.</h3>
        <span className="cms-theme-action-sample" style={{ background: settings.colors.cream, color: settings.colors.background }}>Primary action</span>
      </div>
    </section>
  );

  const brandEditor = (
    <div className="cms-fields">
      <section className="cms-field-group">
        <header><div><span>Design system</span><h2>Brand assets</h2></div><ImageIcon size={20} /></header>
        <p className="cms-section-intro">Official brand logos are controlled here. Instrument owners cannot replace a brand identity.</p>
        <div className="cms-inline-form">
          <label>Brand<input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Fender" /></label>
          <label>Transparent logo URL<input value={brandLogoUrl} onChange={(event) => setBrandLogoUrl(event.target.value)} placeholder="/brands/fender.svg" /></label>
          <button className="button secondary" type="button" onClick={saveBrandLogo}>Add to draft</button>
        </div>
      </section>
      <section className="cms-field-group">
        <header><div><span>Registry</span><h2>Official logos</h2></div><span>{Object.keys(settings.brandLogos).length}</span></header>
        <div className="cms-asset-list">
          {Object.entries(settings.brandLogos).map(([key, url]) => (
            <div key={key}><img src={url} alt="" loading="lazy" fetchPriority="low" decoding="async" width={520} height={120} referrerPolicy="no-referrer" /><div><strong>{key}</strong><small>{url}</small></div><button type="button" onClick={() => setSettings((current) => { const next = { ...current.brandLogos }; delete next[key]; return { ...current, brandLogos: next }; })}>Remove</button></div>
          ))}
          {!Object.keys(settings.brandLogos).length ? <p>No official logos have been added. Brand names continue to render as text.</p> : null}
        </div>
      </section>
    </div>
  );

  const historyEditor = (
    <section className="cms-field-group">
      <header><div><span>Publishing safety</span><h2>Revision history</h2></div><FileClock size={20} /></header>
      <p className="cms-section-intro">Restore places a prior version into the shared draft. Nothing goes live until you review and publish it.</p>
      <div className="cms-revision-list">
        {revisions.map((revision) => (
          <article key={revision.id}>
            <div><strong>{revision.note}</strong><span>{revision.area}</span><small>{formatTime(revision.publishedAt)} · {revision.changedFields.length} changed fields</small></div>
            <button type="button" className="button secondary" onClick={() => setConfirmAction({ kind: "restore", revision })}><RotateCcw size={15} /> Restore to draft</button>
          </article>
        ))}
        {!revisions.length ? <p>No prior published revisions yet.</p> : null}
      </div>
    </section>
  );

  const coverageEditor = (
    <div className="cms-fields">
      <section className="cms-field-group">
        <header><div><span>Content governance</span><h2>Copy coverage</h2></div><Code2 size={20} /></header>
        <p className="cms-section-intro">Every application string is assigned to an editable, locked, data-derived, or browser-owned class. Locked copy is shown for review but cannot be weakened from Content Studio.</p>
        <div className="cms-coverage-summary">
          <div><strong>{contentCoverageSummary.totalKeys}</strong><span>registered fields</span></div>
          <div><strong>{contentCoverageSummary.editableStandard + contentCoverageSummary.editableAdvanced}</strong><span>editable fields</span></div>
          <div><strong>{contentCoverageSummary.securityLocked}</strong><span>security locked</span></div>
          <div className={contentCoverageSummary.unresolved ? "is-warning" : "is-pass"}><strong>{contentCoverageSummary.unresolved}</strong><span>unclassified</span></div>
        </div>
      </section>
      <section className="cms-field-group">
        <header><div><span>Machine-readable manifest</span><h2>Classification sources</h2></div><span>{contentCoverageManifest.length}</span></header>
        <div className="cms-coverage-list">
          {contentCoverageManifest.map((entry) => <article key={entry.source}><div><strong>{entry.source}</strong><span className={`cms-classification is-${entry.classification}`}>{entry.classification.replace(/-/g, " ")}</span></div><p>{entry.reason}</p></article>)}
        </div>
      </section>
    </div>
  );

  const advancedEditor = (
    <section className="cms-field-group">
      <header><div><span>Advanced</span><h2>Settings JSON</h2></div>{advancedUnlocked ? <UnlockKeyhole size={20} /> : <LockKeyhole size={20} />}</header>
      <p className="cms-section-intro">Normal editing never requires JSON. This validated import/export surface is for recovery and controlled migrations.</p>
      <div className={advancedUnlocked ? "cms-json-state is-unlocked" : "cms-json-state"}>
        <strong>{advancedUnlocked ? "Editing unlocked" : "Read-only by default"}</strong>
        <span>{advancedUnlocked ? "Validate before loading. Publishing still requires the normal Publish action." : "Download a backup before unlocking an advanced import."}</span>
      </div>
      <textarea className="cms-json" value={advancedJson} onChange={(event) => setAdvancedJson(event.target.value)} rows={26} spellCheck={false} readOnly={!advancedUnlocked} aria-readonly={!advancedUnlocked} />
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={downloadSettingsBackup}><Save size={16} /> Download backup</button>
        <button type="button" className="button secondary" onClick={() => setAdvancedUnlocked((value) => !value)}>{advancedUnlocked ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />} {advancedUnlocked ? "Lock editor" : "Unlock editor"}</button>
        <button type="button" className="button secondary" onClick={loadAdvancedJson} disabled={!advancedUnlocked}><Upload size={16} /> Validate and load draft</button>
        <button type="button" className="button secondary" onClick={() => void copySettingsExport()}><Clipboard size={16} /> Copy export</button>
      </div>
      {copyExportFeedback ? <p className="form-message" role="status" aria-live="polite">{copyExportFeedback}</p> : null}
    </section>
  );

  if (!authorized) {
    return (
      <><Nav /><main className="section cms-access"><div className="shell"><section className="card"><div className="eyebrow">Owner tools</div><h1>{status === "loading" ? "Checking Site Editor access." : "Admin access required."}</h1><p>{message}</p>{status !== "loading" ? <Link className="button" href={`/login?next=${encodeURIComponent("/site-editor")}`}>Sign in</Link> : null}</section></div></main><Footer /></>
    );
  }

  return (
    <>
      <Nav />
      <main className={previewOpen ? "cms-page is-preview-open" : "cms-page"}>
        <header className="cms-commandbar">
          <div>
            <button ref={sidebarTriggerRef} type="button" className="cms-mobile-tree" onClick={() => setSidebarOpen(true)} aria-label="Open content tree" aria-expanded={sidebarOpen} aria-controls="cms-content-tree"><Menu size={18} /></button>
            <div><span>Content Studio</span><strong>{selected.page}</strong></div>
          </div>
          <div className={`cms-save-state is-${status}`} aria-live="polite">
            {status === "saving" ? <RefreshCw size={14} className="spin" /> : status === "saved" ? <Check size={14} /> : status === "error" ? <X size={14} /> : <Cloud size={14} />}
            <span>{status === "dirty" ? `${changeCount || 1} unpublished ${changeCount === 1 ? "change" : "changes"}` : status === "saving" ? "Saving draft…" : message}</span>
            {editorIssue ? <div role="alert"><button type="button" onClick={exportLocalChanges}>Export local changes</button>{editorIssue === "uncertain" ? <button type="button" disabled={writeBusy} onClick={() => void executeEditor("", {}, true, true)}>Retry the same save</button> : null}{editorIssue === "error" && !mutationsRef.current?.storageProblem ? <button type="button" disabled={writeBusy} onClick={() => { setEditorIssue(""); setStatus("dirty"); }}>Resume saving</button> : null}<button type="button" disabled={writeBusy} onClick={() => { exportLocalChanges(); window.location.reload(); }}>Export and reload latest</button></div> : null}
          </div>
          <div className="cms-command-actions">
            <button type="button" className="button secondary" onClick={() => setConfirmAction({ kind: "discard" })} disabled={!draftMeta && !hasChanges}>Discard draft</button>
            <button ref={previewTriggerRef} type="button" className="button secondary" onClick={() => previewOpen ? closePreview() : setPreviewOpen(true)} aria-expanded={previewOpen} aria-controls="cms-site-preview"><Eye size={16} /> {previewOpen ? "Hide preview" : "Preview"}</button>
            <button type="button" className="button" onClick={() => setConfirmAction({ kind: "publish" })} disabled={status === "saving" || !hasChanges}><Send size={16} /> Publish</button>
          </div>
        </header>

        <div className={previewOpen ? "cms-workspace" : "cms-workspace is-preview-collapsed"}>
          <aside ref={sidebarRef} id="cms-content-tree" className={sidebarOpen ? "cms-sidebar is-open" : "cms-sidebar"} role={sidebarOpen ? "dialog" : undefined} aria-modal={sidebarOpen ? true : undefined} aria-label="Site content navigation" tabIndex={sidebarOpen ? -1 : undefined}>
            <div className="cms-sidebar-head"><div><span>QRguitar</span><strong>Site content</strong></div><button ref={sidebarCloseRef} type="button" onClick={() => setSidebarOpen(false)} aria-label="Close content tree"><PanelLeftClose size={18} /></button></div>
            {tree}
          </aside>
          {sidebarOpen ? <button type="button" className="cms-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close content tree" /> : null}

          <section className="cms-editor">
            <div className="cms-editor-heading">
              <div>
                <span>{selected.area} / {selected.page}</span>
                <h1>{selected.page}</h1>
                <p>{query ? `Search results for "${query}"` : pagePurpose(selected)}</p>
                <div className="cms-editor-timestamps">
                  {draftMeta?.updatedAt
                    ? <span>Draft saved <strong>{formatTime(draftMeta.updatedAt)}</strong></span>
                    : <span>Draft <strong>None</strong></span>}
                  <span>Published <strong>{formatTime(publishedAt)}</strong></span>
                </div>
              </div>
              <button type="button" className="button secondary cms-review-changes" onClick={() => setShowCompare((value) => !value)} disabled={!changeCount} aria-expanded={showCompare} aria-controls="cms-change-review"><Clock3 size={16} /> {changeCount ? `Review ${changeCount} ${changeCount === 1 ? "change" : "changes"}` : "No changes"}</button>
            </div>
            {showCompare ? (
              <section className="cms-compare" id="cms-change-review" aria-label="Draft changes compared with published settings">
                <header><strong>Draft compared with published</strong><button type="button" onClick={() => setShowCompare(false)} aria-label="Close comparison"><X size={16} /></button></header>
                {changeCount ? changeReview.slice(0, 100).map((change) => <div key={change.key}><code><small>{change.category}</small>{change.key}</code><span>{change.before}</span><strong>→</strong><span>{change.after}</span></div>) : <p>No settings differ from the published version.</p>}
                {changeCount > 100 ? <p>Showing the first 100 of {changeCount} changes. Download a backup to review the complete settings document.</p> : null}
              </section>
            ) : null}
            {selected.area === "Design" && selected.page === "Theme" ? themeEditor : selected.area === "Design" ? brandEditor : selected.page === "Revision history" ? historyEditor : selected.page === "Copy coverage" ? coverageEditor : selected.page === "Advanced JSON" ? advancedEditor : selected.area === "Emails" ? emailEditor : selected.area === "SEO" ? seoEditor : standardEditor}
          </section>

          {previewOpen ? <aside ref={previewPanelRef} id="cms-site-preview" className="cms-preview-panel" role="region" aria-label={`${previewSource === "draft" ? "Draft" : "Published"} site preview`} tabIndex={-1}>
            <div className="cms-preview-toolbar">
              <div className="cms-segmented" role="group" aria-label="Preview source">
                <button type="button" className={previewSource === "draft" ? "active" : ""} onClick={() => setPreviewSource("draft")}>Draft</button>
                <button type="button" className={previewSource === "published" ? "active" : ""} onClick={() => setPreviewSource("published")}>Published</button>
              </div>
              <div className="cms-device-buttons" role="group" aria-label="Preview size">
                <button type="button" className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")} aria-label="Desktop preview"><Monitor size={16} /></button>
                <button type="button" className={device === "tablet" ? "active" : ""} onClick={() => setDevice("tablet")} aria-label="Tablet preview"><Tablet size={16} /></button>
                <button type="button" className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")} aria-label="Mobile preview"><Smartphone size={16} /></button>
              </div>
              <button type="button" onClick={() => setPreviewVersion((value) => value + 1)} aria-label="Refresh preview"><RefreshCw size={16} /></button>
              <a href={previewUrl || previewPath} target="_blank" rel="noreferrer" aria-label="Open full preview"><Eye size={16} /></a>
              <button type="button" className="cms-preview-close" onClick={closePreview} aria-label="Close preview"><PanelRightClose size={16} /><span>Close</span></button>
            </div>
            <div className={`cms-preview-frame is-${device}`}>
              {previewError ? <div className="cms-preview-error"><strong>Preview unavailable</strong><p>{previewError}</p><button type="button" onClick={() => setPreviewVersion((value) => value + 1)}>Try again</button></div> : null}
              {!previewError && previewUrl ? <iframe key={`${previewUrl}-${previewVersion}`} src={previewUrl} title={`${selected.page} ${previewSource} preview`} /> : null}
              {!previewError && !previewUrl ? <div className="cms-preview-loading"><RefreshCw size={18} className="spin" /><span>Opening the real {previewSource} page…</span></div> : null}
            </div>
            <div className="cms-preview-meta">
              <div><span>Selected route</span><strong>{previewPath}</strong></div>
              <div><span>Previewing</span><strong>{previewSource === "draft" ? "Shared draft" : "Published site"}</strong></div>
            </div>
          </aside> : null}
        </div>
        {confirmAction ? (
          <div className="cms-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmAction(null); }}>
            <section ref={confirmDialogRef} className="cms-modal" role="dialog" aria-modal="true" aria-labelledby="cms-confirm-title" aria-describedby="cms-confirm-description" tabIndex={-1}>
              <header><div><span>Publishing safety</span><h2 id="cms-confirm-title">{confirmAction.kind === "discard" ? "Discard shared draft?" : confirmAction.kind === "publish" ? `Publish ${selected.page}?` : "Restore this revision?"}</h2></div><button ref={confirmCloseRef} type="button" onClick={() => setConfirmAction(null)} aria-label="Close confirmation"><X size={18} /></button></header>
              <p id="cms-confirm-description">{confirmAction.kind === "discard"
                ? "This removes the current shared draft and returns the editor to the published version. Published pages will not change."
                : confirmAction.kind === "publish"
                  ? `${changeCount || 1} unpublished ${changeCount === 1 ? "change" : "changes"} will be published globally. The prior live version stays available in revision history.`
                  : `This copies the version published ${formatTime(confirmAction.revision.publishedAt)} into the shared draft. It will not go live until you publish it.`}</p>
              {confirmAction.kind === "publish" ? <label className="cms-release-note">Release note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} placeholder={`What changed on ${selected.page}?`} maxLength={180} /></label> : null}
              <div className="cms-modal-actions">
                <button type="button" className="button secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
                <button type="button" className="button" disabled={writeBusy} onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  if (action.kind === "discard") void discardDraft();
                  else if (action.kind === "publish") void publish();
                  else void restoreRevision(action.revision);
                }}>{confirmAction.kind === "discard" ? "Discard draft" : confirmAction.kind === "publish" ? "Confirm publish" : "Restore to draft"}</button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </>
  );
}

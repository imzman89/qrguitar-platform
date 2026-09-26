"use client";
import { useUiText } from "../../components/UiTextProvider";


import {
  ArrowLeft,
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
import styles from "./site-editor.module.css";
import { usePathname } from "next/navigation";
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
  contentPreviewPathForSelection,
  validateContentValues,
  type ContentArea,
  type ContentRegistryEntry
} from "../../lib/content-registry";
import {
  createEmailTemplateSetupExport,
  emailTemplateDeliveryBoundary,
  emailTemplatePrefixFromKeys,
  nonNavigatingEmailPreviewHtml
} from "../../lib/email-template-boundary";
import { renderServiceReviewEmailDocument } from "../../lib/transactional-email-renderer";

import {
  applyThemeSettings,
  defaultSiteSettings,
  isSafeBrandLogoUrl,
  mergeSiteSettings,
  normalizeBrandLogoKey,
  siteColorContrastRatio,
  siteSettingsKey,
  validateBrandLogoEntries,
  validateEditorialComposition,
  validateSiteThemeContrast,
  type EditableSiteSettings,
  type EditorialPageKey
} from "../../lib/site-settings";
import {
  createEditorMutationController,
  EditorLoadError,
  EditorMutationError,
  loadSiteEditorState,
  selectCompleteSectionSchema,
  selectEditorEntries,
  shouldReplaceEditorContent,
  type EditorMutationPayload
} from "../../lib/site-editor-client";
import { settingsChangeReview } from "../../lib/site-editor-review";
import { clearSitePreviewCookie, openSiteDraftPreview, sitePreviewGeneration, sitePreviewInvalidatedEvent } from "../../lib/site-preview-client";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";
import { AdminWorkspaceGate } from "../../components/AdminWorkspaceGate";

type PreviewDevice = "desktop" | "tablet" | "mobile";
type PreviewSource = "draft" | "published";
type EditorMode = "content" | "advanced";
type SpecialPage = "Theme" | "Brand assets" | "Revision history" | "Copy coverage" | "Advanced JSON";
type SelectedPage = { area: ContentArea | "Design" | "Advanced"; page: string };
type ConfirmAction = { kind: "discard" } | { kind: "publish" } | { kind: "restore"; revision: Revision };
type EmailTestFeedback = { tone: "pending" | "success" | "error"; message: string };

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
    ...validateEditorialComposition(settings.composition),
    ...validateSiteThemeContrast(settings.colors)
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

function SiteEditorWorkspace() {
  const ui = useUiText("app.site.editor.page");
  const pathname = usePathname() || "/site-editor";
  const adminEntry = pathname === "/admin/site-editor";
  const editorContinuation = adminEntry ? "/admin/site-editor" : "/site-editor";
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
  const [allTextQuery, setAllTextQuery] = useState("");
  const allTextMatches = useMemo(() => {
    const search = allTextQuery.trim().toLowerCase();
    if (search.length < 2) return [];
    return contentRegistry.filter((entry) => `${entry.page} ${entry.section} ${entry.label} ${entry.defaultValue} ${settings.content[entry.key] || ""}`.toLowerCase().includes(search)).slice(0, 30);
  }, [allTextQuery, settings.content]);
  const [message, setMessage] = useState("Checking admin access…");
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "dirty" | "error">("loading");
  const [authorized, setAuthorized] = useState(false);
  const [initialLoadFailure, setInitialLoadFailure] = useState<"" | "authorization" | "unavailable">("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [previewSource, setPreviewSource] = useState<PreviewSource>("draft");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("content");
  const [openFieldSection, setOpenFieldSection] = useState("");
  const [editingSurface, setEditingSurface] = useState<"content" | "arrangement">("content");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [advancedJson, setAdvancedJson] = useState("");
  const [advancedUnlocked, setAdvancedUnlocked] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailTestFeedback, setEmailTestFeedback] = useState<EmailTestFeedback | null>(null);
  const [copyExportFeedback, setCopyExportFeedback] = useState("");
  const copyExportAttempt = useRef(0);
  const [showCompare, setShowCompare] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const pendingTextField = useRef<ContentRegistryEntry | null>(null);
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

  const entrySelection = useMemo(() => {
    return selectEditorEntries(contentRegistry, selected, query);
  }, [query, selected]);
  const currentPageEntries = entrySelection.currentPage;
  const selectedEntries = entrySelection.results;
  const fieldGroups = useMemo(() => groupEntries(selectedEntries), [selectedEntries]);
  const activeSectionEntries = useMemo(
    () => selectCompleteSectionSchema(currentPageEntries, selectedEntries, openFieldSection),
    [currentPageEntries, openFieldSection, selectedEntries]
  );
  const activeSectionName = activeSectionEntries[0]?.section || "";
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
  const previewPath = contentPreviewPathForSelection(activeSectionEntries.length ? activeSectionEntries : currentPageEntries, selected.page) || "";
  const changeReview = useMemo(() => settingsChangeReview(settings, published), [published, settings]);
  const changeCount = changeReview.length;
  const mutationLocked = Boolean(editorIssue) || writeBusy;
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(published);
  const textContrast = siteColorContrastRatio(settings.colors.text, settings.colors.background);
  const actionContrast = siteColorContrastRatio(settings.colors.background, settings.colors.cream);
  const accentContrast = siteColorContrastRatio(settings.colors.gold, settings.colors.background);

  useEffect(() => {
    setCopyExportFeedback("");
    return () => { copyExportAttempt.current += 1; };
  }, [settings, advancedJson, authorized, selected.area, selected.page, writeBusy, emailSending]);

  useEffect(() => {
    const target = pendingTextField.current;
    setOpenFieldSection(target && fieldGroups.some(([section]) => section === target.section) ? target.section : fieldGroups[0]?.[0] || "");
  }, [fieldGroups]);

  useEffect(() => {
    const target = pendingTextField.current;
    if (!target || target.area !== selected.area || target.page !== selected.page || target.section !== openFieldSection) return;
    const field = document.getElementById(`content-${target.key.replace(/[^a-z0-9]+/gi, "-")}`);
    if (field) { field.focus(); field.scrollIntoView({ block: "center" }); pendingTextField.current = null; }
  }, [openFieldSection, selected]);

  useEffect(() => {
    setEditingSurface("content");
  }, [selected.area, selected.page]);

  useEffect(() => {
    setEmailTestFeedback(null);
  }, [activeSectionName, selected.area, selected.page]);

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
    const nextPublished = mergeSiteSettings(payload.published);
    const nextDraft = payload.draft ? mergeSiteSettings(payload.draft) : null;
    setPublished(nextPublished);
    setPublishedAt(payload.publishedAt || "");
    const next = preferDraft && nextDraft ? nextDraft : nextPublished;
    lastServerDraft.current = nextDraft ? JSON.stringify(nextDraft) : "";
    if (submittedSnapshot === undefined || shouldReplaceEditorContent(JSON.stringify(settingsRef.current), submittedSnapshot)) {
      setSettings(next); setAdvancedJson(JSON.stringify(next, null, 2)); applyThemeSettings(next);
    }
    setDraftMeta(payload.draftMeta || null); setRevisions(payload.revisions || []);
  }, [setSettings]);

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
      try { setSettings(mergeSiteSettings(JSON.parse(recovered))); } catch { /* keep server copy visible */ }
      setEditorIssue("uncertain"); setStatus("error"); setMessage(ui("ui.app.site.editor.page.e85c464416f3", "A previous save needs confirmation. Retry it before making another change."));
    } else if (controller.storageProblem) {
      setEditorIssue("error"); setStatus("error"); setMessage(ui("ui.app.site.editor.page.845056b445ef", "Recovery storage is unavailable. Export your local changes before reloading."));
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
      if (!controller) {
        if (manual) { setStatus("error"); setMessage(ui("ui.app.site.editor.page.cecbf3bf358c", "Reload Site Editor before making another publishing change.")); }
        return;
      }
      if (issueRef.current && !retry) {
        if (manual) {
          setStatus("error");
          setMessage(ui("ui.app.site.editor.page.eee0810038e1", "Resolve the current save issue with the recovery controls before publishing, discarding, or restoring."));
        }
        return;
      }
      const localSnapshot = retry ? controller.pending?.localSnapshot || JSON.stringify(settingsRef.current) : JSON.stringify(settingsRef.current);
      const submitted = settingsRef.current;
      if (!retry && action === "publish") {
        const validation = validateEditorSettings(submitted);
        const text = siteColorContrastRatio(submitted.colors.text, submitted.colors.background);
        const buttons = siteColorContrastRatio(submitted.colors.background, submitted.colors.cream);
        const accent = siteColorContrastRatio(submitted.colors.gold, submitted.colors.background);
        setErrors(validation);
        if (Object.keys(validation).length || text === null || buttons === null || accent === null || text < 4.5 || buttons < 4.5 || accent < 3) {
          setStatus("error"); setMessage(ui("ui.app.site.editor.page.bf88cc32f31d", "Fix highlighted content, keep primary text and actions at 4.5:1 contrast, and keep accent text at 3:1 before publishing.")); return;
        }
      }
      const operation = (async () => {
        setWriteBusy(true); setStatus("saving");
        try {
          const payload = await (retry ? controller.retry() : controller.mutate({ action, ...body, ...(["save_draft", "publish"].includes(action) ? { settings: submitted } : {}) }, versionsRef.current, localSnapshot)) as SiteEditorPayload;
          if (mutationsRef.current !== controller) return;
          applyPayload(payload, true, localSnapshot);
          const serverSnapshot = JSON.stringify(mergeSiteSettings(payload.draft || payload.published));
          const newerEdits = JSON.stringify(settingsRef.current) !== serverSnapshot;
          if (payload.superseded) {
            setEditorIssue("conflict"); setStatus("error"); setMessage(ui("ui.app.site.editor.page.a780f888e244", "Your previous change was saved. Another edit followed it; export local changes and reload before continuing."));
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
          setMessage(error instanceof Error ? error.message : ui("ui.app.site.editor.page.ebdc22e5a6c8", "The save could not be confirmed."));
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
      setMessage(error instanceof Error ? error.message : ui("ui.app.site.editor.page.69cc3b83164d", "Could not clear the draft preview cookie."));
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
      setPreviewError(ui("ui.app.site.editor.page.2a49ea34c2c6", "The signed-in account changed. Reload Site Editor before previewing."));
      setStatus("error"); setMessage(ui("ui.app.site.editor.page.e107cb92e5df", "Your account changed. Reload Site Editor to continue."));
    };
    window.addEventListener(sitePreviewInvalidatedEvent, invalidate);
    return () => window.removeEventListener(sitePreviewInvalidatedEvent, invalidate);
  }, [setSettings]);

  useEffect(() => {
    let cancelled = false;
    const started = sitePreviewGeneration();
    void loadSiteEditorState<SiteEditorPayload>(getSupabaseAccessToken)
      .then((payload) => {
        if (cancelled || started !== sitePreviewGeneration()) return;
        applyPayload(payload, true);
        setAuthorized(true);
        setInitialLoadFailure("");
        setStatus("saved");
        setMessage(payload.draft ? ui("ui.app.site.editor.page.e7a91e2b4bab", "Server draft loaded.") : ui("ui.app.site.editor.page.ca1f63cb40c8", "Published content loaded."));
        loaded.current = true;
        initializeMutations(payload.editorActorId!);
      })
      .catch((error) => {
        if (cancelled) return;
        setAuthorized(false);
        setInitialLoadFailure(error instanceof EditorLoadError ? error.kind : "unavailable");
        setStatus("error");
        setMessage(error instanceof Error ? error.message : ui("ui.app.site.editor.page.0f8bbd571c6c", "Could not load Site Editor. Retry when the service is available."));
      });
    return () => {
      cancelled = true;
    };
  }, [applyPayload, initializeMutations, loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    if (!authorized || !previewOpen) return;
    if (!previewPath) {
      setPreviewUrl("");
      setPreviewError(ui("ui.app.site.editor.page.previewUnavailableForSelection", "This selection needs a real permitted record or does not have a standalone page to preview."));
      return;
    }
    if (previewSource === "published") {
      setPreviewError("");
      setPreviewUrl("");
      void clearDraftPreview()
        .then(() => {
          if (!cancelled) setPreviewUrl(`${previewPath}?cmsPreview=published&v=${previewVersion}`);
        })
        .catch((error) => {
          if (!cancelled) setPreviewError(error instanceof Error ? error.message : ui("ui.app.site.editor.page.5f2c12ebe38c", "Published preview is unavailable."));
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
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : ui("ui.app.site.editor.page.4315de7fb3b8", "Draft preview is unavailable."));
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
      if (event.key === "Escape" && !confirmDialogRef.current) closePreview();
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      trigger?.focus();
    };
  }, [previewOpen, closePreview]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const mobileSidebar = window.matchMedia("(max-width: 900px)");
    if (!mobileSidebar.matches) {
      setSidebarOpen(false);
      return;
    }
    const trigger = sidebarTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
      else trapFocus(sidebarRef.current, event);
    };
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    mobileSidebar.addEventListener("change", closeAtDesktop);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      mobileSidebar.removeEventListener("change", closeAtDesktop);
      document.body.style.overflow = previousOverflow;
      if (mobileSidebar.matches) trigger?.focus();
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!loaded.current || !authorized) return;
    try { window.localStorage.setItem(`${crashRecoveryKey}:${actorRef.current}`, JSON.stringify(settings)); } catch { /* mutation recovery is independently persisted before send */ }
    if (writeBusy || editorIssue || manualPending.current) return;
    if (JSON.stringify(settings) !== lastServerDraft.current && hasChanges) setStatus("dirty");
    const timer = window.setTimeout(() => {
      if (writeTask.current || manualPending.current || issueRef.current) return;
      // Normalized equality cannot prove that a stored draft is identical. Discard requires confirmation.
      if (hasChanges && JSON.stringify(settingsRef.current) !== lastServerDraft.current) {
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
    setErrors((current) => ({ ...current, [key]: "", ...(key === "global.brand.name" ? { brandName: "" } : {}) }));
  }

  async function publish() { await executeEditor("publish", { note, area: `${selected.area} / ${selected.page}` }, true); }
  async function discardDraft() { await executeEditor("discard_draft", { note: "Discarded from Content Studio" }, true); }
  async function restoreRevision(revision: Revision) { await executeEditor("restore_revision", { revisionId: revision.id, note: `Restored revision from ${revision.publishedAt}`, area: "Revision history" }, true); }

  function loadAdvancedJson() {
    if (!advancedUnlocked) {
      setMessage(ui("ui.app.site.editor.page.302960c98c5c", "Unlock Settings JSON before loading an import."));
      setStatus("error");
      return;
    }
    try {
      const parsed = JSON.parse(advancedJson) as Partial<EditableSiteSettings>;
      const next = mergeSiteSettings(parsed);
      const validation = validateEditorSettings(next, parsed.brandLogos);
      if (Object.keys(validation).length) {
        setErrors(validation);
        setMessage(ui("ui.app.site.editor.page.499f64a6a071", "JSON is valid, but the imported settings need corrections before they can be loaded."));
        setStatus("error");
        return;
      }
      setSettings(next);
      applyThemeSettings(next);
      setMessage(ui("ui.app.site.editor.page.44f3536d98dc", "Validated JSON loaded. Autosave will store it as the shared draft."));
      setStatus("dirty");
    } catch {
      setMessage(ui("ui.app.site.editor.page.313358c4d59b", "Settings JSON is not valid JSON."));
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
    setMessage(ui("ui.app.site.editor.page.00f6795cf8d1", "Settings backup downloaded."));
  }

  async function copySettingsExport() {
    if (!authorized || !actorRef.current) return;
    const attempt = ++copyExportAttempt.current;
    const actor = actorRef.current, snapshot = settingsRef.current, generation = sitePreviewGeneration();
    const isCurrent = () => copyExportAttempt.current === attempt && actorRef.current === actor
      && settingsRef.current === snapshot && sitePreviewGeneration() === generation;
    setCopyExportFeedback(ui("ui.app.site.editor.page.f81f7545ce0a", "Copying export…"));
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      if (isCurrent()) setCopyExportFeedback(ui("ui.app.site.editor.page.6a46a60d6ff2", "Settings export copied."));
    } catch {
      if (isCurrent()) setCopyExportFeedback(ui("ui.app.site.editor.page.45a34082834d", "Could not copy automatically. Use Download backup to save the settings export."));
    }
  }

  function saveBrandLogo() {
    const key = normalizeBrandLogoKey(brandName);
    const url = brandLogoUrl.trim();
    const formErrors: Record<string, string> = {};
    if (!key) formErrors["brandLogos.new.name"] = "Enter a valid brand name.";
    if (!isSafeBrandLogoUrl(url)) formErrors["brandLogos.new.url"] = "Use an HTTPS URL or a site-relative path beginning with one slash.";
    if (Object.keys(formErrors).length) {
      setErrors((current) => ({ ...current, ...formErrors }));
      setMessage(ui("ui.app.site.editor.page.7c912eb1b432", "Enter a brand and a valid https URL or site-relative path."));
      setStatus("error");
      return;
    }
    setSettings((current) => ({ ...current, brandLogos: { ...current.brandLogos, [key]: url } }));
    setBrandName("");
    setBrandLogoUrl("");
    setErrors((current) => ({ ...current, "brandLogos.new.name": "", "brandLogos.new.url": "" }));
    setStatus("dirty");
    setMessage(ui("ui.app.site.editor.page.9a80291326a6", "Brand logo added to the draft."));
  }

  function downloadEmailSetupExport() {
    if (selected.area !== "Emails" || !activeSectionEntries.length) return;
    const fields = Object.fromEntries(activeSectionEntries.map((entry) => [entry.key, settings.content[entry.key] ?? entry.defaultValue]));
    const templatePrefix = emailTemplatePrefixFromKeys(Object.keys(fields));
    const bundle = createEmailTemplateSetupExport(templatePrefix, fields);
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `qrguitar-${templatePrefix.replace(/[^a-z0-9]+/gi, "-")}-setup.json`;
    link.click();
    URL.revokeObjectURL(url);
    setEmailTestFeedback({
      tone: "success",
      message: ui("ui.app.site.editor.page.emailSetupExportDownloaded", "Template setup export downloaded.")
    });
  }
  async function sendEmailTest() {
    setEmailSending(true);
    setEmailTestFeedback({ tone: "pending", message: "Sending a safe test to the authenticated admin…" });
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Sign in with an authorized admin account.");
      if (selected.area !== "Emails" || !activeSectionEntries.length) throw new Error("Choose an email template before sending a test.");
      const fields = Object.fromEntries(activeSectionEntries.map((entry) => [entry.key, settings.content[entry.key] ?? entry.defaultValue]));
      const response = await fetch("/api/site-editor/test-email", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ fields })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Test email failed.");
      setEmailTestFeedback({ tone: "success", message: payload.message || "Test email accepted by the provider for the authenticated admin." });
    } catch (error) {
      setEmailTestFeedback({ tone: "error", message: error instanceof Error ? error.message : "Test email failed." });
    } finally {
      setEmailSending(false);
    }
  }

  const tree = (
    <nav className="cms-tree" aria-label={ui("ui.app.site.editor.page.42a94d91df70", "Content sections")}>
      <div className="cms-mode-switch" role="group" aria-label={ui("ui.app.site.editor.page.208d4e01ad3b", "Editing mode")}>
        <button
          type="button"
          className={editorMode === "content" ? "active" : ""}
          onClick={() => {
            setEditorMode("content");
            if (selected.area === "Advanced" || selected.area === "Emails" || selected.area === "SEO" || selected.page === "Theme") {
              setSelected({ area: "Marketing", page: "Homepage" });
            }
          }}
        >{ui("ui.app.site.editor.page.47bd29075f8b", "Content")}</button>
        <button
          type="button"
          className={editorMode === "advanced" ? "active" : ""}
          onClick={() => {
            setEditorMode("advanced");
            setSelected({ area: "Emails", page: contentPagesForArea("Emails")[0] || "Service" });
          }}
        >{ui("ui.app.site.editor.page.9f088dbebd6c", "Advanced")}</button>
      </div>
      <div className="cms-tree-search">
        <Search size={16} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ui("ui.app.site.editor.page.005abd0bb982", "Search {{value1}}", { value1: selected.page })} aria-label={ui("ui.app.site.editor.page.be52471041bb", "Search {{value1}} content", { value1: selected.page })} />
      </div>
      <div className="cms-tree-search">
        <Search size={16} aria-hidden="true" />
        <input value={allTextQuery} onChange={(event) => setAllTextQuery(event.target.value)} placeholder={ui("ui.app.site.editor.page.findAllPlaceholder", "Find wording on any page")} aria-label={ui("ui.app.site.editor.page.findAllLabel", "Find text across all pages")} />
      </div>
      {allTextQuery.trim().length >= 2 ? <div className="cms-text-search-results" aria-label={ui("ui.app.site.editor.page.matchingFields", "Matching text fields")}>
        <p role="status">{allTextMatches.length === 1 ? ui("ui.app.site.editor.page.oneMatch", "1 matching field") : allTextMatches.length ? ui("ui.app.site.editor.page.manyMatches", "{{count}} matching fields", { count: `${allTextMatches.length}${allTextMatches.length === 30 ? "+" : ""}` }) : ui("ui.app.site.editor.page.noMatches", "No matching fields. Try a shorter phrase.")}</p>
        {allTextMatches.map((entry) => <button key={entry.key} type="button" onClick={() => {
          pendingTextField.current = entry;
          setEditorMode(["Emails", "SEO"].includes(entry.area) ? "advanced" : "content");
          setSelected({ area: entry.area, page: entry.page });
          setOpenFieldSection(entry.section); setQuery(""); setAllTextQuery(""); setSidebarOpen(false);
        }}><small>{entry.page} · {entry.section}</small><span>{settings.content[entry.key] ?? entry.defaultValue}</span></button>)}
      </div> : null}
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
          <summary>{ui("ui.app.site.editor.page.0072e6b93494", "Design")}</summary>
          <div>
            <button type="button" className={selected.page === "Brand assets" ? "active" : ""} onClick={() => { setSelected({ area: "Design", page: "Brand assets" }); setSidebarOpen(false); }}>{ui("ui.app.site.editor.page.5491b0ff70a2", "Brand assets")}</button>
          </div>
        </details>
      ) : (
        <>
          <details open={selected.area === "Design"}>
            <summary>{ui("ui.app.site.editor.page.0072e6b93494", "Design")}</summary>
            <div>
              {(["Theme", "Brand assets"] as SpecialPage[]).map((page) => (
                <button type="button" className={selected.page === page ? "active" : ""} onClick={() => { setSelected({ area: "Design", page }); setSidebarOpen(false); }} key={page}>{page}</button>
              ))}
            </div>
          </details>
          <details open={selected.area === "Advanced"}>
            <summary>{ui("ui.app.site.editor.page.9f088dbebd6c", "Advanced")}</summary>
            <div>
              {(["Revision history", "Copy coverage", "Advanced JSON"] as SpecialPage[]).map((page) => (
                <button type="button" className={selected.page === page ? "active" : ""} onClick={() => { setSelected({ area: "Advanced", page }); setSidebarOpen(false); }} key={page}>{page}</button>
              ))}
            </div>
          </details>
        </>
      )}
      {changeCount ? <div className="cms-recent-edit"><span>{ui("ui.app.site.editor.page.5fdf43a3219f", "Draft activity")}</span><strong>{changeCount}{" "}{ui("ui.app.site.editor.page.81c69bb85eae", "unpublished")}{" "}{changeCount === 1 ? ui("ui.app.site.editor.page.12ea12eace7d", "change") : ui("ui.app.site.editor.page.d0b4ba2311b3", "changes")}</strong><small>{selected.page}{" "}{ui("ui.app.site.editor.page.8f4d9115378d", "is open")}</small></div> : null}
    </nav>
  );

  const standardEditor = (
    <div className="cms-fields">
      {compositionPageKey ? <div className={styles.editModes} role="group" aria-label={ui("ui.app.site.editor.page.a2e67e3d39fd", "Page editing view")}>
        <button type="button" aria-pressed={editingSurface === "content"} onClick={() => setEditingSurface("content")}>{ui("ui.app.site.editor.page.c661980d2edb", "Page content")}</button>
        <button type="button" aria-pressed={editingSurface === "arrangement"} onClick={() => setEditingSurface("arrangement")}>{ui("ui.app.site.editor.page.d84427076f69", "Section arrangement")}</button>
      </div> : null}
      {compositionPageKey && editingSurface === "arrangement" ? (
        <SiteCompositionEditor
          pageKey={compositionPageKey}
          sections={settings.composition[compositionPageKey].sections}
          errors={errors}
          onChange={(sections) => setSettings((current) => ({
            ...current,
            composition: {
              ...current.composition,
              [compositionPageKey]: { sections }
            }
          }))}
        />
      ) : <>
      {fieldGroups.length > 1 ? <>
      <label className={styles.sectionSelect} htmlFor="cms-active-section">
        <span>{ui("ui.app.site.editor.page.467c12a6a1ae", "Content section")}</span>
        <select id="cms-active-section" value={openFieldSection || fieldGroups[0]?.[0] || ""} onChange={(event) => setOpenFieldSection(event.target.value)}>
          {fieldGroups.map(([section]) => <option key={section} value={section}>{section}</option>)}
        </select>
      </label>
      <nav className={styles.sectionNav} aria-label={ui("ui.app.site.editor.page.7893cc8c1973", "Page content sections")}>
        {fieldGroups.map(([section, entries]) => <button
          key={section}
          type="button"
          aria-current={section === (openFieldSection || fieldGroups[0]?.[0]) ? "true" : undefined}
          aria-controls="cms-fields-canvas"
          onClick={() => setOpenFieldSection(section)}
        ><span>{section}</span><small>{entries.length}</small></button>)}
      </nav></> : null}
      <div id="cms-fields-canvas" className={styles.fieldCanvas}>
      {fieldGroups.map(([section, entries]) => {
        const isOpen = section === (openFieldSection || fieldGroups[0]?.[0]);
        if (!isOpen) return null;
        return (
        <section className={`cms-field-group cms-content-section${isOpen ? " is-open" : ""}`} key={section}>
          <header className="cms-content-section-head">
            <span><small>{selected.page}</small><strong>{section}</strong><em>{entries.length} {entries.length === 1 ? ui("ui.app.site.editor.page.c0d2856b74d0", "field") : ui("ui.app.site.editor.page.bfe5d697162d", "fields")}</em></span>
          </header>
          {isOpen ? <div className="cms-field-list">
            {entries.map((entry) => {
              const value = settings.content[entry.key] ?? entry.defaultValue;
              const id = `content-${entry.key.replace(/[^a-z0-9]+/gi, "-")}`;
              const locked = ["security-locked", "data-derived", "browser-platform"].includes(entry.classification);
              const validationError = errors[entry.key] || (entry.key === "global.brand.name" ? errors.brandName : "");
              const helpId = `${id}-help`;
              return (
                <label className={`${validationError ? "cms-field has-error" : "cms-field"}${locked ? " is-locked" : ""}`} htmlFor={id} key={entry.key}>
                  <span className="cms-field-label">
                    <strong>{entry.label}</strong>
                    <span>{locked ? <small className="cms-classification is-locked">{ui("ui.app.site.editor.page.5d2bd273b938", "Managed by system")}</small> : null}<small>{value.length}/{entry.maxLength}</small></span>
                  </span>
                  {entry.type === "textarea" ? (
                    <textarea id={id} value={value} rows={4} maxLength={entry.maxLength} readOnly={locked} aria-readonly={locked} aria-invalid={Boolean(validationError)} aria-describedby={helpId} onChange={(event) => updateContent(entry.key, event.target.value)} />
                  ) : entry.type === "select" ? (
                    <select id={id} value={value} disabled={locked} aria-disabled={locked} aria-invalid={Boolean(validationError)} aria-describedby={helpId} onChange={(event) => updateContent(entry.key, event.target.value)}>
                      {(entry.allowedValues || []).map((option) => <option value={option} key={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input id={id} type={entry.type === "email" ? "email" : "text"} value={value} maxLength={entry.maxLength} readOnly={locked} aria-readonly={locked} aria-invalid={Boolean(validationError)} aria-describedby={helpId} onChange={(event) => updateContent(entry.key, event.target.value)} />
                  )}
                  <span id={helpId} className={validationError ? "cms-field-help cms-validation-error" : "cms-field-help"} role={validationError ? "alert" : undefined}>{validationError || (locked ? ui("ui.app.site.editor.page.a56cca2cfbd1", "{{value1}} This value is intentionally read-only.", { value1: entry.help }) : entry.help)}</span>
                  {entry.allowedVariables?.length ? (
                    <span className="cms-variable-list">{ui("ui.app.site.editor.page.2e4aaca6ea8c", "Allowed variables:")}{" "}{entry.allowedVariables.map((variable) => <code key={variable}>{ui("ui.app.site.editor.page.131d28535a61", "{{{{value1}}}}", { value1: variable })}</code>)}</span>
                  ) : null}
                  {!locked && value !== entry.defaultValue ? <button type="button" className="cms-field-reset" onClick={(event) => { event.preventDefault(); updateContent(entry.key, entry.defaultValue); }}><RotateCcw size={13} />{" "}{ui("ui.app.site.editor.page.725b6fa6df52", "Reset field")}</button> : null}
                </label>
              );
            })}
          </div> : null}
        </section>
      )})}
      </div>
      {!selectedEntries.length ? <div className="cms-empty"><Search size={22} /><h2>{ui("ui.app.site.editor.page.8749aa136a36", "No content matched on")}{" "}{selected.page}.</h2><p>{ui("ui.app.site.editor.page.866daf3d66a9", "Try a section name, field label, or content key from this page.")}</p></div> : null}
      </>}
    </div>
  );

  const emailSubject = activeSectionEntries.find((entry) => entry.key.endsWith(".subject"));
  const emailPreheader = activeSectionEntries.find((entry) => entry.key.endsWith(".preheader"));
  const emailHeading = activeSectionEntries.find((entry) => entry.key.endsWith(".heading"));
  const emailBody = activeSectionEntries.find((entry) => entry.key.endsWith(".body"));
  const emailCta = activeSectionEntries.find((entry) => entry.key.endsWith(".cta"));
  const emailFooter = activeSectionEntries.find((entry) => entry.key.endsWith(".footer"));
  const emailTemplatePrefix = emailTemplatePrefixFromKeys(activeSectionEntries.map((entry) => entry.key));
  const emailDeliveryBoundary = emailTemplateDeliveryBoundary(emailTemplatePrefix);
  const emailDeliveryLabel = emailDeliveryBoundary.kind === "application"
    ? ui("ui.app.site.editor.page.emailApplicationDelivery", "Application delivery · Brevo")
    : emailDeliveryBoundary.kind === "provider"
      ? ui("ui.app.site.editor.page.emailProviderDelivery", "Provider delivery · Supabase Auth")
      : ui("ui.app.site.editor.page.emailPreviewOnly", "Design preview · no production trigger");
  const emailFieldPreview = (entry: ContentRegistryEntry | undefined, fallback: string) => emailPreviewValue(entry ? (settings.content[entry.key] ?? entry.defaultValue) : fallback);
  const applicationEmailPreview = emailDeliveryBoundary.kind === "application" && emailTemplatePrefix === "email.service.submitted" ? (() => {
    try {
      return renderServiceReviewEmailDocument({
        subject: emailFieldPreview(emailSubject, `${selected.page} notification`),
        preheader: emailFieldPreview(emailPreheader, "A secure QRguitar update is ready."),
        heading: emailFieldPreview(emailHeading, selected.page),
        body: emailFieldPreview(emailBody, "Review this QRguitar update securely from your account."),
        ctaLabel: emailFieldPreview(emailCta, "Review service work"),
        reviewUrl: "https://www.qrguitar.com/service-review/00000000-0000-4000-8000-000000000000",
        footer: emailFieldPreview(emailFooter, "QRguitar · Permanent instrument identity and history"),
        allowedCtaOrigins: ["https://www.qrguitar.com"]
      });
    } catch {
      return null;
    }
  })() : null;
  const emailEditor = (
    <div className="cms-fields">
      {standardEditor}
      <section className="cms-field-group cms-email-studio">
        <header><div><span>{ui("ui.app.site.editor.page.eeb51b63cf49", "Safe preview")}</span><h2>{activeSectionName ? ui("ui.app.site.editor.page.f199529a30df", "{{value1}} email", { value1: activeSectionName }) : ui("ui.app.site.editor.page.92f2897724bf", "Email preview")}</h2></div><Send size={20} /></header>
        <p className="cms-section-intro">{ui("ui.app.site.editor.page.bbad0a028b19", "Whitelisted variables are replaced with sample values here. Previewing never sends an email or exposes a real token.")}</p>
        <p className="cms-section-intro"><strong>{emailDeliveryLabel}.</strong>{" "}{ui("ui.app.site.editor.page.emailDeliveryBoundary", "Only Service / Submitted is sent by the application. Supabase owns password-reset and transfer sign-in delivery; the remaining templates are design previews with no production trigger.")}</p>
        <div className="cms-email-preview">
          <div className="cms-email-envelope">
            <span>{ui("ui.app.site.editor.page.68971283841a", "Subject")}</span>
            <strong>{emailPreviewValue(emailSubject ? settings.content[emailSubject.key] : `${selected.page} notification`)}</strong>
            <small>{emailPreviewValue(emailPreheader ? settings.content[emailPreheader.key] : "A secure QRguitar update is ready.")}</small>
          </div>
          {emailDeliveryBoundary.kind === "application" ? (applicationEmailPreview ? <>
            <div className="cms-email-renderer-preview" data-testid="application-email-renderer-preview">
              <iframe title={ui("ui.app.site.editor.page.emailApplicationPreviewTitle", "Non-interactive service email preview")} srcDoc={nonNavigatingEmailPreviewHtml(applicationEmailPreview.htmlContent)} sandbox="" tabIndex={0} referrerPolicy="no-referrer" />
            </div>
            <p className="cms-email-preview-safety">{ui("ui.app.site.editor.page.emailApplicationPreviewSafety", "Rendered with the application email code. Scroll inside to review every section. Links are disabled and no message is sent from this preview.")}</p>
            <div className="cms-plain-preview">
              <strong>{ui("ui.app.site.editor.page.2f40e3ad9bf8", "Plain-text preview")}</strong>
              <pre>{applicationEmailPreview.textContent}</pre>
            </div>
          </> : <p className="cms-email-preview-error" role="alert">{ui("ui.app.site.editor.page.emailApplicationPreviewUnavailable", "Complete the required Service / Submitted fields to restore the application-rendered preview.")}</p>) : <>
            <article>
              <div className="cms-email-brand">{ui("ui.app.site.editor.page.a439fba430a3", "QR")}<span>{ui("ui.app.site.editor.page.d081f5e40298", "guitar")}</span></div>
              <p className="cms-email-kicker">{ui("ui.app.site.editor.page.77cf4575c15c", "QRguitar notification")}</p>
              <h3>{emailPreviewValue(emailHeading ? settings.content[emailHeading.key] : selected.page)}</h3>
              <p>{emailPreviewValue(emailBody ? settings.content[emailBody.key] : "Review this QRguitar update securely from your account.")}</p>
              <span className="cms-email-button">{emailCta ? settings.content[emailCta.key] : ui("ui.app.site.editor.page.3dcab0a37bb0", "Open QRguitar")}</span>
              <small>{emailPreviewValue(emailFooter ? settings.content[emailFooter.key] : "QRguitar · Permanent instrument identity and history")}</small>
            </article>
            <div className="cms-plain-preview">
              <strong>{ui("ui.app.site.editor.page.2f40e3ad9bf8", "Plain-text preview")}</strong>
              <pre>{ui("ui.app.site.editor.page.dadbd9e6486e", "{{value1}}\n\n{{value2}}\n\n{{value3}}\n\n{{value4}}\n\n{{value5}}", { value1: emailPreviewValue(emailPreheader ? settings.content[emailPreheader.key] : "A secure QRguitar update is ready."), value2: emailPreviewValue(emailHeading ? settings.content[emailHeading.key] : selected.page), value3: emailPreviewValue(emailBody ? settings.content[emailBody.key] : "Review this QRguitar update securely from your account."), value4: emailCta ? settings.content[emailCta.key] : "Open QRguitar", value5: emailPreviewValue(emailFooter ? settings.content[emailFooter.key] : "QRguitar · Permanent instrument identity and history") })}</pre>
            </div>
          </>}
        </div>
        <div className="cms-email-actions">
          {emailDeliveryBoundary.canSendApplicationTest ? <>
            <button type="button" className="button secondary" onClick={() => void sendEmailTest()} disabled={emailSending}>
              <Send size={16} /> {emailSending ? ui("ui.app.site.editor.page.afdb2a6b3534", "Sending test…") : ui("ui.app.site.editor.page.4e19e53db870", "Send test to my admin email")}
            </button>
            <small>{ui("ui.app.site.editor.page.8ddb6a61231c", "The recipient is fixed to the authenticated admin account. Addresses cannot be entered here.")}</small>
          </> : <>
            <button type="button" className="button secondary" onClick={downloadEmailSetupExport}>
              <Code2 size={16} /> {ui("ui.app.site.editor.page.downloadEmailSetupExport", "Download setup export")}
            </button>
          </>}
        </div>
        {emailTestFeedback ? <p className={`form-message is-${emailTestFeedback.tone}`} role={emailTestFeedback.tone === "error" ? "alert" : "status"} aria-live="polite">{emailTestFeedback.message}</p> : null}
      </section>
    </div>
  );

  const seoTitleEntry = activeSectionEntries.find((entry) => entry.key.endsWith(".title"));
  const seoDescriptionEntry = activeSectionEntries.find((entry) => entry.key.endsWith(".description"));
  const seoOgTitleEntry = activeSectionEntries.find((entry) => entry.key.endsWith(".ogTitle"));
  const seoOgDescriptionEntry = activeSectionEntries.find((entry) => entry.key.endsWith(".ogDescription"));
  const seoImageEntry = activeSectionEntries.find((entry) => entry.key.endsWith(".image"));
  const seoIndexingEntry = activeSectionEntries.find((entry) => entry.key.endsWith(".indexing"));
  const seoTitle = seoTitleEntry ? settings.content[seoTitleEntry.key] : settings.seo.title;
  const seoDescription = seoDescriptionEntry ? settings.content[seoDescriptionEntry.key] : settings.seo.description;
  const seoOgTitle = seoOgTitleEntry ? settings.content[seoOgTitleEntry.key] : seoTitle;
  const seoOgDescription = seoOgDescriptionEntry ? settings.content[seoOgDescriptionEntry.key] : seoDescription;
  const seoIndexingValue = seoIndexingEntry ? settings.content[seoIndexingEntry.key] : "index, follow";
  const seoIndexingValid = !seoIndexingEntry || seoIndexingEntry.allowedValues?.includes(seoIndexingValue) === true;
  const seoEditor = (
    <div className="cms-fields">
      {standardEditor}
      {selected.page === "Global SEO" ? <section className="cms-field-group">
        <header><div><span>{ui("ui.app.site.editor.page.6a4c09bcdc12", "Canonical origin")}</span><h2>{ui("ui.app.site.editor.page.0f2d62a92588", "Site URL")}</h2></div></header>
        <div className="cms-field-list">
          <label className={errors["seo.canonicalUrl"] ? "cms-field has-error" : "cms-field"} htmlFor="seo-canonical-url">
            <span className="cms-field-label"><strong>{ui("ui.app.site.editor.page.a4c0fb64632a", "Canonical site URL")}</strong></span>
            <input id="seo-canonical-url" type="url" value={settings.seo.canonicalUrl} aria-invalid={Boolean(errors["seo.canonicalUrl"])} aria-describedby="seo-canonical-url-help" onChange={(event) => {
              setSettings((current) => ({ ...current, seo: { ...current.seo, canonicalUrl: event.target.value } }));
              setErrors((current) => ({ ...current, "seo.canonicalUrl": "" }));
            }} />
            <span id="seo-canonical-url-help" className={errors["seo.canonicalUrl"] ? "cms-field-help cms-validation-error" : "cms-field-help"} role={errors["seo.canonicalUrl"] ? "alert" : undefined}>{errors["seo.canonicalUrl"] || ui("ui.app.site.editor.page.de8b7527c29d", "Use the public QRguitar HTTPS origin for canonical metadata.")}</span>
          </label>
        </div>
      </section> : null}
      <section className="cms-field-group cms-seo-studio">
        <header><div><span>{ui("ui.app.site.editor.page.fd0112ea773b", "Search and social")}</span><h2>{activeSectionName ? ui("ui.app.site.editor.page.30636cab278d", "{{value1}} preview", { value1: activeSectionName }) : ui("ui.app.site.editor.page.94ae9de3ddac", "Live SEO preview")}</h2></div><Search size={20} /></header>
        <div className="cms-seo-guidance">
          <span className={seoTitle.length >= 30 && seoTitle.length <= 60 ? "is-pass" : "is-warning"}>{ui("ui.app.site.editor.page.7e8cd2056da7", "Title")}{" "}{seoTitle.length}/60</span>
          <span className={seoDescription.length >= 70 && seoDescription.length <= 160 ? "is-pass" : "is-warning"}>{ui("ui.app.site.editor.page.526e0087cc3f", "Description")}{" "}{seoDescription.length}/160</span>
          <span className={seoImageEntry && settings.content[seoImageEntry.key] ? "is-pass" : "is-warning"}>{seoImageEntry ? ui("ui.app.site.editor.page.963e3a2a5127", "Social image set") : ui("ui.app.site.editor.page.d6394e0fdb8c", "Using global social image")}</span>
          <span className={!seoIndexingValid || seoIndexingValue.startsWith("noindex") ? "is-warning" : "is-pass"}>{seoIndexingValid ? seoIndexingValue : ui("ui.app.site.editor.page.6d1ad6e2ee80", "Invalid indexing value — page blocked")}</span>
        </div>
        <div className="cms-search-preview">
          <span>{previewPath ? `https://www.qrguitar.com${previewPath === "/" ? "" : previewPath}` : ui("ui.app.site.editor.page.previewRouteUnavailable", "Not available for this selection")}</span>
          <h3>{seoTitle || ui("ui.app.site.editor.page.4bdfc8059e30", "Untitled QRguitar page")}</h3>
          <p>{seoDescription || ui("ui.app.site.editor.page.09722b5de3c0", "Add a clear description for search results.")}</p>
        </div>
        <div className="cms-social-preview">
          <div>{seoImageEntry ? settings.content[seoImageEntry.key] : settings.seo.image}</div>
          <strong>{seoOgTitle || ui("ui.app.site.editor.page.1a32cd5a3a29", "QRguitar")}</strong>
          <p>{seoOgDescription || ui("ui.app.site.editor.page.917c7e050b98", "Add a social description.")}</p>
          <small>{ui("ui.app.site.editor.page.1a719f6a72dd", "qrguitar.com")}</small>
        </div>
      </section>
    </div>
  );

  const themeEditor = (
    <section className="cms-field-group">
      <header><div><span>{ui("ui.app.site.editor.page.4a866105af15", "Design system")}</span><h2>{ui("ui.app.site.editor.page.efb52e7172b7", "Theme")}</h2></div><Paintbrush size={20} /></header>
      <p className="cms-section-intro">{ui("ui.app.site.editor.page.08dfce1d03af", "Change the small set of approved QRguitar color tokens. Preview contrast before publishing.")}</p>
      <div className="cms-color-grid">
        {Object.entries(settings.colors).map(([key, value]) => (
          <label className={errors[`colors.${key}`] ? "cms-color-field has-error" : "cms-color-field"} htmlFor={`theme-color-${key}`} key={key}>
            <span><i style={{ background: value }} />{key.replace(/([A-Z])/g, " $1")}</span>
            <input id={`theme-color-${key}`} type="text" value={value} maxLength={7} aria-invalid={Boolean(errors[`colors.${key}`])} aria-describedby={`theme-color-${key}-help`} onChange={(event) => {
              const next = { ...settings, colors: { ...settings.colors, [key]: event.target.value } };
              setSettings(next);
              setErrors((current) => ({ ...current, [`colors.${key}`]: "" }));
              applyThemeSettings(next);
            }} />
            <small id={`theme-color-${key}-help`} className={errors[`colors.${key}`] ? "cms-validation-error" : undefined}>{errors[`colors.${key}`] || ui("ui.app.site.editor.page.d21552c09125", "Six-digit hex color")}</small>
          </label>
        ))}
      </div>
      <div className="cms-contrast-grid" aria-label={ui("ui.app.site.editor.page.3d3fa6131c8f", "Theme contrast checks")}>
        {[
          ["Primary text", textContrast, 4.5],
          ["Primary action", actionContrast, 4.5],
          ["Accent text", accentContrast, 3]
        ].map(([label, ratio, minimum]) => {
          const numericRatio = typeof ratio === "number" ? ratio : null;
          const passes = numericRatio !== null && numericRatio >= Number(minimum);
          return <div className={passes ? "is-pass" : "is-warning"} key={String(label)}><span>{label}</span><strong>{numericRatio ? ui("ui.app.site.editor.page.3a4e9214f0ee", "{{value1}}:1", { value1: numericRatio.toFixed(2) }) : ui("ui.app.site.editor.page.a639bb65798f", "Invalid color")}</strong><small>{passes ? ui("ui.app.site.editor.page.bf56ee2fe334", "Readable") : ui("ui.app.site.editor.page.bfb4366f94f8", "Needs {{value1}}:1", { value1: minimum })}</small></div>;
        })}
      </div>
      <div className="cms-theme-sample" style={{ background: settings.colors.background, color: settings.colors.text, borderColor: settings.colors.gold }}>
        <span style={{ color: settings.colors.gold }}>{ui("ui.app.site.editor.page.a41f536cdf78", "Live token preview")}</span>
        <h3>{ui("ui.app.site.editor.page.3f1e961fb0d3", "Clear, calm, unmistakably QRguitar.")}</h3>
        <span className="cms-theme-action-sample" style={{ background: settings.colors.cream, color: settings.colors.background }}>{ui("ui.app.site.editor.page.da2eb576b5f6", "Primary action")}</span>
      </div>
    </section>
  );

  const brandEditor = (
    <div className="cms-fields">
      <section className="cms-field-group">
        <header><div><span>{ui("ui.app.site.editor.page.4a866105af15", "Design system")}</span><h2>{ui("ui.app.site.editor.page.5491b0ff70a2", "Brand assets")}</h2></div><ImageIcon size={20} /></header>
        <p className="cms-section-intro">{ui("ui.app.site.editor.page.c4dfafee898c", "Official brand logos are controlled here. Instrument owners cannot replace a brand identity.")}</p>
        <div className="cms-inline-form">
          <label className={errors["brandLogos.new.name"] ? "has-error" : ""} htmlFor="brand-logo-name">{ui("ui.app.site.editor.page.090ed4316f1d", "Brand")}<input id="brand-logo-name" value={brandName} aria-invalid={Boolean(errors["brandLogos.new.name"])} aria-describedby="brand-logo-name-help" onChange={(event) => { setBrandName(event.target.value); setErrors((current) => ({ ...current, "brandLogos.new.name": "" })); }} placeholder={ui("ui.app.site.editor.page.6711ae89251e", "Fender")} /><small id="brand-logo-name-help" className={errors["brandLogos.new.name"] ? "cms-validation-error" : undefined}>{errors["brandLogos.new.name"] || ui("ui.app.site.editor.page.4c67258f3a3c", "Brand key used by the logo registry.")}</small></label>
          <label className={errors["brandLogos.new.url"] ? "has-error" : ""} htmlFor="brand-logo-url">{ui("ui.app.site.editor.page.062cc3d67c02", "Transparent logo URL")}<input id="brand-logo-url" value={brandLogoUrl} aria-invalid={Boolean(errors["brandLogos.new.url"])} aria-describedby="brand-logo-url-help" onChange={(event) => { setBrandLogoUrl(event.target.value); setErrors((current) => ({ ...current, "brandLogos.new.url": "" })); }} placeholder={ui("ui.app.site.editor.page.0aede7e7963c", "/brands/fender.svg")} /><small id="brand-logo-url-help" className={errors["brandLogos.new.url"] ? "cms-validation-error" : undefined}>{errors["brandLogos.new.url"] || ui("ui.app.site.editor.page.fdafc7dc3390", "HTTPS URL or a site-relative path.")}</small></label>
          <button className="button secondary" type="button" onClick={saveBrandLogo}>{ui("ui.app.site.editor.page.57e6ff68eee1", "Add to draft")}</button>
        </div>
        {errors.brandLogos ? <p className="cms-validation-error" role="alert">{errors.brandLogos}</p> : null}
      </section>
      <section className="cms-field-group">
        <header><div><span>{ui("ui.app.site.editor.page.05c2e3277039", "Registry")}</span><h2>{ui("ui.app.site.editor.page.9d933f9c19c5", "Official logos")}</h2></div><span>{Object.keys(settings.brandLogos).length}</span></header>
        <div className="cms-asset-list">
          {Object.entries(settings.brandLogos).map(([key, url]) => (
            <div className={errors[`brandLogos.${key}`] ? "has-error" : ""} key={key}><img src={url} alt="" loading="lazy" fetchPriority="low" decoding="async" width={520} height={120} referrerPolicy="no-referrer" /><div><strong>{key}</strong><small>{url}</small>{errors[`brandLogos.${key}`] ? <small className="cms-validation-error" role="alert">{errors[`brandLogos.${key}`]}</small> : null}</div><button type="button" onClick={() => setSettings((current) => { const next = { ...current.brandLogos }; delete next[key]; return { ...current, brandLogos: next }; })}>{ui("ui.app.site.editor.page.c3812fc4acb8", "Remove")}</button></div>
          ))}
          {!Object.keys(settings.brandLogos).length ? <p>{ui("ui.app.site.editor.page.49b597ef3482", "No official logos have been added. Brand names continue to render as text.")}</p> : null}
        </div>
      </section>
    </div>
  );

  const historyEditor = (
    <section className="cms-field-group">
      <header><div><span>{ui("ui.app.site.editor.page.d6831de6e415", "Publishing safety")}</span><h2>{ui("ui.app.site.editor.page.5ae0d3d186c7", "Revision history")}</h2></div><FileClock size={20} /></header>
      <p className="cms-section-intro">{ui("ui.app.site.editor.page.42597272a488", "Restore places a prior version into the shared draft. Nothing goes live until you review and publish it.")}</p>
      <div className="cms-revision-list">
        {revisions.map((revision) => (
          <article key={revision.id}>
            <div><strong>{revision.note}</strong><span>{revision.area}</span><small>{formatTime(revision.publishedAt)} · {revision.changedFields.length}{" "}{ui("ui.app.site.editor.page.185c64e10bf3", "changed fields")}</small></div>
            <button type="button" className="button secondary" onClick={() => setConfirmAction({ kind: "restore", revision })} disabled={mutationLocked} title={editorIssue ? ui("ui.app.site.editor.page.119135fecb55", "Resolve the current save issue before restoring a revision.") : undefined}><RotateCcw size={15} />{" "}{ui("ui.app.site.editor.page.c38472e59d29", "Restore to draft")}</button>
          </article>
        ))}
        {!revisions.length ? <p>{ui("ui.app.site.editor.page.2a29e0a485e0", "No prior published revisions yet.")}</p> : null}
      </div>
    </section>
  );

  const coverageEditor = (
    <div className="cms-fields">
      <section className="cms-field-group">
        <header><div><span>{ui("ui.app.site.editor.page.fe19646b2baa", "Content governance")}</span><h2>{ui("ui.app.site.editor.page.818c6d12483c", "Copy coverage")}</h2></div><Code2 size={20} /></header>
        <p className="cms-section-intro">{ui("ui.app.site.editor.page.92ca1b16f685", "Registered website wording is listed below. User-entered Profile and account data remain in their records; browser dialogs and protected system behavior are outside this editor. Counts describe connected fields, not a universal coverage guarantee.")}</p>
        <div className="cms-coverage-summary">
          <div><strong>{contentCoverageSummary.totalKeys}</strong><span>{ui("ui.app.site.editor.page.eb47b979f529", "registered fields")}</span></div>
          <div><strong>{contentCoverageSummary.editableStandard + contentCoverageSummary.editableAdvanced}</strong><span>{ui("ui.app.site.editor.page.ee9fb78f117e", "editable fields")}</span></div>
          <div><strong>{contentCoverageSummary.securityLocked}</strong><span>{ui("ui.app.site.editor.page.b5deeadb6cce", "security locked")}</span></div>
          <div><strong>{contentCoverageSummary.connectedUiFields}</strong><span>connected interface fields</span></div>
        </div>
      </section>
      <section className="cms-field-group">
        <header><div><span>{ui("ui.app.site.editor.page.808558d61bb0", "Machine-readable manifest")}</span><h2>{ui("ui.app.site.editor.page.996c2cb8d88a", "Classification sources")}</h2></div><span>{contentCoverageManifest.length}</span></header>
        <div className="cms-coverage-list">
          {contentCoverageManifest.map((entry) => <article key={entry.source}><div><strong>{entry.source}</strong><span className={`cms-classification is-${entry.classification}`}>{entry.classification.replace(/-/g, " ")}</span></div><p>{entry.reason}</p></article>)}
        </div>
      </section>
    </div>
  );

  const advancedEditor = (
    <section className="cms-field-group">
      <header><div><span>{ui("ui.app.site.editor.page.9f088dbebd6c", "Advanced")}</span><h2>{ui("ui.app.site.editor.page.35e1e7990d8b", "Settings JSON")}</h2></div>{advancedUnlocked ? <UnlockKeyhole size={20} /> : <LockKeyhole size={20} />}</header>
      <p className="cms-section-intro">{ui("ui.app.site.editor.page.7beee9b9b1b2", "Normal editing never requires JSON. This validated import/export surface is for recovery and controlled migrations.")}</p>
      <div className={advancedUnlocked ? "cms-json-state is-unlocked" : "cms-json-state"}>
        <strong>{advancedUnlocked ? ui("ui.app.site.editor.page.44eb00ce43f1", "Editing unlocked") : ui("ui.app.site.editor.page.0a7338b94362", "Read-only by default")}</strong>
        <span>{advancedUnlocked ? ui("ui.app.site.editor.page.c9f0664d6ce5", "Validate before loading. Publishing still requires the normal Publish action.") : ui("ui.app.site.editor.page.c376a71aa874", "Download a backup before unlocking an advanced import.")}</span>
      </div>
      <textarea className="cms-json" value={advancedJson} onChange={(event) => setAdvancedJson(event.target.value)} rows={26} spellCheck={false} readOnly={!advancedUnlocked} aria-readonly={!advancedUnlocked} />
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={downloadSettingsBackup}><Save size={16} />{" "}{ui("ui.app.site.editor.page.669211280b63", "Download backup")}</button>
        <button type="button" className="button secondary" onClick={() => setAdvancedUnlocked((value) => !value)}>{advancedUnlocked ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />} {advancedUnlocked ? ui("ui.app.site.editor.page.d4e86bd24e4e", "Lock editor") : ui("ui.app.site.editor.page.bc879a375fab", "Unlock editor")}</button>
        <button type="button" className="button secondary" onClick={loadAdvancedJson} disabled={!advancedUnlocked}><Upload size={16} />{" "}{ui("ui.app.site.editor.page.cbc4aeaf8a9f", "Validate and load draft")}</button>
        <button type="button" className="button secondary" onClick={() => void copySettingsExport()}><Clipboard size={16} />{" "}{ui("ui.app.site.editor.page.a0d7b2fa2b5f", "Copy export")}</button>
      </div>
      {copyExportFeedback ? <p className="form-message" role="status" aria-live="polite">{copyExportFeedback}</p> : null}
      <div className="form-actions">
        {writeBusy || hasChanges || draftMeta || editorIssue
          ? <button type="button" className="button secondary" disabled>{ui("ui.app.site.editor.page.13d06b13fc80", "Review recovery introduction")}</button>
          : <Link className="button secondary" href="/site-editor/recovery-copy">{ui("ui.app.site.editor.page.13d06b13fc80", "Review recovery introduction")}</Link>}
      </div>
      <p className="cms-section-intro">{ui("ui.app.site.editor.page.ec6baee192a7", "The separate recovery tool reviews only the password-reset introduction. Finish current edits and resolve any shared draft before using it.")}</p>
    </section>
  );

  if (!authorized) {
    return (
      <><Nav /><main className={`section cms-access ${styles.access}`}><div className="shell"><section className="card"><div className="eyebrow">{ui("ui.app.site.editor.page.6586948feb58", "Admin tools")}</div><h1>{status === "loading" ? ui("ui.app.site.editor.page.ba5e8c6179e8", "Checking Site Editor access.") : initialLoadFailure === "unavailable" ? ui("ui.app.site.editor.page.d173d8097380", "Site Editor is temporarily unavailable.") : ui("ui.app.site.editor.page.d92c603b66e1", "Admin access required.")}</h1><p>{message}</p>{status !== "loading" ? <div className="form-actions">{initialLoadFailure === "unavailable" ? <button className="button" type="button" onClick={() => { setInitialLoadFailure(""); setStatus("loading"); setMessage(ui("ui.app.site.editor.page.0dba518055eb", "Retrying Site Editor…")); setLoadAttempt((attempt) => attempt + 1); }}><RefreshCw size={15} />{" "}{ui("ui.app.site.editor.page.942087cc2d41", "Retry")}</button> : <Link className="button" href={`/login?next=${encodeURIComponent(editorContinuation)}`}>{ui("ui.app.site.editor.page.bfd402b2f6f3", "Sign in")}</Link>}{adminEntry ? <Link className="button secondary" href="/admin"><ArrowLeft size={15} />{" "}{ui("ui.app.site.editor.page.345c74235673", "Back to Admin")}</Link> : null}</div> : null}</section></div></main><Footer /></>
    );
  }

  return (
    <>
      <Nav />
      <main className={`${styles.studio} ${previewOpen ? "cms-page is-preview-open" : "cms-page"}`}>
        <header className="cms-commandbar">
          <div>
            <button ref={sidebarTriggerRef} type="button" className="cms-mobile-tree" onClick={() => setSidebarOpen(true)} aria-label={ui("ui.app.site.editor.page.e44e710bee9f", "Open content tree")} aria-expanded={sidebarOpen} aria-controls="cms-content-tree"><Menu size={18} /></button>
            {adminEntry ? <Link className="cms-admin-back" href="/admin" aria-label={ui("ui.app.site.editor.page.345c74235673", "Back to Admin")}><ArrowLeft size={15} />{" "}{ui("ui.app.site.editor.page.345c74235673", "Back to Admin")}</Link> : null}
            <div><span>{ui("ui.app.site.editor.page.2b06d01c3eba", "QRguitar / Admin")}</span><strong>{ui("ui.app.site.editor.page.06c85ff37596", "Content Studio")}</strong></div>
          </div>
          <div className={`cms-save-state is-${status}`} aria-live="polite">
            {editorIssue ? <X size={14} /> : status === "saving" ? <RefreshCw size={14} className="spin" /> : status === "saved" ? <Check size={14} /> : status === "error" ? <X size={14} /> : <Cloud size={14} />}
            <span>{editorIssue ? ui("ui.app.site.editor.page.6015fb9d7c7a", "Save needs attention") : status === "dirty" ? ui("ui.app.site.editor.page.d3d563f1bc30", "{{value1}} unpublished {{value2}}", { value1: changeCount || 1, value2: changeCount === 1 ? "change" : "changes" }) : status === "saving" ? ui("ui.app.site.editor.page.586a61861f0c", "Saving draft…") : message}</span>
          </div>
            <button type="button" className={`button secondary ${styles.discard}`} onClick={() => setConfirmAction({ kind: "discard" })} disabled={mutationLocked || (!draftMeta && !hasChanges)} title={editorIssue ? ui("ui.app.site.editor.page.882467178b39", "Resolve the current save issue before discarding the draft.") : undefined}>{ui("ui.app.site.editor.page.cb30147eec19", "Discard draft")}</button>
          <div className={styles.commandActions}>
            <button ref={previewTriggerRef} type="button" className="button secondary" onClick={() => previewOpen ? closePreview() : setPreviewOpen(true)} aria-expanded={previewOpen} aria-controls="cms-site-preview"><Eye size={16} /> {previewOpen ? ui("ui.app.site.editor.page.69a02c64d5c5", "Back to editing") : ui("ui.app.site.editor.page.324b134f57c7", "Preview")}</button>
            <button type="button" className="button" onClick={() => setConfirmAction({ kind: "publish" })} disabled={mutationLocked || status === "saving" || !hasChanges} title={editorIssue ? ui("ui.app.site.editor.page.25a8b63d9378", "Resolve the current save issue before publishing.") : undefined}><Send size={16} />{" "}{ui("ui.app.site.editor.page.859390eb495b", "Publish")}</button>
          </div>
        </header>

        {editorIssue ? <section className={styles.issueNotice} role="alert" aria-labelledby="cms-save-issue-title">
          <strong id="cms-save-issue-title">{ui("ui.app.site.editor.page.6015fb9d7c7a", "Save needs attention")}</strong>
          <p>{message}</p>
          <div className={styles.issueActions}>
            <button type="button" className="button secondary" onClick={exportLocalChanges}>{ui("ui.app.site.editor.page.8d24f73a9916", "Export local changes")}</button>
            {editorIssue === "uncertain" ? <button type="button" className="button secondary" disabled={writeBusy} onClick={() => void executeEditor("", {}, true, true)}>{ui("ui.app.site.editor.page.878d2ebf6ad9", "Retry the same save")}</button> : null}
            {editorIssue === "error" && !mutationsRef.current?.storageProblem ? <button type="button" className="button secondary" disabled={writeBusy} onClick={() => { setEditorIssue(""); setStatus("dirty"); }}>{ui("ui.app.site.editor.page.16a029bbde48", "Resume saving")}</button> : null}
            <button type="button" className="button secondary" disabled={writeBusy} onClick={() => { exportLocalChanges(); window.location.reload(); }}>{ui("ui.app.site.editor.page.5670576a5886", "Export and reload latest")}</button>
          </div>
        </section> : null}

        <div className={previewOpen ? "cms-workspace" : "cms-workspace is-preview-collapsed"}>
          <aside ref={sidebarRef} id="cms-content-tree" className={sidebarOpen ? "cms-sidebar is-open" : "cms-sidebar"} role={sidebarOpen ? "dialog" : undefined} aria-modal={sidebarOpen ? true : undefined} aria-label={ui("ui.app.site.editor.page.d3f642b0549e", "Site content navigation")} tabIndex={sidebarOpen ? -1 : undefined}>
            <div className="cms-sidebar-head"><div><span>{ui("ui.app.site.editor.page.1a32cd5a3a29", "QRguitar")}</span><strong>{ui("ui.app.site.editor.page.7de0ab86da2a", "Site content")}</strong></div><button ref={sidebarCloseRef} type="button" onClick={() => setSidebarOpen(false)} aria-label={ui("ui.app.site.editor.page.5cfdcc35d8e2", "Close content tree")}><PanelLeftClose size={18} /></button></div>
            {tree}
          </aside>
          {sidebarOpen ? <button type="button" className="cms-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label={ui("ui.app.site.editor.page.5cfdcc35d8e2", "Close content tree")} /> : null}

          <section className="cms-editor">
            <div className="cms-editor-heading">
              <div>
                <span>{selected.area} / {selected.page}</span>
                <h1>{selected.page}</h1>
                <p>{query ? ui("ui.app.site.editor.page.827488f33a51", "Search results for \"{{value1}}\" on {{value2}}", { value1: query, value2: selected.page }) : pagePurpose(selected)}</p>
                <div className="cms-editor-timestamps">
                  {draftMeta?.updatedAt
                    ? <span>{ui("ui.app.site.editor.page.5ccb8caacdc5", "Draft saved")}{" "}<strong>{formatTime(draftMeta.updatedAt)}</strong></span>
                    : <span>{ui("ui.app.site.editor.page.ee283c5bb84b", "No saved draft")}</span>}
                  {publishedAt ? <span>{ui("ui.app.site.editor.page.2ef42ec21d93", "Published")}{" "}<strong>{formatTime(publishedAt)}</strong></span> : <span>{ui("ui.app.site.editor.page.e84062f1f34c", "Publish date unavailable")}</span>}
                </div>
              </div>
              <button type="button" className="button secondary cms-review-changes" onClick={() => setShowCompare((value) => !value)} disabled={!changeCount} aria-expanded={showCompare} aria-controls="cms-change-review"><Clock3 size={16} /> {changeCount ? ui("ui.app.site.editor.page.7109f299864f", "Review {{value1}} {{value2}}", { value1: changeCount, value2: changeCount === 1 ? "change" : "changes" }) : ui("ui.app.site.editor.page.c699aa00b26d", "No changes")}</button>
            </div>
            <p className={styles.publishScope}>{ui("ui.app.site.editor.page.ae75c788f381", "Drafts save automatically. Publishing applies all changes across the site.")}</p>
            {showCompare ? (
              <section className="cms-compare" id="cms-change-review" aria-label={ui("ui.app.site.editor.page.860cbf1a2ef2", "Draft changes compared with published settings")}>
                <header><strong>{ui("ui.app.site.editor.page.45d1bd82d4cd", "Draft compared with published")}</strong><button type="button" onClick={() => setShowCompare(false)} aria-label={ui("ui.app.site.editor.page.f066504404d5", "Close comparison")}><X size={16} /></button></header>
                {changeCount ? changeReview.slice(0, 100).map((change) => <div key={change.key}><code><small>{change.category}</small>{change.key}</code><span>{change.before}</span><strong>→</strong><span>{change.after}</span></div>) : <p>{ui("ui.app.site.editor.page.830d1798762a", "No settings differ from the published version.")}</p>}
                {changeCount > 100 ? <p>{ui("ui.app.site.editor.page.28dbe8914f6b", "Showing the first 100 of")}{" "}{changeCount}{" "}{ui("ui.app.site.editor.page.736afe256bd7", "changes. Download a backup to review the complete settings document.")}</p> : null}
              </section>
            ) : null}
            {selected.area === "Design" && selected.page === "Theme" ? themeEditor : selected.area === "Design" ? brandEditor : selected.page === "Revision history" ? historyEditor : selected.page === "Copy coverage" ? coverageEditor : selected.page === "Advanced JSON" ? advancedEditor : selected.area === "Emails" ? emailEditor : selected.area === "SEO" ? seoEditor : standardEditor}
          </section>

          {previewOpen ? <aside ref={previewPanelRef} id="cms-site-preview" className="cms-preview-panel" role="region" aria-label={ui("ui.app.site.editor.page.494d442c8f74", "{{value1}} site preview", { value1: previewSource === "draft" ? "Draft" : "Published" })} tabIndex={-1}>
            <div className="cms-preview-toolbar">
              <div className="cms-segmented" role="group" aria-label={ui("ui.app.site.editor.page.99e15fdbef0d", "Preview source")}>
                <button type="button" className={previewSource === "draft" ? "active" : ""} onClick={() => setPreviewSource("draft")}>{ui("ui.app.site.editor.page.ebf12ef47cf5", "Draft")}</button>
                <button type="button" className={previewSource === "published" ? "active" : ""} onClick={() => setPreviewSource("published")}>{ui("ui.app.site.editor.page.2ef42ec21d93", "Published")}</button>
              </div>
              <div className="cms-device-buttons" role="group" aria-label={ui("ui.app.site.editor.page.2261434c7aeb", "Preview size")}>
                <button type="button" className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")} aria-label={ui("ui.app.site.editor.page.144adf27f7f3", "Desktop preview")}><Monitor size={16} /></button>
                <button type="button" className={device === "tablet" ? "active" : ""} onClick={() => setDevice("tablet")} aria-label={ui("ui.app.site.editor.page.42805a318ee1", "Tablet preview")}><Tablet size={16} /></button>
                <button type="button" className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")} aria-label={ui("ui.app.site.editor.page.f4185502ae83", "Mobile preview")}><Smartphone size={16} /></button>
              </div>
              <button type="button" onClick={() => setPreviewVersion((value) => value + 1)} aria-label={ui("ui.app.site.editor.page.5b529abadacc", "Refresh preview")}><RefreshCw size={16} /></button>
              {previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer" aria-label={ui("ui.app.site.editor.page.7723e4dec204", "Open full preview")}><Eye size={16} /></a> : <button type="button" disabled aria-label={ui("ui.app.site.editor.page.7723e4dec204", "Open full preview")}><Eye size={16} /></button>}
              <button type="button" className="cms-preview-close" onClick={closePreview} aria-label={ui("ui.app.site.editor.page.7d8ab368210c", "Close preview")}><PanelRightClose size={16} /><span>{ui("ui.app.site.editor.page.7d9eb7acb13e", "Close")}</span></button>
            </div>
            <div className={`cms-preview-frame is-${device}`}>
              {previewError ? <div className="cms-preview-error"><strong>{ui("ui.app.site.editor.page.b99fa6c06150", "Preview unavailable")}</strong><p>{previewError}</p><button type="button" onClick={() => setPreviewVersion((value) => value + 1)}>{ui("ui.app.site.editor.page.d8b8392e2c54", "Try again")}</button></div> : null}
              {!previewError && previewUrl ? <iframe key={`${previewUrl}-${previewVersion}`} src={previewUrl} title={ui("ui.app.site.editor.page.5db120413cf7", "{{value1}} {{value2}} preview", { value1: selected.page, value2: previewSource })} /> : null}
              {!previewError && !previewUrl ? <div className="cms-preview-loading"><RefreshCw size={18} className="spin" /><span>{ui("ui.app.site.editor.page.d8f27ff08958", "Opening the real")}{" "}{previewSource}{" "}{ui("ui.app.site.editor.page.5ccec630b66f", "page…")}</span></div> : null}
            </div>
            <div className="cms-preview-meta">
              <div><span>{ui("ui.app.site.editor.page.489499d1fba4", "Selected route")}</span><strong>{previewPath || ui("ui.app.site.editor.page.previewRouteUnavailable", "Not available for this selection")}</strong></div>
              <div><span>{ui("ui.app.site.editor.page.31c9df53eaed", "Previewing")}</span><strong>{previewSource === "draft" ? ui("ui.app.site.editor.page.9f03d34eb73f", "Shared draft") : ui("ui.app.site.editor.page.caf8e3e0baf3", "Published site")}</strong></div>
            </div>
          </aside> : null}
        </div>
        {confirmAction ? (
          <div className="cms-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmAction(null); }}>
            <section ref={confirmDialogRef} className="cms-modal" role="dialog" aria-modal="true" aria-labelledby="cms-confirm-title" aria-describedby="cms-confirm-description" tabIndex={-1}>
              <header><div><span>{ui("ui.app.site.editor.page.d6831de6e415", "Publishing safety")}</span><h2 id="cms-confirm-title">{confirmAction.kind === "discard" ? ui("ui.app.site.editor.page.2ed6520fbcc7", "Discard shared draft?") : confirmAction.kind === "publish" ? ui("ui.app.site.editor.page.dea6edd12ab5", "Publish all draft changes?") : ui("ui.app.site.editor.page.32456d5ba894", "Restore this revision?")}</h2></div><button ref={confirmCloseRef} type="button" onClick={() => setConfirmAction(null)} aria-label={ui("ui.app.site.editor.page.d2252166e49d", "Close confirmation")}><X size={18} /></button></header>
              <p id="cms-confirm-description">{confirmAction.kind === "discard"
                ? ui("ui.app.site.editor.page.b52ea90f8343", "This removes the current shared draft and returns the editor to the published version. Published pages will not change.")
                : confirmAction.kind === "publish"
                  ? ui("ui.app.site.editor.page.ca134dbc9252", "{{value1}} unpublished {{value2}} will be published globally. The prior live version stays available in revision history.", { value1: changeCount || 1, value2: changeCount === 1 ? "change" : "changes" })
                  : ui("ui.app.site.editor.page.47dd228eac4e", "This copies the version published {{value1}} into the shared draft. It will not go live until you publish it.", { value1: formatTime(confirmAction.revision.publishedAt) })}</p>
              {confirmAction.kind === "publish" ? <label className="cms-release-note">{ui("ui.app.site.editor.page.7bb7415c01f4", "Release note (optional)")}<input value={note} onChange={(event) => setNote(event.target.value)} placeholder={ui("ui.app.site.editor.page.6884a542b504", "What changed in this release?")} maxLength={180} /></label> : null}
              <div className="cms-modal-actions">
                <button type="button" className="button secondary" onClick={() => setConfirmAction(null)}>{ui("ui.app.site.editor.page.19766ed6ccb2", "Cancel")}</button>
                <button type="button" className="button" disabled={mutationLocked} onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  if (action.kind === "discard") void discardDraft();
                  else if (action.kind === "publish") void publish();
                  else void restoreRevision(action.revision);
                }}>{confirmAction.kind === "discard" ? ui("ui.app.site.editor.page.cb30147eec19", "Discard draft") : confirmAction.kind === "publish" ? ui("ui.app.site.editor.page.47231b7511bd", "Confirm publish") : ui("ui.app.site.editor.page.c38472e59d29", "Restore to draft")}</button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </>
  );
}

export default function SiteEditorPage() {
  const pathname = usePathname() || "/site-editor";
  const returnPath = typeof window === "undefined" ? pathname : `${window.location.pathname}${window.location.search}`;
  return <AdminWorkspaceGate returnPath={returnPath}><SiteEditorWorkspace /></AdminWorkspaceGate>;
}

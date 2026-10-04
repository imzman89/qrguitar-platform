"use client";
import { editorDeadline, editorRequest } from "../../lib/editor-request";
import { useUiText } from "../../components/UiTextProvider";

import { createEditorMutationController, type EditorMutationPayload } from "../../lib/site-editor-client";

import {
  Activity,
  BookOpenText,
  Boxes,
  ChevronRight,
  FileCheck2,
  FileClock,
  FileText,
  Gauge,
  Guitar,
  Image as ImageIcon,
  KeyRound,
  Menu,
  Search,
  ShieldCheck,
  TriangleAlert,
  UserCog,
  Users,
  X
} from "lucide-react";
import Link from "next/link";
import styles from "./admin-shell.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { defaultSiteSettings, isSafeBrandLogoUrl, mergeSiteSettings, normalizeBrandLogoKey, type EditableSiteSettings } from "../../lib/site-settings";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { ACCOUNT_DELETION_UNAVAILABLE } from "../../lib/admin-account-deletion-status";
import { dispatchOptionalTrackingProductEvent, optionalTrackingProductEvents } from "../../lib/optional-tracking-consent";
import { AdminWorkspaceGate } from "../../components/AdminWorkspaceGate";

type OverviewPayload = {
  ok?: boolean;
  message?: string;
  migrationNotice?: string;
  admin?: { email?: string; role?: string; accessSource?: string; accountStatus?: string };
  counts?: Record<string, number | null>;
  systemHealth?: {
    build?: { gitCommitSha?: string; buildTimestamp?: string | null; dirtyWorkingTree?: boolean };
    deployment?: { environment?: string; identifier?: string };
    supabase?: { configured?: boolean; responding?: boolean };
    migrations?: { adminFoundation?: boolean; serviceWorkflow?: boolean };
    email?: { provider?: string; configured?: boolean; senderConfigured?: boolean };
    storage?: { responding?: boolean; requiredBucketsReady?: boolean; missingBuckets?: string[] };
  };
};

type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string;
  role: string;
  accountStatus: string;
  envManaged?: boolean;
  isEmpty?: boolean;
  deleteEligible?: boolean;
  deleteDisabledReason?: string;
  hidePublicContent: boolean;
  adminNotes: string;
  recordCount: number;
  publicRecordCount: number;
  privateRecordCount: number;
  proofDocumentCount: number;
  serviceEventCount: number;
  transferCount: number;
  pendingTransferCount?: number;
  acceptedTransferCount?: number;
  verifiedRecordCount?: number;
  authenticityConfirmedRecordCount?: number;
};

type AdminRecord = {
  id: string;
  qrCode: string;
  permanentPath: string;
  title: string;
  brand: string;
  model: string;
  serialNumber?: string;
  ownerId: string;
  ownerEmail: string;
  visibility: string;
  verificationStatus: string;
  authenticityStatus: string;
  showVerificationBadge?: boolean;
  showAuthenticityBadge?: boolean;
  safetyStatus: string;
  publicSafetyNote?: string;
  safetyNote?: string;
  adminArchivedAt?: string;
  adminArchiveReason?: string;
  ownerRemovedAt?: string;
  ownerRemovedReason?: string;
  isArchived?: boolean;
  isOwnerRemoved?: boolean;
  internalVerificationNote?: string;
  publicVerificationNote?: string;
  internalAuthenticityNote?: string;
  publicAuthenticityNote?: string;
  serviceEventCount: number;
  proofDocumentCount: number;
  transferCount: number;
  createdAt: string;
  updatedAt?: string;
};

type AdminProofDocument = {
  id: string;
  guitar_id: string;
  recordCode?: string;
  recordTitle?: string;
  ownerEmail?: string;
  is_public: boolean;
  document_type?: string;
  name?: string;
  file_size?: number | null;
  created_at?: string;
  updated_at?: string;
};

type AdminServiceEvent = {
  id: string;
  guitar_id: string;
  recordCode?: string;
  recordTitle?: string;
  ownerEmail?: string;
  is_public: boolean;
  event_type?: string;
  title?: string;
  service_date?: string;
  shop_name?: string;
  location?: string;
  created_at?: string;
};

type AdminTransfer = {
  id: string;
  guitar_id: string;
  recordCode?: string;
  recordTitle?: string;
  recordVisibility?: string;
  recordIsArchived?: boolean;
  recordIsOwnerRemoved?: boolean;
  fromOwnerEmail?: string;
  acceptedByEmail?: string;
  to_email?: string;
  status: string;
  claimPath?: string;
  created_at?: string;
  accepted_at?: string;
};

type RecordsPayload = {
  ok?: boolean;
  message?: string;
  records?: AdminRecord[];
  proofDocuments?: AdminProofDocument[];
  serviceEvents?: AdminServiceEvent[];
  transfers?: AdminTransfer[];
};

type AdminSession = { actorId: string; token: string };
type AdminAccessState = "checking" | "authorized" | "unauthorized" | "unavailable";

async function readAdminSession(): Promise<AdminSession> {
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  return {
    actorId: data.session?.user.id || "",
    token: data.session?.access_token || ""
  };
}

type AdminOwnershipClaim = {
  id: string;
  claimType: string;
  status: string;
  qrCode: string;
  profileTitle: string;
  acquisitionDetails: string;
  ownershipDeclaration: string;
  evidenceCount: number;
  evidence?: Array<{
    id: string;
    type: string;
    fileName: string;
    note: string;
    url: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type AuditEvent = {
  id: string;
  actor_email?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  target_user_id?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type SectionId =
  | "overview"
  | "users"
  | "records"
  | "trust"
  | "safety"
  | "transfers"
  | "claims"
  | "proof"
  | "service"
  | "brand-logos"
  | "access"
  | "audit"
  | "system";

type PendingAdminAction =
  | {
      kind: "user";
      user: AdminUser;
      action: string;
      extra?: Record<string, unknown>;
      title: string;
      target: string;
      reason: string;
      note?: string;
      includeNote?: boolean;
      typedConfirmation?: string;
    }
  | {
      kind: "record";
      record: AdminRecord;
      action: string;
      extra?: Record<string, unknown>;
      title: string;
      target: string;
      reason: string;
      includeTrustNotes?: boolean;
      includeSafetyNotes?: boolean;
      internalVerificationNote?: string;
      publicVerificationNote?: string;
      internalAuthenticityNote?: string;
      publicAuthenticityNote?: string;
      publicSafetyNote?: string;
      safetyNote?: string;
    }
  | {
      kind: "transfer";
      transfer: AdminTransfer;
      action: "cancel";
      title: string;
      target: string;
      reason: string;
    }
  | {
      kind: "claim";
      claim: AdminOwnershipClaim;
      action: "approve" | "deny" | "request_information" | "expire";
      title: string;
      target: string;
      reason: string;
    };

const sections: Array<{ id: SectionId; label: string; group: string; icon: typeof Gauge }> = [
  { id: "overview", label: "Overview", group: "Workspace", icon: Gauge },
  { id: "users", label: "Users", group: "People & Profiles", icon: Users },
  { id: "records", label: "Profiles", group: "People & Profiles", icon: Guitar },
  { id: "trust", label: "Trust", group: "People & Profiles", icon: ShieldCheck },
  { id: "safety", label: "Safety", group: "People & Profiles", icon: TriangleAlert },
  { id: "transfers", label: "Transfers", group: "Ownership", icon: Boxes },
  { id: "claims", label: "Claims", group: "Ownership", icon: FileCheck2 },
  { id: "proof", label: "Evidence", group: "People & Profiles", icon: FileText },
  { id: "service", label: "Service", group: "People & Profiles", icon: BookOpenText },
  { id: "brand-logos", label: "Brand Registry", group: "Platform", icon: ImageIcon },
  { id: "access", label: "Admin Access", group: "Platform", icon: KeyRound },
  { id: "audit", label: "Audit Log", group: "Platform", icon: FileClock },
  { id: "system", label: "System Health", group: "Platform", icon: Activity }
];

const sectionGroups = ["Workspace", "People & Profiles", "Ownership", "Platform"];

const overviewLinks: Record<string, { section: SectionId; filter?: string }> = {
  totalUsers: { section: "users" },
  activeUsers: { section: "users", filter: "active" },
  lockedUsers: { section: "users", filter: "locked" },
  bannedUsers: { section: "users", filter: "banned" },
  removedUsers: { section: "users", filter: "removed" },
  totalRecords: { section: "records" },
  publicRecords: { section: "records", filter: "public" },
  privateRecords: { section: "records", filter: "private" },
  verifiedRecords: { section: "trust", filter: "verified" },
  authenticityConfirmedRecords: { section: "trust", filter: "authenticity-confirmed" },
  lostRecords: { section: "safety", filter: "lost" },
  stolenRecords: { section: "safety", filter: "stolen" },
  pendingTransfers: { section: "transfers", filter: "pending" },
  serviceEntries: { section: "service" },
  proofDocuments: { section: "proof" }
};

function formatDate(value?: string) {
  if (!value) {
    return "Never";
  }
  return new Date(value).toLocaleString();
}

function statLabel(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function cleanSection(value: string | null): SectionId {
  return sections.some((section) => section.id === value) ? (value as SectionId) : "overview";
}

function normalize(value?: string) {
  return String(value || "").toLowerCase();
}

function safetyLabel(value?: string) {
  if (value === "lost") return "Reported Lost";
  if (value === "stolen") return "Reported Stolen";
  if (value === "recovered") return "Recovered";
  return "No Alert";
}

function adminChipClass(kind: "role" | "status", value?: string) {
  const clean = normalize(value);
  if (kind === "role" && (clean === "admin" || clean === "owner" || clean === "builder" || clean === "shop" || clean === "env-admin" || clean === "user")) return `admin-chip admin-chip--${clean}`;
  if (kind === "status" && (clean === "active" || clean === "locked" || clean === "banned" || clean === "removed")) return `admin-chip admin-chip--${clean}`;
  return "admin-chip";
}

function userRoleLabel(user: AdminUser) {
  if (user.envManaged) return "Env Admin";
  if (user.role === "admin") return "Admin";
  if (user.role === "builder") return "Builder";
  if (user.role === "shop") return "Service Shop";
  if (user.role === "owner") return "Owner";
  return "User";
}

function userRoleChipValue(user: AdminUser) {
  if (user.envManaged) return "env-admin";
  if (["admin", "owner", "builder", "shop"].includes(user.role)) return user.role;
  return "user";
}

function actionLabel(action: string, ui: ReturnType<typeof useUiText> = (_key, source) => source) {
  const labels: Record<string, string> = {
    site_content_published: ui("ui.app.admin.page.siteContentPublished", "Website content published"),
    site_draft_saved: ui("ui.app.admin.page.siteDraftSaved", "Website draft saved"),
    lock: "Account locked",
    unlock: "Account unlocked",
    ban: "User banned",
    unban: "User unbanned",
    remove: "User removed",
    restore_user: "User restored",
    delete_empty_user: "Empty user deleted",
    user_banned: "User banned",
    user_unbanned: "User unbanned",
    user_removed: "User removed",
    user_restored: "User restored",
    empty_user_deleted: "Empty user deleted",
    hide_public_content: "Public content hidden",
    restore_public_content: "Public content restored",
    change_role: "Role changed",
    admin_note: "Admin note saved",
    record_archived: "Profile archived",
    record_restored: "Profile restored",
    record_visibility_updated: "Profile visibility updated",
    trust_status_updated: "Trust status updated",
    authenticity_status_updated: "Authenticity status updated",
    trust_badge_visibility_updated: "Trust badge visibility updated",
    safety_status_updated: "Safety status updated",
    record_removed_from_collection: "Profile deleted from dashboard",
    record_restored_to_collection: "Historical recovery event"
  };
  const labelKey = action === "SITE_CONTENT_PUBLISHED" || action === "SITE_DRAFT_SAVED" ? action.toLowerCase() : action;
  return labels[labelKey] || statLabel(action);
}

function fileSizeLabel(value?: number | null) {
  if (!value) return "Size unavailable";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function AdminWorkspace() {
  const ui = useUiText("app.admin.page");
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [recordsPayload, setRecordsPayload] = useState<RecordsPayload | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [ownershipClaims, setOwnershipClaims] = useState<AdminOwnershipClaim[]>([]);
  const [claimsError, setClaimsError] = useState("");
  const [healthCheckedAt, setHealthCheckedAt] = useState<Date | null>(null);
  const [userFilter, setUserFilter] = useState("");
  const [recordFilter, setRecordFilter] = useState("");
  const [transferFilter, setTransferFilter] = useState("");
  const [adminSearch, setAdminSearch] = useState("");
  const [sortKey, setSortKey] = useState("created-desc");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [adminAccessState, setAdminAccessState] = useState<AdminAccessState>("checking");
  const [adminDataReady, setAdminDataReady] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAdminAction | null>(null);
  const [siteSettings, setSiteSettings] = useState<EditableSiteSettings>(defaultSiteSettings);
  const logoEditor = useRef<ReturnType<typeof createEditorMutationController> | null>(null);
  const logoVersions = useRef({ publishedVersion: "", draftVersion: "" });
  const logoSaving = useRef(false);
  const logoNeedsReload = useRef(false);
  const [brandLogoBrand, setBrandLogoBrand] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AdminRecord | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const navButtonRef = useRef<HTMLButtonElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sectionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const commandBarRef = useRef<HTMLDivElement | null>(null);
  const sectionFocusVersion = useRef(0);
  const pendingSectionFocus = useRef<{ section: SectionId; actorId: string; version: number } | null>(null);
  const entityDrawerRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const adminActorRef = useRef("");
  const adminLoadRevision = useRef(0);
  const adminMutationRef = useRef("");
  const adminAuthorized = adminAccessState === "authorized";
  const overlayKind = adminAuthorized && adminDataReady ? (pendingAction ? "modal" : selectedUser || selectedRecord ? "entity" : navOpen ? "navigation" : "") : "";
  busyRef.current = busy;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = cleanSection(params.get("section"));
    const filter = params.get("filter") || "";
    setActiveSection(section);
    if (section === "users") setUserFilter(filter);
    if (section === "records" || section === "trust" || section === "safety") setRecordFilter(filter);
    if (section === "transfers") setTransferFilter(filter);
  }, []);

  useEffect(() => {
    const closeDesktopNavigation = () => {
      if (window.innerWidth >= 1100) setNavOpen(false);
    };
    closeDesktopNavigation();
    window.addEventListener("resize", closeDesktopNavigation);
    return () => window.removeEventListener("resize", closeDesktopNavigation);
  }, []);

  function goToSection(section: SectionId, filter = "", options: { search?: string } = {}) {
    const actorId = adminActorRef.current;
    pendingSectionFocus.current = section !== activeSection && adminAuthorized && adminDataReady && actorId
      ? { section, actorId, version: ++sectionFocusVersion.current }
      : null;
    setActiveSection(section);
    setAdminSearch(options.search || "");
    setSortKey("created-desc");
    setUserFilter("");
    setRecordFilter("");
    setTransferFilter("");
    if (section === "users") setUserFilter(filter);
    if (section === "records" || section === "trust" || section === "safety") setRecordFilter(filter);
    if (section === "transfers") setTransferFilter(filter);
    const params = new URLSearchParams();
    params.set("section", section);
    if (filter) params.set("filter", filter);
    window.history.replaceState(null, "", `/admin?${params.toString()}`);
    setNavOpen(false);
    setSelectedUser(null);
    setSelectedRecord(null);
  }

  useEffect(() => {
    const overlay = overlayKind === "modal"
      ? modalRef.current
      : overlayKind === "entity"
        ? entityDrawerRef.current
        : overlayKind === "navigation"
          ? sidebarRef.current
          : null;
    if (!overlay) return;
    const activeOverlay = overlay;

    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusVersionRef = sectionFocusVersion;
    const returnVersion = focusVersionRef.current;
    const fallbackFocus = navButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])'
    ].join(",");
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const firstFocusable = activeOverlay.querySelector<HTMLElement>(focusableSelector);
      (firstFocusable || activeOverlay).focus();
    }, 0);

    function closeTopOverlay() {
      if (overlayKind === "modal") {
        if (busyRef.current) return;
        setPendingAction(null);
      }
      else if (overlayKind === "entity") {
        setSelectedUser(null);
        setSelectedRecord(null);
      }
      else setNavOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (overlayKind === "modal" && busyRef.current) return;
        closeTopOverlay();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(activeOverlay.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        activeOverlay.focus();
        return;
      }
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

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => {
        if (returnVersion !== focusVersionRef.current) return;
        if (returnFocus?.isConnected) returnFocus.focus();
        else if (fallbackFocus?.isConnected) fallbackFocus.focus();
      }, 0);
    };
  }, [overlayKind]);

  useEffect(() => {
    const request = pendingSectionFocus.current;
    if (!request) return;
    if (!adminAuthorized || !adminDataReady || overlayKind || activeSection !== request.section || adminActorRef.current !== request.actorId) {
      pendingSectionFocus.current = null;
      return;
    }
    const timer = window.setTimeout(() => {
      const heading = sectionHeadingRef.current;
      if (pendingSectionFocus.current !== request || sectionFocusVersion.current !== request.version || adminActorRef.current !== request.actorId || !heading?.isConnected) return;
      pendingSectionFocus.current = null;
      heading.focus({ preventScroll: true });
      const toolbarHeight = commandBarRef.current?.offsetHeight || 0;
      const top = heading.getBoundingClientRect().top + window.scrollY - toolbarHeight - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeSection, overlayKind, adminAuthorized, adminDataReady]);

  const loadAdmin = useCallback(async (options: { successMessage?: string } = {}) => {
    const requestRevision = ++adminLoadRevision.current;
    setLoading(true);
    if (!options.successMessage) setMessage("");
    try {
      const session = await editorDeadline(readAdminSession());
      if (requestRevision !== adminLoadRevision.current) return;
      if (!session.token || !session.actorId) {
        adminActorRef.current = "";
        setAdminAccessState("unauthorized");
        setAdminDataReady(false);
        setOverview(null);
        setUsers([]);
        setRecordsPayload(null);
        setAuditEvents([]);
        setOwnershipClaims([]);
        setClaimsError("");
        setSelectedUser(null);
        setSelectedRecord(null);
        setPendingAction(null);
        setNavOpen(false);
        setMessage(ui("ui.app.admin.page.82ffb5c6aa67", "Sign in with an authorized admin account."));
        return;
      }
      if (adminActorRef.current && adminActorRef.current !== session.actorId) {
        setOverview(null);
        setUsers([]);
        setRecordsPayload(null);
        setAuditEvents([]);
        setOwnershipClaims([]);
        setClaimsError("");
        setSelectedUser(null);
        setSelectedRecord(null);
        setPendingAction(null);
      }
      adminActorRef.current = session.actorId;

      const headers = { Authorization: `Bearer ${session.token}` };
      const reads = await Promise.all([
        editorRequest("/api/admin/overview", { headers, cache: "no-store" }),
        editorRequest("/api/admin/users", { headers, cache: "no-store" }),
        editorRequest("/api/admin/records", { headers, cache: "no-store" }),
        editorRequest("/api/admin/audit", { headers, cache: "no-store" }),
        editorRequest("/api/ownership-claims", { headers, cache: "no-store" })
      ]);
      const [overviewResponse, usersResponse, recordsResponse, auditResponse, claimsResponse] = reads.map(read => read.response);
      const [overviewJson, usersJson, recordsJson, auditJson, claimsJson] = reads.map(read => read.payload || {});
      if (requestRevision !== adminLoadRevision.current || adminActorRef.current !== session.actorId) return;

      const nextUsers = Array.isArray(usersJson.users) ? usersJson.users as AdminUser[] : [];
      const nextRecords = Array.isArray(recordsJson.records) ? recordsJson.records as AdminRecord[] : [];
      const overviewAuthorized = overviewResponse.ok && overviewJson.ok === true;
      setHealthCheckedAt(overviewAuthorized ? new Date() : null);
      const coreReady = overviewAuthorized
        && usersResponse.ok && usersJson.ok === true
        && recordsResponse.ok && recordsJson.ok === true
        && auditResponse.ok && auditJson.ok === true;
      const nextClaimsError = claimsResponse.ok && claimsJson.ok === true
        ? ""
        : String(claimsJson.message || "Ownership claims could not be loaded. Retry the admin refresh.");
      setOverview(overviewJson);
      setUsers(nextUsers);
      setRecordsPayload(recordsJson);
      setAuditEvents(Array.isArray(auditJson.auditEvents) ? auditJson.auditEvents : []);
      setOwnershipClaims(claimsResponse.ok && Array.isArray(claimsJson.claims) ? claimsJson.claims : []);
      setClaimsError(nextClaimsError);
      setAdminAccessState(overviewAuthorized
        ? "authorized"
        : overviewResponse.status === 401 || overviewResponse.status === 403
          ? "unauthorized"
          : "unavailable");
      setAdminDataReady(coreReady);
      if (!coreReady) {
        setNavOpen(false);
        setSelectedUser(null);
        setSelectedRecord(null);
        setPendingAction(null);
      }
      setSelectedUser((current) => current ? nextUsers.find((user) => user.id === current.id) || null : null);
      setSelectedRecord((current) => current ? nextRecords.find((record) => record.id === current.id) || null : null);
      const responseMessage = overviewJson.message || usersJson.message || recordsJson.message || auditJson.message || nextClaimsError
        || overviewJson.migrationNotice || usersJson.migrationNotice
        || (!coreReady ? "Admin data could not be loaded completely. Retry before using admin controls." : "");
      setMessage(responseMessage || options.successMessage || "");
    } catch (error) {
      if (requestRevision === adminLoadRevision.current) {
        setAdminAccessState("unavailable");
        setAdminDataReady(false);
        setNavOpen(false);
        setSelectedUser(null);
        setSelectedRecord(null);
        setPendingAction(null);
        setMessage(error instanceof Error ? ui("ui.app.admin.page.d09f6c5202ed", "Could not refresh admin data: {{value1}}", {value1: error.message}) : ui("ui.app.admin.page.378a81a9249b", "Could not refresh admin data. Check your connection and try again."));
      }
    } finally {
      if (requestRevision === adminLoadRevision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  const loadSiteSettings = useCallback(async () => {
    let requestedActorId = "";
    try {
      const session = await readAdminSession();
      if (!session.token || !session.actorId) return;
      requestedActorId = session.actorId;
      const response = await fetch("/api/site-editor", { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true || !payload.editorActorId || typeof payload.publishedVersion !== "string" || typeof payload.draftVersion !== "string") throw new Error(payload.message || "Could not load brand logo settings.");
      if (adminActorRef.current && adminActorRef.current !== session.actorId) return;
      setSiteSettings(mergeSiteSettings(payload.published));
      logoVersions.current = { publishedVersion: payload.publishedVersion, draftVersion: payload.draftVersion };
      logoEditor.current = createEditorMutationController({ actorId: payload.editorActorId, storageScope: "brand-logos", storage: window.sessionStorage, uuid: () => crypto.randomUUID(), send: async (body) => {
        const currentSession = await readAdminSession().catch(() => ({ actorId: "", token: "" }));
        if (!currentSession.token) return { status: 401, payload: { ok: false, uncertain: false, message: "Sign in required." } };
        if (currentSession.actorId !== payload.editorActorId) return { status: 409, payload: { ok: false, uncertain: false, message: "The signed-in account changed. Reload brand logos before saving." } };
        const abort = new AbortController(); const timer = window.setTimeout(() => abort.abort(), 20000);
        try {
          const result = await fetch("/api/site-editor", { method: "PUT", headers: { Authorization: `Bearer ${currentSession.token}`, "Content-Type": "application/json" }, body, cache: "no-store", signal: abort.signal });
          return { status: result.status, payload: await result.json().catch(() => ({})) as EditorMutationPayload };
        } finally { window.clearTimeout(timer); }
      } });
      if (logoEditor.current.pending) setMessage(ui("ui.app.admin.page.8ea6a38fb82d", "A previous brand logo save needs confirmation. Use Save again to retry that exact change before making another."));
    } catch (error) {
      if (!requestedActorId || !adminActorRef.current || adminActorRef.current === requestedActorId) {
        setMessage(error instanceof Error ? error.message : ui("ui.app.admin.page.cbf9b4297bc4", "Could not load brand logo settings."));
      }
    }
  }, []);

  useEffect(() => { void loadSiteSettings(); }, [loadSiteSettings]);

  useEffect(() => {
    const { data } = createBrowserSupabaseClient().auth.onAuthStateChange((_event, session) => {
      const nextActorId = session?.user.id || "";
      if (nextActorId === adminActorRef.current) return;
      adminActorRef.current = nextActorId;
      adminLoadRevision.current += 1;
      setAdminAccessState(nextActorId ? "checking" : "unauthorized");
      setAdminDataReady(false);
      setOverview(null);
      setUsers([]);
      setRecordsPayload(null);
      setAuditEvents([]);
      setOwnershipClaims([]);
      setClaimsError("");
      setSelectedUser(null);
      setSelectedRecord(null);
      setPendingAction(null);
      setNavOpen(false);
      setBusy("");
      adminMutationRef.current = "";
      setSiteSettings(defaultSiteSettings);
      setBrandLogoBrand("");
      setBrandLogoUrl("");
      logoEditor.current = null;
      logoVersions.current = { publishedVersion: "", draftVersion: "" };
      logoSaving.current = false;
      logoNeedsReload.current = false;
      setMessage(nextActorId ? ui("ui.app.admin.page.5c1eee64f638", "Refreshing admin access for this account.") : ui("ui.app.admin.page.82ffb5c6aa67", "Sign in with an authorized admin account."));
      setLoading(Boolean(nextActorId));
      if (nextActorId) {
        void loadAdmin();
        void loadSiteSettings();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [loadAdmin, loadSiteSettings]);

  async function saveBrandLogoMapping(nextLogos: Record<string, string>) {
    if (logoSaving.current) return;
    const controller = logoEditor.current;
    if (!controller || logoNeedsReload.current) { setMessage(ui("ui.app.admin.page.4dcdc5cc4c51", "Reload the admin page before changing brand logos.")); return; }
    if (!controller.pending && logoVersions.current.draftVersion) { setMessage(ui("ui.app.admin.page.b2d6ba20f6e1", "A shared draft exists. Manage brand logos in the Site Editor to preserve it.")); return; }
    logoSaving.current = true; setBusy("brand-logo");
    try {
      const nextSettings = mergeSiteSettings({ ...siteSettings, brandLogos: nextLogos });
      const payload = await (controller.pending ? controller.retry() : controller.mutate({ action: "publish", source: "brand_logo_admin", settings: nextSettings, note: "Brand logo mapping updated", area: "Brand assets" }, logoVersions.current, JSON.stringify(nextSettings)));
      if (payload.published) setSiteSettings(mergeSiteSettings(payload.published as Partial<EditableSiteSettings>));
      logoVersions.current = { publishedVersion: payload.publishedVersion!, draftVersion: payload.draftVersion! };
      logoNeedsReload.current = payload.superseded === true;
      setMessage(payload.superseded ? ui("ui.app.admin.page.4b053c659546", "The previous save succeeded; later edits exist. Reload before making another change.") : payload.message || ui("ui.app.admin.page.eb5b7ebcc799", "Brand logos published."));
    } catch (error) {
      if (!controller.pending) logoNeedsReload.current = true;
      setMessage((error instanceof Error ? error.message : "The save could not be confirmed.") + (controller.pending ? " Use Save again to retry that exact change." : " Reload before making another change."));
    } finally { logoSaving.current = false; setBusy(""); }
  }


  function saveCurrentBrandLogo() {
    const key = normalizeBrandLogoKey(brandLogoBrand);
    const url = brandLogoUrl.trim();
    if (!key) {
      setMessage(ui("ui.app.admin.page.7c35bff3970c", "Enter a valid brand name."));
      return;
    }
    if (!isSafeBrandLogoUrl(url)) {
      setMessage(ui("ui.app.admin.page.aaba32ffca62", "Use an HTTPS URL or a site-relative path beginning with one slash."));
      return;
    }

    void saveBrandLogoMapping({ ...siteSettings.brandLogos, [key]: url });
  }

  function removeCurrentBrandLogo(brand: string) {
    const key = normalizeBrandLogoKey(brand);
    const next = { ...siteSettings.brandLogos };
    delete next[key];
    void saveBrandLogoMapping(next);
  }

  function exportAuditLog() {
    const safeEvents = filteredAudit.map((event) => ({
      action: actionLabel(event.action, ui),
      targetType: event.target_type || "",
      targetId: event.target_id || "",
      reason: event.reason || "",
      createdAt: event.created_at,
      metadata: event.metadata || {}
    }));
    const blob = new Blob([JSON.stringify(safeEvents, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `qrguitar-admin-audit-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function beginUserAction(user: AdminUser, action: string, extra: Record<string, unknown> = {}, options: { includeNote?: boolean; confirm?: boolean; title?: string } = {}) {
    if (action === "delete_empty_user") {
      setMessage(ACCOUNT_DELETION_UNAVAILABLE);
      return;
    }
    if (!options.includeNote && !options.confirm) {
      void updateUser(user, action, extra);
      return;
    }

    setMessage("");
    setPendingAction({
      kind: "user",
      user,
      action,
      extra,
      title: options.title || actionLabel(action, ui),
      target: user.email || user.id,
      reason: "",
      note: options.includeNote ? user.adminNotes || "" : undefined,
      includeNote: options.includeNote,
      typedConfirmation: ""
    });
  }

  function beginAdminRoleChange(user: AdminUser) {
    const removingAdmin = user.role === "admin";
    beginUserAction(
      user,
      "change_role",
      { role: removingAdmin ? "" : "admin" },
      { confirm: true, title: removingAdmin ? "Remove Admin" : "Add Admin" }
    );
  }

  async function updateUser(user: AdminUser, action: string, extra: Record<string, unknown> = {}, reason = "") {
    if (action === "delete_empty_user") {
      setMessage(ACCOUNT_DELETION_UNAVAILABLE);
      return false;
    }
    const busyKey = `${action}:${user.id}`;
    if (adminMutationRef.current) return false;
    adminMutationRef.current = busyKey;
    const expectedActorId = adminActorRef.current;
    setMessage("");
    setBusy(busyKey);
    try {
      const session = await readAdminSession();
      if (!session.token || !session.actorId) throw new Error("Sign in required.");
      if (!expectedActorId || expectedActorId !== session.actorId) throw new Error("The signed-in account changed. Refresh admin before trying again.");
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action, reason, ...extra })
      });
      const payload = await response.json().catch(() => ({}));
      if (adminActorRef.current !== session.actorId) return false;
      const confirmed = response.ok && payload.ok === true;
      const resultMessage = payload.message || (confirmed ? "Admin action saved." : "Admin action failed. The server response did not confirm a saved change.");
      if (!confirmed) {
        setMessage(resultMessage);
        return false;
      }
      await loadAdmin({ successMessage: resultMessage });
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui("ui.app.admin.page.2fcab2f0dff4", "The admin action could not be completed. Try again."));
      return false;
    } finally {
      if (adminMutationRef.current === busyKey) adminMutationRef.current = "";
      setBusy((current) => current === busyKey ? "" : current);
    }
  }

  function beginRecordAction(record: AdminRecord, action: string, extra: Record<string, unknown> = {}, options: { includeTrustNotes?: boolean; includeSafetyNotes?: boolean; confirm?: boolean; title?: string } = {}) {
    if (!options.includeTrustNotes && !options.includeSafetyNotes && !options.confirm) {
      void updateRecord(record, action, extra);
      return;
    }

    setMessage("");
    setPendingAction({
      kind: "record",
      record,
      action,
      extra,
      title: options.title || actionLabel(action, ui),
      target: `${record.qrCode} - ${record.title}`,
      reason: "",
      includeTrustNotes: options.includeTrustNotes,
      includeSafetyNotes: options.includeSafetyNotes,
      internalVerificationNote: record.internalVerificationNote || "",
      publicVerificationNote: record.publicVerificationNote || "",
      internalAuthenticityNote: record.internalAuthenticityNote || "",
      publicAuthenticityNote: record.publicAuthenticityNote || "",
      publicSafetyNote: record.publicSafetyNote || "",
      safetyNote: record.safetyNote || ""
    });
  }

  async function updateRecord(record: AdminRecord, action: string, extra: Record<string, unknown> = {}, reason = "") {
    const busyKey = `${action}:${record.id}`;
    if (adminMutationRef.current) return false;
    adminMutationRef.current = busyKey;
    const expectedActorId = adminActorRef.current;
    setMessage("");
    setBusy(busyKey);
    try {
      const session = await readAdminSession();
      if (!session.token || !session.actorId) throw new Error("Sign in required.");
      if (!expectedActorId || expectedActorId !== session.actorId) throw new Error("The signed-in account changed. Refresh admin before trying again.");
      const response = await fetch(`/api/admin/records/${encodeURIComponent(record.id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action, reason, ...extra })
      });
      const payload = await response.json().catch(() => ({}));
      if (adminActorRef.current !== session.actorId) return false;
      const confirmed = response.ok && payload.ok === true;
      const resultMessage = payload.message || (confirmed ? "Profile action saved." : "Profile action failed. The server response did not confirm a saved change.");
      if (!confirmed) {
        setMessage(resultMessage);
        return false;
      }
      await loadAdmin({ successMessage: resultMessage });
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui("ui.app.admin.page.e7fda97ddda3", "The Profile action could not be completed. Try again."));
      return false;
    } finally {
      if (adminMutationRef.current === busyKey) adminMutationRef.current = "";
      setBusy((current) => current === busyKey ? "" : current);
    }
  }

  function beginTransferAction(transfer: AdminTransfer, action: "cancel") {
    setMessage("");
    setPendingAction({
      kind: "transfer",
      transfer,
      action,
      title: "Cancel ownership transfer",
      target: `${transfer.recordTitle || "QRguitar Profile"} (${transfer.recordCode || transfer.guitar_id})`,
      reason: ""
    });
  }

  async function updateTransfer(transfer: AdminTransfer, action: "cancel", reason = "") {
    const busyKey = `${action}:${transfer.id}`;
    if (adminMutationRef.current) return false;
    adminMutationRef.current = busyKey;
    const expectedActorId = adminActorRef.current;
    setMessage("");
    setBusy(busyKey);
    try {
      const session = await readAdminSession();
      if (!session.token || !session.actorId) throw new Error("Sign in required.");
      if (!expectedActorId || expectedActorId !== session.actorId) throw new Error("The signed-in account changed. Refresh admin before trying again.");
      const response = await fetch("/api/transfers", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id: transfer.id, action, reason })
      });
      const payload = await response.json().catch(() => ({}));
      if (adminActorRef.current !== session.actorId) return false;
      const confirmed = response.ok && payload.ok === true;
      const resultMessage = payload.message || (confirmed ? "Transfer action saved." : "Transfer action failed. The server response did not confirm a saved change.");
      if (!confirmed) {
        setMessage(resultMessage);
        return false;
      }
      await loadAdmin({ successMessage: resultMessage });
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui("ui.app.admin.page.db59d7513303", "The transfer action could not be completed. Try again."));
      return false;
    } finally {
      if (adminMutationRef.current === busyKey) adminMutationRef.current = "";
      setBusy((current) => current === busyKey ? "" : current);
    }
  }

  function beginOwnershipClaimAction(claim: AdminOwnershipClaim, action: "approve" | "deny" | "request_information" | "expire") {
    const titles = {
      approve: "Approve ownership claim",
      deny: "Deny ownership claim",
      request_information: "Request additional evidence",
      expire: "Expire ownership claim"
    } as const;
    setMessage("");
    setPendingAction({
      kind: "claim",
      claim,
      action,
      title: titles[action],
      target: `${claim.profileTitle} (${claim.qrCode || "protected Profile"})`,
      reason: ""
    });
  }

  async function updateOwnershipClaim(
    claim: AdminOwnershipClaim,
    action: "approve" | "deny" | "request_information" | "expire",
    reason: string
  ) {
    const busyKey = `${action}:${claim.id}`;
    if (adminMutationRef.current) return false;
    adminMutationRef.current = busyKey;
    const expectedActorId = adminActorRef.current;
    setMessage("");
    setBusy(busyKey);
    try {
      const session = await readAdminSession();
      if (!session.token || !session.actorId) throw new Error("Sign in required.");
      if (!expectedActorId || expectedActorId !== session.actorId) throw new Error("The signed-in account changed. Refresh admin before trying again.");
      const response = await fetch("/api/ownership-claims", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: claim.id, action, note: reason })
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (adminActorRef.current !== session.actorId) return false;
      const resultMessage = payload.message || (response.ok ? "Ownership request updated." : "Ownership request update failed.");
      if (response.ok && payload.ok === true && action === "approve") {
        void dispatchOptionalTrackingProductEvent({
          name: optionalTrackingProductEvents.ownershipTransferCompleted,
          properties: { method: "review" }
        }, { dedupeKey: claim.id });
      }
      if (!response.ok || payload.ok !== true) {
        setMessage(resultMessage);
        return false;
      }
      await loadAdmin({ successMessage: resultMessage });
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui("ui.app.admin.page.e7a30c4fa57d", "The ownership request could not be updated. Try again."));
      return false;
    } finally {
      if (adminMutationRef.current === busyKey) adminMutationRef.current = "";
      setBusy((current) => current === busyKey ? "" : current);
    }
  }

  async function copyTransferClaimLink(transfer: AdminTransfer) {
    if (!transfer.claimPath) {
      setMessage(ui("ui.app.admin.page.1ae6e044a6b1", "No active claim link is available for this transfer."));
      return;
    }

    const url = `${window.location.origin}${transfer.claimPath}`;
    try {
      if (!window.navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
      await window.navigator.clipboard.writeText(url);
      setMessage(ui("ui.app.admin.page.162b1b3c26ed", "Transfer claim link copied."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui("ui.app.admin.page.27ad9cd9e280", "Could not copy the transfer claim link."));
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction || busy) {
      return;
    }

    if (pendingAction.kind === "user" && pendingAction.action === "change_role" && pendingAction.user.role === "admin"
      && !["owner", "builder", "shop"].includes(String(pendingAction.extra?.role || ""))) {
      setMessage(ui("ui.app.admin.page.3dd513825201", "Choose the account role that should remain after admin access is removed."));
      return;
    }

    let confirmed = false;
    if (pendingAction.kind === "user") {
      confirmed = await updateUser(
        pendingAction.user,
        pendingAction.action,
        pendingAction.includeNote ? { ...pendingAction.extra, adminNotes: pendingAction.note || "" } : pendingAction.extra,
        pendingAction.reason
      );
    } else if (pendingAction.kind === "record") {
      confirmed = await updateRecord(
        pendingAction.record,
        pendingAction.action,
        {
          ...pendingAction.extra,
          ...(pendingAction.includeTrustNotes ? {
            internalVerificationNote: pendingAction.internalVerificationNote || "",
            publicVerificationNote: pendingAction.publicVerificationNote || "",
            internalAuthenticityNote: pendingAction.internalAuthenticityNote || "",
            publicAuthenticityNote: pendingAction.publicAuthenticityNote || ""
          } : {}),
          ...(pendingAction.includeSafetyNotes ? {
            publicSafetyNote: pendingAction.publicSafetyNote || "",
            safetyNote: pendingAction.safetyNote || ""
          } : {})
        },
        pendingAction.reason
      );
    } else if (pendingAction.kind === "transfer") {
      confirmed = await updateTransfer(pendingAction.transfer, pendingAction.action, pendingAction.reason);
    } else {
      confirmed = await updateOwnershipClaim(pendingAction.claim, pendingAction.action, pendingAction.reason);
    }

    if (confirmed) setPendingAction(null);
  }

  const filteredUsers = useMemo(() => {
    const search = normalize(adminSearch);
    let list = users.filter((user) => {
      const matchesSearch = !search || normalize(`${user.email} ${user.id}`).includes(search);
      const matchesFilter =
        !userFilter ||
        (userFilter === "admin"
          ? user.role === "admin" || user.envManaged === true
          : userFilter === "normal"
            ? user.role !== "admin" && user.envManaged !== true
            : userFilter === "empty"
              ? user.isEmpty === true
              : userFilter === "has-records"
                ? user.recordCount > 0
                : user.accountStatus === userFilter);
      return matchesSearch && matchesFilter;
    });

    list = [...list].sort((a, b) => {
      if (sortKey === "email") return a.email.localeCompare(b.email);
      if (sortKey === "role") return a.role.localeCompare(b.role);
      if (sortKey === "status") return a.accountStatus.localeCompare(b.accountStatus);
      if (sortKey === "records") return b.recordCount - a.recordCount;
      if (sortKey === "last-sign-in") return String(b.lastSignInAt).localeCompare(String(a.lastSignInAt));
      if (sortKey === "created-asc") return String(a.createdAt).localeCompare(String(b.createdAt));
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return list;
  }, [adminSearch, sortKey, userFilter, users]);

  const records = useMemo(() => recordsPayload?.records || [], [recordsPayload?.records]);
  const usedBrands = useMemo(
    () => Array.from(new Set(records.map((record) => record.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [records]
  );
  const filteredRecords = useMemo(() => {
    const search = normalize(adminSearch);
    let list = records.filter((record) => {
      const haystack = normalize(`${record.qrCode} ${record.title} ${record.brand} ${record.model} ${record.serialNumber} ${record.ownerEmail}`);
      if (search && !haystack.includes(search)) return false;
      if (!recordFilter || recordFilter === "active") return !record.isArchived && !record.isOwnerRemoved;
      if (recordFilter === "archived") return record.isArchived === true;
      if (recordFilter === "owner-removed") return record.isOwnerRemoved === true;
      if (recordFilter === "orphaned") return !record.ownerId;
      if (recordFilter === "public" || recordFilter === "private" || recordFilter === "unlisted") return record.visibility === recordFilter;
      if (recordFilter === "verified") return record.verificationStatus === "Verified";
      if (recordFilter === "unverified") return record.verificationStatus === "Unverified";
      if (recordFilter === "authenticity-confirmed") return record.authenticityStatus === "Authenticity Confirmed";
      if (recordFilter === "authenticity-unconfirmed") return record.authenticityStatus === "Authenticity Unconfirmed";
      if (recordFilter === "lost" || recordFilter === "stolen" || recordFilter === "recovered") return record.safetyStatus === recordFilter;
      if (recordFilter === "clear") return !record.safetyStatus || record.safetyStatus === "clear";
      if (recordFilter === "has-proof") return record.proofDocumentCount > 0;
      if (recordFilter === "has-service") return record.serviceEventCount > 0;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "owner") return a.ownerEmail.localeCompare(b.ownerEmail);
      if (sortKey === "visibility") return a.visibility.localeCompare(b.visibility);
      if (sortKey === "verification") return a.verificationStatus.localeCompare(b.verificationStatus);
      if (sortKey === "authenticity") return a.authenticityStatus.localeCompare(b.authenticityStatus);
      if (sortKey === "safety") return safetyLabel(a.safetyStatus).localeCompare(safetyLabel(b.safetyStatus));
      if (sortKey === "service") return b.serviceEventCount - a.serviceEventCount;
      if (sortKey === "proof") return b.proofDocumentCount - a.proofDocumentCount;
      if (sortKey === "created-asc") return String(a.createdAt).localeCompare(String(b.createdAt));
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return list;
  }, [adminSearch, recordFilter, records, sortKey]);

  const filteredTransfers = useMemo(() => {
    const search = normalize(adminSearch);
    return (recordsPayload?.transfers || [])
      .filter((transfer) => {
        const matchesSearch = !search || normalize(`${transfer.id} ${transfer.recordCode} ${transfer.recordTitle} ${transfer.fromOwnerEmail} ${transfer.to_email}`).includes(search);
        const matchesFilter = !transferFilter || transfer.status === transferFilter || (transferFilter === "pending" && transfer.status === "sent");
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => sortKey === "created-asc"
        ? String(a.created_at).localeCompare(String(b.created_at))
        : String(b.created_at).localeCompare(String(a.created_at)));
  }, [adminSearch, recordsPayload?.transfers, sortKey, transferFilter]);

  const filteredProof = useMemo(() => {
    const search = normalize(adminSearch);
    return [...(recordsPayload?.proofDocuments || [])]
      .filter((document) => !search || normalize(`${document.name} ${document.recordCode} ${document.recordTitle} ${document.ownerEmail} ${document.document_type}`).includes(search))
      .sort((a, b) => {
        if (sortKey === "title") return String(a.name || "").localeCompare(String(b.name || ""));
        if (sortKey === "owner") return String(a.ownerEmail || "").localeCompare(String(b.ownerEmail || ""));
        if (sortKey === "created-asc") return String(a.created_at || "").localeCompare(String(b.created_at || ""));
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });
  }, [adminSearch, recordsPayload?.proofDocuments, sortKey]);

  const filteredService = useMemo(() => {
    const search = normalize(adminSearch);
    return [...(recordsPayload?.serviceEvents || [])]
      .filter((event) => !search || normalize(`${event.title} ${event.recordCode} ${event.recordTitle} ${event.ownerEmail} ${event.event_type} ${event.shop_name} ${event.location}`).includes(search))
      .sort((a, b) => {
        if (sortKey === "title") return String(a.title || "").localeCompare(String(b.title || ""));
        if (sortKey === "owner") return String(a.ownerEmail || "").localeCompare(String(b.ownerEmail || ""));
        if (sortKey === "service-date") return String(b.service_date || "").localeCompare(String(a.service_date || ""));
        if (sortKey === "created-asc") return String(a.created_at || "").localeCompare(String(b.created_at || ""));
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });
  }, [adminSearch, recordsPayload?.serviceEvents, sortKey]);

  const filteredAudit = useMemo(() => {
    const search = normalize(adminSearch);
    return auditEvents
      .filter((event) => !search || normalize(`${event.actor_email} ${event.action} ${event.target_type} ${event.target_id} ${event.reason}`).includes(search))
      .sort((a, b) => {
        if (sortKey === "email") return String(a.actor_email || "").localeCompare(String(b.actor_email || ""));
        if (sortKey === "status") return a.action.localeCompare(b.action);
        if (sortKey === "created-asc") return a.created_at.localeCompare(b.created_at);
        return b.created_at.localeCompare(a.created_at);
      });
  }, [adminSearch, auditEvents, sortKey]);

  function filterControls(kind: "users" | "records" | "transfers" | "proof" | "service" | "audit") {
    return (
      <div className="admin-filter-row">
        <input
          value={adminSearch}
          onChange={(event) => setAdminSearch(event.target.value)}
          placeholder={ui("ui.app.admin.page.43988bdf8cff", "Search this section")}
          aria-label={ui("ui.app.admin.page.005abd0bb982", "Search {{value1}}", { value1: kind })}
        />
        {kind === "users" ? (
          <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} aria-label={ui("ui.app.admin.page.79df1b685bf6", "Filter users")}>
            <option value="">{ui("ui.app.admin.page.f7898130e557", "All users")}</option>
            <option value="active">{ui("ui.app.admin.page.92340695899b", "Active")}</option>
            <option value="locked">{ui("ui.app.admin.page.a424e33d9093", "Locked")}</option>
            <option value="banned">{ui("ui.app.admin.page.05eb210744d1", "Banned")}</option>
            <option value="removed">{ui("ui.app.admin.page.4118fb4fed0e", "Removed")}</option>
            <option value="admin">{ui("ui.app.admin.page.8273a67b55a7", "Admins")}</option>
            <option value="normal">{ui("ui.app.admin.page.e1c372d0ffd5", "Normal users")}</option>
            <option value="empty">{ui("ui.app.admin.page.20aff3de82e7", "Empty users")}</option>
            <option value="has-records">{ui("ui.app.admin.page.48cae46b66a5", "Users with Profiles")}</option>
          </select>
        ) : kind === "transfers" ? (
          <select value={transferFilter} onChange={(event) => setTransferFilter(event.target.value)} aria-label={ui("ui.app.admin.page.1bde91535884", "Filter transfers")}>
            <option value="">{ui("ui.app.admin.page.19ec8ce8a18b", "All transfers")}</option>
            <option value="pending">{ui("ui.app.admin.page.331551b0de41", "Pending")}</option>
            <option value="accepted">{ui("ui.app.admin.page.a00fb0c50741", "Accepted")}</option>
            <option value="cancelled">{ui("ui.app.admin.page.d353a99eb455", "Cancelled")}</option>
            <option value="expired">{ui("ui.app.admin.page.424a2551d356", "Expired")}</option>
          </select>
        ) : kind === "records" ? (
          <select value={recordFilter} onChange={(event) => setRecordFilter(event.target.value)} aria-label={ui("ui.app.admin.page.b5d04c525368", "Filter Profiles")}>
            <option value="">{ui("ui.app.admin.page.4dba739a02ba", "Active records")}</option>
            <option value="archived">{ui("ui.app.admin.page.bdb86505f806", "Archived")}</option>
            <option value="owner-removed">{ui("ui.app.admin.page.981ac585f7ed", "Owner Removed")}</option>
            <option value="orphaned">{ui("ui.app.admin.page.7c4806d5f245", "Orphaned / No owner")}</option>
            <option value="public">{ui("ui.app.admin.page.591935b15b1c", "Public")}</option>
            <option value="private">{ui("ui.app.admin.page.c63eb6720c6e", "Private")}</option>
            <option value="unlisted">{ui("ui.app.admin.page.bc96567e77ca", "Unlisted")}</option>
            <option value="verified">{ui("ui.app.admin.page.4f7838402f37", "Verified")}</option>
            <option value="unverified">{ui("ui.app.admin.page.33c8e8de41c3", "Unverified")}</option>
            <option value="authenticity-confirmed">{ui("ui.app.admin.page.eb95c24a9590", "Authenticity Confirmed")}</option>
            <option value="authenticity-unconfirmed">{ui("ui.app.admin.page.a54f9b625886", "Authenticity Unconfirmed")}</option>
            <option value="clear">{ui("ui.app.admin.page.3b1c46e7fb2b", "No Alert")}</option>
            <option value="lost">{ui("ui.app.admin.page.299f098db192", "Reported Lost")}</option>
            <option value="stolen">{ui("ui.app.admin.page.44d0eeb2a64d", "Reported Stolen")}</option>
            <option value="recovered">{ui("ui.app.admin.page.37ce0a91ee27", "Recovered")}</option>
            <option value="has-proof">{ui("ui.app.admin.page.987c9e86d9fa", "Has evidence documents")}</option>
            <option value="has-service">{ui("ui.app.admin.page.c1abdb6eb2ad", "Has service history")}</option>
          </select>
        ) : kind === "audit" ? (
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value)} aria-label={ui("ui.app.admin.page.0811f50b0a96", "Sort audit events")}>
            <option value="created-desc">{ui("ui.app.admin.page.d15efa178cf6", "Newest")}</option>
            <option value="created-asc">{ui("ui.app.admin.page.505dc450753e", "Oldest")}</option>
            <option value="email">{ui("ui.app.admin.page.449995c4fe8f", "Actor")}</option>
            <option value="status">{ui("ui.app.admin.page.64cff1319d2f", "Action")}</option>
          </select>
        ) : null}
        {kind !== "audit" ? (
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value)} aria-label={ui("ui.app.admin.page.069bd3726909", "Sort {{value1}}", { value1: kind })}>
            <option value="created-desc">{ui("ui.app.admin.page.d15efa178cf6", "Newest")}</option>
            <option value="created-asc">{ui("ui.app.admin.page.505dc450753e", "Oldest")}</option>
            {kind === "users" ? (
              <>
                <option value="email">{ui("ui.app.admin.page.969ccbd3cf63", "Email")}</option>
                <option value="status">{ui("ui.app.admin.page.920e413c7d41", "Status")}</option>
                <option value="role">{ui("ui.app.admin.page.14736a2eb9f4", "Role")}</option>
                <option value="records">{ui("ui.app.admin.page.e51415d4d0a7", "Profile count")}</option>
                <option value="last-sign-in">{ui("ui.app.admin.page.0b70af7a2636", "Last sign-in")}</option>
              </>
            ) : kind === "records" ? (
              <>
                <option value="title">{ui("ui.app.admin.page.7e8cd2056da7", "Title")}</option>
                <option value="owner">{ui("ui.app.admin.page.4b1b8aa3608a", "Owner")}</option>
                <option value="visibility">{ui("ui.app.admin.page.7448611d5f93", "Visibility")}</option>
                <option value="verification">{ui("ui.app.admin.page.7140f4f19dec", "Verification")}</option>
                <option value="authenticity">{ui("ui.app.admin.page.4f531ef9e6ae", "Authenticity")}</option>
                <option value="safety">{ui("ui.app.admin.page.726d11bd5b23", "Safety")}</option>
                <option value="service">{ui("ui.app.admin.page.ad21c90e48a4", "Service count")}</option>
                <option value="proof">{ui("ui.app.admin.page.6fe451952efe", "Evidence count")}</option>
              </>
            ) : kind === "proof" ? (
              <><option value="title">{ui("ui.app.admin.page.380b3582fdcc", "Document name")}</option><option value="owner">{ui("ui.app.admin.page.4b1b8aa3608a", "Owner")}</option></>
            ) : kind === "service" ? (
              <><option value="service-date">{ui("ui.app.admin.page.cdb70ebd5845", "Service date")}</option><option value="title">{ui("ui.app.admin.page.e54c593a4afc", "Entry title")}</option><option value="owner">{ui("ui.app.admin.page.4b1b8aa3608a", "Owner")}</option></>
            ) : null}
          </select>
        ) : null}
      </div>
    );
  }

  function renderRecordRows(list = filteredRecords) {
    return (
      <div className="admin-table">
        {list.length ? list.map((record) => (
            <div className="admin-row admin-entity-row" key={record.id}>
            <div>
              <strong>{record.qrCode} - {record.title}</strong>
              <span>
                {[record.brand, record.model, record.serialNumber].filter(Boolean).join(" / ") || ui("ui.app.admin.page.6fdf3c9bc618", "Instrument")} - {record.visibility}
                {record.isArchived ? ui("ui.app.admin.page.cba53d956892", " - Archived") : ""}
                {record.isOwnerRemoved ? ui("ui.app.admin.page.488773139a60", " - Deleted by owner") : ""}
              </span>
              <small>{ui("ui.app.admin.page.4b1b8aa3608a", "Owner")}{" "}{record.ownerEmail || ui("ui.app.admin.page.2f44d9d0a44f", "No email")}{" "}{ui("ui.app.admin.page.6eb1d007b2d1", "- Evidence")}{" "}{record.proofDocumentCount}{" "}{ui("ui.app.admin.page.aca2d2394162", "- Service")}{" "}{record.serviceEventCount}{" "}{ui("ui.app.admin.page.92b4b2b3640b", "- Transfers")}{" "}{record.transferCount}
              </small>
              <div className="admin-inline-badges">
                <button type="button" onClick={() => goToSection("trust", record.verificationStatus === "Verified" ? "verified" : "unverified")}>{record.verificationStatus}</button>
                <button type="button" onClick={() => goToSection("trust", record.authenticityStatus === "Authenticity Confirmed" ? "authenticity-confirmed" : "authenticity-unconfirmed")}>{record.authenticityStatus}</button>
                <button type="button" onClick={() => goToSection("safety", record.safetyStatus || "clear")}>{safetyLabel(record.safetyStatus)}</button>
              </div>
            </div>
            <button type="button" className="admin-open-entity" onClick={() => setSelectedRecord(record)}>{ui("ui.app.admin.page.f9d77f6cb2f2", "Open Profile")}{" "}<ChevronRight size={16} />
            </button>
          </div>
        )) : <p className="admin-empty">{ui("ui.app.admin.page.3bec71468ff8", "No records match this view.")}</p>}
      </div>
    );
  }

  const content = (() => {
    if (loading) {
      return <section className="card admin-panel-card"><h2>{ui("ui.app.admin.page.01e8e2fadec6", "Loading admin panel.")}</h2><p>{ui("ui.app.admin.page.f2d94682ea94", "Checking account access and platform records.")}</p></section>;
    }

    if ((overview?.ok === false && overview.message) || (!overview && message)) {
      return (
        <section className="card admin-panel-card">
          <div className="eyebrow">{ui("ui.app.admin.page.d006c3740e41", "Admin access")}</div>
          <h2>{overview?.message || message}</h2>
          <Link className="button" href="/login?next=%2Fadmin">{ui("ui.app.admin.page.bfd402b2f6f3", "Sign in")}</Link>
        </section>
      );
    }

    if (activeSection === "overview") {
      const counts = overview?.counts || {};
      const primaryMetrics = ["totalUsers", "totalRecords", "publicRecords", "pendingTransfers"];
      const renderMetric = ([key, value]: [string, number | null]) => {
        const destination = overviewLinks[key] || { section: "overview" as SectionId };
        return <button type="button" className="card admin-stat-card" key={key} onClick={() => goToSection(destination.section, destination.filter || "")}><span>{statLabel(key)}</span><strong>{value === null ? ui("ui.app.admin.page.aff0766a5290", "Review") : value}</strong></button>;
      };
      const needsAttention = [
        { label: "Reported lost", value: counts.lostRecords || 0, section: "safety" as SectionId, filter: "lost" },
        { label: "Reported stolen", value: counts.stolenRecords || 0, section: "safety" as SectionId, filter: "stolen" },
        { label: "Pending transfers", value: counts.pendingTransfers || 0, section: "transfers" as SectionId, filter: "pending" },
        { label: "Banned accounts", value: counts.bannedUsers || 0, section: "users" as SectionId, filter: "banned" },
        { label: "Removed accounts", value: counts.removedUsers || 0, section: "users" as SectionId, filter: "removed" }
      ];
      return (
        <div className="admin-overview-layout">
          <div className={styles.metricsColumn}>
            <section className={"admin-grid " + styles.primaryMetrics} aria-label={ui("ui.app.admin.page.111ec5778725", "Platform overview")}>
              {Object.entries(counts).filter(([key]) => primaryMetrics.includes(key)).map(renderMetric)}
            </section>
            <details className={styles.additionalMetrics}>
              <summary>{ui("ui.app.admin.page.54715e57dfbe", "All platform metrics")}</summary>
              <div className="admin-grid">{Object.entries(counts).filter(([key]) => !primaryMetrics.includes(key)).map(renderMetric)}</div>
            </details>
            <nav className={styles.workspaceShortcuts} aria-label={ui("ui.app.admin.page.8da6a8b868d1", "Platform workspaces")}>
              <Link href="/admin/site-editor"><BookOpenText size={20} /><span><strong>{ui("ui.app.admin.page.06c85ff37596", "Content Studio")}</strong><small>{ui("ui.app.admin.page.48a3e0bb4219", "Website content and publishing")}</small></span><ChevronRight size={16} /></Link>
              <Link href="/admin/payments"><Boxes size={20} /><span><strong>{ui("ui.app.admin.page.632e1c583941", "Payments")}</strong><small>{ui("ui.app.admin.page.66c851a84664", "Orders, receipts, and review")}</small></span><ChevronRight size={16} /></Link>
              <Link href="/admin/service-workflow"><FileCheck2 size={20} /><span><strong>{ui("ui.app.admin.page.f485e1e084b2", "Service operations")}</strong><small>{ui("ui.app.admin.page.bcc977a304a3", "Submissions and evidence")}</small></span><ChevronRight size={16} /></Link>
            </nav>
          </div>
          <section className="card admin-panel-card">
            <div className="eyebrow">{ui("ui.app.admin.page.c1ebc7817870", "Needs attention")}</div>
            {needsAttention.map((item) => (
              <button type="button" className="admin-attention-row" key={item.label} onClick={() => goToSection(item.section, item.filter)}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
            <div className="admin-mini-list">
              <strong>{ui("ui.app.admin.page.008b427f44ee", "Recent admin actions")}</strong>
              {auditEvents.slice(0, 4).map((event) => (
                <button type="button" key={event.id} onClick={() => goToSection("audit")}>
                  {actionLabel(event.action, ui)} - {formatDate(event.created_at)}
                </button>
              ))}
            </div>
          </section>
        </div>
      );
    }

    if (activeSection === "users") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>{ui("ui.app.admin.page.6b0cc904d081", "Users")}</h2>
              <p>{ui("ui.app.admin.page.d7e59444b45a", "Search accounts, remove access safely, hide public content, and manage admin roles.")}</p>
            </div>
          </div>
          {filterControls("users")}
          <div className="admin-table">
            {filteredUsers.length ? filteredUsers.map((user) => (
              <div className="admin-row admin-entity-row" key={user.id}>
                <div>
                  <strong>{user.email || user.id}</strong>
                  <span className="admin-user-summary">
                    <span className={adminChipClass("role", userRoleChipValue(user))}>{userRoleLabel(user)}</span>
                    <span className={adminChipClass("status", user.accountStatus)}>{user.accountStatus}</span>
                    <span>{user.recordCount}{" "}{ui("ui.app.admin.page.3164af6836ca", "records (")}{user.publicRecordCount}{" "}{ui("ui.app.admin.page.1cb989db0120", "public /")}{" "}{user.privateRecordCount}{" "}{ui("ui.app.admin.page.2be78b34bb86", "private)")}</span>
                  </span>
                  <small>{ui("ui.app.admin.page.d70b9e24bca2", "Created")}{" "}{formatDate(user.createdAt)}{" "}{ui("ui.app.admin.page.75f39b1dac8a", "- Last sign-in")}{" "}{formatDate(user.lastSignInAt)}{" "}{ui("ui.app.admin.page.6eb1d007b2d1", "- Evidence")}{" "}{user.proofDocumentCount}{" "}{ui("ui.app.admin.page.aca2d2394162", "- Service")}{" "}{user.serviceEventCount}{" "}{ui("ui.app.admin.page.92b4b2b3640b", "- Transfers")}{" "}{user.transferCount}</small>
                  {user.hidePublicContent ? <small>{ui("ui.app.admin.page.d18c25d082b5", "Public content hidden by admin.")}</small> : null}
                  {user.adminNotes ? <small>{ui("ui.app.admin.page.dd2800d0bbb6", "Admin note saved.")}</small> : null}
                </div>
                <button type="button" className="admin-open-entity" onClick={() => setSelectedUser(user)}>{ui("ui.app.admin.page.f3509b8f0fb6", "Open User")}{" "}<ChevronRight size={16} />
                </button>
              </div>
            )) : <p className="admin-empty">{ui("ui.app.admin.page.17a55a6c7ad2", "No users match this view.")}</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "records") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>{ui("ui.app.admin.page.535e52e4a261", "Profiles")}</h2>
              <p>{ui("ui.app.admin.page.745a9d7a5e16", "Open, edit, archive, restore, and filter QRguitar Profiles without changing permanent QR URLs.")}</p>
            </div>
          </div>
          {filterControls("records")}
          {renderRecordRows()}
        </section>
      );
    }

    if (activeSection === "trust") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>{ui("ui.app.admin.page.ade9248e0132", "Trust")}</h2>
              <p>{ui("ui.app.admin.page.5b6a644bd4fb", "Binary trust controls only: Verified / Unverified and Authenticity Confirmed / Authenticity Unconfirmed.")}</p>
            </div>
          </div>
          {filterControls("records")}
          <div className="admin-table">
            {filteredRecords.length ? filteredRecords.map((record) => (
              <div className="admin-row" key={record.id}>
                <div>
                  <strong>{record.qrCode} - {record.title}</strong>
                  <span>{record.verificationStatus} - {record.authenticityStatus}</span>
                  <small>{ui("ui.app.admin.page.da0417f9d15b", "Verification badge")}{" "}{record.showVerificationBadge === false ? ui("ui.app.admin.page.e564b4081d7a", "hidden") : ui("ui.app.admin.page.baaf53622a51", "shown")}{" "}{ui("ui.app.admin.page.62342d1b22d0", "- Authenticity badge")}{" "}{record.showAuthenticityBadge === false ? ui("ui.app.admin.page.e564b4081d7a", "hidden") : ui("ui.app.admin.page.baaf53622a51", "shown")}</small>
                </div>
                <div className="admin-row-actions">
                  <Link href={`/edit/${record.qrCode}`}>{ui("ui.app.admin.page.b7bd692adff7", "Full Editor")}</Link>
                  <button type="button" disabled={busy === `set_verification:${record.id}`} onClick={() => beginRecordAction(record, "set_verification", { verificationStatus: record.verificationStatus === "Verified" ? "unverified" : "verified" }, { confirm: true, title: "Update Verification" })}>
                    {record.verificationStatus === "Verified" ? ui("ui.app.admin.page.8f85aa39faec", "Set Unverified") : ui("ui.app.admin.page.41027c82a143", "Set Verified")}
                  </button>
                  <button type="button" disabled={busy === `set_authenticity:${record.id}`} onClick={() => beginRecordAction(record, "set_authenticity", { authenticityStatus: record.authenticityStatus === "Authenticity Confirmed" ? "unconfirmed" : "confirmed" }, { confirm: true, title: "Update Authenticity" })}>
                    {record.authenticityStatus === "Authenticity Confirmed" ? ui("ui.app.admin.page.f9121dc0ecba", "Set Unconfirmed") : ui("ui.app.admin.page.047e47196b66", "Set Confirmed")}
                  </button>
                  <button type="button" disabled={busy === `set_trust_badge_visibility:${record.id}`} onClick={() => beginRecordAction(record, "set_trust_badge_visibility", { showVerificationBadge: record.showVerificationBadge === false }, { confirm: true, title: record.showVerificationBadge === false ? "Show Verification Badge" : "Hide Verification Badge" })}>
                    {record.showVerificationBadge === false ? ui("ui.app.admin.page.835e583fbfed", "Show Verified Badge") : ui("ui.app.admin.page.91d97bb55b4e", "Hide Verified Badge")}
                  </button>
                  <button type="button" disabled={busy === `set_trust_badge_visibility:${record.id}`} onClick={() => beginRecordAction(record, "set_trust_badge_visibility", { showAuthenticityBadge: record.showAuthenticityBadge === false }, { confirm: true, title: record.showAuthenticityBadge === false ? "Show Authenticity Badge" : "Hide Authenticity Badge" })}>
                    {record.showAuthenticityBadge === false ? ui("ui.app.admin.page.28eb47f029a8", "Show Auth Badge") : ui("ui.app.admin.page.326e149ea3d3", "Hide Auth Badge")}
                  </button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_trust_badge_visibility", {
                    showVerificationBadge: record.showVerificationBadge !== false,
                    showAuthenticityBadge: record.showAuthenticityBadge !== false
                  }, { includeTrustNotes: true, title: "Edit Trust Notes" })}>{ui("ui.app.admin.page.bcfe582914e4", "Edit Notes")}</button>
                </div>
              </div>
            )) : <p className="admin-empty">{ui("ui.app.admin.page.75597e2cf553", "No Profiles match this trust view.")}</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "safety") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>{ui("ui.app.admin.page.726d11bd5b23", "Safety")}</h2>
              <p>{ui("ui.app.admin.page.df31ef411c65", "Lost and stolen status controls. Private safety notes never appear here.")}</p>
            </div>
          </div>
          {filterControls("records")}
          <div className="admin-table">
            {filteredRecords.length ? filteredRecords.map((record) => (
              <div className="admin-row" key={record.id}>
                <div>
                  <strong>{record.qrCode} - {record.title}</strong>
                  <span>{safetyLabel(record.safetyStatus)} - {record.visibility}</span>
                  <small>{record.publicSafetyNote || ui("ui.app.admin.page.fef2952cf974", "No public safety note.")}</small>
                </div>
                <div className="admin-row-actions">
                  <Link href={`/edit/${record.qrCode}`}>{ui("ui.app.admin.page.b7bd692adff7", "Full Editor")}</Link>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "clear" }, { confirm: true, title: "Clear Safety Alert" })}>{ui("ui.app.admin.page.3b1c46e7fb2b", "No Alert")}</button>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "lost", publicSafetyNote: "This instrument has been reported lost." }, { confirm: true, title: "Report Lost" })}>{ui("ui.app.admin.page.51e1357de85b", "Lost")}</button>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "stolen", publicSafetyNote: "This instrument has been reported stolen." }, { confirm: true, title: "Report Stolen" })}>{ui("ui.app.admin.page.802f1e73e901", "Stolen")}</button>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "recovered" }, { confirm: true, title: "Mark Recovered" })}>{ui("ui.app.admin.page.37ce0a91ee27", "Recovered")}</button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: record.safetyStatus || "clear" }, { includeSafetyNotes: true, title: "Edit Safety Notes" })}>{ui("ui.app.admin.page.bcfe582914e4", "Edit Notes")}</button>
                </div>
              </div>
            )) : <p className="admin-empty">{ui("ui.app.admin.page.df2d620da826", "No Profiles match this safety view.")}</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "transfers") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>{ui("ui.app.admin.page.c417cb88e3fd", "Transfers")}</h2>
              <p>{ui("ui.app.admin.page.7732bf269ab9", "Track ownership handoffs, review transfer status, and jump back to the related record or account.")}</p>
            </div>
          </div>
          {filterControls("transfers")}
          <div className="admin-table">
            {filteredTransfers.length ? filteredTransfers.map((transfer) => {
              const hasPublicPage = transfer.recordCode && transfer.recordVisibility === "public" && !transfer.recordIsArchived && !transfer.recordIsOwnerRemoved;
              return (
                <div className="admin-row" key={transfer.id}>
                  <div>
                    <strong>{transfer.recordTitle || ui("ui.app.admin.page.4538b821a0d6", "QRguitar Profile")}</strong>
                    <span className="admin-user-summary">
                      <span className={`admin-chip admin-chip--transfer-${normalize(transfer.status)}`}>{transfer.status || ui("ui.app.admin.page.b23a6a8439c0", "unknown")}</span>
                      <span>{transfer.recordCode || transfer.guitar_id}</span>
                      <span>{transfer.recordVisibility || ui("ui.app.admin.page.c5adcca45065", "no public page")}</span>
                    </span>
                    <small>{ui("ui.app.admin.page.218197693424", "From")}{" "}{transfer.fromOwnerEmail || ui("ui.app.admin.page.f8aa976cd0da", "unknown owner")}{" "}{ui("ui.app.admin.page.9c3b0b991fe3", "- To")}{" "}{transfer.to_email || transfer.acceptedByEmail || ui("ui.app.admin.page.ca1844969742", "Unavailable")}</small>
                    <small>{ui("ui.app.admin.page.d70b9e24bca2", "Created")}{" "}{formatDate(transfer.created_at)}{" "}{ui("ui.app.admin.page.c69597d150a6", "- Accepted")}{" "}{formatDate(transfer.accepted_at)}</small>
                    {transfer.status === "sent" && transfer.claimPath ? <small>{ui("ui.app.admin.page.1ecbb542e647", "Claim link is active until the transfer is accepted or cancelled.")}</small> : null}
                  </div>
                  <div className="admin-row-actions">
                    {transfer.recordCode ? <Link href={`/edit/${transfer.recordCode}`}>{ui("ui.app.admin.page.fec2ac0f4cf1", "Edit Profile")}</Link> : null}
                    {hasPublicPage ? (
                      <Link href={`/i/${transfer.recordCode}`}>{ui("ui.app.admin.page.5696fccbb87e", "Open Public Page")}</Link>
                    ) : (
                      <button type="button" disabled title={ui("ui.app.admin.page.546a08b7b367", "Private, archived, or removed transfer records do not have an active public page.")}>{ui("ui.app.admin.page.f4050b85b9bc", "No public page")}</button>
                    )}
                    {transfer.fromOwnerEmail ? (
                      <button type="button" onClick={() => goToSection("users", "", { search: transfer.fromOwnerEmail || "" })}>{ui("ui.app.admin.page.75a5de478ca7", "View From User")}</button>
                    ) : null}
                    {transfer.acceptedByEmail ? (
                      <button type="button" onClick={() => goToSection("users", "", { search: transfer.acceptedByEmail || "" })}>{ui("ui.app.admin.page.f694c0211d70", "View Recipient")}</button>
                    ) : null}
                    {transfer.status === "sent" && transfer.claimPath ? (
                      <button type="button" onClick={() => void copyTransferClaimLink(transfer)}>{ui("ui.app.admin.page.222e0344a18c", "Copy Claim Link")}</button>
                    ) : null}
                    {transfer.status === "sent" ? (
                      <button type="button" disabled={busy === `cancel:${transfer.id}`} onClick={() => beginTransferAction(transfer, "cancel")}>{ui("ui.app.admin.page.dc5324346ff0", "Cancel Transfer")}</button>
                    ) : null}
                  </div>
                </div>
              );
            }) : <p className="admin-empty">{ui("ui.app.admin.page.ae6d6f366b4d", "No transfers match this view.")}</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "claims") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>{ui("ui.app.admin.page.b8a312c027f5", "Ownership Claims")}</h2>
              <p>{ui("ui.app.admin.page.8d8feaed8889", "Review ownership requests and their private supporting evidence. Serial matches never transfer ownership automatically.")}</p>
            </div>
          </div>
          <div className="admin-table">
            {claimsError ? <div className="admin-empty" role="alert"><p>{claimsError}</p><button type="button" disabled={loading} onClick={() => void loadAdmin()}>{ui("ui.app.admin.page.retryClaims", "Retry ownership claims")}</button></div> : ownershipClaims.length ? ownershipClaims.map((claim) => (
              <div className="admin-row" key={claim.id}>
                <div>
                  <strong>{claim.profileTitle}</strong>
                  <span className="admin-user-summary">
                    <span className={`admin-chip admin-chip--transfer-${normalize(claim.status)}`}>{claim.status.replaceAll("_", " ")}</span>
                    <span>{claim.qrCode || ui("ui.app.admin.page.46cd37b5b3b5", "Protected Profile")}</span>
                    <span>{claim.evidenceCount}{" "}{ui("ui.app.admin.page.f7711d1542c0", "private evidence")}{" "}{claim.evidenceCount === 1 ? ui("ui.app.admin.page.3b9c358f36f0", "file") : ui("ui.app.admin.page.3d7db37d08f9", "files")}</span>
                  </span>
                  <small>{claim.acquisitionDetails}</small>
                  <small>{ui("ui.app.admin.page.25ab4e4d0a89", "Declaration:")}{" "}{claim.ownershipDeclaration}</small>
                  <small>{ui("ui.app.admin.page.64900440a8c9", "Submitted")}{" "}{formatDate(claim.createdAt)}</small>
                  {claim.evidence?.length ? (
                    <div className="admin-claim-evidence">
                      {claim.evidence.map((item) => (
                        <a key={item.id} href={item.url} target="_blank" rel="noreferrer">{ui("ui.app.admin.page.aff0766a5290", "Review")}{" "}{item.fileName} ({item.type.replaceAll("_", " ")})
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="admin-row-actions">
                  {claim.qrCode ? <Link href={`/edit/${claim.qrCode}`}>{ui("ui.app.admin.page.1a3ca5ca1b90", "Review Profile")}</Link> : null}
                  {claim.status === "awaiting_owner" || claim.status === "admin_review" ? (
                    <>
                      <button type="button" disabled={busy === `approve:${claim.id}`} onClick={() => beginOwnershipClaimAction(claim, "approve")}>{ui("ui.app.admin.page.6007acbe30b2", "Approve")}</button>
                      <button type="button" disabled={busy === `request_information:${claim.id}`} onClick={() => beginOwnershipClaimAction(claim, "request_information")}>{ui("ui.app.admin.page.c70ac5da44ee", "Request evidence")}</button>
                      <button type="button" disabled={busy === `deny:${claim.id}`} onClick={() => beginOwnershipClaimAction(claim, "deny")}>{ui("ui.app.admin.page.05a2d7332eb9", "Deny")}</button>
                      <button type="button" disabled={busy === `expire:${claim.id}`} onClick={() => beginOwnershipClaimAction(claim, "expire")}>{ui("ui.app.admin.page.1c29efccf85b", "Expire")}</button>
                    </>
                  ) : null}
                </div>
              </div>
            )) : <p className="admin-empty">{ui("ui.app.admin.page.21e5d1dcec19", "No ownership claims require review.")}</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "proof") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>{ui("ui.app.admin.page.03867aea70ac", "Evidence")}</h2>
              <p>{ui("ui.app.admin.page.359a3d77ce0c", "Document metadata only. Raw private storage paths are never shown.")}</p>
            </div>
          </div>
          {filterControls("proof")}
          <div className="admin-table">
            {filteredProof.length ? filteredProof.map((document) => (
              <div className="admin-row" key={document.id}>
                <div>
                  <strong>{document.name || ui("ui.app.admin.page.d6bd8c0aeee8", "Document")}</strong>
                  <span>{document.document_type || ui("ui.app.admin.page.d6bd8c0aeee8", "Document")} - {document.is_public ? ui("ui.app.admin.page.591935b15b1c", "Public") : ui("ui.app.admin.page.c63eb6720c6e", "Private")} - {document.recordCode || document.guitar_id}</span>
                  <small>{ui("ui.app.admin.page.4b1b8aa3608a", "Owner")}{" "}{document.ownerEmail || ui("ui.app.admin.page.2f44d9d0a44f", "No email")} - {fileSizeLabel(document.file_size)}{" "}{ui("ui.app.admin.page.71c5fa64dc2c", "- Created")}{" "}{formatDate(document.created_at)}</small>
                </div>
                <div className="admin-row-actions">
                  {document.recordCode ? <Link href={`/edit/${document.recordCode}`}>{ui("ui.app.admin.page.3883a4f48ffc", "Open Editor")}</Link> : null}
                  {document.is_public && document.recordCode ? <Link href={`/i/${document.recordCode}`}>{ui("ui.app.admin.page.f9d77f6cb2f2", "Open Profile")}</Link> : null}
                </div>
              </div>
            )) : <p className="admin-empty">{ui("ui.app.admin.page.c08650fea299", "No evidence documents match this view.")}</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "service") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>{ui("ui.app.admin.page.8b0adc9c9815", "Service History")}</h2>
              <p>{ui("ui.app.admin.page.b8666cc8c526", "Service-entry metadata. Private notes are not shown in this admin list.")}</p>
            </div>
          </div>
          {filterControls("service")}
          <div className="admin-table">
            {filteredService.length ? filteredService.map((event) => (
              <div className="admin-row" key={event.id}>
                <div>
                  <strong>{event.title || ui("ui.app.admin.page.ef49d7a68372", "Service entry")}</strong>
                  <span>{event.event_type || ui("ui.app.admin.page.d677190e0a99", "Service")} - {event.is_public ? ui("ui.app.admin.page.591935b15b1c", "Public") : ui("ui.app.admin.page.c63eb6720c6e", "Private")} - {event.recordCode || event.guitar_id}</span>
                  <small>{event.service_date || ui("ui.app.admin.page.6299dec2fd7d", "No service date")} - {event.shop_name || ui("ui.app.admin.page.f0a53c8652d6", "No shop listed")} - {event.location || ui("ui.app.admin.page.1ee8786a79c8", "No location listed")}</small>
                </div>
                <div className="admin-row-actions">
                  {event.recordCode ? <Link href={`/edit/${event.recordCode}`}>{ui("ui.app.admin.page.3883a4f48ffc", "Open Editor")}</Link> : null}
                  {event.is_public && event.recordCode ? <Link href={`/i/${event.recordCode}`}>{ui("ui.app.admin.page.f9d77f6cb2f2", "Open Profile")}</Link> : null}
                </div>
              </div>
            )) : <p className="admin-empty">{ui("ui.app.admin.page.403501789107", "No service entries match this view.")}</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "brand-logos") {
      const savedEntries = Object.entries(siteSettings.brandLogos || {});
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>{ui("ui.app.admin.page.aa89f2bd41f2", "Brand Logos")}</h2>
              <p>{ui("ui.app.admin.page.f7e70a928a09", "Manage official brand logos with an HTTPS URL or a site-relative path beginning with one slash. User uploads never become brand logos.")}</p>
            </div>
          </div>
          <div className="admin-brand-form">
            <label>
              <span>{ui("ui.app.admin.page.090ed4316f1d", "Brand")}</span>
              <input
                list="admin-used-brands"
                value={brandLogoBrand}
                onChange={(event) => setBrandLogoBrand(event.target.value)}
                placeholder={ui("ui.app.admin.page.d71410ead047", "Choose a brand")}
              />
            </label>
            <label>
              <span>{ui("ui.app.admin.page.0b680d3f2da3", "Transparent logo URL or site path")}</span>
              <input
                value={brandLogoUrl}
                onChange={(event) => setBrandLogoUrl(event.target.value)}
                placeholder={ui("ui.app.admin.page.8cad814a1a4b", "/logos/brand.svg or https://example.com/logo.png")}
              />
            </label>
            <button className="button" type="button" disabled={busy === "brand-logo"} onClick={saveCurrentBrandLogo}>
              <ImageIcon size={16} /> {busy === "brand-logo" ? ui("ui.app.admin.page.dc85af8f2b1d", "Saving...") : ui("ui.app.admin.page.c69542744db9", "Save Logo")}
            </button>
          </div>
          <datalist id="admin-used-brands">
            {usedBrands.map((brand) => <option value={brand} key={brand} />)}
          </datalist>
          {isSafeBrandLogoUrl(brandLogoUrl) ? (
            <div className="admin-logo-preview">
              <span>{ui("ui.app.admin.page.324b134f57c7", "Preview")}</span>
              <img src={brandLogoUrl} alt="" loading="lazy" fetchPriority="low" decoding="async" width={520} height={120} referrerPolicy="no-referrer" />
            </div>
          ) : null}
          <div className="admin-table">
            {savedEntries.length ? savedEntries.map(([brandKey, logoUrl]) => (
              <div className="admin-row" key={brandKey}>
                <div>
                  <strong>{brandKey}</strong>
                  <small>{logoUrl}</small>
                </div>
                <div className="admin-row-actions">
                  <button type="button" onClick={() => { setBrandLogoBrand(brandKey); setBrandLogoUrl(logoUrl); }}>{ui("ui.app.admin.page.464c4ffd019e", "Edit")}</button>
                  <button type="button" disabled={busy === "brand-logo"} onClick={() => removeCurrentBrandLogo(brandKey)}>{ui("ui.app.admin.page.325cd61c86dc", "Remove Logo")}</button>
                </div>
              </div>
            )) : (
              <div className="admin-brand-empty">
                <ImageIcon size={22} aria-hidden="true" />
                <div><strong>{ui("ui.app.admin.page.11129d9d4997", "No official logos yet")}</strong><p>{ui("ui.app.admin.page.3ddebd272cca", "Profiles will use clean brand text until an administrator assigns an approved transparent logo.")}</p></div>
              </div>
            )}
          </div>
        </section>
      );
    }

    if (activeSection === "access") {
      const accessTarget = users.find((user) => normalize(user.email) === normalize(adminSearch));
      const dbAdmins = users.filter((user) => user.role === "admin" || user.envManaged === true);
      return (
        <section className="card admin-panel-card">
          <h2>{ui("ui.app.admin.page.d006c3740e41", "Admin access")}</h2>
          <p>{ui("ui.app.admin.page.abc50e334be4", "Signed in as")}{" "}{overview?.admin?.email || ui("ui.app.admin.page.e6e28beb50f8", "authorized admin")}.</p>
          <p>{ui("ui.app.admin.page.44dd5f163cba", "Role:")}{" "}{overview?.admin?.role || ui("ui.app.admin.page.4895f73177ab", "Not set")}{" "}{ui("ui.app.admin.page.e4465dd3dcd0", "- Source:")}{" "}{overview?.admin?.accessSource || ui("ui.app.admin.page.b23a6a8439c0", "unknown")}{" "}{ui("ui.app.admin.page.567b78ef3aa9", "- Status:")}{" "}{overview?.admin?.accountStatus || ui("ui.app.admin.page.96879611650f", "active")}</p>
          <p>{ui("ui.app.admin.page.e943fccff1ac", "Admin access is controlled by profile role or server environment allowlists. Environment-managed access cannot be removed from this UI.")}</p>
          <div className="admin-filter-row">
            <input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} placeholder={ui("ui.app.admin.page.6cf2ac95a947", "User email for admin access")} />
            <button
              type="button"
              disabled={Boolean(busy) || !accessTarget || accessTarget.role === "admin"}
              onClick={() => accessTarget ? beginUserAction(accessTarget, "change_role", { role: "admin" }, { confirm: true, title: "Add Admin" }) : undefined}
            >{ui("ui.app.admin.page.85e15e9342ac", "Add Admin")}</button>
            <button
              type="button"
              disabled={Boolean(busy) || !accessTarget || accessTarget.role !== "admin" || accessTarget.envManaged === true}
              onClick={() => accessTarget ? beginAdminRoleChange(accessTarget) : undefined}
            >
              {accessTarget?.envManaged ? ui("ui.app.admin.page.3bcf2e8dca06", "Managed by environment") : ui("ui.app.admin.page.8d16ea8f7bbf", "Remove Admin")}
            </button>
          </div>
          <div className="admin-table">
            {dbAdmins.length ? dbAdmins.map((user) => (
              <div className="admin-row" key={user.id}>
                <div>
                  <strong>{user.email}</strong>
                  <span>{user.envManaged ? ui("ui.app.admin.page.3bcf2e8dca06", "Managed by environment") : ui("ui.app.admin.page.c0cf6cfaa199", "Database admin")} - {user.accountStatus}</span>
                </div>
                <div className="admin-row-actions">
                  <button type="button" disabled={Boolean(busy) || user.envManaged === true} onClick={() => beginAdminRoleChange(user)}>
                    {user.envManaged ? ui("ui.app.admin.page.3bcf2e8dca06", "Managed by environment") : ui("ui.app.admin.page.8d16ea8f7bbf", "Remove Admin")}
                  </button>
                </div>
              </div>
            )) : <p className="admin-empty">{ui("ui.app.admin.page.5169ed4a9a67", "No database admin users listed.")}</p>}
          </div>
          {overview?.admin?.accessSource === "env" ? <p>{ui("ui.app.admin.page.db62ef5c8164", "Current access is managed by environment.")}</p> : null}
        </section>
      );
    }

    if (activeSection === "system") {
      const health = overview?.systemHealth;
      const primarySystems = [
        {
          label: "Application",
          status: health?.build?.gitCommitSha && health.build.gitCommitSha !== "unknown" ? "healthy" : "unknown",
          summary: health?.build?.gitCommitSha && health.build.gitCommitSha !== "unknown" ? `Release ${health.build.gitCommitSha.slice(0, 8)}` : "Release identity was not reported",
          details: [`Admin API: ${overview?.ok ? "responding" : "not confirmed"}`, `Environment: ${health?.deployment?.environment || "local QA"}`, `Deployment: ${health?.deployment?.identifier || "not reported"}`]
        },
        {
          label: "Database",
          status: health?.supabase?.configured === true && health?.supabase?.responding === true ? "healthy" : health?.supabase?.configured === false ? "warning" : "unknown",
          summary: health?.supabase?.responding ? "Supabase responding" : "Connection not confirmed",
          details: [`Configuration: ${health?.supabase?.configured ? "present" : "not confirmed"}`, `Admin migration: ${health?.migrations?.adminFoundation ? "ready" : "not confirmed"}`, `Service migration: ${health?.migrations?.serviceWorkflow ? "ready" : "not confirmed"}`]
        },
        {
          label: "Email",
          status: health?.email?.configured === true && health?.email?.senderConfigured === true ? "healthy" : health?.email?.configured === true ? "warning" : "unknown",
          summary: health?.email?.configured && health?.email?.senderConfigured ? "Provider and sender configured" : "Delivery configuration not confirmed",
          details: [`Provider API: ${health?.email?.configured ? "configured" : "unknown"}`, `Sender identity: ${health?.email?.senderConfigured ? "configured" : "unknown"}`, "Recipient data and credentials are intentionally hidden"]
        },
        {
          label: "Storage",
          status: health?.storage?.responding === true && health?.storage?.requiredBucketsReady === true ? "healthy" : health?.storage?.responding === true ? "warning" : "unknown",
          summary: health?.storage?.requiredBucketsReady ? "Required buckets ready" : "Bucket readiness not confirmed",
          details: [`Storage API: ${health?.storage?.responding ? "responding" : "unknown"}`, `Required buckets: ${health?.storage?.requiredBucketsReady ? "ready" : "review"}`, `Missing: ${health?.storage?.missingBuckets?.join(", ") || "none reported"}`]
        }
      ];
      return (
        <section className="admin-system-health">
          <div className="admin-section-head"><div><h2>{ui("ui.app.admin.page.c3d66242c591", "System Health")}</h2><p>{ui("ui.app.admin.page.e3fde139154b", "Production services, release identity, integrations, and operational status.")}</p></div><button type="button" onClick={() => void loadAdmin()}>{ui("ui.app.admin.page.36d93c489ad7", "Run checks")}</button></div>
          <div className="admin-health-strip">
            {primarySystems.map((system) => (
              <details className={`admin-health-system is-${system.status}`} key={system.label}>
                <summary><span>{system.status === "healthy" ? ui("ui.app.admin.page.7f1e323b6272", "Healthy") : system.status === "warning" ? ui("ui.app.admin.page.e981ddae45d8", "Warning") : ui("ui.app.admin.page.b764cdc0eab7", "Unknown")}</span><strong>{system.label}</strong><small>{system.summary}</small></summary>
                <ul>{system.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
              </details>
            ))}
          </div>
          <div className="admin-system-sections">
            <section>
              <span>{ui("ui.app.admin.page.567e6d18e458", "Release identity")}</span>
              <dl>
                <div><dt>{ui("ui.app.admin.page.9e471951a1b4", "Environment")}</dt><dd>{health?.deployment?.environment || ui("ui.app.admin.page.8481c59531c6", "Local QA")}</dd></div>
                <div><dt>{ui("ui.app.admin.page.574737f4b500", "Build SHA")}</dt><dd><code>{health?.build?.gitCommitSha || ui("ui.app.admin.page.b764cdc0eab7", "Unknown")}</code></dd></div>
                <div><dt>{ui("ui.app.admin.page.870a8ffd98f4", "Deployment")}</dt><dd>{health?.deployment?.identifier || ui("ui.app.admin.page.b764cdc0eab7", "Unknown")}</dd></div>
                <div><dt>{ui("ui.app.admin.page.918c893908aa", "Git state")}</dt><dd>{health?.build?.dirtyWorkingTree ? ui("ui.app.admin.page.7c6d009716c5", "Dirty review candidate") : health?.build?.gitCommitSha ? ui("ui.app.admin.page.7516a9f3a65c", "Reported clean") : ui("ui.app.admin.page.b764cdc0eab7", "Unknown")}</dd></div>
                <div><dt>{ui("ui.app.admin.page.7b368d657608", "Canonical local origin")}</dt><dd>127.0.0.1:3003</dd></div>
              </dl>
            </section>
            <section>
              <span>{ui("ui.app.admin.page.358cc201f87d", "Operations")}</span>
              <dl>
                <div><dt>{ui("ui.app.admin.page.25be9dd9f53a", "Profiles loaded")}</dt><dd>{recordsPayload?.ok ? records.length : ui("ui.app.admin.page.b764cdc0eab7", "Unknown")}</dd></div>
                <div><dt>{ui("ui.app.admin.page.61d81254336e", "Recent audit events")}</dt><dd>{Array.isArray(auditEvents) ? auditEvents.length : ui("ui.app.admin.page.b764cdc0eab7", "Unknown")}</dd></div>
                <div><dt>{ui("ui.app.admin.page.9639382ac623", "Content publishing")}</dt><dd>{ui("ui.app.admin.page.35194ad54b90", "Shared server-backed source")}</dd></div>
                <div><dt>{ui("ui.app.admin.page.96f34bd1021a", "Required migrations")}</dt><dd>{health?.migrations?.adminFoundation && health?.migrations?.serviceWorkflow ? ui("ui.app.admin.page.5fa7aac5375c", "Ready") : ui("ui.app.admin.page.aff0766a5290", "Review")}</dd></div>
                <div><dt>{ui("ui.app.admin.page.c982b23dfadd", "Last check")}</dt><dd>{healthCheckedAt ? healthCheckedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ui("ui.app.admin.page.checkNotConfirmed", "Not confirmed")}</dd></div>
              </dl>
            </section>
          </div>
          <div className="admin-system-meta"><span>{ui("ui.app.admin.page.ca566c8968e7", "Signed in")}</span><strong>{overview?.admin?.email || ui("ui.app.admin.page.abe20ea47cc7", "Authorized admin")}</strong><span>{ui("ui.app.admin.page.3b4ed4a764ca", "Access source")}</span><strong>{overview?.admin?.accessSource || ui("ui.app.admin.page.b764cdc0eab7", "Unknown")}</strong></div>
        </section>
      );
    }

    return (
      <section className="card admin-panel-card">
        <div className="admin-section-head">
          <div>
            <h2>{ui("ui.app.admin.page.47751f88edff", "Audit Log")}</h2>
            <p>{ui("ui.app.admin.page.a6984f1868ef", "Human-readable admin action history. Metadata is summarized behind details controls.")}</p>
          </div>
          <button type="button" onClick={exportAuditLog} disabled={!filteredAudit.length}>{ui("ui.app.admin.page.10ed84df24ae", "Export safe JSON")}</button>
        </div>
        {filterControls("audit")}
        <div className="admin-table">
          {filteredAudit.length ? filteredAudit.map((event) => (
            <div className="admin-row" key={event.id}>
              <div>
                <strong>{actionLabel(event.action, ui)}</strong>
                <span>{ui("ui.app.admin.page.cd560284860f", "Admin operator -")}{" "}{event.target_type || ui("ui.app.admin.page.34a04005bcaf", "target")} {event.target_id || ""}</span>
                <small>{formatDate(event.created_at)} - {event.reason || ui("ui.app.admin.page.789bc6410570", "No reason listed")}</small>
                {event.metadata ? (
                  <details className="admin-details">
                    <summary>{ui("ui.app.admin.page.45989de49fb7", "Details")}</summary>
                    <code>{JSON.stringify(event.metadata)}</code>
                  </details>
                ) : null}
              </div>
            </div>
          )) : <p className="admin-empty">{ui("ui.app.admin.page.d51efa005048", "No audit events match this view.")}</p>}
        </div>
      </section>
    );
  })();

  const activeSectionMeta = sections.find((section) => section.id === activeSection) || sections[0];
  const ActiveSectionIcon = activeSectionMeta.icon;

  const entityDrawer = adminAuthorized && adminDataReady && selectedUser ? (
    <div className="admin-drawer-layer">
      <button type="button" className="admin-drawer-backdrop" onClick={() => setSelectedUser(null)} aria-label={ui("ui.app.admin.page.c3328e05169f", "Close user details")} />
      <aside ref={entityDrawerRef} tabIndex={-1} className="admin-entity-drawer" role="dialog" aria-modal="true" aria-label={ui("ui.app.admin.page.66ac4249df2e", "User details for {{value1}}", { value1: selectedUser.email })} aria-busy={Boolean(busy)}>
        <header><div><span>{ui("ui.app.admin.page.78388698fe5e", "User account")}</span><h2>{selectedUser.email}</h2></div><button type="button" disabled={Boolean(busy)} onClick={() => setSelectedUser(null)} aria-label={ui("ui.app.admin.page.7d9eb7acb13e", "Close")}><X size={18} /></button></header>
        <div className="admin-drawer-body">
          <div className="admin-drawer-chips"><span className={adminChipClass("role", userRoleChipValue(selectedUser))}>{userRoleLabel(selectedUser)}</span><span className={adminChipClass("status", selectedUser.accountStatus)}>{selectedUser.accountStatus}</span></div>
          <dl><div><dt>{ui("ui.app.admin.page.535e52e4a261", "Profiles")}</dt><dd>{selectedUser.recordCount}</dd></div><div><dt>{ui("ui.app.admin.page.e696100c1a43", "Public / private")}</dt><dd>{selectedUser.publicRecordCount} / {selectedUser.privateRecordCount}</dd></div><div><dt>{ui("ui.app.admin.page.0b70af7a2636", "Last sign-in")}</dt><dd>{formatDate(selectedUser.lastSignInAt)}</dd></div><div><dt>{ui("ui.app.admin.page.d70b9e24bca2", "Created")}</dt><dd>{formatDate(selectedUser.createdAt)}</dd></div></dl>
          <section><span>{ui("ui.app.admin.page.3386f588f0c2", "Account access")}</span><div className="admin-drawer-actions">
            {selectedUser.accountStatus === "locked" ? <button type="button" disabled={Boolean(busy)} onClick={() => beginUserAction(selectedUser, "unlock", {}, { confirm: true, title: "Unlock Account" })}>{ui("ui.app.admin.page.a7104c2c90ad", "Unlock account")}</button> : selectedUser.accountStatus === "active" ? <button type="button" disabled={Boolean(busy) || selectedUser.envManaged} onClick={() => beginUserAction(selectedUser, "lock", {}, { confirm: true, title: "Lock Account" })}>{ui("ui.app.admin.page.18a702c5399d", "Lock account")}</button> : null}
            {selectedUser.accountStatus === "banned" ? <button type="button" disabled={Boolean(busy)} onClick={() => beginUserAction(selectedUser, "unban", {}, { confirm: true, title: "Unban User" })}>{ui("ui.app.admin.page.543e2f94847c", "Unban user")}</button> : <button type="button" disabled={Boolean(busy) || selectedUser.envManaged || selectedUser.accountStatus === "removed"} onClick={() => beginUserAction(selectedUser, "ban", {}, { confirm: true, title: "Ban User" })}>{ui("ui.app.admin.page.29b589a60a8a", "Ban user")}</button>}
            {selectedUser.accountStatus === "removed" ? <button type="button" disabled={Boolean(busy)} onClick={() => beginUserAction(selectedUser, "restore_user", {}, { confirm: true, title: "Restore User" })}>{ui("ui.app.admin.page.88ae7f79b8c0", "Restore user")}</button> : <button type="button" disabled={Boolean(busy) || selectedUser.envManaged} onClick={() => beginUserAction(selectedUser, "remove", {}, { confirm: true, title: "Remove User" })}>{ui("ui.app.admin.page.84a18f0e0474", "Remove user")}</button>}
          </div></section>
          <section><span>{ui("ui.app.admin.page.26b14d7dca4a", "Public presence")}</span><div className="admin-drawer-actions"><button type="button" disabled={Boolean(busy)} onClick={() => beginUserAction(selectedUser, selectedUser.hidePublicContent ? "restore_public_content" : "hide_public_content", {}, { confirm: true, title: selectedUser.hidePublicContent ? "Restore Public Content" : "Hide Public Content" })}>{selectedUser.hidePublicContent ? ui("ui.app.admin.page.1c0af42d56c5", "Restore public content") : ui("ui.app.admin.page.e5db012228a6", "Hide public content")}</button></div></section>
          <section><span>{ui("ui.app.admin.page.4b42c6690ebe", "Administration")}</span><div className="admin-drawer-actions"><button type="button" disabled={Boolean(busy) || selectedUser.envManaged} onClick={() => beginAdminRoleChange(selectedUser)}>{selectedUser.role === "admin" ? ui("ui.app.admin.page.e987caf5e975", "Remove admin") : ui("ui.app.admin.page.606c13cb01b1", "Add admin")}</button><button type="button" disabled={Boolean(busy)} onClick={() => beginUserAction(selectedUser, "admin_note", {}, { includeNote: true, title: "Save Admin Note" })}>{ui("ui.app.admin.page.f4377182ae81", "Internal note")}</button></div></section>
          <section className="admin-danger-zone"><span>{ui("ui.app.admin.page.583317a2bfb3", "Permanent action")}</span><p id="admin-deletion-unavailable">{ACCOUNT_DELETION_UNAVAILABLE}</p><button type="button" disabled aria-describedby="admin-deletion-unavailable">{ui("ui.app.admin.page.b530d24457c5", "Permanent account deletion unavailable")}</button></section>
        </div>
      </aside>
    </div>
  ) : adminAuthorized && adminDataReady && selectedRecord ? (
    <div className="admin-drawer-layer">
      <button type="button" className="admin-drawer-backdrop" onClick={() => setSelectedRecord(null)} aria-label={ui("ui.app.admin.page.5306887e2f26", "Close Profile details")} />
      <aside ref={entityDrawerRef} tabIndex={-1} className="admin-entity-drawer" role="dialog" aria-modal="true" aria-label={ui("ui.app.admin.page.bc68de5dbe4f", "Profile details for {{value1}}", { value1: selectedRecord.title })} aria-busy={Boolean(busy)}>
        <header><div><span>{ui("ui.app.admin.page.4538b821a0d6", "QRguitar Profile")}</span><h2>{selectedRecord.title}</h2><small>{selectedRecord.qrCode}</small></div><button type="button" disabled={Boolean(busy)} onClick={() => setSelectedRecord(null)} aria-label={ui("ui.app.admin.page.7d9eb7acb13e", "Close")}><X size={18} /></button></header>
        <div className="admin-drawer-body">
          <dl><div><dt>{ui("ui.app.admin.page.4b1b8aa3608a", "Owner")}</dt><dd>{selectedRecord.ownerEmail || ui("ui.app.admin.page.4339bb439318", "No owner")}</dd></div><div><dt>{ui("ui.app.admin.page.7448611d5f93", "Visibility")}</dt><dd>{selectedRecord.visibility}</dd></div><div><dt>{ui("ui.app.admin.page.d4262f628982", "Service / evidence")}</dt><dd>{selectedRecord.serviceEventCount} / {selectedRecord.proofDocumentCount}</dd></div><div><dt>{ui("ui.app.admin.page.d70b9e24bca2", "Created")}</dt><dd>{formatDate(selectedRecord.createdAt)}</dd></div></dl>
          <section><span>{ui("ui.app.admin.page.ed077f3d8125", "Open")}</span><div className="admin-drawer-actions"><Link href={`/edit/${selectedRecord.qrCode}`}>{ui("ui.app.admin.page.aa189cf874d6", "Full editor")}</Link>{selectedRecord.visibility === "public" && !selectedRecord.isArchived && !selectedRecord.isOwnerRemoved ? <Link href={selectedRecord.permanentPath}>{ui("ui.app.admin.page.6f3c838c26c3", "Public Profile")}</Link> : null}</div></section>
          <section><span>{ui("ui.app.admin.page.7448611d5f93", "Visibility")}</span><div className="admin-drawer-actions"><button type="button" disabled={Boolean(busy) || selectedRecord.visibility === "public" || selectedRecord.isArchived} onClick={() => beginRecordAction(selectedRecord, "set_visibility", { visibility: "public" }, { confirm: true, title: "Make Public" })}>{ui("ui.app.admin.page.81f879eaea93", "Make public")}</button><button type="button" disabled={Boolean(busy) || selectedRecord.visibility === "private" || selectedRecord.isArchived} onClick={() => beginRecordAction(selectedRecord, "set_visibility", { visibility: "private" }, { confirm: true, title: "Make Private" })}>{ui("ui.app.admin.page.e83dbc0a3f6b", "Make private")}</button></div></section>
          <section><span>{ui("ui.app.admin.page.ed8638486b8f", "Trust and safety")}</span><div className="admin-drawer-actions"><button type="button" disabled={Boolean(busy)} onClick={() => beginRecordAction(selectedRecord, "set_verification", { verificationStatus: selectedRecord.verificationStatus === "Verified" ? "unverified" : "verified" }, { includeTrustNotes: true, title: "Update Verification" })}>{selectedRecord.verificationStatus === "Verified" ? ui("ui.app.admin.page.5baf6cf2d6d3", "Set unverified") : ui("ui.app.admin.page.844d96004955", "Set verified")}</button><button type="button" disabled={Boolean(busy)} onClick={() => beginRecordAction(selectedRecord, "set_authenticity", { authenticityStatus: selectedRecord.authenticityStatus === "Authenticity Confirmed" ? "unconfirmed" : "confirmed" }, { includeTrustNotes: true, title: "Update Authenticity" })}>{selectedRecord.authenticityStatus === "Authenticity Confirmed" ? ui("ui.app.admin.page.10ddf273c018", "Set unconfirmed") : ui("ui.app.admin.page.8d2419b8fa92", "Confirm authenticity")}</button><button type="button" disabled={Boolean(busy)} onClick={() => beginRecordAction(selectedRecord, "set_safety", { safetyStatus: selectedRecord.safetyStatus || "clear" }, { includeSafetyNotes: true, title: "Update Safety Status" })}>{ui("ui.app.admin.page.aca51557b8b3", "Safety details")}</button></div></section>
          <section className="admin-danger-zone"><span>{ui("ui.app.admin.page.66f4804ee23d", "Archive")}</span><p>{ui("ui.app.admin.page.c4c38cb94355", "Archiving removes the Profile from active public surfaces without changing its permanent QRguitar ID.")}</p><button type="button" disabled={Boolean(busy)} onClick={() => beginRecordAction(selectedRecord, selectedRecord.isArchived ? "restore_archive" : "archive", {}, { confirm: true, title: selectedRecord.isArchived ? "Restore from Archive" : "Archive Profile" })}>{selectedRecord.isArchived ? ui("ui.app.admin.page.7f610fde72d0", "Restore Profile") : ui("ui.app.admin.page.38cdb6bf032e", "Archive Profile")}</button></section>
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <Nav />
      <main className={`admin-page ${styles.admin}`}>
        <div ref={commandBarRef} className="admin-command-bar">
          <div>{adminAuthorized && adminDataReady ? <button ref={navButtonRef} type="button" className="admin-mobile-nav" onClick={() => setNavOpen(true)} aria-label={ui("ui.app.admin.page.ab4aa617a9a8", "Open admin navigation")} aria-controls="admin-primary-navigation" aria-expanded={navOpen}><Menu size={18} /></button> : null}<div><span>{ui("ui.app.admin.page.2b06d01c3eba", "QRguitar / Admin")}</span><strong>{activeSectionMeta.label}</strong></div></div>
          {/* Each searchable section owns one accurately labelled search below. */}
          <div className="admin-command-meta"><span>{ui("ui.app.admin.page.d006c3740e41", "Admin access")}</span><strong>{adminAuthorized ? overview?.admin?.email || ui("ui.app.admin.page.abe20ea47cc7", "Authorized admin") : adminAccessState === "unavailable" ? ui("ui.app.admin.page.3c86be3eae40", "Temporarily unavailable") : adminAccessState === "checking" ? ui("ui.app.admin.page.0dfe1d63c9d8", "Checking") : ui("ui.app.admin.page.255346f25669", "Sign in required")}</strong></div>
        </div>
        <div className={adminAuthorized && adminDataReady ? "admin-shell" : "admin-shell is-locked"}>
          {adminAuthorized && adminDataReady ? <aside ref={sidebarRef} tabIndex={-1} id="admin-primary-navigation" aria-label={ui("ui.app.admin.page.3e761ea14625", "Admin navigation")} className={navOpen ? "admin-sidebar is-open" : "admin-sidebar"}><header><strong>{ui("ui.app.admin.page.e145db962517", "QRguitar Admin")}</strong><button type="button" onClick={() => setNavOpen(false)} aria-label={ui("ui.app.admin.page.084a671688b6", "Close admin navigation")}><X size={17} /></button></header>{sectionGroups.map((group) => <nav key={group} aria-label={ui("ui.app.admin.page.e636d7cdcb63", "{{value1}} sections", { value1: group })}><span>{group}</span>{sections.filter((section) => section.group === group).map((section) => { const Icon = section.icon; return <button type="button" className={section.id === activeSection ? "active" : ""} onClick={() => goToSection(section.id)} key={section.id}><Icon size={16} />{(section.label === "Overview" ? ui("ui.app.admin.page.d4b1ea5708dd", "Overview") : section.label === "Users" ? ui("ui.app.admin.page.6b0cc904d081", "Users") : section.label === "Profiles" ? ui("ui.app.admin.page.535e52e4a261", "Profiles") : section.label === "Trust" ? ui("ui.app.admin.page.ade9248e0132", "Trust") : section.label === "Safety" ? ui("ui.app.admin.page.726d11bd5b23", "Safety") : section.label === "Transfers" ? ui("ui.app.admin.page.c417cb88e3fd", "Transfers") : section.label === "Claims" ? ui("ui.app.admin.page.1c85c12229a4", "Claims") : section.label === "Evidence" ? ui("ui.app.admin.page.03867aea70ac", "Evidence") : section.label === "Service" ? ui("ui.app.admin.page.d677190e0a99", "Service") : section.label === "Brand Registry" ? ui("ui.app.admin.page.5bdba306d978", "Brand Registry") : section.label === "Admin Access" ? ui("ui.app.admin.page.aa6578c24cd0", "Admin Access") : section.label === "Audit Log" ? ui("ui.app.admin.page.47751f88edff", "Audit Log") : section.label === "System Health" ? ui("ui.app.admin.page.c3d66242c591", "System Health") : section.label)}</button>; })}</nav>)}<nav className="admin-sidebar-links" aria-label={ui("ui.app.admin.page.69012983f67d", "Admin workspaces")}><span>{ui("ui.app.admin.page.1377264ba3b0", "Workspaces")}</span><Link href="/admin/site-editor">{ui("ui.app.admin.page.06c85ff37596", "Content Studio")}</Link><Link href="/admin/service-workflow">{ui("ui.app.admin.page.f485e1e084b2", "Service operations")}</Link><Link href="/admin/payments">{ui("ui.app.admin.page.632e1c583941", "Payments")}</Link><Link href="/admin/promotions">{ui("ui.app.admin.page.9ab150d3af8e", "Promo codes")}</Link><Link href="/admin/deletion-requests">{ui("ui.app.admin.page.70d603a1a8ef", "Deletion requests")}</Link></nav></aside> : null}
          {adminAuthorized && adminDataReady && navOpen ? <button type="button" className="admin-sidebar-backdrop" onClick={() => setNavOpen(false)} aria-label={ui("ui.app.admin.page.084a671688b6", "Close admin navigation")} /> : null}
          <div className="admin-main">
          {!adminAuthorized ? (
            <section className="card admin-panel-card admin-login-card">
              <div className="eyebrow">{ui("ui.app.admin.page.d006c3740e41", "Admin access")}</div>
              <h1>{loading || adminAccessState === "checking" ? ui("ui.app.admin.page.d76960a17040", "Checking admin access.") : adminAccessState === "unavailable" ? ui("ui.app.admin.page.12565e67c555", "Admin is temporarily unavailable.") : ui("ui.app.admin.page.82ffb5c6aa67", "Sign in with an authorized admin account.")}</h1>
              <p>{loading || adminAccessState === "checking" ? ui("ui.app.admin.page.c53c5be7e3a2", "Confirming your session before admin tools load.") : adminAccessState === "unavailable" ? ui("ui.app.admin.page.f7ce008a3276", "Your session exists, but QRguitar could not verify admin access or load the admin service.") : ui("ui.app.admin.page.ea4603af6095", "Admin tools stay hidden until an authorized admin account is signed in.")}</p>
              {message ? <p role="alert" className="admin-message">{message}</p> : null}
              {adminAccessState === "unavailable" ? (
                <button className="button" type="button" disabled={loading} onClick={() => void loadAdmin()}>{loading ? ui("ui.app.admin.page.a16c8b1c9595", "Retrying…") : ui("ui.app.admin.page.a080dac3297a", "Retry admin access")}</button>
              ) : !loading && adminAccessState === "unauthorized" ? (
                <Link className="button" href={`/login?next=${encodeURIComponent("/admin")}`}>{ui("ui.app.admin.page.bfd402b2f6f3", "Sign in")}</Link>
              ) : null}
            </section>
          ) : (
            <>
              <div className="admin-main-heading"><ActiveSectionIcon size={22} /><div><span>{activeSectionMeta.group}</span><h1 ref={sectionHeadingRef} tabIndex={-1}>{activeSectionMeta.label}</h1></div></div>
              {adminDataReady && message ? <div className="admin-message">{message}</div> : null}
              {!adminDataReady ? <section className="card admin-panel-card" role="alert"><h2>{ui("ui.app.admin.page.4b9ba740f352", "Admin data is temporarily unavailable.")}</h2><p>{message || ui("ui.app.admin.page.c1265c4bbbf8", "QRguitar could not load all required admin data.")}</p><button type="button" disabled={loading} onClick={() => void loadAdmin()}>{loading ? ui("ui.app.admin.page.a16c8b1c9595", "Retrying…") : ui("ui.app.admin.page.343aad82ce4d", "Retry admin data")}</button></section> : null}
            </>
          )}
          {adminAuthorized && adminDataReady && pendingAction ? (
            <div className="admin-modal-backdrop" role="presentation">
              <section ref={modalRef} tabIndex={-1} className="card admin-modal" role="dialog" aria-modal="true" aria-label={pendingAction.title}>
                <div className="admin-section-head">
                  <div>
                    <div className="eyebrow">{ui("ui.app.admin.page.7792c9b3f23d", "Confirm admin action")}</div>
                    <h2>{pendingAction.title}</h2>
                    <p>{pendingAction.target}</p>
                  </div>
                  <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => setPendingAction(null)}>{ui("ui.app.admin.page.19766ed6ccb2", "Cancel")}</button>
                </div>
                <div className="admin-impact-summary">
                  <strong>{ui("ui.app.admin.page.d1f23f0d1361", "Impact")}</strong>
                  <p>{pendingAction.kind === "user" && pendingAction.action === "delete_empty_user" ? ACCOUNT_DELETION_UNAVAILABLE : ui("ui.app.admin.page.115dbbb6039f", "This changes operational data immediately. The action is recorded in the audit trail and the affected view is refreshed.")}</p>
                  <span>{pendingAction.kind === "user" && pendingAction.action === "delete_empty_user" ? ui("ui.app.admin.page.ca1844969742", "Unavailable") : ui("ui.app.admin.page.9c5a83b1b171", "Reversible where the corresponding restore action is available")}</span>
                </div>
                {message ? <div className="admin-message" role="alert">{message}</div> : null}
                {pendingAction.kind === "user" && pendingAction.action === "change_role" && pendingAction.user.role === "admin" ? (
                  <label>{ui("ui.app.admin.page.5013bf64080b", "Role after removing admin access")}<select
                      value={String(pendingAction.extra?.role || "")}
                      disabled={Boolean(busy)}
                      onChange={(event) => setPendingAction({ ...pendingAction, extra: { ...pendingAction.extra, role: event.target.value } })}
                    >
                      <option value="">{ui("ui.app.admin.page.a49c49b04c4d", "Choose a role")}</option>
                      <option value="owner">{ui("ui.app.admin.page.4b1b8aa3608a", "Owner")}</option>
                      <option value="builder">{ui("ui.app.admin.page.090940e73258", "Builder")}</option>
                      <option value="shop">{ui("ui.app.admin.page.90f5e27cca2a", "Service Shop")}</option>
                    </select>
                  </label>
                ) : null}
                <label>{ui("ui.app.admin.page.85a5eb20c15e", "Operator reason")}<textarea value={pendingAction.reason} onChange={(event) => setPendingAction({ ...pendingAction, reason: event.target.value })} rows={2} placeholder={ui("ui.app.admin.page.d5bc853f6cc7", "Required for the audit trail")} />
                </label>
                {pendingAction.kind === "user" && pendingAction.includeNote ? (
                  <label>{ui("ui.app.admin.page.0ae690f1b1e9", "Internal admin note")}<textarea
                      value={pendingAction.note || ""}
                      onChange={(event) => setPendingAction({ ...pendingAction, note: event.target.value })}
                      rows={4}
                    />
                  </label>
                ) : null}
                {pendingAction.kind === "record" && pendingAction.includeTrustNotes ? (
                  <div className="admin-modal-grid">
                    <label>{ui("ui.app.admin.page.118e1524b882", "Public verification note")}<textarea value={pendingAction.publicVerificationNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, publicVerificationNote: event.target.value })} rows={3} />
                    </label>
                    <label>{ui("ui.app.admin.page.f4a130abf8de", "Internal verification note")}<textarea value={pendingAction.internalVerificationNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, internalVerificationNote: event.target.value })} rows={3} />
                    </label>
                    <label>{ui("ui.app.admin.page.42af0e4ee0c2", "Public authenticity note")}<textarea value={pendingAction.publicAuthenticityNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, publicAuthenticityNote: event.target.value })} rows={3} />
                    </label>
                    <label>{ui("ui.app.admin.page.010edcad212d", "Internal authenticity note")}<textarea value={pendingAction.internalAuthenticityNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, internalAuthenticityNote: event.target.value })} rows={3} />
                    </label>
                  </div>
                ) : null}
                {pendingAction.kind === "record" && pendingAction.includeSafetyNotes ? (
                  <div className="admin-modal-grid">
                    <label>{ui("ui.app.admin.page.804f3c9e9556", "Public safety note")}<textarea value={pendingAction.publicSafetyNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, publicSafetyNote: event.target.value })} rows={3} />
                    </label>
                    <label>{ui("ui.app.admin.page.3bbf81ca7df1", "Private/internal safety note")}<textarea value={pendingAction.safetyNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, safetyNote: event.target.value })} rows={3} />
                    </label>
                  </div>
                ) : null}
                <div className="form-actions">
                  <button className="button" type="button" disabled={Boolean(busy) || !pendingAction.reason.trim() || (pendingAction.kind === "user" && pendingAction.action === "delete_empty_user") || (pendingAction.kind === "user" && pendingAction.action === "change_role" && pendingAction.user.role === "admin" && !["owner", "builder", "shop"].includes(String(pendingAction.extra?.role || "")))} onClick={() => void confirmPendingAction()}>
                    {busy ? ui("ui.app.admin.page.23e39291d613", "Saving…") : ui("ui.app.admin.page.eebdd24a77d9", "Confirm")}
                  </button>
                  <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => setPendingAction(null)}>{ui("ui.app.admin.page.19766ed6ccb2", "Cancel")}</button>
                </div>
              </section>
            </div>
          ) : null}
          {adminAuthorized && adminDataReady ? content : null}
          </div>
        </div>
        {entityDrawer}
      </main>
      <Footer />
    </>
  );
}

export default function AdminPage() {
  const returnPath = typeof window === "undefined" ? "/admin" : `${window.location.pathname}${window.location.search}`;
  return <AdminWorkspaceGate returnPath={returnPath}><AdminWorkspace /></AdminWorkspaceGate>;
}

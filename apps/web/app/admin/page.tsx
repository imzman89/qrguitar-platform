"use client";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { defaultSiteSettings, isSafeBrandLogoUrl, mergeSiteSettings, normalizeBrandLogoKey, type EditableSiteSettings } from "../../lib/site-settings";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { ACCOUNT_DELETION_UNAVAILABLE } from "../../lib/admin-account-deletion-status";
import { dispatchOptionalTrackingProductEvent, optionalTrackingProductEvents } from "../../lib/optional-tracking-consent";

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
  { id: "overview", label: "Overview", group: "Command", icon: Gauge },
  { id: "users", label: "Users", group: "Manage", icon: Users },
  { id: "records", label: "Profiles", group: "Manage", icon: Guitar },
  { id: "trust", label: "Trust", group: "Review", icon: ShieldCheck },
  { id: "safety", label: "Safety", group: "Review", icon: TriangleAlert },
  { id: "transfers", label: "Transfers", group: "Ownership", icon: Boxes },
  { id: "claims", label: "Claims", group: "Ownership", icon: FileCheck2 },
  { id: "proof", label: "Evidence", group: "Profiles", icon: FileText },
  { id: "service", label: "Service", group: "Profiles", icon: BookOpenText },
  { id: "brand-logos", label: "Brand Registry", group: "Platform", icon: ImageIcon },
  { id: "access", label: "Admin Access", group: "Platform", icon: KeyRound },
  { id: "audit", label: "Audit Log", group: "Platform", icon: FileClock },
  { id: "system", label: "System Health", group: "Platform", icon: Activity }
];

const sectionGroups = ["Command", "Manage", "Review", "Ownership", "Profiles", "Platform"];

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

function actionLabel(action: string) {
  const labels: Record<string, string> = {
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
  return labels[action] || statLabel(action);
}

function fileSizeLabel(value?: number | null) {
  if (!value) return "Size unavailable";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [recordsPayload, setRecordsPayload] = useState<RecordsPayload | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [ownershipClaims, setOwnershipClaims] = useState<AdminOwnershipClaim[]>([]);
  const [claimsError, setClaimsError] = useState("");
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
        if (returnFocus?.isConnected) returnFocus.focus();
        else if (fallbackFocus?.isConnected) fallbackFocus.focus();
      }, 0);
    };
  }, [overlayKind]);

  const loadAdmin = useCallback(async (options: { successMessage?: string } = {}) => {
    const requestRevision = ++adminLoadRevision.current;
    setLoading(true);
    if (!options.successMessage) setMessage("");
    try {
      const session = await readAdminSession();
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
        setMessage("Sign in with an authorized admin account.");
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
      const [overviewResponse, usersResponse, recordsResponse, auditResponse, claimsResponse] = await Promise.all([
        fetch("/api/admin/overview", { headers, cache: "no-store" }),
        fetch("/api/admin/users", { headers, cache: "no-store" }),
        fetch("/api/admin/records", { headers, cache: "no-store" }),
        fetch("/api/admin/audit", { headers, cache: "no-store" }),
        fetch("/api/ownership-claims", { headers, cache: "no-store" })
      ]);

      const [overviewJson, usersJson, recordsJson, auditJson, claimsJson] = await Promise.all([
        overviewResponse.json().catch(() => ({})),
        usersResponse.json().catch(() => ({})),
        recordsResponse.json().catch(() => ({})),
        auditResponse.json().catch(() => ({})),
        claimsResponse.json().catch(() => ({}))
      ]);
      if (requestRevision !== adminLoadRevision.current || adminActorRef.current !== session.actorId) return;

      const nextUsers = Array.isArray(usersJson.users) ? usersJson.users as AdminUser[] : [];
      const nextRecords = Array.isArray(recordsJson.records) ? recordsJson.records as AdminRecord[] : [];
      const overviewAuthorized = overviewResponse.ok && overviewJson.ok === true;
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
        setMessage(error instanceof Error ? `Could not refresh admin data: ${error.message}` : "Could not refresh admin data. Check your connection and try again.");
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
      if (logoEditor.current.pending) setMessage("A previous brand logo save needs confirmation. Use Save again to retry that exact change before making another.");
    } catch (error) {
      if (!requestedActorId || !adminActorRef.current || adminActorRef.current === requestedActorId) {
        setMessage(error instanceof Error ? error.message : "Could not load brand logo settings.");
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
      setMessage(nextActorId ? "Refreshing admin access for this account." : "Sign in with an authorized admin account.");
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
    if (!controller || logoNeedsReload.current) { setMessage("Reload the admin page before changing brand logos."); return; }
    if (!controller.pending && logoVersions.current.draftVersion) { setMessage("A shared draft exists. Manage brand logos in the Site Editor to preserve it."); return; }
    logoSaving.current = true; setBusy("brand-logo");
    try {
      const nextSettings = mergeSiteSettings({ ...siteSettings, brandLogos: nextLogos });
      const payload = await (controller.pending ? controller.retry() : controller.mutate({ action: "publish", source: "brand_logo_admin", settings: nextSettings, note: "Brand logo mapping updated", area: "Brand assets" }, logoVersions.current, JSON.stringify(nextSettings)));
      if (payload.published) setSiteSettings(mergeSiteSettings(payload.published as Partial<EditableSiteSettings>));
      logoVersions.current = { publishedVersion: payload.publishedVersion!, draftVersion: payload.draftVersion! };
      logoNeedsReload.current = payload.superseded === true;
      setMessage(payload.superseded ? "The previous save succeeded; later edits exist. Reload before making another change." : payload.message || "Brand logos published.");
    } catch (error) {
      if (!controller.pending) logoNeedsReload.current = true;
      setMessage((error instanceof Error ? error.message : "The save could not be confirmed.") + (controller.pending ? " Use Save again to retry that exact change." : " Reload before making another change."));
    } finally { logoSaving.current = false; setBusy(""); }
  }


  function saveCurrentBrandLogo() {
    const key = normalizeBrandLogoKey(brandLogoBrand);
    const url = brandLogoUrl.trim();
    if (!key) {
      setMessage("Enter a valid brand name.");
      return;
    }
    if (!isSafeBrandLogoUrl(url)) {
      setMessage("Use an HTTPS URL or a site-relative path beginning with one slash.");
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
      action: actionLabel(event.action),
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
      title: options.title || actionLabel(action),
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
      setMessage(error instanceof Error ? error.message : "The admin action could not be completed. Try again.");
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
      title: options.title || actionLabel(action),
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
      setMessage(error instanceof Error ? error.message : "The Profile action could not be completed. Try again.");
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
      setMessage(error instanceof Error ? error.message : "The transfer action could not be completed. Try again.");
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
      setMessage(error instanceof Error ? error.message : "The ownership request could not be updated. Try again.");
      return false;
    } finally {
      if (adminMutationRef.current === busyKey) adminMutationRef.current = "";
      setBusy((current) => current === busyKey ? "" : current);
    }
  }

  async function copyTransferClaimLink(transfer: AdminTransfer) {
    if (!transfer.claimPath) {
      setMessage("No active claim link is available for this transfer.");
      return;
    }

    const url = `${window.location.origin}${transfer.claimPath}`;
    try {
      if (!window.navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
      await window.navigator.clipboard.writeText(url);
      setMessage("Transfer claim link copied.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not copy the transfer claim link.");
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction || busy) {
      return;
    }

    if (pendingAction.kind === "user" && pendingAction.action === "change_role" && pendingAction.user.role === "admin"
      && !["owner", "builder", "shop"].includes(String(pendingAction.extra?.role || ""))) {
      setMessage("Choose the account role that should remain after admin access is removed.");
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
          placeholder="Search this section"
          aria-label={`Search ${kind}`}
        />
        {kind === "users" ? (
          <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} aria-label="Filter users">
            <option value="">All users</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="banned">Banned</option>
            <option value="removed">Removed</option>
            <option value="admin">Admins</option>
            <option value="normal">Normal users</option>
            <option value="empty">Empty users</option>
            <option value="has-records">Users with Profiles</option>
          </select>
        ) : kind === "transfers" ? (
          <select value={transferFilter} onChange={(event) => setTransferFilter(event.target.value)} aria-label="Filter transfers">
            <option value="">All transfers</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        ) : kind === "records" ? (
          <select value={recordFilter} onChange={(event) => setRecordFilter(event.target.value)} aria-label="Filter Profiles">
            <option value="">Active records</option>
            <option value="archived">Archived</option>
            <option value="owner-removed">Owner Removed</option>
            <option value="orphaned">Orphaned / No owner</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
            <option value="authenticity-confirmed">Authenticity Confirmed</option>
            <option value="authenticity-unconfirmed">Authenticity Unconfirmed</option>
            <option value="clear">No Alert</option>
            <option value="lost">Reported Lost</option>
            <option value="stolen">Reported Stolen</option>
            <option value="recovered">Recovered</option>
            <option value="has-proof">Has evidence documents</option>
            <option value="has-service">Has service history</option>
          </select>
        ) : kind === "audit" ? (
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value)} aria-label="Sort audit events">
            <option value="created-desc">Newest</option>
            <option value="created-asc">Oldest</option>
            <option value="email">Actor</option>
            <option value="status">Action</option>
          </select>
        ) : null}
        {kind !== "audit" ? (
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value)} aria-label={`Sort ${kind}`}>
            <option value="created-desc">Newest</option>
            <option value="created-asc">Oldest</option>
            {kind === "users" ? (
              <>
                <option value="email">Email</option>
                <option value="status">Status</option>
                <option value="role">Role</option>
                <option value="records">Profile count</option>
                <option value="last-sign-in">Last sign-in</option>
              </>
            ) : kind === "records" ? (
              <>
                <option value="title">Title</option>
                <option value="owner">Owner</option>
                <option value="visibility">Visibility</option>
                <option value="verification">Verification</option>
                <option value="authenticity">Authenticity</option>
                <option value="safety">Safety</option>
                <option value="service">Service count</option>
                <option value="proof">Evidence count</option>
              </>
            ) : kind === "proof" ? (
              <><option value="title">Document name</option><option value="owner">Owner</option></>
            ) : kind === "service" ? (
              <><option value="service-date">Service date</option><option value="title">Entry title</option><option value="owner">Owner</option></>
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
                {[record.brand, record.model, record.serialNumber].filter(Boolean).join(" / ") || "Instrument"} - {record.visibility}
                {record.isArchived ? " - Archived" : ""}
                {record.isOwnerRemoved ? " - Deleted by owner" : ""}
              </span>
              <small>
                Owner {record.ownerEmail || "No email"} - Evidence {record.proofDocumentCount} - Service {record.serviceEventCount} - Transfers {record.transferCount}
              </small>
              <div className="admin-inline-badges">
                <button type="button" onClick={() => goToSection("trust", record.verificationStatus === "Verified" ? "verified" : "unverified")}>{record.verificationStatus}</button>
                <button type="button" onClick={() => goToSection("trust", record.authenticityStatus === "Authenticity Confirmed" ? "authenticity-confirmed" : "authenticity-unconfirmed")}>{record.authenticityStatus}</button>
                <button type="button" onClick={() => goToSection("safety", record.safetyStatus || "clear")}>{safetyLabel(record.safetyStatus)}</button>
              </div>
            </div>
            <button type="button" className="admin-open-entity" onClick={() => setSelectedRecord(record)}>
              Open Profile <ChevronRight size={16} />
            </button>
          </div>
        )) : <p className="admin-empty">No records match this view.</p>}
      </div>
    );
  }

  const content = (() => {
    if (loading) {
      return <section className="card admin-panel-card"><h2>Loading admin panel.</h2><p>Checking account access and platform records.</p></section>;
    }

    if ((overview?.ok === false && overview.message) || (!overview && message)) {
      return (
        <section className="card admin-panel-card">
          <div className="eyebrow">Admin access</div>
          <h2>{overview?.message || message}</h2>
          <Link className="button" href="/login?next=%2Fadmin">Sign in</Link>
        </section>
      );
    }

    if (activeSection === "overview") {
      const counts = overview?.counts || {};
      const needsAttention = [
        { label: "Reported lost", value: counts.lostRecords || 0, section: "safety" as SectionId, filter: "lost" },
        { label: "Reported stolen", value: counts.stolenRecords || 0, section: "safety" as SectionId, filter: "stolen" },
        { label: "Pending transfers", value: counts.pendingTransfers || 0, section: "transfers" as SectionId, filter: "pending" },
        { label: "Banned accounts", value: counts.bannedUsers || 0, section: "users" as SectionId, filter: "banned" },
        { label: "Removed accounts", value: counts.removedUsers || 0, section: "users" as SectionId, filter: "removed" }
      ];
      return (
        <div className="admin-overview-layout">
          <section className="admin-grid">
            {Object.entries(counts).map(([key, value]) => {
              const destination = overviewLinks[key] || { section: "overview" as SectionId };
              return (
                <button type="button" className="card admin-stat-card" key={key} onClick={() => goToSection(destination.section, destination.filter || "")}>
                  <span>{statLabel(key)}</span>
                  <strong>{value === null ? "Review" : value}</strong>
                </button>
              );
            })}
          </section>
          <section className="card admin-panel-card">
            <div className="eyebrow">Needs attention</div>
            {needsAttention.map((item) => (
              <button type="button" className="admin-attention-row" key={item.label} onClick={() => goToSection(item.section, item.filter)}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
            <div className="admin-mini-list">
              <strong>Recent admin actions</strong>
              {auditEvents.slice(0, 4).map((event) => (
                <button type="button" key={event.id} onClick={() => goToSection("audit")}>
                  {actionLabel(event.action)} - {formatDate(event.created_at)}
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
              <h2>Users</h2>
              <p>Search accounts, remove access safely, hide public content, and manage admin roles.</p>
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
                    <span>{user.recordCount} records ({user.publicRecordCount} public / {user.privateRecordCount} private)</span>
                  </span>
                  <small>Created {formatDate(user.createdAt)} - Last sign-in {formatDate(user.lastSignInAt)} - Evidence {user.proofDocumentCount} - Service {user.serviceEventCount} - Transfers {user.transferCount}</small>
                  {user.hidePublicContent ? <small>Public content hidden by admin.</small> : null}
                  {user.adminNotes ? <small>Admin note saved.</small> : null}
                </div>
                <button type="button" className="admin-open-entity" onClick={() => setSelectedUser(user)}>
                  Open User <ChevronRight size={16} />
                </button>
              </div>
            )) : <p className="admin-empty">No users match this view.</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "records") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>Profiles</h2>
              <p>Open, edit, archive, restore, and filter QRguitar Profiles without changing permanent QR URLs.</p>
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
              <h2>Trust</h2>
              <p>Binary trust controls only: Verified / Unverified and Authenticity Confirmed / Authenticity Unconfirmed.</p>
            </div>
          </div>
          {filterControls("records")}
          <div className="admin-table">
            {filteredRecords.length ? filteredRecords.map((record) => (
              <div className="admin-row" key={record.id}>
                <div>
                  <strong>{record.qrCode} - {record.title}</strong>
                  <span>{record.verificationStatus} - {record.authenticityStatus}</span>
                  <small>Verification badge {record.showVerificationBadge === false ? "hidden" : "shown"} - Authenticity badge {record.showAuthenticityBadge === false ? "hidden" : "shown"}</small>
                </div>
                <div className="admin-row-actions">
                  <Link href={`/edit/${record.qrCode}`}>Full Editor</Link>
                  <button type="button" disabled={busy === `set_verification:${record.id}`} onClick={() => beginRecordAction(record, "set_verification", { verificationStatus: record.verificationStatus === "Verified" ? "unverified" : "verified" }, { confirm: true, title: "Update Verification" })}>
                    {record.verificationStatus === "Verified" ? "Set Unverified" : "Set Verified"}
                  </button>
                  <button type="button" disabled={busy === `set_authenticity:${record.id}`} onClick={() => beginRecordAction(record, "set_authenticity", { authenticityStatus: record.authenticityStatus === "Authenticity Confirmed" ? "unconfirmed" : "confirmed" }, { confirm: true, title: "Update Authenticity" })}>
                    {record.authenticityStatus === "Authenticity Confirmed" ? "Set Unconfirmed" : "Set Confirmed"}
                  </button>
                  <button type="button" disabled={busy === `set_trust_badge_visibility:${record.id}`} onClick={() => beginRecordAction(record, "set_trust_badge_visibility", { showVerificationBadge: record.showVerificationBadge === false }, { confirm: true, title: record.showVerificationBadge === false ? "Show Verification Badge" : "Hide Verification Badge" })}>
                    {record.showVerificationBadge === false ? "Show Verified Badge" : "Hide Verified Badge"}
                  </button>
                  <button type="button" disabled={busy === `set_trust_badge_visibility:${record.id}`} onClick={() => beginRecordAction(record, "set_trust_badge_visibility", { showAuthenticityBadge: record.showAuthenticityBadge === false }, { confirm: true, title: record.showAuthenticityBadge === false ? "Show Authenticity Badge" : "Hide Authenticity Badge" })}>
                    {record.showAuthenticityBadge === false ? "Show Auth Badge" : "Hide Auth Badge"}
                  </button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_trust_badge_visibility", {
                    showVerificationBadge: record.showVerificationBadge !== false,
                    showAuthenticityBadge: record.showAuthenticityBadge !== false
                  }, { includeTrustNotes: true, title: "Edit Trust Notes" })}>
                    Edit Notes
                  </button>
                </div>
              </div>
            )) : <p className="admin-empty">No Profiles match this trust view.</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "safety") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>Safety</h2>
              <p>Lost and stolen status controls. Private safety notes never appear here.</p>
            </div>
          </div>
          {filterControls("records")}
          <div className="admin-table">
            {filteredRecords.length ? filteredRecords.map((record) => (
              <div className="admin-row" key={record.id}>
                <div>
                  <strong>{record.qrCode} - {record.title}</strong>
                  <span>{safetyLabel(record.safetyStatus)} - {record.visibility}</span>
                  <small>{record.publicSafetyNote || "No public safety note."}</small>
                </div>
                <div className="admin-row-actions">
                  <Link href={`/edit/${record.qrCode}`}>Full Editor</Link>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "clear" }, { confirm: true, title: "Clear Safety Alert" })}>No Alert</button>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "lost", publicSafetyNote: "This instrument has been reported lost." }, { confirm: true, title: "Report Lost" })}>Lost</button>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "stolen", publicSafetyNote: "This instrument has been reported stolen." }, { confirm: true, title: "Report Stolen" })}>Stolen</button>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "recovered" }, { confirm: true, title: "Mark Recovered" })}>Recovered</button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: record.safetyStatus || "clear" }, { includeSafetyNotes: true, title: "Edit Safety Notes" })}>Edit Notes</button>
                </div>
              </div>
            )) : <p className="admin-empty">No Profiles match this safety view.</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "transfers") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>Transfers</h2>
              <p>Track ownership handoffs, review transfer status, and jump back to the related record or account.</p>
            </div>
          </div>
          {filterControls("transfers")}
          <div className="admin-table">
            {filteredTransfers.length ? filteredTransfers.map((transfer) => {
              const hasPublicPage = transfer.recordCode && transfer.recordVisibility === "public" && !transfer.recordIsArchived && !transfer.recordIsOwnerRemoved;
              return (
                <div className="admin-row" key={transfer.id}>
                  <div>
                    <strong>{transfer.recordTitle || "QRguitar Profile"}</strong>
                    <span className="admin-user-summary">
                      <span className={`admin-chip admin-chip--transfer-${normalize(transfer.status)}`}>{transfer.status || "unknown"}</span>
                      <span>{transfer.recordCode || transfer.guitar_id}</span>
                      <span>{transfer.recordVisibility || "no public page"}</span>
                    </span>
                    <small>From {transfer.fromOwnerEmail || "unknown owner"} - To {transfer.to_email || transfer.acceptedByEmail || "Unavailable"}</small>
                    <small>Created {formatDate(transfer.created_at)} - Accepted {formatDate(transfer.accepted_at)}</small>
                    {transfer.status === "sent" && transfer.claimPath ? <small>Claim link is active until the transfer is accepted or cancelled.</small> : null}
                  </div>
                  <div className="admin-row-actions">
                    {transfer.recordCode ? <Link href={`/edit/${transfer.recordCode}`}>Edit Profile</Link> : null}
                    {hasPublicPage ? (
                      <Link href={`/i/${transfer.recordCode}`}>Open Public Page</Link>
                    ) : (
                      <button type="button" disabled title="Private, archived, or removed transfer records do not have an active public page.">No public page</button>
                    )}
                    {transfer.fromOwnerEmail ? (
                      <button type="button" onClick={() => goToSection("users", "", { search: transfer.fromOwnerEmail || "" })}>View From User</button>
                    ) : null}
                    {transfer.acceptedByEmail ? (
                      <button type="button" onClick={() => goToSection("users", "", { search: transfer.acceptedByEmail || "" })}>View Recipient</button>
                    ) : null}
                    {transfer.status === "sent" && transfer.claimPath ? (
                      <button type="button" onClick={() => void copyTransferClaimLink(transfer)}>
                        Copy Claim Link
                      </button>
                    ) : null}
                    {transfer.status === "sent" ? (
                      <button type="button" disabled={busy === `cancel:${transfer.id}`} onClick={() => beginTransferAction(transfer, "cancel")}>
                        Cancel Transfer
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            }) : <p className="admin-empty">No transfers match this view.</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "claims") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>Ownership Claims</h2>
              <p>Review ownership requests and their private supporting evidence. Serial matches never transfer ownership automatically.</p>
            </div>
          </div>
          <div className="admin-table">
            {claimsError ? <p className="admin-empty" role="alert">{claimsError}</p> : ownershipClaims.length ? ownershipClaims.map((claim) => (
              <div className="admin-row" key={claim.id}>
                <div>
                  <strong>{claim.profileTitle}</strong>
                  <span className="admin-user-summary">
                    <span className={`admin-chip admin-chip--transfer-${normalize(claim.status)}`}>{claim.status.replaceAll("_", " ")}</span>
                    <span>{claim.qrCode || "Protected Profile"}</span>
                    <span>{claim.evidenceCount} private evidence {claim.evidenceCount === 1 ? "file" : "files"}</span>
                  </span>
                  <small>{claim.acquisitionDetails}</small>
                  <small>Declaration: {claim.ownershipDeclaration}</small>
                  <small>Submitted {formatDate(claim.createdAt)}</small>
                  {claim.evidence?.length ? (
                    <div className="admin-claim-evidence">
                      {claim.evidence.map((item) => (
                        <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                          Review {item.fileName} ({item.type.replaceAll("_", " ")})
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="admin-row-actions">
                  {claim.qrCode ? <Link href={`/edit/${claim.qrCode}`}>Review Profile</Link> : null}
                  {claim.status === "awaiting_owner" || claim.status === "admin_review" ? (
                    <>
                      <button type="button" disabled={busy === `approve:${claim.id}`} onClick={() => beginOwnershipClaimAction(claim, "approve")}>Approve</button>
                      <button type="button" disabled={busy === `request_information:${claim.id}`} onClick={() => beginOwnershipClaimAction(claim, "request_information")}>Request evidence</button>
                      <button type="button" disabled={busy === `deny:${claim.id}`} onClick={() => beginOwnershipClaimAction(claim, "deny")}>Deny</button>
                      <button type="button" disabled={busy === `expire:${claim.id}`} onClick={() => beginOwnershipClaimAction(claim, "expire")}>Expire</button>
                    </>
                  ) : null}
                </div>
              </div>
            )) : <p className="admin-empty">No ownership claims require review.</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "proof") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>Evidence</h2>
              <p>Document metadata only. Raw private storage paths are never shown.</p>
            </div>
          </div>
          {filterControls("proof")}
          <div className="admin-table">
            {filteredProof.length ? filteredProof.map((document) => (
              <div className="admin-row" key={document.id}>
                <div>
                  <strong>{document.name || "Document"}</strong>
                  <span>{document.document_type || "Document"} - {document.is_public ? "Public" : "Private"} - {document.recordCode || document.guitar_id}</span>
                  <small>Owner {document.ownerEmail || "No email"} - {fileSizeLabel(document.file_size)} - Created {formatDate(document.created_at)}</small>
                </div>
                <div className="admin-row-actions">
                  {document.recordCode ? <Link href={`/edit/${document.recordCode}`}>Open Editor</Link> : null}
                  {document.is_public && document.recordCode ? <Link href={`/i/${document.recordCode}`}>Open Profile</Link> : null}
                </div>
              </div>
            )) : <p className="admin-empty">No evidence documents match this view.</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "service") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>Service History</h2>
              <p>Service-entry metadata. Private notes are not shown in this admin list.</p>
            </div>
          </div>
          {filterControls("service")}
          <div className="admin-table">
            {filteredService.length ? filteredService.map((event) => (
              <div className="admin-row" key={event.id}>
                <div>
                  <strong>{event.title || "Service entry"}</strong>
                  <span>{event.event_type || "Service"} - {event.is_public ? "Public" : "Private"} - {event.recordCode || event.guitar_id}</span>
                  <small>{event.service_date || "No service date"} - {event.shop_name || "No shop listed"} - {event.location || "No location listed"}</small>
                </div>
                <div className="admin-row-actions">
                  {event.recordCode ? <Link href={`/edit/${event.recordCode}`}>Open Editor</Link> : null}
                  {event.is_public && event.recordCode ? <Link href={`/i/${event.recordCode}`}>Open Profile</Link> : null}
                </div>
              </div>
            )) : <p className="admin-empty">No service entries match this view.</p>}
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
              <h2>Brand Logos</h2>
              <p>Manage official brand logos with an HTTPS URL or a site-relative path beginning with one slash. User uploads never become brand logos.</p>
            </div>
          </div>
          <div className="admin-brand-form">
            <label>
              <span>Brand</span>
              <input
                list="admin-used-brands"
                value={brandLogoBrand}
                onChange={(event) => setBrandLogoBrand(event.target.value)}
                placeholder="Choose a brand"
              />
            </label>
            <label>
              <span>Transparent logo URL or site path</span>
              <input
                value={brandLogoUrl}
                onChange={(event) => setBrandLogoUrl(event.target.value)}
                placeholder="/logos/brand.svg or https://example.com/logo.png"
              />
            </label>
            <button className="button" type="button" disabled={busy === "brand-logo"} onClick={saveCurrentBrandLogo}>
              <ImageIcon size={16} /> {busy === "brand-logo" ? "Saving..." : "Save Logo"}
            </button>
          </div>
          <datalist id="admin-used-brands">
            {usedBrands.map((brand) => <option value={brand} key={brand} />)}
          </datalist>
          {isSafeBrandLogoUrl(brandLogoUrl) ? (
            <div className="admin-logo-preview">
              <span>Preview</span>
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
                  <button type="button" onClick={() => { setBrandLogoBrand(brandKey); setBrandLogoUrl(logoUrl); }}>Edit</button>
                  <button type="button" disabled={busy === "brand-logo"} onClick={() => removeCurrentBrandLogo(brandKey)}>Remove Logo</button>
                </div>
              </div>
            )) : (
              <div className="admin-brand-empty">
                <ImageIcon size={22} aria-hidden="true" />
                <div><strong>No official logos yet</strong><p>Profiles will use clean brand text until an administrator assigns an approved transparent logo.</p></div>
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
          <h2>Admin access</h2>
          <p>Signed in as {overview?.admin?.email || "authorized admin"}.</p>
          <p>Role: {overview?.admin?.role || "Not set"} - Source: {overview?.admin?.accessSource || "unknown"} - Status: {overview?.admin?.accountStatus || "active"}</p>
          <p>Admin access is controlled by profile role or server environment allowlists. Environment-managed access cannot be removed from this UI.</p>
          <div className="admin-filter-row">
            <input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} placeholder="User email for admin access" />
            <button
              type="button"
              disabled={Boolean(busy) || !accessTarget || accessTarget.role === "admin"}
              onClick={() => accessTarget ? beginUserAction(accessTarget, "change_role", { role: "admin" }, { confirm: true, title: "Add Admin" }) : undefined}
            >
              Add Admin
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || !accessTarget || accessTarget.role !== "admin" || accessTarget.envManaged === true}
              onClick={() => accessTarget ? beginAdminRoleChange(accessTarget) : undefined}
            >
              {accessTarget?.envManaged ? "Managed by environment" : "Remove Admin"}
            </button>
          </div>
          <div className="admin-table">
            {dbAdmins.length ? dbAdmins.map((user) => (
              <div className="admin-row" key={user.id}>
                <div>
                  <strong>{user.email}</strong>
                  <span>{user.envManaged ? "Managed by environment" : "Database admin"} - {user.accountStatus}</span>
                </div>
                <div className="admin-row-actions">
                  <button type="button" disabled={Boolean(busy) || user.envManaged === true} onClick={() => beginAdminRoleChange(user)}>
                    {user.envManaged ? "Managed by environment" : "Remove Admin"}
                  </button>
                </div>
              </div>
            )) : <p className="admin-empty">No database admin users listed.</p>}
          </div>
          {overview?.admin?.accessSource === "env" ? <p>Current access is managed by environment.</p> : null}
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
          <div className="admin-section-head"><div><h2>System Health</h2><p>Production services, release identity, integrations, and operational status.</p></div><button type="button" onClick={() => void loadAdmin()}>Run checks</button></div>
          <div className="admin-health-strip">
            {primarySystems.map((system) => (
              <details className={`admin-health-system is-${system.status}`} key={system.label}>
                <summary><span>{system.status === "healthy" ? "Healthy" : system.status === "warning" ? "Warning" : "Unknown"}</span><strong>{system.label}</strong><small>{system.summary}</small></summary>
                <ul>{system.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
              </details>
            ))}
          </div>
          <div className="admin-system-sections">
            <section>
              <span>Release identity</span>
              <dl>
                <div><dt>Environment</dt><dd>{health?.deployment?.environment || "Local QA"}</dd></div>
                <div><dt>Build SHA</dt><dd><code>{health?.build?.gitCommitSha || "Unknown"}</code></dd></div>
                <div><dt>Deployment</dt><dd>{health?.deployment?.identifier || "Unknown"}</dd></div>
                <div><dt>Git state</dt><dd>{health?.build?.dirtyWorkingTree ? "Dirty review candidate" : health?.build?.gitCommitSha ? "Reported clean" : "Unknown"}</dd></div>
                <div><dt>Canonical local origin</dt><dd>127.0.0.1:3003</dd></div>
              </dl>
            </section>
            <section>
              <span>Operations</span>
              <dl>
                <div><dt>Profiles loaded</dt><dd>{recordsPayload?.ok ? records.length : "Unknown"}</dd></div>
                <div><dt>Recent audit events</dt><dd>{Array.isArray(auditEvents) ? auditEvents.length : "Unknown"}</dd></div>
                <div><dt>Content publishing</dt><dd>Shared server-backed source</dd></div>
                <div><dt>Required migrations</dt><dd>{health?.migrations?.adminFoundation && health?.migrations?.serviceWorkflow ? "Ready" : "Review"}</dd></div>
                <div><dt>Last check</dt><dd>{new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</dd></div>
              </dl>
            </section>
          </div>
          <div className="admin-system-meta"><span>Signed in</span><strong>{overview?.admin?.email || "Authorized admin"}</strong><span>Access source</span><strong>{overview?.admin?.accessSource || "Unknown"}</strong></div>
        </section>
      );
    }

    return (
      <section className="card admin-panel-card">
        <div className="admin-section-head">
          <div>
            <h2>Audit Log</h2>
            <p>Human-readable admin action history. Metadata is summarized behind details controls.</p>
          </div>
          <button type="button" onClick={exportAuditLog} disabled={!filteredAudit.length}>Export safe JSON</button>
        </div>
        {filterControls("audit")}
        <div className="admin-table">
          {filteredAudit.length ? filteredAudit.map((event) => (
            <div className="admin-row" key={event.id}>
              <div>
                <strong>{actionLabel(event.action)}</strong>
                <span>Admin operator - {event.target_type || "target"} {event.target_id || ""}</span>
                <small>{formatDate(event.created_at)} - {event.reason || "No reason listed"}</small>
                {event.metadata ? (
                  <details className="admin-details">
                    <summary>Details</summary>
                    <code>{JSON.stringify(event.metadata)}</code>
                  </details>
                ) : null}
              </div>
            </div>
          )) : <p className="admin-empty">No audit events match this view.</p>}
        </div>
      </section>
    );
  })();

  const activeSectionMeta = sections.find((section) => section.id === activeSection) || sections[0];
  const ActiveSectionIcon = activeSectionMeta.icon;

  const entityDrawer = adminAuthorized && adminDataReady && selectedUser ? (
    <div className="admin-drawer-layer">
      <button type="button" className="admin-drawer-backdrop" onClick={() => setSelectedUser(null)} aria-label="Close user details" />
      <aside ref={entityDrawerRef} tabIndex={-1} className="admin-entity-drawer" role="dialog" aria-modal="true" aria-label={`User details for ${selectedUser.email}`} aria-busy={Boolean(busy)}>
        <header><div><span>User account</span><h2>{selectedUser.email}</h2></div><button type="button" disabled={Boolean(busy)} onClick={() => setSelectedUser(null)} aria-label="Close"><X size={18} /></button></header>
        <div className="admin-drawer-body">
          <div className="admin-drawer-chips"><span className={adminChipClass("role", userRoleChipValue(selectedUser))}>{userRoleLabel(selectedUser)}</span><span className={adminChipClass("status", selectedUser.accountStatus)}>{selectedUser.accountStatus}</span></div>
          <dl><div><dt>Profiles</dt><dd>{selectedUser.recordCount}</dd></div><div><dt>Public / private</dt><dd>{selectedUser.publicRecordCount} / {selectedUser.privateRecordCount}</dd></div><div><dt>Last sign-in</dt><dd>{formatDate(selectedUser.lastSignInAt)}</dd></div><div><dt>Created</dt><dd>{formatDate(selectedUser.createdAt)}</dd></div></dl>
          <section><span>Account access</span><div className="admin-drawer-actions">
            {selectedUser.accountStatus === "locked" ? <button type="button" disabled={Boolean(busy)} onClick={() => beginUserAction(selectedUser, "unlock", {}, { confirm: true, title: "Unlock Account" })}>Unlock account</button> : selectedUser.accountStatus === "active" ? <button type="button" disabled={Boolean(busy) || selectedUser.envManaged} onClick={() => beginUserAction(selectedUser, "lock", {}, { confirm: true, title: "Lock Account" })}>Lock account</button> : null}
            {selectedUser.accountStatus === "banned" ? <button type="button" disabled={Boolean(busy)} onClick={() => beginUserAction(selectedUser, "unban", {}, { confirm: true, title: "Unban User" })}>Unban user</button> : <button type="button" disabled={Boolean(busy) || selectedUser.envManaged || selectedUser.accountStatus === "removed"} onClick={() => beginUserAction(selectedUser, "ban", {}, { confirm: true, title: "Ban User" })}>Ban user</button>}
            {selectedUser.accountStatus === "removed" ? <button type="button" disabled={Boolean(busy)} onClick={() => beginUserAction(selectedUser, "restore_user", {}, { confirm: true, title: "Restore User" })}>Restore user</button> : <button type="button" disabled={Boolean(busy) || selectedUser.envManaged} onClick={() => beginUserAction(selectedUser, "remove", {}, { confirm: true, title: "Remove User" })}>Remove user</button>}
          </div></section>
          <section><span>Public presence</span><div className="admin-drawer-actions"><button type="button" disabled={Boolean(busy)} onClick={() => beginUserAction(selectedUser, selectedUser.hidePublicContent ? "restore_public_content" : "hide_public_content", {}, { confirm: true, title: selectedUser.hidePublicContent ? "Restore Public Content" : "Hide Public Content" })}>{selectedUser.hidePublicContent ? "Restore public content" : "Hide public content"}</button></div></section>
          <section><span>Administration</span><div className="admin-drawer-actions"><button type="button" disabled={Boolean(busy) || selectedUser.envManaged} onClick={() => beginAdminRoleChange(selectedUser)}>{selectedUser.role === "admin" ? "Remove admin" : "Add admin"}</button><button type="button" disabled={Boolean(busy)} onClick={() => beginUserAction(selectedUser, "admin_note", {}, { includeNote: true, title: "Save Admin Note" })}>Internal note</button></div></section>
          <section className="admin-danger-zone"><span>Permanent action</span><p id="admin-deletion-unavailable">{ACCOUNT_DELETION_UNAVAILABLE}</p><button type="button" disabled aria-describedby="admin-deletion-unavailable">Permanent account deletion unavailable</button></section>
        </div>
      </aside>
    </div>
  ) : adminAuthorized && adminDataReady && selectedRecord ? (
    <div className="admin-drawer-layer">
      <button type="button" className="admin-drawer-backdrop" onClick={() => setSelectedRecord(null)} aria-label="Close Profile details" />
      <aside ref={entityDrawerRef} tabIndex={-1} className="admin-entity-drawer" role="dialog" aria-modal="true" aria-label={`Profile details for ${selectedRecord.title}`} aria-busy={Boolean(busy)}>
        <header><div><span>QRguitar Profile</span><h2>{selectedRecord.title}</h2><small>{selectedRecord.qrCode}</small></div><button type="button" disabled={Boolean(busy)} onClick={() => setSelectedRecord(null)} aria-label="Close"><X size={18} /></button></header>
        <div className="admin-drawer-body">
          <dl><div><dt>Owner</dt><dd>{selectedRecord.ownerEmail || "No owner"}</dd></div><div><dt>Visibility</dt><dd>{selectedRecord.visibility}</dd></div><div><dt>Service / evidence</dt><dd>{selectedRecord.serviceEventCount} / {selectedRecord.proofDocumentCount}</dd></div><div><dt>Created</dt><dd>{formatDate(selectedRecord.createdAt)}</dd></div></dl>
          <section><span>Open</span><div className="admin-drawer-actions"><Link href={`/edit/${selectedRecord.qrCode}`}>Full editor</Link>{selectedRecord.visibility === "public" && !selectedRecord.isArchived && !selectedRecord.isOwnerRemoved ? <Link href={selectedRecord.permanentPath}>Public Profile</Link> : null}</div></section>
          <section><span>Visibility</span><div className="admin-drawer-actions"><button type="button" disabled={Boolean(busy) || selectedRecord.visibility === "public" || selectedRecord.isArchived} onClick={() => beginRecordAction(selectedRecord, "set_visibility", { visibility: "public" }, { confirm: true, title: "Make Public" })}>Make public</button><button type="button" disabled={Boolean(busy) || selectedRecord.visibility === "private" || selectedRecord.isArchived} onClick={() => beginRecordAction(selectedRecord, "set_visibility", { visibility: "private" }, { confirm: true, title: "Make Private" })}>Make private</button></div></section>
          <section><span>Trust and safety</span><div className="admin-drawer-actions"><button type="button" disabled={Boolean(busy)} onClick={() => beginRecordAction(selectedRecord, "set_verification", { verificationStatus: selectedRecord.verificationStatus === "Verified" ? "unverified" : "verified" }, { includeTrustNotes: true, title: "Update Verification" })}>{selectedRecord.verificationStatus === "Verified" ? "Set unverified" : "Set verified"}</button><button type="button" disabled={Boolean(busy)} onClick={() => beginRecordAction(selectedRecord, "set_authenticity", { authenticityStatus: selectedRecord.authenticityStatus === "Authenticity Confirmed" ? "unconfirmed" : "confirmed" }, { includeTrustNotes: true, title: "Update Authenticity" })}>{selectedRecord.authenticityStatus === "Authenticity Confirmed" ? "Set unconfirmed" : "Confirm authenticity"}</button><button type="button" disabled={Boolean(busy)} onClick={() => beginRecordAction(selectedRecord, "set_safety", { safetyStatus: selectedRecord.safetyStatus || "clear" }, { includeSafetyNotes: true, title: "Update Safety Status" })}>Safety details</button></div></section>
          <section className="admin-danger-zone"><span>Archive</span><p>Archiving removes the Profile from active public surfaces without changing its permanent QRguitar ID.</p><button type="button" disabled={Boolean(busy)} onClick={() => beginRecordAction(selectedRecord, selectedRecord.isArchived ? "restore_archive" : "archive", {}, { confirm: true, title: selectedRecord.isArchived ? "Restore from Archive" : "Archive Profile" })}>{selectedRecord.isArchived ? "Restore Profile" : "Archive Profile"}</button></section>
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <Nav />
      <main className="admin-page">
        <div className="admin-command-bar">
          <div>{adminAuthorized && adminDataReady ? <button ref={navButtonRef} type="button" className="admin-mobile-nav" onClick={() => setNavOpen(true)} aria-label="Open admin navigation" aria-controls="admin-primary-navigation" aria-expanded={navOpen}><Menu size={18} /></button> : null}<div><span>Admin command center</span><strong>{activeSectionMeta.label}</strong></div></div>
          {adminAuthorized && adminDataReady ? <label className="admin-global-search"><Search size={16} /><input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} placeholder="Search users, Profiles, or IDs" /></label> : null}
          <div className="admin-command-meta"><span>Admin access</span><strong>{adminAuthorized ? overview?.admin?.email || "Authorized admin" : adminAccessState === "unavailable" ? "Temporarily unavailable" : adminAccessState === "checking" ? "Checking" : "Sign in required"}</strong></div>
        </div>
        <div className={adminAuthorized && adminDataReady ? "admin-shell" : "admin-shell is-locked"}>
          {adminAuthorized && adminDataReady ? <aside ref={sidebarRef} tabIndex={-1} id="admin-primary-navigation" aria-label="Admin navigation" className={navOpen ? "admin-sidebar is-open" : "admin-sidebar"}><header><strong>QRguitar Admin</strong><button type="button" onClick={() => setNavOpen(false)} aria-label="Close admin navigation"><X size={17} /></button></header>{sectionGroups.map((group) => <nav key={group} aria-label={`${group} sections`}><span>{group}</span>{sections.filter((section) => section.group === group).map((section) => { const Icon = section.icon; return <button type="button" className={section.id === activeSection ? "active" : ""} onClick={() => goToSection(section.id)} key={section.id}><Icon size={16} />{section.label}</button>; })}</nav>)}<nav className="admin-sidebar-links" aria-label="Admin workspaces"><span>Workspaces</span><Link href="/admin/site-editor">Site editor</Link><Link href="/admin/service-workflow">Service operations</Link><Link href="/admin/payments">Payments</Link><Link href="/admin/promotions">Promo codes</Link><Link href="/admin/deletion-requests">Deletion requests</Link></nav></aside> : null}
          {adminAuthorized && adminDataReady && navOpen ? <button type="button" className="admin-sidebar-backdrop" onClick={() => setNavOpen(false)} aria-label="Close admin navigation" /> : null}
          <div className="admin-main">
          {!adminAuthorized ? (
            <section className="card admin-panel-card admin-login-card">
              <div className="eyebrow">Admin access</div>
              <h2>{loading || adminAccessState === "checking" ? "Checking admin access." : adminAccessState === "unavailable" ? "Admin is temporarily unavailable." : "Sign in with an authorized admin account."}</h2>
              <p>{loading || adminAccessState === "checking" ? "Confirming your session before admin tools load." : adminAccessState === "unavailable" ? "Your session exists, but QRguitar could not verify admin access or load the admin service." : "Admin tools stay hidden until an authorized admin account is signed in."}</p>
              {message ? <p role="alert" className="admin-message">{message}</p> : null}
              {adminAccessState === "unavailable" ? (
                <button className="button" type="button" disabled={loading} onClick={() => void loadAdmin()}>{loading ? "Retrying…" : "Retry admin access"}</button>
              ) : !loading && adminAccessState === "unauthorized" ? (
                <Link className="button" href={`/login?next=${encodeURIComponent("/admin")}`}>
                  Sign in
                </Link>
              ) : null}
            </section>
          ) : (
            <>
              <div className="admin-main-heading"><ActiveSectionIcon size={22} /><div><span>{activeSectionMeta.group}</span><h1>{activeSectionMeta.label}</h1></div></div>
              {adminDataReady && message ? <div className="admin-message">{message}</div> : null}
              {!adminDataReady ? <section className="card admin-panel-card" role="alert"><h2>Admin data is temporarily unavailable.</h2><p>{message || "QRguitar could not load all required admin data."}</p><button type="button" disabled={loading} onClick={() => void loadAdmin()}>{loading ? "Retrying…" : "Retry admin data"}</button></section> : null}
            </>
          )}
          {adminAuthorized && adminDataReady && pendingAction ? (
            <div className="admin-modal-backdrop" role="presentation">
              <section ref={modalRef} tabIndex={-1} className="card admin-modal" role="dialog" aria-modal="true" aria-label={pendingAction.title}>
                <div className="admin-section-head">
                  <div>
                    <div className="eyebrow">Confirm admin action</div>
                    <h2>{pendingAction.title}</h2>
                    <p>{pendingAction.target}</p>
                  </div>
                  <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => setPendingAction(null)}>
                    Cancel
                  </button>
                </div>
                <div className="admin-impact-summary">
                  <strong>Impact</strong>
                  <p>{pendingAction.kind === "user" && pendingAction.action === "delete_empty_user" ? ACCOUNT_DELETION_UNAVAILABLE : "This changes operational data immediately. The action is recorded in the audit trail and the affected view is refreshed."}</p>
                  <span>{pendingAction.kind === "user" && pendingAction.action === "delete_empty_user" ? "Unavailable" : "Reversible where the corresponding restore action is available"}</span>
                </div>
                {message ? <div className="admin-message" role="alert">{message}</div> : null}
                {pendingAction.kind === "user" && pendingAction.action === "change_role" && pendingAction.user.role === "admin" ? (
                  <label>
                    Role after removing admin access
                    <select
                      value={String(pendingAction.extra?.role || "")}
                      disabled={Boolean(busy)}
                      onChange={(event) => setPendingAction({ ...pendingAction, extra: { ...pendingAction.extra, role: event.target.value } })}
                    >
                      <option value="">Choose a role</option>
                      <option value="owner">Owner</option>
                      <option value="builder">Builder</option>
                      <option value="shop">Service Shop</option>
                    </select>
                  </label>
                ) : null}
                <label>
                  Operator reason
                  <textarea value={pendingAction.reason} onChange={(event) => setPendingAction({ ...pendingAction, reason: event.target.value })} rows={2} placeholder="Required for the audit trail" />
                </label>
                {pendingAction.kind === "user" && pendingAction.includeNote ? (
                  <label>
                    Internal admin note
                    <textarea
                      value={pendingAction.note || ""}
                      onChange={(event) => setPendingAction({ ...pendingAction, note: event.target.value })}
                      rows={4}
                    />
                  </label>
                ) : null}
                {pendingAction.kind === "record" && pendingAction.includeTrustNotes ? (
                  <div className="admin-modal-grid">
                    <label>
                      Public verification note
                      <textarea value={pendingAction.publicVerificationNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, publicVerificationNote: event.target.value })} rows={3} />
                    </label>
                    <label>
                      Internal verification note
                      <textarea value={pendingAction.internalVerificationNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, internalVerificationNote: event.target.value })} rows={3} />
                    </label>
                    <label>
                      Public authenticity note
                      <textarea value={pendingAction.publicAuthenticityNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, publicAuthenticityNote: event.target.value })} rows={3} />
                    </label>
                    <label>
                      Internal authenticity note
                      <textarea value={pendingAction.internalAuthenticityNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, internalAuthenticityNote: event.target.value })} rows={3} />
                    </label>
                  </div>
                ) : null}
                {pendingAction.kind === "record" && pendingAction.includeSafetyNotes ? (
                  <div className="admin-modal-grid">
                    <label>
                      Public safety note
                      <textarea value={pendingAction.publicSafetyNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, publicSafetyNote: event.target.value })} rows={3} />
                    </label>
                    <label>
                      Private/internal safety note
                      <textarea value={pendingAction.safetyNote || ""} onChange={(event) => setPendingAction({ ...pendingAction, safetyNote: event.target.value })} rows={3} />
                    </label>
                  </div>
                ) : null}
                <div className="form-actions">
                  <button className="button" type="button" disabled={Boolean(busy) || !pendingAction.reason.trim() || (pendingAction.kind === "user" && pendingAction.action === "delete_empty_user") || (pendingAction.kind === "user" && pendingAction.action === "change_role" && pendingAction.user.role === "admin" && !["owner", "builder", "shop"].includes(String(pendingAction.extra?.role || "")))} onClick={() => void confirmPendingAction()}>
                    {busy ? "Saving…" : "Confirm"}
                  </button>
                  <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => setPendingAction(null)}>
                    Cancel
                  </button>
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

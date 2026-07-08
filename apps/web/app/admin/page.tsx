"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getSupabaseAccessToken } from "../../lib/supabase-browser";

type OverviewPayload = {
  ok?: boolean;
  message?: string;
  migrationNotice?: string;
  admin?: { email?: string; role?: string; accessSource?: string; accountStatus?: string };
  counts?: Record<string, number | null>;
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
  | "proof"
  | "service"
  | "access"
  | "audit";

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
    };

const sections: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "records", label: "Records" },
  { id: "trust", label: "Trust" },
  { id: "safety", label: "Safety" },
  { id: "transfers", label: "Transfers" },
  { id: "proof", label: "Proof Vault" },
  { id: "service", label: "Service History" },
  { id: "access", label: "Admin Access" },
  { id: "audit", label: "Audit Log" }
];

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
  if (kind === "role" && (clean === "admin" || clean === "owner" || clean === "env-admin" || clean === "user")) return `admin-chip admin-chip--${clean}`;
  if (kind === "status" && (clean === "active" || clean === "locked" || clean === "banned" || clean === "removed")) return `admin-chip admin-chip--${clean}`;
  return "admin-chip";
}

function userRoleLabel(user: AdminUser) {
  if (user.envManaged) return "Env Admin";
  if (user.role === "admin") return "Admin";
  return "User";
}

function userRoleChipValue(user: AdminUser) {
  if (user.envManaged) return "env-admin";
  if (user.role === "admin") return "admin";
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
    record_archived: "Record archived",
    record_restored: "Record restored",
    record_visibility_updated: "Record visibility updated",
    trust_status_updated: "Trust status updated",
    authenticity_status_updated: "Authenticity status updated",
    trust_badge_visibility_updated: "Trust badge visibility updated",
    safety_status_updated: "Safety status updated",
    record_removed_from_collection: "Record deleted from dashboard",
    record_restored_to_collection: "Historical recovery event"
  };
  return labels[action] || statLabel(action);
}

function fileSizeLabel(value?: number | null) {
  if (!value) return "Size not listed";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [recordsPayload, setRecordsPayload] = useState<RecordsPayload | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [userFilter, setUserFilter] = useState("");
  const [recordFilter, setRecordFilter] = useState("");
  const [transferFilter, setTransferFilter] = useState("");
  const [adminSearch, setAdminSearch] = useState("");
  const [sortKey, setSortKey] = useState("created-desc");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAdminAction | null>(null);

  const tokenPromise = useMemo(() => getSupabaseAccessToken(), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setActiveSection(cleanSection(params.get("section")));
    setUserFilter(params.get("filter") || "");
    setRecordFilter(params.get("filter") || "");
    setTransferFilter(params.get("filter") || "");
  }, []);

  function goToSection(section: SectionId, filter = "") {
    setActiveSection(section);
    if (section === "users") setUserFilter(filter);
    if (section === "records" || section === "trust" || section === "safety") setRecordFilter(filter);
    if (section === "transfers") setTransferFilter(filter);
    const params = new URLSearchParams();
    params.set("section", section);
    if (filter) params.set("filter", filter);
    window.history.replaceState(null, "", `/admin?${params.toString()}`);
  }

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const token = await tokenPromise;
    if (!token) {
      setAdminAuthorized(false);
      setMessage("Sign in with an authorized admin account.");
      setLoading(false);
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    const [overviewResponse, usersResponse, recordsResponse, auditResponse] = await Promise.all([
      fetch("/api/admin/overview", { headers, cache: "no-store" }),
      fetch("/api/admin/users", { headers, cache: "no-store" }),
      fetch("/api/admin/records", { headers, cache: "no-store" }),
      fetch("/api/admin/audit", { headers, cache: "no-store" })
    ]);

    const [overviewJson, usersJson, recordsJson, auditJson] = await Promise.all([
      overviewResponse.json().catch(() => ({})),
      usersResponse.json().catch(() => ({})),
      recordsResponse.json().catch(() => ({})),
      auditResponse.json().catch(() => ({}))
    ]);

    setOverview(overviewJson);
    setUsers(usersJson.users || []);
    setRecordsPayload(recordsJson);
    setAuditEvents(auditJson.auditEvents || []);
    setAdminAuthorized(overviewResponse.ok && usersResponse.ok && recordsResponse.ok && auditResponse.ok);
    setMessage(overviewJson.message || usersJson.message || recordsJson.message || auditJson.message || overviewJson.migrationNotice || usersJson.migrationNotice || "");
    setLoading(false);
  }, [tokenPromise]);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  function beginUserAction(user: AdminUser, action: string, extra: Record<string, unknown> = {}, options: { includeNote?: boolean; confirm?: boolean; title?: string } = {}) {
    if (!options.includeNote && !options.confirm) {
      void updateUser(user, action, extra);
      return;
    }

    setPendingAction({
      kind: "user",
      user,
      action,
      extra,
      title: options.title || actionLabel(action),
      target: user.email || user.id,
      reason: "",
      note: options.includeNote ? user.adminNotes || "" : undefined,
      includeNote: options.includeNote
    });
  }

  async function updateUser(user: AdminUser, action: string, extra: Record<string, unknown> = {}, reason = "") {
    const token = await tokenPromise;
    if (!token) {
      setMessage("Sign in required.");
      return;
    }

    setBusy(`${action}:${user.id}`);
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, reason, ...extra })
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message || (response.ok ? "Admin action saved." : "Admin action failed."));
    setBusy("");
    if (response.ok) {
      await loadAdmin();
    }
  }

  function beginRecordAction(record: AdminRecord, action: string, extra: Record<string, unknown> = {}, options: { includeTrustNotes?: boolean; includeSafetyNotes?: boolean; title?: string } = {}) {
    if (!options.includeTrustNotes && !options.includeSafetyNotes) {
      void updateRecord(record, action, extra);
      return;
    }

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
    const token = await tokenPromise;
    if (!token) {
      setMessage("Sign in required.");
      return;
    }

    setBusy(`${action}:${record.id}`);
    const response = await fetch(`/api/admin/records/${encodeURIComponent(record.id)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, reason, ...extra })
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message || (response.ok ? "Record action saved." : "Record action failed."));
    setBusy("");
    if (response.ok) {
      await loadAdmin();
    }
  }

  function beginTransferAction(transfer: AdminTransfer, action: "cancel") {
    void updateTransfer(transfer, action);
  }

  async function updateTransfer(transfer: AdminTransfer, action: "cancel", reason = "") {
    const token = await tokenPromise;
    if (!token) {
      setMessage("Sign in required.");
      return;
    }

    setBusy(`${action}:${transfer.id}`);
    const response = await fetch("/api/transfers", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id: transfer.id, action, reason })
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message || (response.ok ? "Transfer action saved." : "Transfer action failed."));
    setBusy("");
    if (response.ok) {
      await loadAdmin();
    }
  }

  async function copyTransferClaimLink(transfer: AdminTransfer) {
    if (!transfer.claimPath) {
      setMessage("No active claim link is available for this transfer.");
      return;
    }

    const url = `${window.location.origin}${transfer.claimPath}`;
    await window.navigator.clipboard?.writeText(url);
    setMessage("Transfer claim link copied.");
  }

  async function confirmPendingAction() {
    if (!pendingAction) {
      return;
    }

    if (pendingAction.kind === "user") {
      await updateUser(
        pendingAction.user,
        pendingAction.action,
        pendingAction.includeNote ? { ...pendingAction.extra, adminNotes: pendingAction.note || "" } : pendingAction.extra,
        ""
      );
    } else if (pendingAction.kind === "record") {
      await updateRecord(
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
        ""
      );
    } else {
      await updateTransfer(pendingAction.transfer, pendingAction.action, "");
    }

    setPendingAction(null);
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
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return list;
  }, [adminSearch, sortKey, userFilter, users]);

  const records = recordsPayload?.records || [];
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
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [adminSearch, recordsPayload?.transfers, transferFilter]);

  const filteredProof = useMemo(() => {
    const search = normalize(adminSearch);
    return (recordsPayload?.proofDocuments || []).filter((document) => !search || normalize(`${document.name} ${document.recordCode} ${document.recordTitle} ${document.ownerEmail} ${document.document_type}`).includes(search));
  }, [adminSearch, recordsPayload?.proofDocuments]);

  const filteredService = useMemo(() => {
    const search = normalize(adminSearch);
    return (recordsPayload?.serviceEvents || []).filter((event) => !search || normalize(`${event.title} ${event.recordCode} ${event.recordTitle} ${event.ownerEmail} ${event.event_type} ${event.shop_name} ${event.location}`).includes(search));
  }, [adminSearch, recordsPayload?.serviceEvents]);

  const filteredAudit = useMemo(() => {
    const search = normalize(adminSearch);
    return auditEvents.filter((event) => !search || normalize(`${event.actor_email} ${event.action} ${event.target_type} ${event.target_id} ${event.reason}`).includes(search));
  }, [adminSearch, auditEvents]);

  function filterControls(kind: "users" | "records" | "transfers" | "audit") {
    return (
      <div className="admin-filter-row">
        <input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} placeholder="Search this section" />
        {kind === "users" ? (
          <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
            <option value="">All users</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="banned">Banned</option>
            <option value="removed">Removed</option>
            <option value="admin">Admins</option>
            <option value="normal">Normal users</option>
            <option value="empty">Empty users</option>
            <option value="has-records">Users with records</option>
          </select>
        ) : kind === "transfers" ? (
          <select value={transferFilter} onChange={(event) => setTransferFilter(event.target.value)}>
            <option value="">All transfers</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        ) : kind === "records" ? (
          <select value={recordFilter} onChange={(event) => setRecordFilter(event.target.value)}>
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
            <option value="has-proof">Has proof docs</option>
            <option value="has-service">Has service history</option>
          </select>
        ) : (
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
            <option value="created-desc">Newest</option>
            <option value="email">Actor</option>
            <option value="status">Action</option>
          </select>
        )}
        {kind !== "audit" ? (
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
            <option value="created-desc">Newest</option>
            <option value="email">Email</option>
            <option value="title">Title</option>
            <option value="owner">Owner</option>
            <option value="status">Status</option>
            <option value="role">Role</option>
            <option value="visibility">Visibility</option>
            <option value="verification">Verification</option>
            <option value="authenticity">Authenticity</option>
            <option value="safety">Safety</option>
            <option value="records">Record count</option>
            <option value="last-sign-in">Last sign-in</option>
          </select>
        ) : null}
      </div>
    );
  }

  function renderRecordRows(list = filteredRecords) {
    return (
      <div className="admin-table">
        {list.length ? list.map((record) => (
          <div className="admin-row" key={record.id}>
            <div>
              <strong>{record.qrCode} - {record.title}</strong>
              <span>
                {[record.brand, record.model, record.serialNumber].filter(Boolean).join(" / ") || "Instrument"} - {record.visibility}
                {record.isArchived ? " - Archived" : ""}
                {record.isOwnerRemoved ? " - Deleted by owner" : ""}
              </span>
              <small>
                Owner {record.ownerEmail || "No email"} - Proof {record.proofDocumentCount} - Service {record.serviceEventCount} - Transfers {record.transferCount}
              </small>
              <div className="admin-inline-badges">
                <button type="button" onClick={() => goToSection("trust", record.verificationStatus === "Verified" ? "verified" : "unverified")}>{record.verificationStatus}</button>
                <button type="button" onClick={() => goToSection("trust", record.authenticityStatus === "Authenticity Confirmed" ? "authenticity-confirmed" : "authenticity-unconfirmed")}>{record.authenticityStatus}</button>
                <button type="button" onClick={() => goToSection("safety", record.safetyStatus || "clear")}>{safetyLabel(record.safetyStatus)}</button>
              </div>
            </div>
            <div className="admin-row-actions">
              {record.visibility === "public" && !record.isArchived && !record.isOwnerRemoved ? (
                <Link href={record.permanentPath}>Open Public</Link>
              ) : (
                <button type="button" disabled title="Private, archived, or removed records do not have an active public page.">No public page</button>
              )}
              <Link href={`/edit/${record.qrCode}`}>Edit</Link>
              {record.visibility !== "public" && !record.isArchived && !record.isOwnerRemoved ? (
                <button type="button" disabled={busy === `set_visibility:${record.id}`} onClick={() => beginRecordAction(record, "set_visibility", { visibility: "public" }, { title: "Make Public" })}>Make Public</button>
              ) : null}
              {record.visibility !== "private" && !record.isArchived ? (
                <button type="button" disabled={busy === `set_visibility:${record.id}`} onClick={() => beginRecordAction(record, "set_visibility", { visibility: "private" }, { title: "Make Private" })}>Make Private</button>
              ) : null}
              {record.isArchived ? (
                <button type="button" disabled={busy === `restore_archive:${record.id}`} onClick={() => beginRecordAction(record, "restore_archive", {}, { title: "Restore from Archive" })}>Restore from Archive</button>
              ) : (
                <button type="button" disabled={busy === `archive:${record.id}`} onClick={() => beginRecordAction(record, "archive", {}, { title: "Archive Record" })}>Archive Record</button>
              )}
              {record.isOwnerRemoved ? (
                <button type="button" disabled title="Deleted dashboard records cannot be restored. Create a new record instead.">Deleted</button>
              ) : null}
            </div>
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
              <div className="admin-row" key={user.id}>
                <div>
                  <strong>{user.email || user.id}</strong>
                  <span className="admin-user-summary">
                    <span className={adminChipClass("role", userRoleChipValue(user))}>{userRoleLabel(user)}</span>
                    <span className={adminChipClass("status", user.accountStatus)}>{user.accountStatus}</span>
                    <span>{user.recordCount} records ({user.publicRecordCount} public / {user.privateRecordCount} private)</span>
                  </span>
                  <small>Created {formatDate(user.createdAt)} - Last sign-in {formatDate(user.lastSignInAt)} - Proof {user.proofDocumentCount} - Service {user.serviceEventCount} - Transfers {user.transferCount}</small>
                  {user.hidePublicContent ? <small>Public content hidden by admin.</small> : null}
                  {user.adminNotes ? <small>Admin note saved.</small> : null}
                </div>
                <div className="admin-row-actions">
                  {user.accountStatus === "removed" ? null : user.accountStatus === "locked" ? (
                    <button type="button" disabled={busy === `unlock:${user.id}`} onClick={() => beginUserAction(user, "unlock", {}, { title: "Unlock Account" })}>Unlock</button>
                  ) : (
                    <button type="button" disabled={user.envManaged === true || busy === `lock:${user.id}`} title={user.envManaged ? "Environment-managed admin access is not changed here." : ""} onClick={() => beginUserAction(user, "lock", {}, { title: "Lock Account" })}>Lock</button>
                  )}
                  {user.accountStatus === "banned" ? (
                    <button type="button" disabled={busy === `unban:${user.id}`} onClick={() => beginUserAction(user, "unban", {}, { title: "Unban User" })}>Unban</button>
                  ) : user.accountStatus !== "removed" ? (
                    <button type="button" disabled={user.envManaged === true || busy === `ban:${user.id}`} title={user.envManaged ? "Environment-managed admin access is not changed here." : ""} onClick={() => beginUserAction(user, "ban", {}, { title: "Ban User" })}>Ban User</button>
                  ) : null}
                  {user.accountStatus === "removed" ? (
                    <button type="button" disabled={busy === `restore_user:${user.id}`} onClick={() => beginUserAction(user, "restore_user", {}, { title: "Restore User" })}>Restore User</button>
                  ) : (
                    <button type="button" disabled={user.envManaged === true || busy === `remove:${user.id}`} title={user.envManaged ? "Environment-managed admin access is not changed here." : ""} onClick={() => beginUserAction(user, "remove", {}, { title: "Remove User" })}>Remove User</button>
                  )}
                  {user.hidePublicContent ? (
                    <button type="button" disabled={busy === `restore_public_content:${user.id}`} onClick={() => beginUserAction(user, "restore_public_content", {}, { title: "Restore Public Content" })}>Restore Public</button>
                  ) : user.accountStatus !== "banned" && user.accountStatus !== "removed" ? (
                    <button type="button" disabled={busy === `hide_public_content:${user.id}`} onClick={() => beginUserAction(user, "hide_public_content", {}, { title: "Hide Public Content" })}>Hide Public</button>
                  ) : null}
                  {user.accountStatus !== "banned" && user.accountStatus !== "removed" ? (
                    <button type="button" disabled={user.envManaged === true} title={user.envManaged ? "Environment-managed admin access is not changed here." : ""} onClick={() => beginUserAction(user, "change_role", { role: user.role === "admin" ? "user" : "admin" }, { title: user.role === "admin" ? "Remove Admin" : "Add Admin" })}>
                      {user.envManaged ? "Env Admin" : user.role === "admin" ? "Remove Admin" : "Add Admin"}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => beginUserAction(user, "admin_note", {}, { includeNote: true, title: "Save Admin Note" })}>Note</button>
                  <button
                    type="button"
                    disabled={!user.deleteEligible || busy === `delete_empty_user:${user.id}`}
                    title={user.deleteEligible ? "Permanently delete this empty auth user." : user.deleteDisabledReason || "Only empty non-admin users can be deleted."}
                    onClick={() => beginUserAction(user, "delete_empty_user", {}, { confirm: true, title: "Delete Empty User" })}
                  >
                    Delete Empty User
                  </button>
                </div>
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
              <h2>Records</h2>
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
            {filteredRecords.map((record) => (
              <div className="admin-row" key={record.id}>
                <div>
                  <strong>{record.qrCode} - {record.title}</strong>
                  <span>{record.verificationStatus} - {record.authenticityStatus}</span>
                  <small>Verification badge {record.showVerificationBadge === false ? "hidden" : "visible"} - Authenticity badge {record.showAuthenticityBadge === false ? "hidden" : "visible"}</small>
                </div>
                <div className="admin-row-actions">
                  <Link href={`/edit/${record.qrCode}`}>Full Editor</Link>
                  <button type="button" disabled={busy === `set_verification:${record.id}`} onClick={() => void updateRecord(record, "set_verification", { verificationStatus: record.verificationStatus === "Verified" ? "unverified" : "verified" })}>
                    {record.verificationStatus === "Verified" ? "Set Unverified" : "Set Verified"}
                  </button>
                  <button type="button" disabled={busy === `set_authenticity:${record.id}`} onClick={() => void updateRecord(record, "set_authenticity", { authenticityStatus: record.authenticityStatus === "Authenticity Confirmed" ? "unconfirmed" : "confirmed" })}>
                    {record.authenticityStatus === "Authenticity Confirmed" ? "Set Unconfirmed" : "Set Confirmed"}
                  </button>
                  <button type="button" disabled={busy === `set_trust_badge_visibility:${record.id}`} onClick={() => void updateRecord(record, "set_trust_badge_visibility", { showVerificationBadge: record.showVerificationBadge === false })}>
                    {record.showVerificationBadge === false ? "Show Verified Badge" : "Hide Verified Badge"}
                  </button>
                  <button type="button" disabled={busy === `set_trust_badge_visibility:${record.id}`} onClick={() => void updateRecord(record, "set_trust_badge_visibility", { showAuthenticityBadge: record.showAuthenticityBadge === false })}>
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
            ))}
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
            {filteredRecords.map((record) => (
              <div className="admin-row" key={record.id}>
                <div>
                  <strong>{record.qrCode} - {record.title}</strong>
                  <span>{safetyLabel(record.safetyStatus)} - {record.visibility}</span>
                  <small>{record.publicSafetyNote || "No public safety note."}</small>
                </div>
                <div className="admin-row-actions">
                  <Link href={`/edit/${record.qrCode}`}>Full Editor</Link>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => void updateRecord(record, "set_safety", { safetyStatus: "clear" })}>No Alert</button>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => void updateRecord(record, "set_safety", { safetyStatus: "lost", publicSafetyNote: "This instrument has been reported lost." })}>Lost</button>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => void updateRecord(record, "set_safety", { safetyStatus: "stolen", publicSafetyNote: "This instrument has been reported stolen." })}>Stolen</button>
                  <button type="button" disabled={busy === `set_safety:${record.id}`} onClick={() => void updateRecord(record, "set_safety", { safetyStatus: "recovered" })}>Recovered</button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: record.safetyStatus || "clear" }, { includeSafetyNotes: true, title: "Edit Safety Notes" })}>Edit Notes</button>
                </div>
              </div>
            ))}
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
                    <strong>{transfer.recordTitle || "QRguitar record"}</strong>
                    <span className="admin-user-summary">
                      <span className={`admin-chip admin-chip--transfer-${normalize(transfer.status)}`}>{transfer.status || "unknown"}</span>
                      <span>{transfer.recordCode || transfer.guitar_id}</span>
                      <span>{transfer.recordVisibility || "no public page"}</span>
                    </span>
                    <small>From {transfer.fromOwnerEmail || "unknown owner"} - To {transfer.to_email || transfer.acceptedByEmail || "not listed"}</small>
                    <small>Created {formatDate(transfer.created_at)} - Accepted {formatDate(transfer.accepted_at)}</small>
                    {transfer.status === "sent" && transfer.claimPath ? <small>Claim link is active until the transfer is accepted or cancelled.</small> : null}
                  </div>
                  <div className="admin-row-actions">
                    {transfer.recordCode ? <Link href={`/edit/${transfer.recordCode}`}>Edit Record</Link> : null}
                    {hasPublicPage ? (
                      <Link href={`/i/${transfer.recordCode}`}>Open Public Page</Link>
                    ) : (
                      <button type="button" disabled title="Private, archived, or removed transfer records do not have an active public page.">No public page</button>
                    )}
                    {transfer.fromOwnerEmail ? (
                      <button type="button" onClick={() => { setAdminSearch(transfer.fromOwnerEmail || ""); goToSection("users"); }}>View From User</button>
                    ) : null}
                    {transfer.acceptedByEmail ? (
                      <button type="button" onClick={() => { setAdminSearch(transfer.acceptedByEmail || ""); goToSection("users"); }}>View Recipient</button>
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

    if (activeSection === "proof") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-section-head">
            <div>
              <h2>Proof Vault</h2>
              <p>Document metadata only. Raw private storage paths are never shown.</p>
            </div>
          </div>
          {filterControls("audit")}
          <div className="admin-table">
            {filteredProof.length ? filteredProof.map((document) => (
              <div className="admin-row" key={document.id}>
                <div>
                  <strong>{document.name || "Document"}</strong>
                  <span>{document.document_type || "Proof"} - {document.is_public ? "Public" : "Private"} - {document.recordCode || document.guitar_id}</span>
                  <small>Owner {document.ownerEmail || "No email"} - {fileSizeLabel(document.file_size)} - Created {formatDate(document.created_at)}</small>
                </div>
                <div className="admin-row-actions">
                  {document.recordCode ? <Link href={`/edit/${document.recordCode}`}>Open Editor</Link> : null}
                  {document.is_public && document.recordCode ? <Link href={`/i/${document.recordCode}`}>Open Profile</Link> : null}
                </div>
              </div>
            )) : <p className="admin-empty">No proof documents match this view.</p>}
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
          {filterControls("audit")}
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
              disabled={!accessTarget || accessTarget.role === "admin"}
              onClick={() => accessTarget ? beginUserAction(accessTarget, "change_role", { role: "admin" }, { title: "Add Admin" }) : undefined}
            >
              Add Admin
            </button>
            <button
              type="button"
              disabled={!accessTarget || accessTarget.role !== "admin" || accessTarget.envManaged === true}
              onClick={() => accessTarget ? beginUserAction(accessTarget, "change_role", { role: "user" }, { title: "Remove Admin" }) : undefined}
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
                  <button type="button" disabled={user.envManaged === true} onClick={() => beginUserAction(user, "change_role", { role: "user" }, { title: "Remove Admin" })}>
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

    return (
      <section className="card admin-panel-card">
        <div className="admin-section-head">
          <div>
            <h2>Audit Log</h2>
            <p>Human-readable admin action history. Metadata is summarized behind details controls.</p>
          </div>
        </div>
        {filterControls("audit")}
        <div className="admin-table">
          {filteredAudit.length ? filteredAudit.map((event) => (
            <div className="admin-row" key={event.id}>
              <div>
                <strong>{actionLabel(event.action)}</strong>
                <span>{event.actor_email || "System"} - {event.target_type || "target"} {event.target_id || ""}</span>
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

  return (
    <>
      <Nav />
      <main className="section admin-page">
        <div className="shell">
          <div className="admin-hero">
            <div>
              <div className="eyebrow">Owner admin</div>
              <h1>QRguitar admin panel.</h1>
              <p>Manage users, records, trust controls, safety alerts, transfers, proof documents, service history, site settings, and audit events.</p>
            </div>
            {adminAuthorized ? <Link className="button secondary" href="/admin/site-editor">Site Editor</Link> : null}
          </div>
          {!adminAuthorized ? (
            <section className="card admin-panel-card admin-login-card">
              <div className="eyebrow">Admin access</div>
              <h2>{loading ? "Checking admin access." : "Sign in with an authorized admin account."}</h2>
              <p>{loading ? "Confirming your session before admin tools load." : "Owner tools stay hidden until an authorized admin account is signed in."}</p>
              <Link className="button" href={`/login?next=${encodeURIComponent("/admin")}`}>
                Sign in
              </Link>
            </section>
          ) : (
            <>
              {message ? <div className="admin-message">{message}</div> : null}
              <div className="admin-tabs" role="tablist" aria-label="Admin sections">
                {sections.map((section) => (
                  <button type="button" className={section.id === activeSection ? "active" : ""} onClick={() => goToSection(section.id)} key={section.id}>
                    {section.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {pendingAction ? (
            <div className="admin-modal-backdrop" role="presentation">
              <section className="card admin-modal" role="dialog" aria-modal="true" aria-label={pendingAction.title}>
                <div className="admin-section-head">
                  <div>
                    <div className="eyebrow">Confirm admin action</div>
                    <h2>{pendingAction.title}</h2>
                    <p>{pendingAction.target}</p>
                  </div>
                  <button type="button" className="button secondary" onClick={() => setPendingAction(null)}>
                    Cancel
                  </button>
                </div>
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
                  <button className="button" type="button" onClick={() => void confirmPendingAction()}>
                    Confirm
                  </button>
                  <button className="button secondary" type="button" onClick={() => setPendingAction(null)}>
                    Cancel
                  </button>
                </div>
              </section>
            </div>
          ) : null}
          {adminAuthorized ? content : null}
        </div>
      </main>
      <Footer />
    </>
  );
}

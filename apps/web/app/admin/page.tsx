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
  hidePublicContent: boolean;
  adminNotes: string;
  recordCount: number;
  publicRecordCount: number;
  privateRecordCount: number;
  proofDocumentCount: number;
  serviceEventCount: number;
  transferCount: number;
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
  fromOwnerEmail?: string;
  acceptedByEmail?: string;
  to_email?: string;
  status: string;
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
  | "site-editor"
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
  { id: "site-editor", label: "Site Editor" },
  { id: "access", label: "Admin Access" },
  { id: "audit", label: "Audit Log" }
];

const overviewLinks: Record<string, { section: SectionId; filter?: string }> = {
  totalUsers: { section: "users" },
  activeUsers: { section: "users", filter: "active" },
  lockedUsers: { section: "users", filter: "locked" },
  bannedUsers: { section: "users", filter: "banned" },
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

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    lock: "Account locked",
    unlock: "Account unlocked",
    ban: "User access removed",
    unban: "User access restored",
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
    record_removed_from_collection: "Record removed from collection",
    record_restored_to_collection: "Record restored to collection"
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
    setMessage(overviewJson.message || usersJson.message || recordsJson.message || auditJson.message || overviewJson.migrationNotice || usersJson.migrationNotice || "");
    setLoading(false);
  }, [tokenPromise]);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  function beginUserAction(user: AdminUser, action: string, extra: Record<string, unknown> = {}, options: { includeNote?: boolean; title?: string } = {}) {
    const needsReason = ["lock", "unlock", "ban", "unban", "hide_public_content", "restore_public_content", "change_role", "admin_note"].includes(action);
    if (!needsReason) {
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
      body: JSON.stringify({ action, reason: reason || action, ...extra })
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message || (response.ok ? "Admin action saved." : "Admin action failed."));
    setBusy("");
    if (response.ok) {
      await loadAdmin();
    }
  }

  function beginRecordAction(record: AdminRecord, action: string, extra: Record<string, unknown> = {}, options: { includeTrustNotes?: boolean; includeSafetyNotes?: boolean; title?: string } = {}) {
    const needsReason = ["archive", "restore_archive", "restore_to_collection", "set_visibility", "set_verification", "set_safety", "set_authenticity", "set_trust_badge_visibility"].includes(action);
    if (!needsReason) {
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
      body: JSON.stringify({ action, reason: reason || action, ...extra })
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message || (response.ok ? "Record action saved." : "Record action failed."));
    setBusy("");
    if (response.ok) {
      await loadAdmin();
    }
  }

  function beginTransferAction(transfer: AdminTransfer, action: "cancel") {
    setPendingAction({
      kind: "transfer",
      transfer,
      action,
      title: "Cancel Transfer",
      target: `${transfer.recordCode || transfer.guitar_id} - ${transfer.to_email || "recipient not listed"}`,
      reason: ""
    });
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

  async function confirmPendingAction() {
    if (!pendingAction) {
      return;
    }

    const reason = pendingAction.reason.trim();
    if (!reason) {
      setMessage("A reason is required before this admin action can run.");
      return;
    }

    if (pendingAction.kind === "user") {
      await updateUser(
        pendingAction.user,
        pendingAction.action,
        pendingAction.includeNote ? { ...pendingAction.extra, adminNotes: pendingAction.note || "" } : pendingAction.extra,
        reason
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
        reason
      );
    } else {
      await updateTransfer(pendingAction.transfer, pendingAction.action, reason);
    }

    setPendingAction(null);
  }

  const filteredUsers = useMemo(() => {
    const search = normalize(adminSearch);
    let list = users.filter((user) => {
      const matchesSearch = !search || normalize(`${user.email} ${user.id}`).includes(search);
      const matchesFilter =
        !userFilter ||
        (userFilter === "inactive" ? !user.lastSignInAt : userFilter === "admin" ? user.role === "admin" : user.accountStatus === userFilter);
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
            <option value="inactive">Inactive</option>
            <option value="locked">Locked</option>
            <option value="banned">Removed</option>
            <option value="admin">Admins</option>
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
            <option value="title">Title</option>
            <option value="owner">Owner</option>
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
                {record.isOwnerRemoved ? " - Owner removed" : ""}
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
              <Link href={record.permanentPath}>Open</Link>
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
                <button type="button" disabled={busy === `archive:${record.id}`} onClick={() => beginRecordAction(record, "archive", {}, { title: "Archive Record" })}>Archive</button>
              )}
              {record.isOwnerRemoved ? (
                <button type="button" disabled={busy === `restore_to_collection:${record.id}`} onClick={() => beginRecordAction(record, "restore_to_collection", {}, { title: "Restore to Collection" })}>Restore to Collection</button>
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
        { label: "Locked/removed accounts", value: (counts.lockedUsers || 0) + (counts.bannedUsers || 0), section: "users" as SectionId, filter: "locked" }
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
                  <span>{user.role} - {user.accountStatus} - {user.recordCount} records ({user.publicRecordCount} public / {user.privateRecordCount} private)</span>
                  <small>Created {formatDate(user.createdAt)} - Last sign-in {formatDate(user.lastSignInAt)} - Proof {user.proofDocumentCount} - Service {user.serviceEventCount} - Transfers {user.transferCount}</small>
                  {user.hidePublicContent ? <small>Public content hidden by admin.</small> : null}
                  {user.adminNotes ? <small>Admin note saved.</small> : null}
                </div>
                <div className="admin-row-actions">
                  <button type="button" disabled={busy === `lock:${user.id}`} onClick={() => beginUserAction(user, "lock", {}, { title: "Lock Account" })}>Lock</button>
                  <button type="button" disabled={busy === `unlock:${user.id}`} onClick={() => beginUserAction(user, "unlock", {}, { title: "Unlock Account" })}>Unlock</button>
                  <button type="button" disabled={busy === `ban:${user.id}`} onClick={() => beginUserAction(user, "ban", {}, { title: "Remove Access" })}>Remove Access</button>
                  <button type="button" disabled={busy === `unban:${user.id}`} onClick={() => beginUserAction(user, "unban", {}, { title: "Restore Access" })}>Restore Access</button>
                  <button type="button" onClick={() => beginUserAction(user, user.hidePublicContent ? "restore_public_content" : "hide_public_content", {}, { title: user.hidePublicContent ? "Restore Public Content" : "Hide Public Content" })}>
                    {user.hidePublicContent ? "Restore Public" : "Hide Public"}
                  </button>
                  <button type="button" onClick={() => beginUserAction(user, "change_role", { role: user.role === "admin" ? "owner" : "admin" }, { title: user.role === "admin" ? "Remove Admin" : "Add Admin" })}>
                    {user.role === "admin" ? "Remove Admin" : "Add Admin"}
                  </button>
                  <button type="button" onClick={() => beginUserAction(user, "admin_note", {}, { includeNote: true, title: "Save Admin Note" })}>Note</button>
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
              <p>Open, edit, archive, restore, and filter QRguitar records without changing permanent QR URLs.</p>
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
                  <button type="button" onClick={() => beginRecordAction(record, "set_verification", { verificationStatus: record.verificationStatus === "Verified" ? "unverified" : "verified" }, { includeTrustNotes: true })}>
                    {record.verificationStatus === "Verified" ? "Set Unverified" : "Set Verified"}
                  </button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_authenticity", { authenticityStatus: record.authenticityStatus === "Authenticity Confirmed" ? "unconfirmed" : "confirmed" }, { includeTrustNotes: true })}>
                    {record.authenticityStatus === "Authenticity Confirmed" ? "Set Unconfirmed" : "Set Confirmed"}
                  </button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_trust_badge_visibility", { showVerificationBadge: record.showVerificationBadge === false }, { includeTrustNotes: true, title: "Update Verification Badge Visibility" })}>
                    {record.showVerificationBadge === false ? "Show Verified Badge" : "Hide Verified Badge"}
                  </button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_trust_badge_visibility", { showAuthenticityBadge: record.showAuthenticityBadge === false }, { includeTrustNotes: true, title: "Update Authenticity Badge Visibility" })}>
                    {record.showAuthenticityBadge === false ? "Show Auth Badge" : "Hide Auth Badge"}
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
                  <button type="button" onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "clear" }, { includeSafetyNotes: true })}>No Alert</button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "lost", publicSafetyNote: "This instrument has been reported lost." }, { includeSafetyNotes: true })}>Lost</button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "stolen", publicSafetyNote: "This instrument has been reported stolen." }, { includeSafetyNotes: true })}>Stolen</button>
                  <button type="button" onClick={() => beginRecordAction(record, "set_safety", { safetyStatus: "recovered" }, { includeSafetyNotes: true })}>Recovered</button>
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
              <p>Read-only transfer summary. Claim links cannot be reconstructed here.</p>
            </div>
          </div>
          {filterControls("transfers")}
          <div className="admin-table">
            {filteredTransfers.length ? filteredTransfers.map((transfer) => (
              <div className="admin-row" key={transfer.id}>
                <div>
                  <strong>{transfer.status} - {transfer.recordCode || transfer.guitar_id}</strong>
                  <span>{transfer.recordTitle || "Record"} - From {transfer.fromOwnerEmail || "unknown"} - To {transfer.to_email || transfer.acceptedByEmail || "not listed"}</span>
                  <small>Created {formatDate(transfer.created_at)} - Accepted {formatDate(transfer.accepted_at)}</small>
                  <small>Claim link cannot be reconstructed. Create a new transfer from record owner tools.</small>
                </div>
                <div className="admin-row-actions">
                  {transfer.recordCode ? <Link href={`/i/${transfer.recordCode}`}>Open Record</Link> : null}
                  {transfer.recordCode ? <Link href={`/edit/${transfer.recordCode}`}>Edit Record</Link> : null}
                  {transfer.status === "sent" ? (
                    <button type="button" disabled={busy === `cancel:${transfer.id}`} onClick={() => beginTransferAction(transfer, "cancel")}>
                      Cancel Transfer
                    </button>
                  ) : null}
                </div>
              </div>
            )) : <p className="admin-empty">No transfers match this view.</p>}
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
                  {document.is_public && document.recordCode ? <Link href={`/i/${document.recordCode}`}>Public Record</Link> : null}
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
                  {event.is_public && event.recordCode ? <Link href={`/i/${event.recordCode}`}>Public Record</Link> : null}
                </div>
              </div>
            )) : <p className="admin-empty">No service entries match this view.</p>}
          </div>
        </section>
      );
    }

    if (activeSection === "site-editor") {
      return (
        <section className="card admin-panel-card">
          <h2>Site editor</h2>
          <p>Open the published site editor for homepage copy, footer text, beta language, SEO settings, and theme controls.</p>
          <Link className="button" href="/admin/site-editor">Open Site Editor</Link>
        </section>
      );
    }

    if (activeSection === "access") {
      const accessTarget = users.find((user) => normalize(user.email) === normalize(adminSearch));
      const dbAdmins = users.filter((user) => user.role === "admin");
      return (
        <section className="card admin-panel-card">
          <h2>Admin access</h2>
          <p>Signed in as {overview?.admin?.email || "authorized admin"}.</p>
          <p>Role: {overview?.admin?.role || "Not listed"} - Source: {overview?.admin?.accessSource || "unknown"} - Status: {overview?.admin?.accountStatus || "active"}</p>
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
              disabled={!accessTarget || accessTarget.role !== "admin"}
              onClick={() => accessTarget ? beginUserAction(accessTarget, "change_role", { role: "owner" }, { title: "Remove Admin" }) : undefined}
            >
              Remove Admin
            </button>
          </div>
          <div className="admin-table">
            {dbAdmins.length ? dbAdmins.map((user) => (
              <div className="admin-row" key={user.id}>
                <div>
                  <strong>{user.email}</strong>
                  <span>Database admin - {user.accountStatus}</span>
                </div>
                <div className="admin-row-actions">
                  <button type="button" onClick={() => beginUserAction(user, "change_role", { role: "owner" }, { title: "Remove Admin" })}>
                    Remove Admin
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
            <Link className="button secondary" href="/admin/site-editor">Site Editor</Link>
          </div>
          {message ? <div className="admin-message">{message}</div> : null}
          <div className="admin-tabs" role="tablist" aria-label="Admin sections">
            {sections.map((section) => (
              <button type="button" className={section.id === activeSection ? "active" : ""} onClick={() => goToSection(section.id)} key={section.id}>
                {section.label}
              </button>
            ))}
          </div>
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
                <label>
                  Reason
                  <textarea
                    value={pendingAction.reason}
                    onChange={(event) => setPendingAction({ ...pendingAction, reason: event.target.value })}
                    placeholder="Required for the audit log"
                    rows={3}
                  />
                </label>
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
          {content}
        </div>
      </main>
      <Footer />
    </>
  );
}

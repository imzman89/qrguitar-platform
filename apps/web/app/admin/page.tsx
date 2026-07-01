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
    safety_status_updated: "Safety status updated"
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

  async function updateUser(user: AdminUser, action: string, extra: Record<string, unknown> = {}) {
    const token = await tokenPromise;
    if (!token) {
      setMessage("Sign in required.");
      return;
    }

    const needsReason = ["lock", "ban", "hide_public_content", "change_role"].includes(action);
    const reason = needsReason ? window.prompt("Reason for audit log:") : "";
    if (needsReason && !reason) {
      setMessage("Action cancelled. A reason is required.");
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

  async function updateRecord(record: AdminRecord, action: string, extra: Record<string, unknown> = {}) {
    const token = await tokenPromise;
    if (!token) {
      setMessage("Sign in required.");
      return;
    }

    const reason = ["archive", "restore_public", "set_visibility", "set_verification", "set_safety", "set_authenticity"].includes(action)
      ? window.prompt("Reason for audit log:")
      : "";
    if (!reason && action !== "set_trust_badge_visibility") {
      setMessage("Action cancelled. A reason is required.");
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
      if (!recordFilter) return true;
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
            <option value="">All records</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
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
              <span>{[record.brand, record.model, record.serialNumber].filter(Boolean).join(" / ") || "Instrument"} - {record.visibility}</span>
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
              <button type="button" disabled={busy === `archive:${record.id}`} onClick={() => updateRecord(record, "archive")}>Archive</button>
              <button type="button" disabled={busy === `restore_public:${record.id}`} onClick={() => updateRecord(record, "restore_public")}>Restore public</button>
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
                  <button type="button" disabled={busy === `lock:${user.id}`} onClick={() => updateUser(user, "lock")}>Lock</button>
                  <button type="button" disabled={busy === `unlock:${user.id}`} onClick={() => updateUser(user, "unlock")}>Unlock</button>
                  <button type="button" disabled={busy === `ban:${user.id}`} onClick={() => updateUser(user, "ban")}>Remove Access</button>
                  <button type="button" disabled={busy === `unban:${user.id}`} onClick={() => updateUser(user, "unban")}>Restore Access</button>
                  <button type="button" onClick={() => updateUser(user, user.hidePublicContent ? "restore_public_content" : "hide_public_content")}>
                    {user.hidePublicContent ? "Restore Public" : "Hide Public"}
                  </button>
                  <button type="button" onClick={() => updateUser(user, "change_role", { role: user.role === "admin" ? "owner" : "admin" })}>
                    {user.role === "admin" ? "Remove Admin" : "Add Admin"}
                  </button>
                  <button type="button" onClick={() => {
                    const note = window.prompt("Internal admin note:", user.adminNotes || "");
                    if (note !== null) updateUser(user, "admin_note", { adminNotes: note });
                  }}>Note</button>
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
                  <button type="button" onClick={() => updateRecord(record, "set_verification", { verificationStatus: record.verificationStatus === "Verified" ? "unverified" : "verified" })}>
                    {record.verificationStatus === "Verified" ? "Set Unverified" : "Set Verified"}
                  </button>
                  <button type="button" onClick={() => updateRecord(record, "set_authenticity", { authenticityStatus: record.authenticityStatus === "Authenticity Confirmed" ? "unconfirmed" : "confirmed" })}>
                    {record.authenticityStatus === "Authenticity Confirmed" ? "Set Unconfirmed" : "Set Confirmed"}
                  </button>
                  <button type="button" onClick={() => updateRecord(record, "set_trust_badge_visibility", { showVerificationBadge: record.showVerificationBadge === false })}>
                    {record.showVerificationBadge === false ? "Show Verified Badge" : "Hide Verified Badge"}
                  </button>
                  <button type="button" onClick={() => updateRecord(record, "set_trust_badge_visibility", { showAuthenticityBadge: record.showAuthenticityBadge === false })}>
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
                  <button type="button" onClick={() => updateRecord(record, "set_safety", { safetyStatus: "clear" })}>No Alert</button>
                  <button type="button" onClick={() => updateRecord(record, "set_safety", { safetyStatus: "lost", publicSafetyNote: "This instrument has been reported lost." })}>Lost</button>
                  <button type="button" onClick={() => updateRecord(record, "set_safety", { safetyStatus: "stolen", publicSafetyNote: "This instrument has been reported stolen." })}>Stolen</button>
                  <button type="button" onClick={() => updateRecord(record, "set_safety", { safetyStatus: "recovered" })}>Recovered</button>
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
      return (
        <section className="card admin-panel-card">
          <h2>Admin access</h2>
          <p>Signed in as {overview?.admin?.email || "authorized admin"}.</p>
          <p>Role: {overview?.admin?.role || "Not listed"} - Source: {overview?.admin?.accessSource || "unknown"} - Status: {overview?.admin?.accountStatus || "active"}</p>
          <p>Admin access is controlled by profile role or server environment allowlists. Environment-managed access cannot be removed from this UI.</p>
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
          {content}
        </div>
      </main>
      <Footer />
    </>
  );
}

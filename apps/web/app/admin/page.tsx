"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  ownerId: string;
  ownerEmail: string;
  visibility: string;
  verificationStatus: string;
  authenticityStatus: string;
  safetyStatus: string;
  serviceEventCount: number;
  proofDocumentCount: number;
  transferCount: number;
  createdAt: string;
};

type RecordsPayload = {
  ok?: boolean;
  message?: string;
  records?: AdminRecord[];
  proofDocuments?: Array<{ id: string; guitar_id: string; is_public: boolean; document_type?: string; created_at?: string }>;
  serviceEvents?: Array<{ id: string; guitar_id: string; is_public: boolean; event_type?: string; title?: string; created_at?: string }>;
  transfers?: Array<{ id: string; guitar_id: string; status: string; created_at?: string; accepted_at?: string }>;
};

type AuditEvent = {
  id: string;
  actor_email?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  reason?: string;
  created_at: string;
};

const tabs = [
  "Overview",
  "Users",
  "Records",
  "Trust",
  "Safety",
  "Transfers",
  "Proof Vault",
  "Service History",
  "Site Editor",
  "Admin Access",
  "Audit Log"
];

function formatDate(value?: string) {
  if (!value) {
    return "Never";
  }
  return new Date(value).toLocaleString();
}

function statLabel(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [records, setRecords] = useState<RecordsPayload | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const tokenPromise = useMemo(() => getSupabaseAccessToken(), []);

  useEffect(() => {
    let cancelled = false;
    async function loadAdmin() {
      setLoading(true);
      setMessage("");
      const token = await tokenPromise;
      if (!token) {
        if (!cancelled) {
          setMessage("Sign in with an authorized admin account.");
          setLoading(false);
        }
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };
      const [overviewResponse, usersResponse, recordsResponse, auditResponse] = await Promise.all([
        fetch("/api/admin/overview", { headers, cache: "no-store" }),
        fetch(`/api/admin/users?search=${encodeURIComponent(search)}&status=${encodeURIComponent(statusFilter)}`, { headers, cache: "no-store" }),
        fetch("/api/admin/records", { headers, cache: "no-store" }),
        fetch("/api/admin/audit", { headers, cache: "no-store" })
      ]);

      const [overviewJson, usersJson, recordsJson, auditJson] = await Promise.all([
        overviewResponse.json().catch(() => ({})),
        usersResponse.json().catch(() => ({})),
        recordsResponse.json().catch(() => ({})),
        auditResponse.json().catch(() => ({}))
      ]);

      if (!cancelled) {
        setOverview(overviewJson);
        setUsers(usersJson.users || []);
        setRecords(recordsJson);
        setAuditEvents(auditJson.auditEvents || []);
        setMessage(overviewJson.message || usersJson.message || recordsJson.message || auditJson.message || overviewJson.migrationNotice || usersJson.migrationNotice || "");
        setLoading(false);
      }
    }

    loadAdmin();
    return () => {
      cancelled = true;
    };
  }, [search, statusFilter, tokenPromise]);

  async function updateUser(userId: string, action: string, reason = "") {
    const token = await tokenPromise;
    if (!token) {
      setMessage("Sign in required.");
      return;
    }

    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, reason: reason || action })
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message || (response.ok ? "Admin action saved." : "Admin action failed."));
    if (response.ok) {
      const refreshed = await fetch(`/api/admin/users?search=${encodeURIComponent(search)}&status=${encodeURIComponent(statusFilter)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const refreshedPayload = await refreshed.json().catch(() => ({}));
      setUsers(refreshedPayload.users || []);
    }
  }

  const content = (() => {
    if (loading) {
      return <section className="card admin-panel-card"><h2>Loading admin panel.</h2><p>Checking account access and platform records.</p></section>;
    }

    if (overview?.ok === false && overview.message) {
      return (
        <section className="card admin-panel-card">
          <div className="eyebrow">Admin access</div>
          <h2>{overview.message}</h2>
          <Link className="button" href="/login?next=%2Fadmin">Sign in</Link>
        </section>
      );
    }

    if (activeTab === "Overview") {
      const counts = overview?.counts || {};
      return (
        <section className="admin-grid">
          {Object.entries(counts).map(([key, value]) => (
            <div className="card admin-stat-card" key={key}>
              <span>{statLabel(key)}</span>
              <strong>{value === null ? "Needs setup" : value}</strong>
            </div>
          ))}
        </section>
      );
    }

    if (activeTab === "Users") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-filter-row">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email or user ID" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All users</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="locked">Locked</option>
              <option value="banned">Banned</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="admin-table">
            {users.map((user) => (
              <div className="admin-row" key={user.id}>
                <div>
                  <strong>{user.email || user.id}</strong>
                  <span>{user.role} · {user.accountStatus} · {user.recordCount} records</span>
                  <small>Created {formatDate(user.createdAt)} · Last sign-in {formatDate(user.lastSignInAt)}</small>
                </div>
                <div className="admin-row-actions">
                  <button type="button" onClick={() => updateUser(user.id, "lock", "Admin account lock")}>Lock</button>
                  <button type="button" onClick={() => updateUser(user.id, "unlock")}>Unlock</button>
                  <button type="button" onClick={() => updateUser(user.id, "ban", "Admin account ban")}>Ban</button>
                  <button type="button" onClick={() => updateUser(user.id, "unban")}>Unban</button>
                  <button type="button" onClick={() => updateUser(user.id, user.hidePublicContent ? "restore_public_content" : "hide_public_content")}>
                    {user.hidePublicContent ? "Restore public" : "Hide public"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (activeTab === "Records" || activeTab === "Trust" || activeTab === "Safety") {
      return (
        <section className="card admin-panel-card">
          <div className="admin-table">
            {(records?.records || []).map((record) => (
              <div className="admin-row" key={record.id}>
                <div>
                  <strong>{record.qrCode} · {record.title}</strong>
                  <span>{record.brand} {record.model} · {record.visibility} · {record.verificationStatus} · {record.authenticityStatus}</span>
                  <small>Safety: {record.safetyStatus} · Proof: {record.proofDocumentCount} · Service: {record.serviceEventCount} · Owner: {record.ownerEmail || "No email"}</small>
                </div>
                <div className="admin-row-actions">
                  <Link href={record.permanentPath}>Open</Link>
                  <Link href={`/edit/${record.qrCode}`}>Edit</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (activeTab === "Transfers") {
      return (
        <section className="card admin-panel-card">
          {(records?.transfers || []).map((transfer) => (
            <div className="admin-row" key={transfer.id}>
              <div>
                <strong>{transfer.status}</strong>
                <span>Record ID {transfer.guitar_id}</span>
                <small>Created {formatDate(transfer.created_at)}</small>
              </div>
            </div>
          ))}
        </section>
      );
    }

    if (activeTab === "Proof Vault") {
      return (
        <section className="card admin-panel-card">
          {(records?.proofDocuments || []).map((document) => (
            <div className="admin-row" key={document.id}>
              <div>
                <strong>{document.document_type || "Document"}</strong>
                <span>{document.is_public ? "Public" : "Private"} · Record ID {document.guitar_id}</span>
                <small>Created {formatDate(document.created_at)}</small>
              </div>
            </div>
          ))}
        </section>
      );
    }

    if (activeTab === "Service History") {
      return (
        <section className="card admin-panel-card">
          {(records?.serviceEvents || []).map((event) => (
            <div className="admin-row" key={event.id}>
              <div>
                <strong>{event.title || "Service entry"}</strong>
                <span>{event.event_type || "Service"} · {event.is_public ? "Public" : "Private"} · Record ID {event.guitar_id}</span>
                <small>Created {formatDate(event.created_at)}</small>
              </div>
            </div>
          ))}
        </section>
      );
    }

    if (activeTab === "Site Editor") {
      return (
        <section className="card admin-panel-card">
          <h2>Site editor</h2>
          <p>Open the existing owner editor with the same draft and global publishing behavior.</p>
          <Link className="button" href="/admin/site-editor">Open Site Editor</Link>
        </section>
      );
    }

    if (activeTab === "Admin Access") {
      return (
        <section className="card admin-panel-card">
          <h2>Admin access</h2>
          <p>Signed in as {overview?.admin?.email || "authorized admin"}.</p>
          <p>Role: {overview?.admin?.role || "Not listed"} · Source: {overview?.admin?.accessSource || "unknown"} · Status: {overview?.admin?.accountStatus || "active"}</p>
          <p>Admin access comes from profile role or server environment allowlists. Passwords and tokens are never shown here.</p>
        </section>
      );
    }

    return (
      <section className="card admin-panel-card">
        {(auditEvents || []).map((event) => (
          <div className="admin-row" key={event.id}>
            <div>
              <strong>{event.action}</strong>
              <span>{event.target_type || "target"} {event.target_id || ""}</span>
              <small>{formatDate(event.created_at)} · {event.reason || "No reason listed"}</small>
            </div>
          </div>
        ))}
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
              <p>Manage records, users, trust controls, safety status, transfers, proof documents, service history, site settings, and audit events.</p>
            </div>
            <Link className="button secondary" href="/admin/site-editor">Site Editor</Link>
          </div>
          {message ? <div className="admin-message">{message}</div> : null}
          <div className="admin-tabs" role="tablist" aria-label="Admin sections">
            {tabs.map((tab) => (
              <button type="button" className={tab === activeTab ? "active" : ""} onClick={() => setActiveTab(tab)} key={tab}>
                {tab}
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

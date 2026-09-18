import { cleanServiceEvidenceRevision, parseServiceEvidenceUploadDiscovery, parseServiceEvidenceUploadReceipt, serviceEvidenceFilename, serviceEvidenceStoragePath, validServiceEvidenceSignedUploadUrl } from "./service-evidence-upload";

/** Browser orchestration only; the service APIs remain the permission authority. */
export type ProviderForm = { businessName: string; publicDisplayName: string; website: string; location: string; serviceCategories: string[] };
export type ServiceForm = { serviceDate: string; serviceType: string; workOrderReference: string; title: string; workPerformed: string; partsInstalled: string; setupMeasurements: string; recommendedPublicDescription: string; privateProviderNote: string; requestedVisibility: string };
export type ServiceStatus = "draft" | "submitted" | "changes_requested" | "approved" | "declined" | "cancelled" | "expired";
export type WorkSubmission = ServiceForm & { id: string; qrCode: string; profileTitle: string; provider: { userId: string }; status: ServiceStatus; ownerReviewNote: string; evidenceCount: number; emailDeliveryStatus: string; emailDeliveryMessage: string };
export type WorkEvidence = { id: string; type: string; fileName: string; mimeType: string; fileSizeBytes: number; createdAt: string; previewUrl: string };
export type WorkSession = { access_token: string; user: { id: string } } | null;
export type WorkbenchAuth = {
  getSession(): Promise<{ data: { session: WorkSession }; error?: unknown }>;
  onAuthStateChange(callback: (event: string, session: WorkSession) => void): { data: { subscription: { unsubscribe(): void } } };
};
export type EvidenceRecoveryAttempt = { uploadId: string; expectedRevision: string | null; fileName: string; evidenceType: string; mimeType: string; size: number; storagePath: string; bytes: "uploaded" | "missing" | "mismatch" | "unknown"; canFinish: boolean; canDiscard: boolean };
export type EvidenceRecovery = { phase: "unchecked" | "checking" | "confirmed" | "error"; revision: string | null; attempt: EvidenceRecoveryAttempt | null; pendingCount: number; canPrepare: boolean; error: string };
export const emptyEvidenceRecovery = (): EvidenceRecovery => ({ phase: "unchecked", revision: null, attempt: null, pendingCount: 0, canPrepare: false, error: "" });
export type WorkbenchState = { phase: "loading" | "signed-out" | "error" | "ready"; actorId: string; provider: ProviderForm; form: ServiceForm; submission: WorkSubmission | null; busy: string; message: string; duplicateId: string; uncertain: "" | "create" | "change"; evidence: WorkEvidence[] | null; evidenceLoading: boolean; evidenceError: string; evidenceRecovery: EvidenceRecovery };
export const emptyProvider = (): ProviderForm => ({ businessName: "", publicDisplayName: "", website: "", location: "", serviceCategories: [] });
export const emptyServiceForm = (): ServiceForm => ({ serviceDate: "", serviceType: "Setup", workOrderReference: "", title: "", workPerformed: "", partsInstalled: "", setupMeasurements: "", recommendedPublicDescription: "", privateProviderNote: "", requestedVisibility: "private" });
export const initialWorkbenchState = (): WorkbenchState => ({ phase: "loading", actorId: "", provider: emptyProvider(), form: emptyServiceForm(), submission: null, busy: "", message: "", duplicateId: "", uncertain: "", evidence: null, evidenceLoading: false, evidenceError: "", evidenceRecovery: emptyEvidenceRecovery() });
export function readEvidenceRevision(value: unknown): string {
  const result = cleanServiceEvidenceRevision(value);
  if (result === null) throw new Error("The upload revision could not be confirmed. Check upload status before making changes.");
  return result;
}
const olderRevision = (value: string, previous: string) => value.length < previous.length || (value.length === previous.length && value < previous);
export function serviceResumePath(qrCode: string, id = "") { return `/service-work/${encodeURIComponent(qrCode)}${id ? `?submission=${encodeURIComponent(id)}` : ""}`; }
const statuses = new Set(["draft", "submitted", "changes_requested", "approved", "declined", "cancelled", "expired"]);
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(value);
export function readWorkEvidence(value: unknown): WorkEvidence[] {
  if (!Array.isArray(value)) throw new Error("The evidence list could not be confirmed. Please retry.");
  const seen = new Set<string>();
  return value.map((item) => {
    const row = record(item);
    if (!identifier(row.id) || seen.has(row.id) || ["type", "fileName", "mimeType", "createdAt", "previewUrl"].some(key => typeof row[key] !== "string") || !Number.isSafeInteger(row.fileSizeBytes) || Number(row.fileSizeBytes) < 1) throw new Error("The evidence list is incomplete. Please retry.");
    try {
      const url = new URL(row.previewUrl as string);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Unsafe evidence link");
    } catch { throw new Error("An evidence link could not be confirmed. Please retry."); }
    seen.add(row.id);
    return row as WorkEvidence;
  });
}
export function readWorkSubmission(value: unknown, actorId: string, qrCode: string, expectedId?: string): WorkSubmission {
  const row = record(value);
  if (!identifier(row.id) || (expectedId && row.id !== expectedId) || row.qrCode !== qrCode || record(row.provider).userId !== actorId) throw new Error("This service request does not belong to this provider and Profile.");
  if (!statuses.has(String(row.status)) || !Number.isSafeInteger(row.evidenceCount) || Number(row.evidenceCount) < 0 || !["private", "public"].includes(String(row.requestedVisibility))) throw new Error("The saved service request is incomplete. Please reload it.");
  for (const key of [...Object.keys(emptyServiceForm()), "profileTitle", "ownerReviewNote", "emailDeliveryStatus", "emailDeliveryMessage"]) if (typeof row[key] !== "string") throw new Error("The saved service request is incomplete. Please reload it.");
  return row as WorkSubmission;
}
function readProvider(value: unknown, actorId: string): ProviderForm {
  if (value === null) return emptyProvider();
  const row = record(value);
  if (row.userId !== actorId || ["businessName", "publicDisplayName", "website", "location"].some(key => typeof row[key] !== "string") || !Array.isArray(row.serviceCategories) || row.serviceCategories.some(item => typeof item !== "string")) throw new Error("Could not confirm the provider profile for this account.");
  return { businessName: row.businessName as string, publicDisplayName: row.publicDisplayName as string, website: row.website as string, location: row.location as string, serviceCategories: [...row.serviceCategories] as string[] };
}
function formFromSubmission(row: WorkSubmission): ServiceForm {
  const form = emptyServiceForm();
  for (const key of Object.keys(form) as (keyof ServiceForm)[]) form[key] = row[key];
  return form;
}
class StaleOperation extends Error {}
class WorkbenchFailure extends Error {
  constructor(message: string, readonly uncertain = false, readonly duplicateId = "", readonly conflict = false, readonly rejected = false,
    readonly responseStatus?: number, readonly responsePayload?: Record<string, unknown>) { super(message); }
}
type Lease = { actorId: string; revision: number };
type EvidenceIntent = { actorId: string; submissionId: string; uploadId: string; expectedRevision: string | null };
type UploadReceipt = { uploadId: string; expectedRevision: string | null; state: "prepared" | "committed" | "deleted" | "discarded"; attempt: EvidenceRecoveryAttempt | null };
type Dependencies = { auth: () => WorkbenchAuth; fetch?: typeof fetch; timeoutMs?: number; uploadTimeoutMs?: number; supabaseUrl?: string };
const evidenceTypes = new Set(["invoice", "work_order", "service_slip", "before_photo", "after_photo", "measurement_sheet", "receipt", "other"]);
function readUploadReceipt(value: unknown, actorId: string, submissionId: string): UploadReceipt {
  const receipt = parseServiceEvidenceUploadReceipt(value, { actorId, submissionId });
  if (!receipt) throw new Error("The saved upload receipt could not be confirmed.");
  const metadata = receipt.metadata;
  const attempt: EvidenceRecoveryAttempt | null = receipt.state === "prepared" && metadata ? {
    uploadId: receipt.uploadId, expectedRevision: receipt.expectedRevision, fileName: metadata.file_name,
    evidenceType: metadata.evidence_type, mimeType: metadata.mime_type, size: metadata.file_size_bytes,
    storagePath: receipt.storagePath!, bytes: receipt.storageState === "matching" ? "uploaded" : receipt.storageState === "missing" ? "missing" : receipt.storageState === "mismatch" ? "mismatch" : "unknown",
    canFinish: receipt.canFinish, canDiscard: receipt.canDiscard
  } : null;
  return { uploadId: receipt.uploadId, expectedRevision: receipt.expectedRevision, state: receipt.state, attempt };
}
export function createServiceWorkbench(qrCode: string, submissionId: string, deps: Dependencies) {
  let state = initialWorkbenchState();
  let auth: WorkbenchAuth | undefined;
  let unsubscribe: (() => void) | undefined;
  let revision = 0;
  let disposed = false;
  let actorKnown = false;
  let lock: symbol | undefined;
  let loadRevision = 0;
  let evidenceRevision = 0;
  // Accepted attempts are discovered from the server. In-memory identity also
  // fences an unknown request that has not reached the server yet. No bytes persist.
  let evidenceIntent: EvidenceIntent | null = null;
  let activeFile: File | null = null;
  let evidenceUncertain = false;
  let recoveryReadRevision = 0;
  let highestEvidenceRevision: string | null = null;
  const pendingEvidence = () => evidenceIntent || state.evidenceRecovery.attempt;
  const recoveryMessage = "Check upload status, then explicitly finish or discard the unfinished attempt before making another change.";
  const listeners = new Set<(value: WorkbenchState) => void>();
  const pending = new Set<AbortController>();
  const transport = deps.fetch || fetch;
  const timeoutMs = deps.timeoutMs ?? 20_000;
  const publish = (patch: Partial<WorkbenchState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } };
  const live = (lease: Lease) => !disposed && lease.revision === revision && lease.actorId === state.actorId;
  const check = (lease: Lease) => { if (!live(lease)) throw new StaleOperation(); };
  function abortPending() { pending.forEach(controller => controller.abort()); pending.clear(); }
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T>, limitMs = timeoutMs): Promise<T> {
    const controller = new AbortController();
    pending.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => undefined;
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("The request was interrupted. Please retry."));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => { reject(new Error("The request timed out. Please retry.")); controller.abort(); }, limitMs);
      })]);
    } finally { if (timer) clearTimeout(timer); controller.signal.removeEventListener("abort", onAbort); pending.delete(controller); }
  }
  function changeActor(session: WorkSession) {
    if (disposed) return;
    const actorId = session?.access_token ? session.user.id : "";
    if (actorKnown && actorId === state.actorId) return;
    actorKnown = true;
    activeFile = null; evidenceIntent = null; evidenceUncertain = false;
    recoveryReadRevision++; highestEvidenceRevision = null;
    revision++;
    loadRevision++;
    abortPending();
    lock = undefined;
    publish({ ...initialWorkbenchState(), actorId, phase: actorId ? "loading" : "signed-out" });
    if (actorId) void Promise.resolve().then(() => load());
  }
  async function freshSession(lease: Lease) {
    check(lease);
    if (!auth) throw new Error("Sign-in is unavailable. Please retry.");
    const result = await bounded(() => auth!.getSession());
    check(lease);
    if (result.error) throw new Error("Could not check your sign-in session. Please retry.");
    const session = result.data.session;
    if (!session?.access_token || session.user.id !== lease.actorId) { changeActor(session); throw new StaleOperation(); }
    return session;
  }
  async function request(lease: Lease, path: string, init: RequestInit = {}, mutation = false) {
    const session = await freshSession(lease);
    check(lease);
    let response: Response;
    let payload: Record<string, unknown>;
    try {
      ({ response, payload } = await bounded(async signal => {
        const response = await transport(path, { ...init, signal, cache: "no-store", headers: { ...init.headers, authorization: `Bearer ${session.access_token}` } });
        const payload = record(await response.json());
        return { response, payload };
      }));
      check(lease);
      await freshSession(lease);
    } catch (error) {
      check(lease);
      throw new WorkbenchFailure(error instanceof Error ? error.message : "The request could not be completed.", mutation);
    }
    if (!response.ok || payload.ok !== true) throw new WorkbenchFailure(typeof payload.message === "string" ? payload.message : "The server did not confirm this request. Please retry.", mutation && (response.status >= 500 || response.ok || payload.commitStatus === "unknown"), response.status === 409 && identifier(payload.existingSubmissionId) ? payload.existingSubmissionId : "", response.status === 409 && !payload.existingSubmissionId, !response.ok && response.status >= 400 && response.status < 500 && payload.ok === false, response.status, payload);
    return payload;
  }
  function confirmRevision(value: unknown) {
    const valueString = readEvidenceRevision(value);
    if (highestEvidenceRevision !== null && olderRevision(valueString, highestEvidenceRevision)) throw new Error("An older upload snapshot was returned. Check upload status again.");
    highestEvidenceRevision = valueString;
    return valueString;
  }
  async function readRecovery(lease: Lease, id: string) {
    const reading = ++recoveryReadRevision;
    evidenceRevision++;
    const tracked = evidenceIntent;
    publish({ evidenceLoading: false, evidenceRecovery: { ...state.evidenceRecovery, phase: "checking", error: "", canPrepare: false } });
    try {
      const payload = await request(lease, `/api/service-evidence?submissionId=${encodeURIComponent(id)}&uploadState=1${tracked ? `&uploadId=${encodeURIComponent(tracked.uploadId)}` : ""}`);
      if (reading !== recoveryReadRevision) return false;
      if (!parseServiceEvidenceUploadDiscovery(payload, { actorId: lease.actorId, submissionId: id, ...(tracked ? { uploadId: tracked.uploadId } : {}) })) throw new Error("The upload recovery snapshot could not be confirmed.");
      const snapshotRevision = readEvidenceRevision(payload.revision);
      const pending = payload.pending === null ? null : readUploadReceipt(payload.pending, lease.actorId, id);
      const latest = payload.latest === null ? null : readUploadReceipt(payload.latest, lease.actorId, id);
      const requested = payload.requested === null ? null : readUploadReceipt(payload.requested, lease.actorId, id);
      if ((Number(payload.pendingCount) === 0) !== (pending === null) || pending && pending.state !== "prepared" || payload.canPrepare && Number(payload.pendingCount) > 0
        || requested && (!tracked || requested.uploadId !== tracked.uploadId || requested.expectedRevision !== tracked.expectedRevision)) throw new Error("The upload recovery snapshot contains conflicting identities.");
      const receipts = [pending, latest, requested].filter(Boolean) as UploadReceipt[];
      for (const receipt of receipts) {
        if (receipt.expectedRevision !== null && olderRevision(snapshotRevision, receipt.expectedRevision)) throw new Error("The upload receipt revision is ahead of its snapshot.");
        for (const other of receipts) if (other.uploadId === receipt.uploadId && JSON.stringify(other) !== JSON.stringify(receipt)) throw new Error("The upload receipts disagree. Check upload status again.");
      }
      // A fresh controller also shows actual attached evidence before enabling a
      // new explicit upload. Discovery itself cannot complete or sign an upload.
      const list = await request(lease, `/api/service-evidence?submissionId=${encodeURIComponent(id)}`);
      const evidence = readWorkEvidence(list.evidence);
      if (!live(lease) || reading !== recoveryReadRevision || state.submission?.id !== id) return false;
      confirmRevision(snapshotRevision);
      if (tracked && requested && requested.state !== "prepared") evidenceIntent = null;
      let attempt = requested?.attempt || pending?.attempt || null;
      if (evidenceIntent && !requested) attempt = { uploadId: evidenceIntent.uploadId, expectedRevision: evidenceIntent.expectedRevision, fileName: "Unconfirmed evidence upload", evidenceType: "other", mimeType: "", size: 0, storagePath: "", bytes: "unknown", canFinish: false, canDiscard: true };
      const blocked = Boolean(attempt || Number(payload.pendingCount));
      publish({ evidenceRecovery: { phase: "confirmed", revision: snapshotRevision, attempt, pendingCount: Number(payload.pendingCount), canPrepare: payload.canPrepare === true && !blocked && !evidenceIntent, error: "" },
        evidence, evidenceError: "", submission: { ...state.submission, evidenceCount: evidence.length },
        ...(evidenceUncertain ? { uncertain: blocked ? "change" : "", message: blocked ? recoveryMessage : "Saved upload status checked. No file was uploaded or attached by this check." } : {}) });
      if (!blocked) evidenceUncertain = false;
      return true;
    } catch (error) {
      if (live(lease) && reading === recoveryReadRevision) publish({ evidenceRecovery: { ...state.evidenceRecovery, phase: "error", canPrepare: false, error: error instanceof Error ? error.message : "Upload status could not be checked. Please retry." } });
      return false;
    }
  }
  async function checkEvidenceRecovery() {
    if (disposed || lock || state.phase !== "ready" || !state.submission) return;
    return readRecovery({ actorId: state.actorId, revision }, state.submission.id);
  }
  async function load() {
    if (disposed || lock || !state.actorId) return;
    const lease = { actorId: state.actorId, revision };
    const loading = ++loadRevision;
    evidenceRevision++;
    const id = state.submission?.id || submissionId || evidenceIntent?.submissionId;
    publish({ phase: "loading", message: "", evidence: null, evidenceLoading: false, evidenceError: "" });
    try {
      const providerPayload = await request(lease, "/api/service-providers");
      const provider = readProvider(providerPayload.provider, lease.actorId);
      let submission: WorkSubmission | null = null;
      if (id) {
        if (!identifier(id)) throw new Error("The service request link is invalid.");
        const payload = await request(lease, `/api/service-submissions?id=${encodeURIComponent(id)}`);
        if (payload.submission === null) throw new Error("This service request was not found or is no longer available.");
        submission = readWorkSubmission(payload.submission, lease.actorId, qrCode, id);
      }
      check(lease);
      if (loading !== loadRevision) return;
      publish({ phase: "ready", provider, submission, form: submission ? formFromSubmission(submission) : state.form, uncertain: evidenceIntent ? "change" : id ? "" : state.uncertain, message: evidenceIntent ? recoveryMessage : !id && state.uncertain === "create" ? "Draft creation is unconfirmed. Check recent service work before creating another draft." : "" });
      if (submission) await readRecovery(lease, submission.id);
    } catch (error) {
      if (live(lease) && loading === loadRevision) publish({ phase: "error", message: error instanceof Error ? error.message : "Could not load service work. Please retry." });
    }
  }
  async function start() {
    if (disposed) return;
    publish({ phase: "loading", message: "" });
    const startingRevision = revision;
    try {
      if (!auth) {
        auth = deps.auth();
        const subscription = auth.onAuthStateChange((_event, session) => changeActor(session));
        unsubscribe = () => subscription.data.subscription.unsubscribe();
      }
      const result = await bounded(() => auth!.getSession());
      if (disposed || revision !== startingRevision) return;
      if (result.error) throw new Error("Could not check your sign-in session. Please retry.");
      if (actorKnown && state.actorId === (result.data.session?.access_token ? result.data.session.user.id : "")) {
        if (state.actorId) await load(); else publish({ phase: "signed-out" });
      } else changeActor(result.data.session);
    } catch (error) {
      if (!disposed && revision === startingRevision) publish({ phase: "error", message: error instanceof Error ? error.message : "Sign-in is unavailable. Please retry." });
    }
  }
  async function loadEvidence(confirmedUploadLease?: Lease) {
    if (disposed || (lock && (!confirmedUploadLease || !live(confirmedUploadLease))) || state.phase !== "ready" || !state.submission || state.evidenceLoading || state.evidenceRecovery.phase === "checking") return;
    const lease = { actorId: state.actorId, revision };
    const id = state.submission.id;
    const loading = ++evidenceRevision;
    publish({ evidenceLoading: true, evidenceError: "", evidence: null });
    try {
      const payload = await request(lease, `/api/service-evidence?submissionId=${encodeURIComponent(id)}`);
      const evidence = readWorkEvidence(payload.evidence);
      if (live(lease) && loading === evidenceRevision && state.submission?.id === id) publish({ evidence, submission: { ...state.submission, evidenceCount: evidence.length } });
    } catch (error) {
      if (live(lease) && loading === evidenceRevision) publish({ evidenceError: error instanceof Error ? error.message : "Private evidence could not be loaded. Please retry." });
    } finally {
      if (live(lease) && loading === evidenceRevision) publish({ evidenceLoading: false });
    }
  }
  async function mutate(label: string, work: (lease: Lease) => Promise<void>, uploadRecovery = false) {
    if (disposed || lock || state.phase !== "ready" || ((state.uncertain || pendingEvidence()) && !uploadRecovery)) return;
    if (!uploadRecovery && state.submission && (state.evidenceRecovery.phase !== "confirmed" || state.evidenceRecovery.pendingCount > 0)) return;
    if (!uploadRecovery && state.submission && !["draft", "changes_requested"].includes(state.submission.status)) return;
    const operation = Symbol(label);
    lock = operation;
    evidenceRevision++;
    recoveryReadRevision++;
    const lease = { actorId: state.actorId, revision };
    publish({ busy: label, message: "", duplicateId: "", evidenceLoading: false });
    try { await work(lease); }
    catch (error) {
      if (live(lease)) {
        const failure = error instanceof WorkbenchFailure ? error : new WorkbenchFailure(error instanceof Error ? error.message : "Could not complete the request.");
        const uncertain = pendingEvidence() || failure.uncertain || failure.conflict ? (state.submission ? "change" : "create") : "";
        publish({ message: uncertain ? `${failure.message} ${state.submission ? "Reload the saved version before making another change; the last change may already be saved." : "Draft creation is unconfirmed. Check recent service work before creating another draft."}` : failure.message, duplicateId: failure.duplicateId, uncertain });
      }
    } finally {
      if (lock === operation) { lock = undefined; if (live(lease)) publish({ busy: "" }); }
    }
  }
  async function save(action: "save_draft" | "submit" | "revise") {
    return mutate(action, async lease => {
      const form = { ...state.form };
      const provider = { ...state.provider, serviceCategories: [...state.provider.serviceCategories] };
      if (!provider.publicDisplayName.trim()) throw new Error("Add the provider name shown to the owner before saving service work.");
      if (action !== "save_draft" && (!form.serviceDate || !form.title.trim() || !form.workPerformed.trim())) throw new Error("Add the service date, title and work performed before sending work to the owner.");
      if (action === "revise" && state.submission?.status !== "changes_requested") throw new Error("Only work with requested changes can be revised.");
      const json = (body: unknown) => ({ method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const savedProvider = await request(lease, "/api/service-providers", json(provider));
      publish({ provider: readProvider(savedProvider.provider, lease.actorId) });
      let current = state.submission;
      if (!current) {
        const payload = await request(lease, "/api/service-submissions", { ...json({ qrCode, ...form }), method: "POST" }, true);
        try { current = readWorkSubmission(payload.submission, lease.actorId, qrCode); }
        catch { throw new WorkbenchFailure("The server did not confirm the new draft identity.", true); }
        if (current.status !== "draft") throw new WorkbenchFailure("The new draft returned an unexpected status.", true);
        publish({ submission: current, form: formFromSubmission(current) });
        if (action === "save_draft") { publish({ message: "Private service draft created." }); await readRecovery(lease, current.id); return; }
      }
      const payload = await request(lease, "/api/service-submissions", json({ id: current.id, action, ...form }), true);
      let saved: WorkSubmission;
      try { saved = readWorkSubmission(payload.submission, lease.actorId, qrCode, current.id); }
      catch { throw new WorkbenchFailure("The server did not confirm the saved service request.", true); }
      if (saved.status !== (action === "save_draft" ? current.status : "submitted")) throw new WorkbenchFailure("The server did not confirm the expected service status.", true);
      publish({ submission: saved, form: formFromSubmission(saved), message: typeof payload.message === "string" ? payload.message : action === "save_draft" ? "Private service draft saved." : "Service work submitted for owner review." });
      await readRecovery(lease, saved.id);
    });
  }
  async function upload(file: File | null, evidenceType: string) {
    if (!file || !state.evidenceRecovery.canPrepare) return;
    return mutate("evidence", async lease => {
      const submission = state.submission;
      if (!submission) throw new Error("Save the private draft before uploading evidence.");
      if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) throw new Error("Choose a JPG, PNG, WebP, or PDF evidence file.");
      if (!file.size || file.size > 15 * 1024 * 1024) throw new Error("Evidence files must be between 1 byte and 15 MB.");
      if (!evidenceTypes.has(evidenceType)) throw new Error("Choose a supported evidence type.");
      const uploadId = crypto.randomUUID();
      const storagePath = serviceEvidenceStoragePath(submission.id, lease.actorId, uploadId, file.type);
      if (!storagePath) throw new Error("The evidence upload identity could not be verified. Reload this submission.");
      const intent = { actorId: lease.actorId, submissionId: submission.id, uploadId, expectedRevision: readEvidenceRevision(state.evidenceRecovery.revision) };
      const metadata = { protocolVersion: 2, action: "prepare", expectedActorId: lease.actorId, submissionId: submission.id, uploadId, expectedRevision: intent.expectedRevision, evidenceType,
        fileName: serviceEvidenceFilename(typeof file.name === "string" && file.name ? file.name : "evidence"), mimeType: file.type, size: file.size };
      evidenceIntent = intent; activeFile = file; evidenceUncertain = true;
      publish({ evidenceRecovery: { ...state.evidenceRecovery, phase: "unchecked", canPrepare: false, attempt: { ...metadata, storagePath, bytes: "unknown", canFinish: false, canDiscard: true } } });
      try {
        let payload = await request(lease, "/api/service-evidence", jsonControl(metadata), true);
        verifyUploadResponse(payload, intent);
        if (payload.bucket !== "service-evidence" || payload.storagePath !== storagePath || !["upload", "uploaded", "committed"].includes(String(payload.phase))) throw new WorkbenchFailure("The upload destination was not confirmed.", true);
        if (payload.phase === "upload") {
          const supabaseUrl = deps.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
          if (!validServiceEvidenceSignedUploadUrl(payload.signedUrl, supabaseUrl, storagePath)) throw new WorkbenchFailure("The secure upload destination could not be verified. Check upload status.", true);
          await freshSession(lease); check(lease);
          try {
            await bounded(async signal => {
              check(lease);
              if (!activeFile) throw new Error("The original evidence bytes are no longer available.");
              await transport(payload.signedUrl as string, { method: "PUT", body: activeFile, signal, redirect: "error", credentials: "omit", cache: "no-store", headers: { "content-type": metadata.mimeType, "x-upsert": "false" } });
            }, deps.uploadTimeoutMs ?? 120_000);
          } catch { check(lease); /* A lost Storage response is verified by this uninterrupted completion. */ }
        }
        if (payload.phase !== "committed") payload = await request(lease, "/api/service-evidence", intentControl("complete", intent), true);
        verifyCommitted(payload, intent);
        evidenceIntent = null; evidenceUncertain = false;
        publish({ uncertain: "", message: "Private evidence uploaded." });
        await readRecovery(lease, submission.id);
      } finally { if (live(lease)) activeFile = null; }
    });
  }
  const jsonControl = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const intentControl = (action: "complete" | "discard", intent: EvidenceIntent) => jsonControl({ protocolVersion: 2, action, expectedActorId: intent.actorId, submissionId: intent.submissionId, uploadId: intent.uploadId, expectedRevision: intent.expectedRevision });
  function verifyUploadResponse(payload: Record<string, unknown>, intent: EvidenceIntent) {
    if (payload.protocolVersion !== 2 || payload.uploadId !== intent.uploadId || payload.submissionId !== intent.submissionId || payload.actorId !== intent.actorId || payload.expectedRevision !== intent.expectedRevision) throw new WorkbenchFailure("The original upload identity was not confirmed. Check upload status.", true);
    if (intent.expectedRevision !== null && !olderRevision(intent.expectedRevision, readEvidenceRevision(payload.revision))) throw new WorkbenchFailure("The saved upload revision was not advanced. Check upload status.", true);
    confirmRevision(payload.revision);
  }
  function verifyCommitted(payload: Record<string, unknown>, intent: EvidenceIntent) {
    verifyUploadResponse(payload, intent);
    if (payload.phase !== "committed" || payload.committed !== true || !identifier(record(payload.evidence).id)) throw new WorkbenchFailure("The evidence upload was not confirmed.", true);
  }
  async function finishEvidence() {
    const recovery = state.evidenceRecovery, attempt = recovery.attempt;
    if (recovery.phase !== "confirmed" || !attempt?.canFinish || attempt.bytes !== "uploaded") return;
    return mutate("finish-evidence", async lease => {
      if (!state.submission) return;
      const intent = { actorId: lease.actorId, submissionId: state.submission.id, uploadId: attempt.uploadId, expectedRevision: attempt.expectedRevision };
      evidenceIntent = intent; evidenceUncertain = true;
      publish({ evidenceRecovery: { ...recovery, phase: "unchecked", canPrepare: false } });
      const payload = await request(lease, "/api/service-evidence", intentControl("complete", intent), true);
      verifyCommitted(payload, intent);
      evidenceIntent = null; evidenceUncertain = false;
      publish({ uncertain: "", message: "Private evidence attached." });
      await readRecovery(lease, intent.submissionId);
    }, true);
  }
  async function discardEvidence() {
    const recovery = state.evidenceRecovery, attempt = recovery.attempt;
    if (recovery.phase !== "confirmed" || !attempt?.canDiscard) return;
    return mutate("discard-evidence", async lease => {
      if (!state.submission) return;
      const intent = { actorId: lease.actorId, submissionId: state.submission.id, uploadId: attempt.uploadId, expectedRevision: attempt.expectedRevision };
      evidenceIntent = intent; evidenceUncertain = true;
      publish({ evidenceRecovery: { ...recovery, phase: "unchecked", canPrepare: false } });
      const payload = await request(lease, "/api/service-evidence", intentControl("discard", intent), true);
      verifyUploadResponse(payload, intent);
      const receipt = readUploadReceipt(payload.receipt, lease.actorId, intent.submissionId);
      if (receipt.uploadId !== intent.uploadId || receipt.expectedRevision !== intent.expectedRevision || receipt.state === "prepared" || payload.phase !== receipt.state) throw new WorkbenchFailure("The discard outcome was not confirmed. Check upload status.", true);
      evidenceIntent = null; evidenceUncertain = false;
      publish({ uncertain: "", message: receipt.state === "committed" ? "This upload was already attached. Discard did not remove it." : receipt.state === "deleted" ? "This attachment was already removed. It will not be recreated." : "Unfinished upload discarded. No file was attached by this action." });
      await readRecovery(lease, intent.submissionId);
    }, true);
  }
  async function reload() {
    if (!state.actorId) return start();
    await load();
  }
  async function removeEvidence(evidenceId: string) {
    return mutate("remove-evidence", async lease => {
      const submission = state.submission;
      const evidence = state.evidence;
      if (!submission || !evidence?.some(item => item.id === evidenceId)) throw new Error("Load the saved evidence before removing an attachment.");
      const payload = await request(lease, "/api/service-evidence", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenceId }) }, true);
      if (payload.committed !== true) throw new WorkbenchFailure("The evidence removal was not confirmed.", true);
      publish({ evidence: evidence.filter(item => item.id !== evidenceId), submission: { ...submission, evidenceCount: Math.max(0, submission.evidenceCount - 1) }, message: typeof payload.message === "string" ? payload.message : "Evidence removed from this submission." });
    });
  }
  return {
    getState: () => state,
    subscribe(listener: (value: WorkbenchState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start, reload, save, upload, checkEvidenceRecovery, finishEvidence, discardEvidence, loadEvidence: () => loadEvidence(), removeEvidence,
    setProvider(provider: ProviderForm) { if (!lock && state.phase === "ready" && !state.uncertain && !pendingEvidence()) publish({ provider }); },
    setForm(form: ServiceForm) { if (!lock && state.phase === "ready" && !state.uncertain && !pendingEvidence()) publish({ form }); },
    dispose() { disposed = true; revision++; recoveryReadRevision++; activeFile = null; evidenceIntent = null; abortPending(); unsubscribe?.(); listeners.clear(); state = initialWorkbenchState(); },
  };
}

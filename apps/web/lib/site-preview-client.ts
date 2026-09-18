// Cookie mutations are serialized so a late preview response cannot win over logout cleanup.
type PreviewSession = { userId: string; accessToken: string };
let generation = 0;
let queue: Promise<unknown> = Promise.resolve();
let cleanupRequired = false;
export const sitePreviewInvalidatedEvent = "qrguitar:preview-invalidated";
export function sitePreviewGeneration() { return generation; }
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}
async function deleteCookie() {
  cleanupRequired = true;
  const response = await fetch("/api/site-editor/preview", {
    method: "DELETE", credentials: "same-origin", cache: "no-store", keepalive: true, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Could not clear the draft preview. Retry when the connection is available.");
  cleanupRequired = false;
}
export function clearSitePreviewCookie() {
  generation += 1;
  return enqueue(deleteCookie);
}
export function invalidateSitePreviewSession() {
  const pending = clearSitePreviewCookie();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(sitePreviewInvalidatedEvent));
  return pending;
}
export function openSiteDraftPreview(path: string, expectedActorId: string, getSession: () => Promise<PreviewSession>) {
  const started = generation;
  return enqueue(async () => {
    if (cleanupRequired) await deleteCookie();
    const session = await getSession();
    if (started !== generation || !expectedActorId || session.userId !== expectedActorId || !session.accessToken) {
      throw new Error("The signed-in editor changed. Reload Site Editor before previewing.");
    }
    try {
      const response = await fetch("/api/site-editor/preview", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path, expectedActorId })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; path?: string; editorActorId?: string; message?: string } | null;
      const current = await getSession();
      if (started !== generation || current.userId !== expectedActorId || !current.accessToken) {
        await deleteCookie();
        throw new Error("The signed-in editor changed. Reload Site Editor before previewing.");
      }
      if (!response.ok || payload?.ok !== true || payload.editorActorId !== expectedActorId || typeof payload.path !== "string" ||
          !payload.path.startsWith("/") || payload.path.startsWith("//") || payload.path.includes("\\")) {
        throw new Error(payload?.message || "Could not authorize the draft preview.");
      }
      return `${payload.path}?cmsPreview=draft`;
    } catch (error) {
      // A lost HTTP result may already have set a cookie. Clear before allowing another issuance.
      await deleteCookie().catch(() => undefined);
      throw error;
    }
  });
}

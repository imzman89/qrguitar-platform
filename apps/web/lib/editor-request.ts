// A deadline bounds UI waiting, not the outcome of an already dispatched write.
export async function editorDeadline<T>(work: Promise<T>, timeoutMs = 15000, abort?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort?.abort(); reject(new Error("Editor request was not confirmed.")); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer!); }
}

export async function editorRequest(url: string, init: RequestInit = {}) {
  const abort = new AbortController();
  // Include body consumption in the deadline; a received header is not a receipt.
  return editorDeadline((async () => {
    const response = await fetch(url, { ...init, signal: abort.signal });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  })(), 15000, abort);
}

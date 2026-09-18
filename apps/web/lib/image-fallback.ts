export function appendFailedImageSource(failedSources: string[], source: string): string[] {
  const candidate = String(source || "");
  if (!candidate.trim() || failedSources.includes(candidate)) return failedSources;
  return [...failedSources, candidate];
}

export function filterAvailableImageSources(sources: readonly string[], failedSources: readonly string[]) {
  if (!failedSources.length) return [...sources];
  const failed = new Set(failedSources);
  return sources.filter((source) => !failed.has(source));
}

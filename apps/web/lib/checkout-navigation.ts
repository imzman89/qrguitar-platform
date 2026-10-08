import { isCheckoutPath } from "./security-headers";

/** CSP and payment permissions belong to a document, not a client-side route. */
export function crossesCheckoutBoundary(currentPath: string, destination: string) {
  try {
    const base = "https://qrguitar.invalid";
    const current = new URL(currentPath, base);
    const target = new URL(destination, current);
    if (![base, "https://qrguitar.com", "https://www.qrguitar.com"].includes(target.origin)) return false;
    return isCheckoutPath(current.pathname) !== isCheckoutPath(target.pathname);
  } catch { return false; }
}

export function replaceWithCheckoutPolicy(
  currentPath: string,
  destination: string,
  router: { replace(href: string): void },
  location: { replace(href: string): void }
) {
  if (crossesCheckoutBoundary(currentPath, destination)) location.replace(destination);
  else router.replace(destination);
}

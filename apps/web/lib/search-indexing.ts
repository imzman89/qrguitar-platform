const NOINDEX_ROUTE_PREFIXES = [
  "/account",
  "/admin",
  "/api",
  "/billing",
  "/dashboard",
  "/edit",
  "/handout",
  "/login",
  "/ownership-claim",
  "/reset-password",
  "/service-review",
  "/service-work",
  "/site-editor",
  "/transfer"
] as const;

export function isNoindexPathname(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return NOINDEX_ROUTE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { activateOptionalTracking } from "../lib/optional-tracking-consent";
import { configuredGoogleAnalytics } from "../lib/google-analytics-config";
import { dispatchGoogleAnalyticsRoute, startGoogleAnalytics } from "../lib/google-analytics";

export function GoogleAnalyticsRuntime() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (!configuredGoogleAnalytics.enabled) return;
    return activateOptionalTracking("analytics", () => startGoogleAnalytics(configuredGoogleAnalytics));
  }, []);

  useEffect(() => {
    if (!configuredGoogleAnalytics.enabled) return;
    dispatchGoogleAnalyticsRoute(pathname);
  }, [pathname]);

  return null;
}

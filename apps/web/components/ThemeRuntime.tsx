"use client";

import { useEffect } from "react";
import { applyThemeSettings, defaultSiteSettings, fetchPublishedSiteSettings } from "../lib/site-settings";

export function ThemeRuntime() {
  useEffect(() => {
    applyThemeSettings(defaultSiteSettings);
    void fetchPublishedSiteSettings().then((published) => {
      if (published) {
        applyThemeSettings(published);
      }
    });
  }, []);

  return null;
}

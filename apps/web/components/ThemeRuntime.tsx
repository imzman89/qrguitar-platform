"use client";

import { useEffect } from "react";
import { applySeoSettings, applyThemeSettings, defaultSiteSettings, fetchPublishedSiteSettings } from "../lib/site-settings";

export function ThemeRuntime() {
  useEffect(() => {
    applyThemeSettings(defaultSiteSettings);
    applySeoSettings(defaultSiteSettings);
    void fetchPublishedSiteSettings().then((published) => {
      if (published) {
        applyThemeSettings(published);
        applySeoSettings(published);
      }
    });
  }, []);

  return null;
}

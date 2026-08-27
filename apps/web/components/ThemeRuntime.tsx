"use client";

import { useEffect } from "react";
import { applyThemeSettings, fetchPublishedSiteSettings } from "../lib/site-settings";

export function ThemeRuntime() {
  useEffect(() => {
    void fetchPublishedSiteSettings().then((published) => {
      if (published) {
        applyThemeSettings(published);
      }
    });
  }, []);

  return null;
}

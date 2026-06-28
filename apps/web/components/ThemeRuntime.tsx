"use client";

import { useEffect } from "react";
import { applySeoSettings, applyThemeSettings, fetchPublishedSiteSettings, readSiteSettings, type EditableSiteSettings } from "../lib/site-settings";

export function ThemeRuntime() {
  useEffect(() => {
    const stored = readSiteSettings();
    applyThemeSettings(stored);
    applySeoSettings(stored);
    void fetchPublishedSiteSettings().then((published) => {
      if (published) {
        applyThemeSettings(published);
        applySeoSettings(published);
      }
    });

    function onSettings(event: Event) {
      const detail = (event as CustomEvent<EditableSiteSettings>).detail;
      const settings = detail || readSiteSettings();
      applyThemeSettings(settings);
      applySeoSettings(settings);
    }

    window.addEventListener("qrguitar:site-settings", onSettings);

    return () => {
      window.removeEventListener("qrguitar:site-settings", onSettings);
    };
  }, []);

  return null;
}

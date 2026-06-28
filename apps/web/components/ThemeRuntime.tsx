"use client";

import { useEffect } from "react";
import { applyThemeSettings, fetchPublishedSiteSettings, readSiteSettings, type EditableSiteSettings } from "../lib/site-settings";

export function ThemeRuntime() {
  useEffect(() => {
    applyThemeSettings(readSiteSettings());
    void fetchPublishedSiteSettings().then((published) => {
      if (published) {
        applyThemeSettings(published);
      }
    });

    function onSettings(event: Event) {
      const detail = (event as CustomEvent<EditableSiteSettings>).detail;
      const settings = detail || readSiteSettings();
      applyThemeSettings(settings);
    }

    window.addEventListener("qrguitar:site-settings", onSettings);

    return () => {
      window.removeEventListener("qrguitar:site-settings", onSettings);
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";
import { applyThemeSettings, readSiteSettings, type EditableSiteSettings } from "../lib/site-settings";

export function ThemeRuntime() {
  useEffect(() => {
    applyThemeSettings(readSiteSettings());

    function onSettings(event: Event) {
      const detail = (event as CustomEvent<EditableSiteSettings>).detail;
      applyThemeSettings(detail || readSiteSettings());
    }

    window.addEventListener("qrguitar:site-settings", onSettings);
    window.addEventListener("storage", onSettings);

    return () => {
      window.removeEventListener("qrguitar:site-settings", onSettings);
      window.removeEventListener("storage", onSettings);
    };
  }, []);

  return null;
}

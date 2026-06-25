"use client";

import { useEffect } from "react";
import { applySeoSettings, applyThemeSettings, readSiteSettings, type EditableSiteSettings } from "../lib/site-settings";

export function ThemeRuntime() {
  useEffect(() => {
    const storedSettings = readSiteSettings();
    applyThemeSettings(storedSettings);
    applySeoSettings(storedSettings);

    function onSettings(event: Event) {
      const detail = (event as CustomEvent<EditableSiteSettings>).detail;
      const settings = detail || readSiteSettings();
      applyThemeSettings(settings);
      applySeoSettings(settings);
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

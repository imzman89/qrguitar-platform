"use client";

import { useEffect, useState } from "react";
import { defaultSiteSettings, readSiteSettings, type EditableSiteSettings } from "../lib/site-settings";

export function Footer() {
  const [settings, setSettings] = useState<EditableSiteSettings>(defaultSiteSettings);

  useEffect(() => {
    setSettings(readSiteSettings());

    function onSettings() {
      setSettings(readSiteSettings());
    }

    window.addEventListener("qrguitar:site-settings", onSettings);
    window.addEventListener("storage", onSettings);

    return () => {
      window.removeEventListener("qrguitar:site-settings", onSettings);
      window.removeEventListener("storage", onSettings);
    };
  }, []);

  return (
    <footer className="footer">
      <div className="shell">
        <strong className="brand footer-brand"><span>QR</span><span>guitar</span></strong>
        <p>{settings.tagline}</p>
      </div>
    </footer>
  );
}

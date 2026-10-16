"use client";

import { useEffect, useMemo, useState } from "react";
import { HomeDiscovery } from "./HomeDiscovery";
import { Footer } from "./Footer";
import { Nav } from "./Nav";
import { siteCopy } from "../content/site-copy";
import type { DemoInstrument } from "../lib/local-demo";
import { buildEditableHomeCopy, fetchPublishedSiteSettings, mergeSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import { requestPublicProfiles } from "../lib/public-profile-request";
import { homeActionTextColors } from "../lib/home-action-contrast";
import styles from "./BoutiqueHome.module.css";

export function HomePageClient({ initialRecords, initialSettings }: { initialRecords: DemoInstrument[]; initialSettings: EditableSiteSettings }) {
  const [settings, setSettings] = useState(() => mergeSiteSettings(initialSettings));
  const [homeRecords, setHomeRecords] = useState(initialRecords);
  const [galleryFailed, setGalleryFailed] = useState(false);
  const [galleryPending, setGalleryPending] = useState(true);
  const [galleryAttempt, setGalleryAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setGalleryPending(true);
    void requestPublicProfiles().then(records => {
      if (active) { setHomeRecords(records); setGalleryFailed(false); }
    }).catch(() => { if (active) setGalleryFailed(true); }).finally(() => { if (active) setGalleryPending(false); });
    return () => { active = false; };
  }, [galleryAttempt]);

  useEffect(() => {
    let active = true;
    void fetchPublishedSiteSettings().then(published => {
      if (active && published) setSettings(published);
    });
    return () => { active = false; };
  }, []);

  const hero = useMemo(() => ({ ...siteCopy.hero, ...buildEditableHomeCopy(settings).hero }), [settings]);
  return <div className={styles.page + " boutique-gallery"} style={homeActionTextColors(settings.colors.gold)}>
    <Nav />
    <main className="home-page"><HomeDiscovery records={homeRecords} settings={settings} hero={hero} pending={galleryPending} failed={galleryFailed} onRetry={() => { setGalleryPending(true); setGalleryAttempt(attempt => attempt + 1); }} /></main>
    <Footer />
  </div>;
}

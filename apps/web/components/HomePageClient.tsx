"use client";

import { useEffect, useState } from "react";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { HomePagePresentation, selectHomeProfiles } from "./HomePagePresentation";
import type { DemoInstrument } from "../lib/local-demo";
import { fetchPublishedSiteSettings, mergeSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import { requestPublicProfiles } from "../lib/public-profile-request";

export function HomePageClient({ initialRecords, initialSettings }: { initialRecords: DemoInstrument[]; initialSettings: EditableSiteSettings }) {
  const [settings, setSettings] = useState(() => mergeSiteSettings(initialSettings));
  const [records, setRecords] = useState(initialRecords);
  const [pending, setPending] = useState(!selectHomeProfiles(initialRecords).length);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setPending(true);
    void requestPublicProfiles().then(next => {
      if (active) { setRecords(next); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    let active = true;
    void fetchPublishedSiteSettings().then(published => { if (active && published) setSettings(published); });
    return () => { active = false; };
  }, []);

  return <><Nav /><HomePagePresentation records={records} settings={settings} pending={pending} failed={failed} onRetry={() => { setPending(true); setAttempt(value => value + 1); }} /><Footer /></>;
}
"use client";

import Link from "./CheckoutAwareLink";
import { ArrowRight } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { HomeProfileShowcase } from "./HomeProfileShowcase";
import { Footer } from "./Footer";
import { Nav } from "./Nav";
import { useUiText } from "./UiTextProvider";
import { siteCopy } from "../content/site-copy";
import type { DemoInstrument } from "../lib/local-demo";
import { getProfilePhotoUrls } from "../lib/instrument-profile-contract";
import { buildEditableHomeCopy, fetchPublishedSiteSettings, mergeSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import { selectHomeFeaturedProfile } from "../lib/home-featured-profile";
import { isEligiblePublicProfile } from "../lib/public-profile-eligibility";
import { requestPublicProfiles } from "../lib/public-profile-request";
import { getContentValue } from "../lib/content-registry";
import { homeActionTextColors } from "../lib/home-action-contrast";
import { homeSignupSections } from "../lib/home-signup-layout";
import styles from "./BoutiqueHome.module.css";

export function HomePageClient({ initialRecords, initialSettings }: {
  initialRecords: DemoInstrument[];
  initialSettings: EditableSiteSettings;
}) {
  const ui = useUiText("components.HomePageClient");
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
  const eligibleRecords = homeRecords.filter(record => record.visibility === "public" && !record.collectionRemovedAt
    && isEligiblePublicProfile(record) && record.safetyStatus !== "lost" && record.safetyStatus !== "stolen"
    && getProfilePhotoUrls(record).length > 0);
  const initialLatestRecord = selectHomeFeaturedProfile(eligibleRecords);
  const seenCodes = new Set(initialLatestRecord ? [initialLatestRecord.qrCode.trim().toUpperCase()] : []);
  const seenPhotos = new Set(initialLatestRecord ? getProfilePhotoUrls(initialLatestRecord) : []);
  const orderedRecords = [...eligibleRecords.filter(record => /guitar/i.test(record.instrumentType || "")),
    ...eligibleRecords.filter(record => !/guitar/i.test(record.instrumentType || ""))];
  const archiveRecords = orderedRecords.filter(record => {
    const code = record.qrCode.trim().toUpperCase();
    const photos = getProfilePhotoUrls(record);
    if (seenCodes.has(code) || seenPhotos.has(photos[0])) return false;
    seenCodes.add(code);
    photos.forEach(photo => seenPhotos.add(photo));
    return true;
  }).slice(0, 3);
  const homeSections = homeSignupSections(settings.composition.home.sections);
  const content = settings.content;

  const renderedSections: Record<string, ReactNode> = {
    hero: (
      <section className={styles.opening} aria-labelledby="home-title">
        <div className={"shell " + styles.heroGrid}>
          <div className={styles.heroCopy}>
            {hero.eyebrow ? <p className={styles.eyebrow}>{hero.eyebrow}</p> : null}
            <h1 id="home-title">{hero.headline}</h1>
            {hero.body ? <p className={styles.introduction}>{hero.body}</p> : null}
            <div className={styles.actions}>
              <Link className={"button " + styles.primaryAction} href="/create">{hero.primaryCta}<ArrowRight size={17} aria-hidden="true" /></Link>
              <Link className={styles.textLink} href={initialLatestRecord ? "/i/" + encodeURIComponent(initialLatestRecord.qrCode) : "/catalog"}>
                {initialLatestRecord ? getContentValue(content, "home.hero.viewProfile") : hero.secondaryCta}<ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
            {getContentValue(content, "home.hero.accessNote") ? <Link className={styles.accessNote} href="/billing">{getContentValue(content, "home.hero.accessNote")}</Link> : null}
          </div>
          <div className={styles.heroShowcase}>
            {initialLatestRecord ? <HomeProfileShowcase record={initialLatestRecord} /> : null}
            {galleryPending && !initialLatestRecord ? <p role="status" aria-busy="true">{ui("ui.components.LatestPublicRecord.feef6ffa93b4", "Loading latest QRguitar Profile")}</p>
              : galleryFailed ? <div role="status"><span>{ui("ui.components.LatestPublicRecord.unavailable", "The Profile example is temporarily unavailable.")}</span>{" "}<button className={styles.textLink} type="button" onClick={() => { setGalleryPending(true); setGalleryAttempt(attempt => attempt + 1); }}>{ui("ui.components.LatestPublicRecord.retry", "Retry")}</button></div>
              : !initialLatestRecord ? <p>{ui("ui.components.LatestPublicRecord.bf94b5d71589", "No public Profiles yet.")}</p> : null}
          </div>
        </div>
      </section>
    ),
    archive: archiveRecords.length ? (
      <section className={styles.archiveSection} aria-labelledby="home-archive-title">
        <div className="shell">
          <div className={styles.sectionHeading}>
            <div>
              {getContentValue(content, "home.archive.eyebrow") ? <p className={styles.eyebrow}>{getContentValue(content, "home.archive.eyebrow")}</p> : null}
              <h2 id="home-archive-title">{getContentValue(content, "home.archive.heading")}</h2>
              {getContentValue(content, "home.archive.body") ? <p>{getContentValue(content, "home.archive.body")}</p> : null}
            </div>
            <Link className={styles.textLink} href="/catalog">{getContentValue(content, "home.archive.viewAll")}<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className={styles.archiveGrid} aria-label={ui("ui.components.HomePageClient.230cdd8c2e80", "Explore additional QRguitar Profiles")}>
            {archiveRecords.map(record => <HomeProfileShowcase key={record.qrCode} record={record} variant="gallery" />)}
          </div>
        </div>
      </section>
    ) : null,
    roles: (
      <section className={styles.signupSection} id="audiences" aria-labelledby="home-signup-title">
        <div className={"shell " + styles.signupPanel}>
          <div className={styles.signupCopy}>
            {getContentValue(content, "home.signup.eyebrow") ? <p className={styles.eyebrow}>{getContentValue(content, "home.signup.eyebrow")}</p> : null}
            <h2 id="home-signup-title">{getContentValue(content, "home.signup.headline")}</h2>
            {getContentValue(content, "home.signup.body") ? <p>{getContentValue(content, "home.signup.body")}</p> : null}
          </div>
          <div className={styles.signupAction}>
            <Link className={"button " + styles.primaryAction} href="/login?mode=register&next=%2Fcreate">{getContentValue(content, "home.signup.cta")}<ArrowRight size={17} aria-hidden="true" /></Link>
            {getContentValue(content, "home.signup.note") ? <p>{getContentValue(content, "home.signup.note")}</p> : null}
          </div>
        </div>
      </section>
    )
  };

  return (
    <div className={styles.page} style={homeActionTextColors(settings.colors.gold)}>
      <Nav />
      <main className={`home-page ${styles.home}`}>
        {homeSections.filter(section => section.visible).map(section => <Fragment key={section.id}>{renderedSections[section.id] || null}</Fragment>)}
      </main>
      <Footer />
    </div>
  );
}

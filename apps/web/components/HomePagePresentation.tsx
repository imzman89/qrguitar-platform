"use client";

import Link from "./CheckoutAwareLink";
import { ArrowRight } from "lucide-react";
import { HomeProfileShowcase } from "./HomeProfileShowcase";
import { HomeRoleSelector } from "./HomeRoleSelector";
import type { ReactNode } from "react";
import { compactHomeSectionIds } from "../lib/home-layout-contract";
import { useUiText } from "./UiTextProvider";
import type { DemoInstrument } from "../lib/local-demo";
import type { EditableSiteSettings } from "../lib/site-settings";
import { getContentValue } from "../lib/content-registry";
import { getProfilePhotoUrls } from "../lib/instrument-profile-contract";
import { isEligiblePublicProfile } from "../lib/public-profile-eligibility";
import { selectHomeFeaturedProfile } from "../lib/home-featured-profile";
import { homeActionTextColors } from "../lib/home-action-contrast";
import styles from "./HomePageClient.module.css";

export function selectHomeProfiles(records: DemoInstrument[]) {
  const eligible = records.filter(record => record.visibility === "public" && !record.collectionRemovedAt && isEligiblePublicProfile(record) && record.safetyStatus !== "lost" && record.safetyStatus !== "stolen" && getProfilePhotoUrls(record).length > 0);
  const first = selectHomeFeaturedProfile(eligible);
  const ordered = [...eligible.filter(record => /guitar/i.test(record.instrumentType || "")), ...eligible.filter(record => !/guitar/i.test(record.instrumentType || ""))];
  const codes = new Set<string>(), photos = new Set<string>();
  return [first, ...ordered].filter((record): record is DemoInstrument => {
    if (!record) return false;
    const code = record.qrCode.trim().toUpperCase(), images = getProfilePhotoUrls(record);
    if (codes.has(code) || photos.has(images[0])) return false;
    codes.add(code); images.forEach(photo => photos.add(photo)); return true;
  }).slice(0, 3);
}

export function HomePagePresentation({ records, settings, pending = false, failed = false, onRetry }: { records: DemoInstrument[]; settings: EditableSiteSettings; pending?: boolean; failed?: boolean; onRetry?: () => void }) {
  const ui = useUiText("components.HomePageClient");
  const text = (key: string) => getContentValue(settings.content, key);
  const profiles = selectHomeProfiles(records);
  const sections = settings.composition.home.sections;
  const roleBlocks = sections.find(section => section.id === "roles")?.blocks.filter(block => block.visible) || [];

  const renderedSections: Record<string, ReactNode> = {
    hero: (<section className={styles.opening}>
      <div className="shell">
        <div className={styles.intro}>
          <h1>{text("home.hero.headline")}</h1>
          <div className={styles.introCopy}>
            <p>{text("home.hero.body")}</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/create">{text("home.hero.primaryCta")}<ArrowRight size={17} aria-hidden="true" /></Link>
              <Link className={styles.secondary} href="/catalog">{text("home.hero.secondaryCta")}<ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
            <p className={styles.access}>{text("home.hero.accessNote")}</p>
          </div>
        </div>
        <h2 className={styles.screenReaderOnly}>{ui("ui.components.HomePageClient.featuredProfilesHeading", "Real instrument Profiles")}</h2>
        <div className={styles.gallery} role="region" tabIndex={0} aria-label={ui("ui.components.HomePageClient.230cdd8c2e80", "Explore additional QRguitar Profiles")} onFocusCapture={event => {
          const rail = event.currentTarget;
          if (rail.scrollWidth <= rail.clientWidth) return;
          const card = (event.target as HTMLElement).closest<HTMLElement>('[data-home-featured="true"]');
          if (!card || !rail.contains(card)) return;
          const view = rail.getBoundingClientRect(), bounds = card.getBoundingClientRect();
          const gutter = parseFloat(getComputedStyle(rail).scrollPaddingInlineStart) || 0;
          if (bounds.left < view.left + gutter - 1 || bounds.right > view.right - gutter + 1) rail.scrollTo({left:rail.scrollLeft + bounds.left - view.left - gutter, behavior:"instant"});
        }}>
          {profiles.map((record, index) => <div key={record.qrCode} data-home-featured="true"><HomeProfileShowcase record={record} prioritizeLeadImage={index === 0} /></div>)}
        </div>
        {failed ? <div className={styles.galleryStatus} role="status">{ui("ui.components.LatestPublicRecord.unavailable", "The Profile example is temporarily unavailable.")}{" "}<button type="button" onClick={onRetry}>{ui("ui.components.LatestPublicRecord.retry", "Retry")}</button></div> : pending && !profiles.length ? <p className={styles.galleryStatus} role="status" aria-busy="true">{ui("ui.components.LatestPublicRecord.feef6ffa93b4", "Loading latest QRguitar Profile")}</p> : !profiles.length ? <p className={styles.galleryStatus}>{ui("ui.components.LatestPublicRecord.bf94b5d71589", "No public Profiles yet.")}</p> : null}
        <div className={styles.benefits}>
          {[1, 2, 3].map(index => <div key={index}><h2>{text(`home.summary.${index}.title`)}</h2><p>{text(`home.summary.${index}.body`)}</p></div>)}
        </div>
      </div>
    </section>),
    roles: roleBlocks.length ? <section className={styles.start} id="audiences"><div className="shell"><h2>{text("home.roles.headline")}</h2><HomeRoleSelector compact blocks={roleBlocks} content={settings.content} label={ui("ui.components.HomePageClient.5545daa79d3d", "Choose how you use QRguitar")} fallbackAction={ui("ui.components.HomePageClient.cd7d731ce76a", "See the workflow")} installerLabel={ui("ui.components.HomePageClient.installerProgram", "Explore the Installer program")} /></div></section> : null,
    pricing: ( <section className={styles.services} id="pricing"><div className="shell"><div><h2>{text("home.pricing.creditsTitle")}</h2><p>{text("home.pricing.creditsBody")}</p></div><Link className={styles.secondary} href="/billing">{text("home.pricing.creditsCta")}<ArrowRight size={15} aria-hidden="true" /></Link></div></section>)
  };
  return <main className={`home-page ${styles.home}`} style={homeActionTextColors(settings.colors.gold)}>{sections.filter(section => section.visible && compactHomeSectionIds.has(section.id)).map(section => <div key={section.id}>{renderedSections[section.id]}</div>)}</main>;
}
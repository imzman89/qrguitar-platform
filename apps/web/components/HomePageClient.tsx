"use client";
import { useUiText } from "./UiTextProvider";


import Link from "./CheckoutAwareLink";
import { ArrowRight, Check } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { HomeRoleSelector } from "./HomeRoleSelector";
import { CollectibleRecordCard } from "./CollectibleRecordCard";
import { Footer } from "./Footer";
import { EditorialIcon } from "./EditorialIcon";
import { Nav } from "./Nav";
import { siteCopy } from "../content/site-copy";
import type { DemoInstrument } from "../lib/local-demo";
import { getProfilePhotoUrls } from "../lib/instrument-profile-contract";
import { publicMediaVariantSrcSet, publicMediaVariantUrl } from "../lib/public-media-variant";
import { buildEditableHomeCopy, fetchPublishedSiteSettings, mergeSiteSettings, type EditableSiteSettings } from "../lib/site-settings";

import { selectHomeFeaturedProfile } from "../lib/home-featured-profile";
import { isEligiblePublicProfile } from "../lib/public-profile-eligibility";
import { requestPublicProfiles } from "../lib/public-profile-request";
import { getContentValue } from "../lib/content-registry";
import { homeActionTextColors } from "../lib/home-action-contrast";
import styles from "./HomePageClient.module.css";

export function HomePageClient({
  initialRecords,
  initialSettings
}: {
  initialRecords: DemoInstrument[];
  initialSettings: EditableSiteSettings;
}) {
  const ui = useUiText("components.HomePageClient");
  const [settings, setSettings] = useState<EditableSiteSettings | null>(() => mergeSiteSettings(initialSettings));
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
  const [failedRecordPhotos, setFailedRecordPhotos] = useState<string[]>([]);

  useEffect(() => {
    void fetchPublishedSiteSettings().then((published) => {
      if (published) {
        setSettings(published);
      }
    });
  }, []);

  const copy = useMemo(() => {
    if (!settings) {
      return siteCopy;
    }

    const resolved = buildEditableHomeCopy(settings);
    return {
      ...siteCopy,
      hero: { ...siteCopy.hero, ...resolved.hero },
      workflow: {
        ...siteCopy.workflow,
        eyebrow: resolved.workflow.eyebrow,
        headline: resolved.workflow.headline,
        body: resolved.workflow.body,
        cards: resolved.workflow.cards
      },
      customization: {
        ...siteCopy.customization,
        eyebrow: resolved.customization.eyebrow,
        headline: resolved.customization.headline,
        body: resolved.customization.body,
        checks: resolved.customization.checks,
        cta: resolved.customization.cta
      },
      audiences: {
        ...siteCopy.audiences,
        eyebrow: resolved.audiences.eyebrow,
        headline: resolved.audiences.headline,
        body: resolved.audiences.body,
        cards: resolved.audiences.cards,
        cta: resolved.audiences.cta
      },
      pricing: {
        ...siteCopy.pricing,
        eyebrow: resolved.pricing.eyebrow,
        headline: resolved.pricing.headline,
        body: resolved.pricing.body,
        plans: resolved.pricing.plans,
        enterpriseTitle: resolved.pricing.enterpriseTitle,
        enterpriseBody: resolved.pricing.enterpriseBody
      }
    };
  }, [settings]);

  const eligibleRecords = homeRecords.filter(record => record.visibility === "public" && !record.collectionRemovedAt && isEligiblePublicProfile(record) && record.safetyStatus !== "lost" && record.safetyStatus !== "stolen" && getProfilePhotoUrls(record).length > 0);
  const initialLatestRecord = selectHomeFeaturedProfile(eligibleRecords);
  const seenCodes = new Set<string>();
  const seenPhotos = new Set<string>();
  const orderedRecords = [...eligibleRecords.filter(record => /guitar/i.test(record.instrumentType || "")), ...eligibleRecords.filter(record => !/guitar/i.test(record.instrumentType || ""))];
  const galleryRecords = [initialLatestRecord, ...orderedRecords].filter((record): record is DemoInstrument => {
    if (!record) return false;
    const code = record.qrCode.trim().toUpperCase();
    const photos = getProfilePhotoUrls(record);
    if (seenCodes.has(code) || seenPhotos.has(photos[0])) return false;
    seenCodes.add(code); photos.forEach(photo => seenPhotos.add(photo)); return true;
  }).slice(0, 3);
  const galleryCodes = new Set(galleryRecords.map(record => record.qrCode));
  const archiveImages = new Set(galleryRecords.flatMap(record => getProfilePhotoUrls(record)));
  const archiveRecords = eligibleRecords.filter(record => {
    if (galleryCodes.has(record.qrCode)) return false;
    const leadImage = getProfilePhotoUrls(record)[0];
    if (archiveImages.has(leadImage)) return false;
    archiveImages.add(leadImage); return true;
  }).slice(0, 3);
  const supportingRecord = eligibleRecords.find(record => record.qrCode !== initialLatestRecord?.qrCode && getProfilePhotoUrls(record).length > 1) || eligibleRecords.find(record => record.qrCode !== initialLatestRecord?.qrCode);
  const supportingPhotos = supportingRecord ? getProfilePhotoUrls(supportingRecord) : [];
  const recordPhotoCandidates = supportingPhotos.length > 1
    ? [supportingPhotos[1], supportingPhotos[0], ...supportingPhotos.slice(2)]
    : supportingPhotos;
  const recordPhoto = recordPhotoCandidates.find((photo) => !failedRecordPhotos.includes(photo)) || "";
  const homeSections = settings?.composition.home.sections || [];
  const sectionBlocks = (sectionId: string) => homeSections.find((section) => section.id === sectionId)?.blocks.filter((block) => block.visible) || [];
  const audienceBlocks = sectionBlocks("roles");


  const renderedSections: Record<string, ReactNode> = {
    hero: (
      <section className={styles.galleryOpening}>
        <div className="shell">
          <div className={styles.galleryIntro}>
            <div className={styles.galleryHeadline}>
              {copy.hero.eyebrow ? <p className={styles.audienceNote}>{copy.hero.eyebrow}</p> : null}
              <h1>{copy.hero.headline}</h1>
            </div>
            <div className={styles.galleryDescription}>
              <p>{copy.hero.body}</p>
              <div className="hero-actions">
                <Link className="button" href="/create">{copy.hero.primaryCta}<ArrowRight size={17} aria-hidden="true" /></Link>
                <Link className="text-link" href="/catalog">{copy.hero.secondaryCta}</Link>
              </div>
              <span className={styles.betaNote}>{getContentValue(settings?.content || {}, "home.hero.accessNote")}</span>
            </div>
          </div>
          <div className={styles.profileGallery} role="region" tabIndex={0}
            onFocusCapture={(event) => {
              const rail = event.currentTarget;
              if (rail.scrollWidth <= rail.clientWidth) return;
              const card = (event.target as HTMLElement).closest<HTMLElement>('[data-home-featured="true"]');
              if (!card || !rail.contains(card)) return;
              const viewport = rail.getBoundingClientRect();
              const bounds = card.getBoundingClientRect();
              const gutter = parseFloat(getComputedStyle(rail).scrollPaddingInlineStart) || 0;
              if (bounds.left < viewport.left + gutter - 1 || bounds.right > viewport.right - gutter + 1) {
                rail.scrollTo({ left: rail.scrollLeft + bounds.left - viewport.left - gutter, behavior: "instant" });
              }
            }}
            aria-label={ui("ui.components.HomePageClient.230cdd8c2e80", "Explore additional QRguitar Profiles")}>
            {galleryRecords.map((record, index) => <CollectibleRecordCard key={record.qrCode} record={record} variant="latest" homeFeatured prioritizeLeadImage={index === 0} content={settings?.content} />)}
          </div>
          {galleryPending && !galleryRecords.length ? <p role="status" aria-busy="true">{ui("ui.components.LatestPublicRecord.feef6ffa93b4", "Loading latest QRguitar Profile")}</p> : galleryFailed ? <div role="status"><span>{ui("ui.components.LatestPublicRecord.unavailable", "The Profile example is temporarily unavailable.")}</span>{" "}<button className="text-link" type="button" onClick={() => { setGalleryPending(true); setGalleryAttempt(attempt => attempt + 1); }}>{ui("ui.components.LatestPublicRecord.retry", "Retry")}</button></div> : !homeRecords.length ? <p>{ui("ui.components.LatestPublicRecord.bf94b5d71589", "No public Profiles yet.")}</p> : null}
        </div>
      </section>
    ),
    archive: archiveRecords.length ? (
      <section className="section home-archive-section">
        <div className="shell home-archive">
            <div className="home-archive-heading">
              <div>
                {settings?.content["home.archive.eyebrow"] ? <div className="eyebrow">{settings.content["home.archive.eyebrow"]}</div> : null}
                <h2>{settings?.content["home.archive.heading"] || ui("ui.components.HomePageClient.3b67d76945bd", "Profiles")}</h2>
                {settings?.content["home.archive.body"] ? <p>{settings.content["home.archive.body"]}</p> : null}
              </div>
              <div className="home-archive-actions">
                <Link className="text-link" href="/catalog">{settings?.content["home.archive.viewAll"] || ui("ui.components.HomePageClient.025320721b82", "Catalog")}</Link>
              </div>
            </div>
            <div className="home-archive-rail" aria-label={ui("ui.components.HomePageClient.230cdd8c2e80", "Explore additional QRguitar Profiles")}>
              {archiveRecords.map((record) => (
                <CollectibleRecordCard
                  key={record.qrCode}
                  record={record}
                  variant="archive"
                  content={settings?.content}
                />
              ))}
            </div>
          </div>
      </section>
    ) : null,
    lifecycle: (
      <section className="section home-lifecycle-section">
        <div className="shell">
          <div className="section-header">
            {copy.workflow.eyebrow ? <div className="eyebrow">{copy.workflow.eyebrow}</div> : null}
            <h2>{copy.workflow.headline}</h2>
            {copy.workflow.body ? <p>{copy.workflow.body}</p> : null}
          </div>
          <div className="grid three">
            {sectionBlocks("lifecycle").map((item) => <Card key={item.id} icon={<EditorialIcon name={item.icon} size={30} />} title={item.title} copy={item.body} />)}
          </div>
        </div>
      </section>
    ),
    anatomy: (
      <section className="section record-holds-section">
        <div className="shell record-holds-layout">
          <div className="record-holds-copy">
            {copy.customization.eyebrow ? <div className="eyebrow">{copy.customization.eyebrow}</div> : null}
            <h2>{copy.customization.headline}</h2>
            <p>{copy.customization.body}</p>
            <div className="inline-cta-row"><Link className="button" href={supportingRecord ? `/i/${encodeURIComponent(supportingRecord.qrCode)}` : "/catalog"}>{supportingRecord ? copy.customization.cta : copy.hero.secondaryCta}</Link></div>
          </div>
          <div className="record-holds-visual" aria-label={ui("ui.components.HomePageClient.4c90147fd5f7", "A QRguitar Profile keeps the instrument and its history together")}>
            <div className="record-holds-photo">
              {recordPhoto
                ? <img src={publicMediaVariantUrl(recordPhoto, 640)} srcSet={publicMediaVariantSrcSet(recordPhoto, [160, 640])} sizes="(max-width: 700px) 360px, 320px" alt={ui("ui.components.HomePageClient.d28da756523e", "Documented {{value1}} in QRguitar", { value1: supportingRecord?.brand || "instrument" })} loading="lazy" fetchPriority="low" decoding="async" width={1200} height={900} referrerPolicy="no-referrer" onError={() => setFailedRecordPhotos((current) => current.includes(recordPhoto) ? current : [...current, recordPhoto])} />
                : <div className="record-holds-photo-empty"><span>{settings?.content["home.anatomy.fallback"] || ui("ui.components.HomePageClient.42ab3b00b1c2", "A permanent identity for every instrument")}</span></div>}
              <span>{ui("ui.components.HomePageClient.8969d61bdcd8", "One Profile")}</span>
            </div>
            <div className="record-holds-facts">
              {sectionBlocks("anatomy").map((item, index) => <div key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong><p>{item.body}</p></div>)}
            </div>
          </div>
        </div>
      </section>
    ),
    roles: (
      <section className="section home-roles-section" id="audiences">
        <div className="shell">
          <div className="section-header">{copy.audiences.eyebrow ? <div className="eyebrow">{copy.audiences.eyebrow}</div> : null}<h2>{copy.audiences.headline}</h2>{copy.audiences.body ? <p>{copy.audiences.body}</p> : null}</div>
          <HomeRoleSelector blocks={audienceBlocks} content={settings?.content || {}} label={ui("ui.components.HomePageClient.5545daa79d3d", "Choose how you use QRguitar")} fallbackAction={ui("ui.components.HomePageClient.cd7d731ce76a", "See the workflow")} installerLabel={ui("ui.components.HomePageClient.installerProgram", "Explore the Installer program")} />
        </div>
      </section>
    ),
    continuity: (
      <section className="section continuity-section">
        <div className="shell continuity-layout">
          <div className="continuity-intro">
            {settings?.content["home.continuity.eyebrow"] ? <div className="eyebrow">{settings.content["home.continuity.eyebrow"]}</div> : null}
            <h2>{settings?.content["home.continuity.headline"] || ui("ui.components.HomePageClient.b655c5fb6426", "Service and ownership")}</h2>
            <p>{settings?.content["home.continuity.body"] || ui("ui.components.HomePageClient.9a4346833f50", "Approved service and completed transfers keep the same Profile and QR link.")}</p>
            <Link className="text-link" href="/how-it-works">{settings?.content["home.continuity.cta"] || ui("ui.components.HomePageClient.7bf7f24c48ad", "How it works")}</Link>
          </div>
          <div className="continuity-list">
            {sectionBlocks("continuity").map((item, index) => (
              <article key={item.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <EditorialIcon name={item.icon} size={22} />
                <div><h3>{item.title}</h3><p>{item.body}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>
    ),
    pricing: (
      <section className="section pricing-section" id="pricing">
        <div className="shell">
          <div className="section-header"><div className="eyebrow">{copy.pricing.eyebrow}</div><h2>{copy.pricing.headline}</h2>{copy.pricing.body ? <p>{copy.pricing.body}</p> : null}</div>
          <div className="pricing-grid">
            {sectionBlocks("pricing").map((plan) => <PricingCard key={plan.id} primary={plan.id === "home-price-beta"} name={plan.title} price={plan.label || ""} copy={plan.body} features={plan.items || []} cta={plan.ctaLabel} href={plan.ctaUrl} secondaryHref={plan.id === "home-price-commercial" && plan.ctaUrl !== "/installers" ? "/installers" : undefined} secondaryCta={plan.id === "home-price-commercial" && plan.ctaUrl !== "/installers" ? ui("ui.components.HomePageClient.installerProgram", "Explore the Installer program") : undefined} />)}
          </div>
          <div className={styles.creditNote}><div><h3>{getContentValue(settings?.content || {}, "home.pricing.creditsTitle")}</h3><p>{getContentValue(settings?.content || {}, "home.pricing.creditsBody")}</p></div><Link className={styles.creditLink} href="/billing">{getContentValue(settings?.content || {}, "home.pricing.creditsCta")}<ArrowRight size={16} aria-hidden="true" /></Link></div>
        </div>
      </section>
    ),
    finalCta: (
      <section className="section home-final-cta">
        <div className="shell">
          <div className="section-header">{settings?.content["home.finalCta.eyebrow"] ? <div className="eyebrow">{settings.content["home.finalCta.eyebrow"]}</div> : null}<h2>{settings?.content["home.finalCta.headline"] || ui("ui.components.HomePageClient.b575d2660321", "Create a Profile")}</h2>{settings?.content["home.finalCta.body"] ? <p>{settings.content["home.finalCta.body"]}</p> : null}</div>
          <div className="section-cta"><Link className="button" href="/create">{settings?.content["home.finalCta.primaryCta"] || ui("ui.components.HomePageClient.8088497eb587", "Create a Profile")}<ArrowRight size={17} aria-hidden="true" /></Link><Link className="text-link" href="/catalog">{settings?.content["home.finalCta.secondaryCta"] || ui("ui.components.HomePageClient.004ca2d8b070", "Catalog")}</Link></div>
        </div>
      </section>
    )
  };

  return (
    <>
      <Nav />
      <main className={`home-page ${styles.home}`} style={homeActionTextColors((settings || initialSettings).colors.gold)}>
        {homeSections.filter((section) => section.visible).map((section) => <Fragment key={section.id}>{renderedSections[section.id] || null}</Fragment>)}
      </main>
      <Footer />
    </>
  );
}

function Card({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <article className="card">
      <div className="icon">{icon}</div>
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  );
}

function PricingCard({
  primary = false,
  name,
  price,
  copy,
  badge,
  features,
  cta,
  href,
  secondaryHref,
  secondaryCta
}: {
  primary?: boolean;
  name: string;
  price: string;
  copy: string;
  badge?: string;
  features: string[];
  cta?: string;
  href?: string;
  secondaryHref?: string;
  secondaryCta?: string;
}) {
  const normalizedName = name.trim().toLowerCase();
  const freePlan = primary || normalizedName === "for owners and collectors" || normalizedName === "free public beta";
  const resolvedCta = cta || (freePlan ? "Create a Profile" : "Contact QRguitar");
  const resolvedHref = href || (freePlan
      ? "/create"
      : `mailto:support@qrguitar.com?subject=${encodeURIComponent(`QRguitar ${name}`)}`);

  return (
    <article className={badge ? "price-card featured" : "price-card"} data-emphasis={primary ? "primary" : "secondary"}>
      {badge ? <div className="plan-badge">{badge}</div> : null}
      <h3>{name}</h3>
      <div className="price">{price}</div>
      <p>{copy}</p>
      <ul>
        {features.map((feature) => (
          <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>
        ))}
      </ul>
      <div className={styles.pricingActions}>
      <Link className={primary ? "button" : "button secondary"} href={resolvedHref}>
        {resolvedCta}<ArrowRight size={16} aria-hidden="true" />
      </Link>
        {secondaryHref && secondaryCta ? <Link className={styles.creditLink} href={secondaryHref}>{secondaryCta}</Link> : null}
      </div>
    </article>
  );
}

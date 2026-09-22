"use client";
import { useUiText } from "./UiTextProvider";


import Link from "./CheckoutAwareLink";
import { ArrowRight, Fingerprint, ShieldCheck, RefreshCw } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { CollectibleRecordCard } from "./CollectibleRecordCard";
import { Footer } from "./Footer";
import { EditorialIcon } from "./EditorialIcon";
import { LatestPublicRecord } from "./LatestPublicRecord";
import { Nav } from "./Nav";
import { siteCopy } from "../content/site-copy";
import type { DemoInstrument } from "../lib/local-demo";
import { getProfilePhotoUrls } from "../lib/instrument-profile-contract";
import { publicMediaVariantSrcSet, publicMediaVariantUrl } from "../lib/public-media-variant";
import { buildEditableHomeCopy, fetchPublishedSiteSettings, type EditableSiteSettings } from "../lib/site-settings";

import { selectHomeFeaturedProfile } from "../lib/home-featured-profile";
import { getContentValue } from "../lib/content-registry";
import styles from "./HomePageClient.module.css";

export function HomePageClient({
  initialRecords,
  initialSettings
}: {
  initialRecords: DemoInstrument[];
  initialSettings: EditableSiteSettings;
}) {
  const ui = useUiText("components.HomePageClient");
  const [settings, setSettings] = useState<EditableSiteSettings | null>(initialSettings);
  const [activeAudience, setActiveAudience] = useState(0);
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

  const initialLatestRecord = selectHomeFeaturedProfile(initialRecords);
  const heroImages = new Set(initialLatestRecord ? getProfilePhotoUrls(initialLatestRecord) : []);
  const archiveImages = new Set(heroImages);
  const archiveRecords = initialRecords.filter((record) => {
    if (record.qrCode === initialLatestRecord?.qrCode) return false;
    const leadImage = getProfilePhotoUrls(record)[0];
    if (!leadImage || archiveImages.has(leadImage)) return false;
    archiveImages.add(leadImage);
    return true;
  }).slice(0, 3);
  const supportingRecord = initialRecords.find((record) => record.qrCode !== initialLatestRecord?.qrCode && getProfilePhotoUrls(record).length > 1)
    || initialRecords.find((record) => record.qrCode !== initialLatestRecord?.qrCode && getProfilePhotoUrls(record).length > 0);
  const supportingPhotos = supportingRecord ? getProfilePhotoUrls(supportingRecord) : [];
  const recordPhotoCandidates = supportingPhotos.length > 1
    ? [supportingPhotos[1], supportingPhotos[0], ...supportingPhotos.slice(2)]
    : supportingPhotos;
  const recordPhoto = recordPhotoCandidates.find((photo) => !failedRecordPhotos.includes(photo)) || "";
  const homeSections = settings?.composition.home.sections || [];
  const sectionBlocks = (sectionId: string) => homeSections.find((section) => section.id === sectionId)?.blocks.filter((block) => block.visible) || [];
  const audienceBlocks = sectionBlocks("roles");
  const selectedAudience = audienceBlocks[activeAudience] || audienceBlocks[0];

  const renderedSections: Record<string, ReactNode> = {
    hero: (
      <section className="hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">{copy.hero.eyebrow}</div>
            <h1>{copy.hero.headline}</h1>
            <p>{copy.hero.body}</p>
            <div className="hero-actions">
              <Link className="button" href="/create">{copy.hero.primaryCta}<ArrowRight size={17} aria-hidden="true" /></Link>
              <Link className="button secondary" href={initialLatestRecord ? `/i/${encodeURIComponent(initialLatestRecord.qrCode)}` : "/catalog"}>{initialLatestRecord ? getContentValue(settings?.content || {}, "home.hero.viewProfile") : copy.hero.secondaryCta}</Link>
            </div>
            <a className={styles.betaNote} href="#pricing">{getContentValue(settings?.content || {}, "home.hero.accessNote")}</a>
          </div>
          <div className={styles.heroShowcase}><LatestPublicRecord initialRecord={initialLatestRecord} content={settings?.content} presentation="showcase" /></div>
        </div>
        <div className={"shell " + styles.valueStrip} aria-label={ui("ui.components.HomePageClient.bec4c56fb4cb", "What stays with your instrument")}>
          <div><Fingerprint size={24} strokeWidth={1.4} aria-hidden="true" /><span><strong>{ui("ui.components.HomePageClient.ecbcf256c14d", "One permanent identity")}</strong><small>{ui("ui.components.HomePageClient.bc615fcc90ab", "The same Profile. Every chapter.")}</small></span></div>
          <div><ShieldCheck size={24} strokeWidth={1.4} aria-hidden="true" /><span><strong>{ui("ui.components.HomePageClient.eb341bf13357", "Your privacy, your choice")}</strong><small>{ui("ui.components.HomePageClient.a4c1dff0c2e1", "Public, unlisted, or just for you.")}</small></span></div>
          <div><RefreshCw size={24} strokeWidth={1.4} aria-hidden="true" /><span><strong>{ui("ui.components.HomePageClient.f5ab906e49d7", "A history that carries forward")}</strong><small>{ui("ui.components.HomePageClient.104c2472352a", "Service and ownership, connected.")}</small></span></div>
        </div>
      </section>
    ),
    archive: archiveRecords.length ? (
      <section className="section home-archive-section">
        <div className="shell home-archive">
            <div className="home-archive-heading">
              <div>
                <div className="eyebrow">{settings?.content["home.archive.eyebrow"] || ui("ui.components.HomePageClient.72cdbf43eb3a", "PUBLIC PROFILES")}</div>
                <h2>{settings?.content["home.archive.heading"] || ui("ui.components.HomePageClient.3b67d76945bd", "See what's already documented.")}</h2>
                <p>{settings?.content["home.archive.body"] || ui("ui.components.HomePageClient.5c75e88902f3", "Browse real QRguitar Profiles from the public Catalog.")}</p>
              </div>
              <div className="home-archive-actions">
                <Link className="text-link" href="/catalog">{settings?.content["home.archive.viewAll"] || ui("ui.components.HomePageClient.025320721b82", "View all Profiles")}</Link>
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
            <div className="eyebrow">{copy.workflow.eyebrow}</div>
            <h2>{copy.workflow.headline}</h2>
            <p>{copy.workflow.body}</p>
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
            <div className="eyebrow">{copy.customization.eyebrow}</div>
            <h2>{copy.customization.headline}</h2>
            <p>{copy.customization.body}</p>
            <div className="inline-cta-row"><Link className="button" href={supportingRecord ? `/i/${encodeURIComponent(supportingRecord.qrCode)}` : "/catalog"}>{copy.customization.cta}</Link></div>
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
      <section className="section home-roles-section">
        <div className="shell">
          <div className="section-header"><div className="eyebrow">{copy.audiences.eyebrow}</div><h2>{copy.audiences.headline}</h2>{copy.audiences.body ? <p>{copy.audiences.body}</p> : null}</div>
          <div className="audience-switcher">
            <div className="audience-tabs" role="tablist" aria-label={ui("ui.components.HomePageClient.5545daa79d3d", "Choose how you use QRguitar")} onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? (activeAudience + 1) % audienceBlocks.length : event.key === "ArrowLeft" ? (activeAudience - 1 + audienceBlocks.length) % audienceBlocks.length : event.key === "Home" ? 0 : event.key === "End" ? audienceBlocks.length - 1 : null;
              if (next !== null) { event.preventDefault(); setActiveAudience(next); (event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next])?.focus(); }
            }}>
              {audienceBlocks.map((item, index) => <button className={index === activeAudience ? "is-active" : ""} key={item.id} type="button" role="tab" id={`home-audience-${index}`} aria-controls="home-audience-panel" tabIndex={index === activeAudience ? 0 : -1} aria-selected={index === activeAudience} onClick={() => setActiveAudience(index)}>{item.title}</button>)}
            </div>
            {selectedAudience ? <article className="audience-panel" role="tabpanel" id="home-audience-panel" aria-labelledby={`home-audience-${activeAudience}`}><div className="icon"><EditorialIcon name={selectedAudience.icon} size={30} /></div><div><h3>{selectedAudience.title}</h3><p>{selectedAudience.body}</p></div><Link className="button secondary" href={selectedAudience.ctaUrl || "/how-it-works"}>{selectedAudience.ctaLabel || ui("ui.components.HomePageClient.cd7d731ce76a", "See the workflow")}</Link></article> : null}
          </div>
        </div>
      </section>
    ),
    continuity: (
      <section className="section continuity-section">
        <div className="shell continuity-layout">
          <div className="continuity-intro">
            <div className="eyebrow">{settings?.content["home.continuity.eyebrow"] || ui("ui.components.HomePageClient.34165e2cdda6", "SERVICE & OWNERSHIP")}</div>
            <h2>{settings?.content["home.continuity.headline"] || ui("ui.components.HomePageClient.b655c5fb6426", "The history stays with the instrument.")}</h2>
            <p>{settings?.content["home.continuity.body"] || ui("ui.components.HomePageClient.9a4346833f50", "Approved service and completed ownership transfers update the same Profile. The QRguitar ID and link do not change.")}</p>
            <Link className="text-link" href="/how-it-works">{settings?.content["home.continuity.cta"] || ui("ui.components.HomePageClient.7bf7f24c48ad", "See How It Works")}</Link>
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
            {sectionBlocks("pricing").map((plan) => <PricingCard key={plan.id} name={plan.title} price={plan.label || ""} copy={plan.body} features={plan.items || []} cta={plan.ctaLabel} href={plan.ctaUrl} />)}
          </div>
          <div className={styles.creditNote}><div><h3>{getContentValue(settings?.content || {}, "home.pricing.creditsTitle")}</h3><p>{getContentValue(settings?.content || {}, "home.pricing.creditsBody")}</p></div><Link className="button secondary" href="/billing">{getContentValue(settings?.content || {}, "home.pricing.creditsCta")}</Link></div>
        </div>
      </section>
    ),
    finalCta: (
      <section className="section home-final-cta">
        <div className="shell">
          <div className="section-header">{settings?.content["home.finalCta.eyebrow"] ? <div className="eyebrow">{settings.content["home.finalCta.eyebrow"]}</div> : null}<h2>{settings?.content["home.finalCta.headline"] || ui("ui.components.HomePageClient.b575d2660321", "Start with one instrument.")}</h2><p>{settings?.content["home.finalCta.body"] || ui("ui.components.HomePageClient.9dae741a1b7c", "Create the Profile now. Add the rest over time.")}</p></div>
          <div className="section-cta"><Link className="button" href="/create">{settings?.content["home.finalCta.primaryCta"] || ui("ui.components.HomePageClient.8088497eb587", "Create a Profile")}</Link><Link className="button secondary" href="/catalog">{settings?.content["home.finalCta.secondaryCta"] || ui("ui.components.HomePageClient.004ca2d8b070", "Explore the Catalog")}</Link></div>
        </div>
      </section>
    )
  };

  return (
    <>
      <Nav />
      <main className={`home-page ${styles.home}`}>
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
  name,
  price,
  copy,
  badge,
  features,
  cta,
  href
}: {
  name: string;
  price: string;
  copy: string;
  badge?: string;
  features: string[];
  cta?: string;
  href?: string;
}) {
  const normalizedName = name.trim().toLowerCase();
  const resolvedCta = cta || (normalizedName === "free public beta" ? "Create Free Profile" : "Contact QRguitar");
  const resolvedHref = href || (normalizedName === "free public beta"
      ? "/create"
      : `mailto:support@qrguitar.com?subject=${encodeURIComponent(`QRguitar ${name}`)}`);

  return (
    <article className={badge ? "price-card featured" : "price-card"}>
      {badge ? <div className="plan-badge">{badge}</div> : null}
      <h3>{name}</h3>
      <div className="price">{price}</div>
      <p>{copy}</p>
      <ul>
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <Link className="button" href={resolvedHref}>
        {resolvedCta}
      </Link>
    </article>
  );
}

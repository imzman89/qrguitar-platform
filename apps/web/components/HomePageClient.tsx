"use client";

import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Fingerprint, ShieldCheck, RefreshCw } from "lucide-react";
import { Fragment, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CollectibleRecordCard } from "./CollectibleRecordCard";
import { Footer } from "./Footer";
import { EditorialIcon } from "./EditorialIcon";
import { LatestPublicRecord } from "./LatestPublicRecord";
import { Nav } from "./Nav";
import { siteCopy } from "../content/site-copy";
import type { DemoInstrument } from "../lib/local-demo";
import { getProfilePhotoUrls } from "../lib/instrument-profile-contract";
import { buildEditableHomeCopy, fetchPublishedSiteSettings, type EditableSiteSettings } from "../lib/site-settings";

import styles from "./HomePageClient.module.css";

export function HomePageClient({
  initialRecords,
  initialSettings
}: {
  initialRecords: DemoInstrument[];
  initialSettings: EditableSiteSettings;
}) {
  const [settings, setSettings] = useState<EditableSiteSettings | null>(initialSettings);
  const [activeAudience, setActiveAudience] = useState(0);
  const [failedRecordPhotos, setFailedRecordPhotos] = useState<string[]>([]);
  const [archiveIndex, setArchiveIndex] = useState(0);
  const archiveRailRef = useRef<HTMLDivElement | null>(null);
  const archiveDrag = useRef({ pointerId: -1, startX: 0, scrollLeft: 0 });

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

  const initialLatestRecord = initialRecords[0] || null;
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

  function beginArchiveDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    if ((event.target as HTMLElement).closest(".collectible-card")) return;
    const rail = archiveRailRef.current;
    if (!rail) return;
    archiveDrag.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: rail.scrollLeft };
    rail.setPointerCapture(event.pointerId);
  }

  function moveArchiveDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const rail = archiveRailRef.current;
    if (!rail || archiveDrag.current.pointerId !== event.pointerId) return;
    rail.scrollLeft = archiveDrag.current.scrollLeft - (event.clientX - archiveDrag.current.startX);
  }

  function endArchiveDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const rail = archiveRailRef.current;
    if (!rail || archiveDrag.current.pointerId !== event.pointerId) return;
    rail.releasePointerCapture(event.pointerId);
    archiveDrag.current.pointerId = -1;
  }

  function handleArchiveKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.currentTarget.scrollBy({
      left: (event.key === "ArrowRight" ? 1 : -1) * Math.max(280, event.currentTarget.clientWidth * 0.72),
      behavior: "smooth"
    });
  }

  function moveArchive(direction: -1 | 1) {
    const rail = archiveRailRef.current;
    if (!rail || !archiveRecords.length) return;
    const next = Math.max(0, Math.min(archiveRecords.length - 1, archiveIndex + direction));
    const target = rail.children.item(next) as HTMLElement | null;
    rail.scrollTo({ left: target?.offsetLeft || 0, behavior: "smooth" });
    setArchiveIndex(next);
  }

  function updateArchiveIndex() {
    const rail = archiveRailRef.current;
    if (!rail || !rail.children.length) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    const next = cards.reduce((closest, card, index) => (
      Math.abs(card.offsetLeft - rail.scrollLeft) < Math.abs(cards[closest].offsetLeft - rail.scrollLeft) ? index : closest
    ), 0);
    setArchiveIndex(next);
  }

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
              <Link className="button secondary" href="/catalog">{copy.hero.secondaryCta}</Link>
            </div>
            <a className={styles.betaNote} href="#pricing">Free during public beta · View plans</a>
          </div>
          <div className={styles.heroShowcase}><LatestPublicRecord initialRecord={initialLatestRecord} content={settings?.content} presentation="showcase" /></div>
        </div>
        <div className={"shell " + styles.valueStrip} aria-label="What stays with your instrument">
          <div><Fingerprint size={24} strokeWidth={1.4} aria-hidden="true" /><span><strong>One permanent identity</strong><small>The same Profile. Every chapter.</small></span></div>
          <div><ShieldCheck size={24} strokeWidth={1.4} aria-hidden="true" /><span><strong>Your privacy, your choice</strong><small>Public, unlisted, or just for you.</small></span></div>
          <div><RefreshCw size={24} strokeWidth={1.4} aria-hidden="true" /><span><strong>A history that carries forward</strong><small>Service and ownership, connected.</small></span></div>
        </div>
      </section>
    ),
    archive: archiveRecords.length ? (
      <section className="section home-archive-section">
        <div className="shell home-archive">
            <div className="home-archive-heading">
              <div>
                <div className="eyebrow">{settings?.content["home.archive.eyebrow"] || "PUBLIC PROFILES"}</div>
                <h2>{settings?.content["home.archive.heading"] || "See what's already documented."}</h2>
                <p>{settings?.content["home.archive.body"] || "Browse real QRguitar Profiles from the public Catalog."}</p>
              </div>
              <div className="home-archive-actions">
                <div className="home-archive-controls" aria-label="Browse archive Profiles">
                  <button type="button" onClick={() => moveArchive(-1)} disabled={archiveIndex === 0} aria-label="Previous Profile">
                    <ChevronLeft size={17} aria-hidden="true" />
                  </button>
                  <span aria-live="polite">{archiveIndex + 1} / {archiveRecords.length}</span>
                  <button type="button" onClick={() => moveArchive(1)} disabled={archiveIndex === archiveRecords.length - 1} aria-label="Next Profile">
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                </div>
                <Link className="text-link" href="/catalog">{settings?.content["home.archive.viewAll"] || "View all Profiles"}</Link>
              </div>
            </div>
            <div
              ref={archiveRailRef}
              className="home-archive-rail"
              role="region"
              aria-label="Explore additional QRguitar Profiles"
              tabIndex={0}
              onPointerDown={beginArchiveDrag}
              onPointerMove={moveArchiveDrag}
              onPointerUp={endArchiveDrag}
              onPointerCancel={endArchiveDrag}
              onKeyDown={handleArchiveKeyDown}
              onScroll={updateArchiveIndex}
            >
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
          <div className="record-holds-visual" aria-label="A QRguitar Profile keeps the instrument and its history together">
            <div className="record-holds-photo">
              {recordPhoto
                ? <img src={recordPhoto} alt={`Documented ${supportingRecord?.brand || "instrument"} in QRguitar`} onError={() => setFailedRecordPhotos((current) => current.includes(recordPhoto) ? current : [...current, recordPhoto])} />
                : <div className="record-holds-photo-empty"><span>{settings?.content["home.anatomy.fallback"] || "A permanent identity for every instrument"}</span></div>}
              <span>One Profile</span>
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
            <div className="audience-tabs" role="tablist" aria-label="Choose how you use QRguitar">
              {audienceBlocks.map((item, index) => <button className={index === activeAudience ? "is-active" : ""} key={item.id} type="button" role="tab" aria-selected={index === activeAudience} onClick={() => setActiveAudience(index)}>{item.title}</button>)}
            </div>
            {selectedAudience ? <article className="audience-panel" role="tabpanel"><div className="icon"><EditorialIcon name={selectedAudience.icon} size={30} /></div><div><h3>{selectedAudience.title}</h3><p>{selectedAudience.body}</p></div><Link className="button secondary" href={selectedAudience.ctaUrl || "/how-it-works"}>{selectedAudience.ctaLabel || "See the workflow"}</Link></article> : null}
          </div>
        </div>
      </section>
    ),
    continuity: (
      <section className="section continuity-section">
        <div className="shell continuity-layout">
          <div className="continuity-intro">
            <div className="eyebrow">{settings?.content["home.continuity.eyebrow"] || "SERVICE & OWNERSHIP"}</div>
            <h2>{settings?.content["home.continuity.headline"] || "The history stays with the instrument."}</h2>
            <p>{settings?.content["home.continuity.body"] || "Approved service and completed ownership transfers update the same Profile. The QRguitar ID and link do not change."}</p>
            <Link className="text-link" href="/how-it-works">{settings?.content["home.continuity.cta"] || "See How It Works"}</Link>
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
        </div>
      </section>
    ),
    finalCta: (
      <section className="section home-final-cta">
        <div className="shell">
          <div className="section-header">{settings?.content["home.finalCta.eyebrow"] ? <div className="eyebrow">{settings.content["home.finalCta.eyebrow"]}</div> : null}<h2>{settings?.content["home.finalCta.headline"] || "Start with one instrument."}</h2><p>{settings?.content["home.finalCta.body"] || "Create the Profile now. Add the rest over time."}</p></div>
          <div className="section-cta"><Link className="button" href="/create">{settings?.content["home.finalCta.primaryCta"] || "Create a Profile"}</Link><Link className="button secondary" href="/catalog">{settings?.content["home.finalCta.secondaryCta"] || "Explore the Catalog"}</Link></div>
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

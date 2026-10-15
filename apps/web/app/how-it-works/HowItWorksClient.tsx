"use client";
import { useUiText } from "../../components/UiTextProvider";


import Link from "../../components/CheckoutAwareLink";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Eye,
  FileText,
  LockKeyhole,
  QrCode,
  Repeat2,
  ShieldCheck,
  Store,
  UserRoundCheck,
  Wrench
} from "lucide-react";
import { Footer } from "../../components/Footer";
import { EditorialIcon } from "../../components/EditorialIcon";
import { Nav } from "../../components/Nav";
import { getContentValue } from "../../lib/content-registry";
import { resolveVisibleEditorialSections, type EditableSiteSettings } from "../../lib/site-settings";

import { CollectibleRecordCard } from "../../components/CollectibleRecordCard";
import type { DemoInstrument } from "../../lib/local-demo";
import styles from "./guide.module.css";

function revealRoleTab(strip: HTMLElement | null, tab: HTMLElement | null) {
  if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
  const stripBounds = strip.getBoundingClientRect();
  const tabBounds = tab.getBoundingClientRect();
  const left = stripBounds.left + strip.clientLeft;
  const right = left + strip.clientWidth;
  if (tabBounds.left < left || tabBounds.width > strip.clientWidth) strip.scrollLeft += tabBounds.left - left;
  else if (tabBounds.right > right) strip.scrollLeft += tabBounds.right - right;
}

export function HowItWorksClient({ settings, example = null, initialAudienceId = "" }: { settings: EditableSiteSettings; example?: DemoInstrument | null; initialAudienceId?: string }) {
  const ui = useUiText("app.how.it.works.HowItWorksClient");
  const content = settings.content;
  const sections = resolveVisibleEditorialSections(settings, "howItWorks");
  const visibleSectionIds = useMemo(() => new Set(sections.map((section) => section.id)), [sections]);
  const blocks = (sectionId: string) => sections.find((section) => section.id === sectionId)?.blocks.filter((block) => block.visible) || [];
  const roleBlocks = blocks("roles");
  const [activeAudience, setActiveAudience] = useState(() => Math.max(0, roleBlocks.findIndex(block => block.id === initialAudienceId)));
  const selectedAudience = roleBlocks[activeAudience] || roleBlocks[0];
  const selectedAudienceHref = selectedAudience?.id === "how-role-provider" && selectedAudience.ctaUrl === "/account#service-provider"
    ? "/account?section=profile"
    : selectedAudience?.ctaUrl || "/create";
  const roleTabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const revealSelectedRole = () => {
      const strip = roleTabsRef.current;
      revealRoleTab(strip, strip?.querySelector<HTMLElement>('[aria-selected="true"]') || null);
    };
    revealSelectedRole();
    window.addEventListener("resize", revealSelectedRole);
    return () => window.removeEventListener("resize", revealSelectedRole);
  }, [selectedAudience?.id]);
  const sectionStyle = (sectionId: string) => ({ order: Math.max(0, sections.findIndex((section) => section.id === sectionId)) });

  const visibility = [
    { icon: Eye, title: "howItWorks.visibility.publicTitle", body: "howItWorks.visibility.publicBody" },
    { icon: UserRoundCheck, title: "howItWorks.visibility.unlistedTitle", body: "howItWorks.visibility.unlistedBody" },
    { icon: LockKeyhole, title: "howItWorks.visibility.privateTitle", body: "howItWorks.visibility.privateBody" }
  ];

  const ownership = [
    { icon: Repeat2, title: "howItWorks.ownership.ownerTitle", body: "howItWorks.ownership.ownerBody" },
    { icon: Store, title: "howItWorks.ownership.businessTitle", body: "howItWorks.ownership.businessBody" },
    { icon: ShieldCheck, title: "howItWorks.ownership.claimTitle", body: "howItWorks.ownership.claimBody" }
  ];

  return (
    <>
      <Nav />
      <main className={`editorial-composed-page product-guide-page ${styles.guide}`}>
        {visibleSectionIds.has("hero") ? (
          <section className="section product-guide-hero" style={sectionStyle("hero")}>
            <div className="shell product-guide-hero-inner">
              <div>
                <div className="eyebrow">{getContentValue(content, "howItWorks.hero.eyebrow")}</div>
                <h1>{getContentValue(content, "howItWorks.hero.headline")}</h1>
                <p>{getContentValue(content, "howItWorks.hero.body")}</p>
                <div className="product-guide-actions">
                  <Link className="button" href="/create">{ui("ui.app.how.it.works.HowItWorksClient.8088497eb587", "Create a Profile")}{" "}<ArrowRight size={16} /></Link>
                  <Link className="button secondary" href="/catalog">{ui("ui.app.how.it.works.HowItWorksClient.004ca2d8b070", "Explore the Catalog")}</Link>
                </div>
              </div>
              {example && visibleSectionIds.has("lifecycle") ? <aside className={styles.example} aria-label={ui("ui.app.how.it.works.HowItWorksClient.9238fe0c58c9", "A real QRguitar Profile")}><CollectibleRecordCard record={example} variant="archive" content={settings.content} /></aside> : null}
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("lifecycle") ? (
          <section className="section product-guide-flow" style={sectionStyle("lifecycle")}>
            <div className="shell">
              <div className="section-heading centered-heading">
                <div className="eyebrow">{ui("ui.app.how.it.works.HowItWorksClient.6a4cc4c27d2f", "HOW IT WORKS")}</div>
                <h2>{getContentValue(content, "howItWorks.lifecycle.heading")}</h2>
              </div>
              <div className={styles.walkthrough}><ol className="product-guide-steps" role="list">
                {blocks("lifecycle").map((item, index) => (
                  <li key={item.id}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <div><h3>{item.title}</h3><p>{item.body}</p>{item.id === "how-step-create" ? <p className={styles.serialCaveat}>{getContentValue(content, "howItWorks.lifecycle.serialHelp")}</p> : null}</div>
                  </li>
                ))}
              </ol>{example && !visibleSectionIds.has("hero") ? <aside className={styles.example} aria-label={ui("ui.app.how.it.works.HowItWorksClient.9238fe0c58c9", "A real QRguitar Profile")}><CollectibleRecordCard record={example} variant="archive" content={settings.content} /></aside> : null}</div>
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("features") ? (
          <section className="section product-guide-uses" id="profile-capabilities" style={sectionStyle("features")}>
            <div className="shell">
              <div className="section-heading centered-heading">
                <div className="eyebrow">{ui("ui.app.how.it.works.HowItWorksClient.b11d90f41a06", "PROFILE CONTENT")}</div>
                <h2>{getContentValue(content, "howItWorks.features.heading")}</h2>
              </div>
              <div className="product-guide-use-grid product-guide-capability-grid">
                {blocks("features").map((item) => (
                  <article key={item.id}><span><EditorialIcon name={item.icon} /></span><h3>{item.title}</h3><p>{item.body}</p></article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("identity") ? (
          <section className="section product-guide-identity" id="identity-privacy" style={sectionStyle("identity")}>
            <div className="shell product-guide-split">
              <div>
                <div className="eyebrow">{ui("ui.app.how.it.works.HowItWorksClient.eb8d26a4476d", "IDENTITY & PRIVACY")}</div>
                <h2>{getContentValue(content, "howItWorks.identity.heading")}</h2>
                <p>{getContentValue(content, "howItWorks.identity.body")}</p>
              </div>
              <div className="product-guide-visibility">
                <div><QrCode /><strong>{getContentValue(content, "howItWorks.identity.qrTitle")}</strong><span>{getContentValue(content, "howItWorks.identity.qrBody")}</span></div>
                <div><FileText /><strong>{getContentValue(content, "howItWorks.identity.serialTitle")}</strong><span>{getContentValue(content, "howItWorks.identity.serialBody")}</span><small className={styles.serialCaveat}>{ui("ui.app.how.it.works.HowItWorksClient.ab496be499d5", "The QRguitar ID and URL may still include this number even when the field is hidden.")}</small></div>
              </div>
            </div>
            <div className="shell product-guide-visibility-heading">
              <h2>{getContentValue(content, "howItWorks.privacy.heading")}</h2>
              <p>{getContentValue(content, "howItWorks.privacy.body")}</p>
              <p className="fine-print">{ui("ui.app.how.it.works.HowItWorksClient.378ea29c1ca1", "Choose a Private Profile when access must be restricted.")}</p>
            </div>
            <div className="shell product-guide-visibility-grid" aria-label={ui("ui.app.how.it.works.HowItWorksClient.d843ddab8d76", "Profile visibility options")}>
              {visibility.map((item) => <article key={item.title}><item.icon /><div><strong>{getContentValue(content, item.title)}</strong><span>{getContentValue(content, item.body)}</span></div></article>)}
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("service") ? (
          <section className="section product-guide-ownership" id="service-providers" style={sectionStyle("service")}>
            <div className="shell product-guide-ownership-layout">
              <div className="section-heading">
                <div className="eyebrow">{ui("ui.app.how.it.works.HowItWorksClient.4acc8a696c56", "OWNERSHIP")}</div>
                <h2>{getContentValue(content, "howItWorks.ownership.heading")}</h2>
                <p>{getContentValue(content, "howItWorks.ownership.body")}</p>
                <Link className="text-link" href="/ownership-claim">{ui("ui.app.how.it.works.HowItWorksClient.c682490365e0", "Open Claim Center")}</Link>
              </div>
              <div className="product-guide-ownership-list">
                {ownership.map((item) => <article key={item.title}><item.icon /><div><h3>{getContentValue(content, item.title)}</h3><p>{getContentValue(content, item.body)}</p></div></article>)}
              </div>
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("roles") ? (
          <section className="section product-guide-uses product-guide-audiences" id="who-it-is-for" style={sectionStyle("roles")}>
            <div className="shell">
              <div className="section-heading centered-heading"><div className="eyebrow">{ui("ui.app.how.it.works.HowItWorksClient.10f89fbc4f6e", "FOR THE INSTRUMENT COMMUNITY")}</div><h2>{getContentValue(content, "howItWorks.roles.heading")}</h2></div>
              <div className="product-guide-role-switcher">
                <div className="product-guide-role-tabs" ref={roleTabsRef} role="tablist" aria-label={ui("ui.app.how.it.works.HowItWorksClient.6cda88bdf5a8", "Choose your role")}>
                  {roleBlocks.map((item, index) => <button className={index === activeAudience ? "is-active" : ""} type="button" role="tab" id={`guide-audience-${index}`} aria-controls="guide-audience-panel" tabIndex={index === activeAudience ? 0 : -1} aria-selected={index === activeAudience} key={item.id} onClick={() => setActiveAudience(index)} onKeyDown={(event) => {
                    const target = event.key === "ArrowRight" ? (index + 1) % roleBlocks.length : event.key === "ArrowLeft" ? (index - 1 + roleBlocks.length) % roleBlocks.length : event.key === "Home" ? 0 : event.key === "End" ? roleBlocks.length - 1 : null;
                    if (target === null) return;
                    event.preventDefault(); setActiveAudience(target);
                    const targetTab = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target];
                    targetTab?.focus({ preventScroll: true });
                    revealRoleTab(roleTabsRef.current, targetTab || null);
                  }}>{item.title}</button>)}
                </div>
                {selectedAudience ? (
                  <article className="product-guide-role-panel" role="tabpanel" id="guide-audience-panel" aria-labelledby={`guide-audience-${activeAudience}`}>
                    <span>{String(activeAudience + 1).padStart(2, "0")}</span>
                    <div><h3>{selectedAudience.title}</h3><p>{selectedAudience.body}</p></div>
                    <Link className="button secondary" href={selectedAudienceHref}>{selectedAudience.ctaLabel || ui("ui.app.how.it.works.HowItWorksClient.8088497eb587", "Create a Profile")}</Link>
                  </article>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("faq") ? (
          <section className="section product-guide-faq" style={sectionStyle("faq")}>
            <div className="shell product-guide-faq-inner">
              <div><div className="eyebrow">{ui("ui.app.how.it.works.HowItWorksClient.0e7f56b89a7f", "BEFORE YOU START")}</div><h2>{getContentValue(content, "howItWorks.faq.heading")}</h2></div>
              <div className="product-guide-faq-list">
                {blocks("faq").map((item) => <details key={item.id}><summary>{item.title}</summary><p>{item.body}</p></details>)}
              </div>
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("finalCta") ? (
          <section className="section product-guide-cta" style={sectionStyle("finalCta")}>
            <div className="shell product-guide-cta-inner">
              <div><div className="eyebrow">{ui("ui.app.how.it.works.HowItWorksClient.2d735641fa51", "START WITH ONE INSTRUMENT")}</div><h2>{getContentValue(content, "howItWorks.finalCta.headline")}</h2><p>{getContentValue(content, "howItWorks.finalCta.body")}</p></div>
              <Link className="button" href="/create">{ui("ui.app.how.it.works.HowItWorksClient.8088497eb587", "Create a Profile")}{" "}<ArrowRight size={16} /></Link>
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </>
  );
}

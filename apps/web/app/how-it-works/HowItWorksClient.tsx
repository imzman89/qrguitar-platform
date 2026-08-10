"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

export function HowItWorksClient({ settings }: { settings: EditableSiteSettings }) {
  const [activeAudience, setActiveAudience] = useState(0);
  const content = settings.content;
  const sections = resolveVisibleEditorialSections(settings, "howItWorks");
  const visibleSectionIds = useMemo(() => new Set(sections.map((section) => section.id)), [sections]);
  const blocks = (sectionId: string) => sections.find((section) => section.id === sectionId)?.blocks.filter((block) => block.visible) || [];
  const roleBlocks = blocks("roles");
  const selectedAudience = roleBlocks[activeAudience] || roleBlocks[0];
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
      <main className="editorial-composed-page product-guide-page">
        {visibleSectionIds.has("hero") ? (
          <section className="section product-guide-hero" style={sectionStyle("hero")}>
            <div className="shell product-guide-hero-inner">
              <div>
                <div className="eyebrow">{getContentValue(content, "howItWorks.hero.eyebrow")}</div>
                <h1>{getContentValue(content, "howItWorks.hero.headline")}</h1>
                <p>{getContentValue(content, "howItWorks.hero.body")}</p>
                <div className="product-guide-actions">
                  <Link className="button" href="/create">Create a Profile <ArrowRight size={16} /></Link>
                  <Link className="button secondary" href="/catalog">Explore the Catalog</Link>
                </div>
              </div>
              <div className="product-guide-principles" aria-label="QRguitar essentials">
                <div><QrCode /><strong>One QRguitar ID</strong><span>The Profile URL and printable QR stay the same.</span></div>
                <div><Eye /><strong>Owner-controlled privacy</strong><span>Choose Public, Unlisted, or Private for each Profile.</span></div>
                <div><Repeat2 /><strong>Secure ownership handoff</strong><span>A scan opens the Profile. It never transfers ownership.</span></div>
              </div>
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("lifecycle") ? (
          <section className="section product-guide-flow" style={sectionStyle("lifecycle")}>
            <div className="shell">
              <div className="section-heading centered-heading">
                <div className="eyebrow">HOW IT WORKS</div>
                <h2>{getContentValue(content, "howItWorks.lifecycle.heading")}</h2>
              </div>
              <ol className="product-guide-steps">
                {blocks("lifecycle").map((item, index) => (
                  <li key={item.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><h3>{item.title}</h3><p>{item.body}</p></div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("features") ? (
          <section className="section product-guide-uses" id="profile-capabilities" style={sectionStyle("features")}>
            <div className="shell">
              <div className="section-heading centered-heading">
                <div className="eyebrow">PROFILE CONTENT</div>
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
                <div className="eyebrow">IDENTITY & PRIVACY</div>
                <h2>{getContentValue(content, "howItWorks.identity.heading")}</h2>
                <p>{getContentValue(content, "howItWorks.identity.body")}</p>
              </div>
              <div className="product-guide-visibility">
                <div><QrCode /><strong>{getContentValue(content, "howItWorks.identity.qrTitle")}</strong><span>{getContentValue(content, "howItWorks.identity.qrBody")}</span></div>
                <div><FileText /><strong>{getContentValue(content, "howItWorks.identity.serialTitle")}</strong><span>{getContentValue(content, "howItWorks.identity.serialBody")}</span></div>
              </div>
            </div>
            <div className="shell product-guide-visibility-heading">
              <h2>{getContentValue(content, "howItWorks.privacy.heading")}</h2>
              <p>{getContentValue(content, "howItWorks.privacy.body")}</p>
            </div>
            <div className="shell product-guide-visibility-grid" aria-label="Profile visibility options">
              {visibility.map((item) => <article key={item.title}><item.icon /><div><strong>{getContentValue(content, item.title)}</strong><span>{getContentValue(content, item.body)}</span></div></article>)}
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("service") ? (
          <section className="section product-guide-ownership" id="service-providers" style={sectionStyle("service")}>
            <div className="shell product-guide-ownership-layout">
              <div className="section-heading">
                <div className="eyebrow">OWNERSHIP</div>
                <h2>{getContentValue(content, "howItWorks.ownership.heading")}</h2>
                <p>{getContentValue(content, "howItWorks.ownership.body")}</p>
                <Link className="text-link" href="/ownership-claim">Open Claim Center</Link>
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
              <div className="section-heading centered-heading"><div className="eyebrow">FOR THE INSTRUMENT COMMUNITY</div><h2>{getContentValue(content, "howItWorks.roles.heading")}</h2></div>
              <div className="product-guide-role-switcher">
                <div className="product-guide-role-tabs" role="tablist" aria-label="Choose your role">
                  {roleBlocks.map((item, index) => <button className={index === activeAudience ? "is-active" : ""} type="button" role="tab" aria-selected={index === activeAudience} key={item.id} onClick={() => setActiveAudience(index)}>{item.title}</button>)}
                </div>
                {selectedAudience ? (
                  <article className="product-guide-role-panel" role="tabpanel">
                    <span>{String(activeAudience + 1).padStart(2, "0")}</span>
                    <div><h3>{selectedAudience.title}</h3><p>{selectedAudience.body}</p></div>
                    <Link className="button secondary" href={selectedAudience.ctaUrl || "/create"}>{selectedAudience.ctaLabel || "Create a Profile"}</Link>
                  </article>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("faq") ? (
          <section className="section product-guide-faq" style={sectionStyle("faq")}>
            <div className="shell product-guide-faq-inner">
              <div><div className="eyebrow">BEFORE YOU START</div><h2>{getContentValue(content, "howItWorks.faq.heading")}</h2></div>
              <div className="product-guide-faq-list">
                {blocks("faq").map((item) => <details key={item.id}><summary>{item.title}</summary><p>{item.body}</p></details>)}
              </div>
            </div>
          </section>
        ) : null}

        {visibleSectionIds.has("finalCta") ? (
          <section className="section product-guide-cta" style={sectionStyle("finalCta")}>
            <div className="shell product-guide-cta-inner">
              <div><div className="eyebrow">START WITH ONE INSTRUMENT</div><h2>{getContentValue(content, "howItWorks.finalCta.headline")}</h2><p>{getContentValue(content, "howItWorks.finalCta.body")}</p></div>
              <Link className="button" href="/create">Create a Profile <ArrowRight size={16} /></Link>
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </>
  );
}

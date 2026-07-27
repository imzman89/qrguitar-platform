"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Eye,
  FileText,
  Images,
  LockKeyhole,
  QrCode,
  Repeat2,
  ShieldCheck,
  UserRoundCheck,
  Wrench
} from "lucide-react";
import { Footer } from "../../components/Footer";
import { EditorialIcon } from "../../components/EditorialIcon";
import { Nav } from "../../components/Nav";
import { getContentValue } from "../../lib/content-registry";
import {
  resolveVisibleEditorialSections,
  type EditableSiteSettings
} from "../../lib/site-settings";

export function HowItWorksClient({ settings }: { settings: EditableSiteSettings }) {
  const [activeAudience, setActiveAudience] = useState(0);
  const content = settings.content;
  const sections = resolveVisibleEditorialSections(settings, "howItWorks");
  const visibleSectionIds = useMemo(() => new Set(sections.map((section) => section.id)), [sections]);
  const blocks = (sectionId: string) => sections.find((section) => section.id === sectionId)?.blocks.filter((block) => block.visible) || [];
  const roleBlocks = blocks("roles");
  const selectedAudience = roleBlocks[activeAudience] || roleBlocks[0];
  const sectionStyle = (sectionId: string) => {
    const index = sections.findIndex((section) => section.id === sectionId);
    return { order: index < 0 ? 99 : index };
  };

  return (
    <>
      <Nav />
      <main className="editorial-composed-page">
        {visibleSectionIds.has("hero") ? <section className="section product-guide-hero" style={sectionStyle("hero")}>
          <div className="shell product-guide-hero-inner">
            <div>
              <div className="eyebrow">{getContentValue(content, "howItWorks.hero.eyebrow")}</div>
              <h1>{getContentValue(content, "howItWorks.hero.headline")}</h1>
              <p>{getContentValue(content, "howItWorks.hero.body")}</p>
              <div className="product-guide-actions">
                <Link className="button" href="/create">Create Profile <ArrowRight size={16} /></Link>
                <Link className="button secondary" href="/catalog">Browse QRguitar Profiles</Link>
              </div>
            </div>
            <div className="product-guide-principles" aria-label="QRguitar essentials">
              <div><Images /><strong>Add one clear photo</strong><span>Every Profile starts with a real image of the instrument.</span></div>
              <div><Eye /><strong>Choose who can see it</strong><span>Use Public, Unlisted, or Private without changing the permanent ID.</span></div>
              <div><QrCode /><strong>Print or share the QR</strong><span>The same link stays with the instrument as its Profile grows.</span></div>
            </div>
          </div>
        </section> : null}

        {visibleSectionIds.has("lifecycle") ? <section className="section product-guide-flow" style={sectionStyle("lifecycle")}>
          <div className="shell">
            <div className="section-heading centered-heading">
              <div className="eyebrow">Start in minutes</div>
              <h2>Four clear steps.</h2>
            </div>
            <ol className="product-guide-steps">
              {blocks("lifecycle").map((item, index) => <li key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></li>)}
            </ol>
          </div>
        </section> : null}

        {visibleSectionIds.has("identity") ? <section className="section product-guide-identity" id="identity-privacy" style={sectionStyle("identity")}>
          <div className="shell product-guide-split">
            <div>
              <div className="eyebrow">Identity and privacy</div>
              <h2>The Serial Number and QRguitar ID have different jobs.</h2>
              <p><strong>With a Serial Number:</strong> the permanent ID uses the clear format QRG-[Serial Number]. The owner can hide the separate public Serial Number field without changing the ID or printed QR.</p>
              <p><strong>Without a Serial Number:</strong> QRguitar creates a unique six-digit ID. The Profile still works normally, but trust approval requires QRguitar review.</p>
            </div>
            <div className="product-guide-visibility">
              <div><QrCode /><strong>QRguitar ID</strong><span>The permanent system identity used by the Profile URL and printable QR.</span></div>
              <div><FileText /><strong>Serial Number</strong><span>The manufacturer or builder identity, shown publicly only when the owner allows it.</span></div>
              <div><ShieldCheck /><strong>Permanent link</strong><span>Editing details never changes the Profile URL or an already printed QR.</span></div>
            </div>
          </div>
          <div className="shell product-guide-visibility-grid" aria-label="Profile visibility options">
            <article><Eye /><div><strong>Public</strong><span>Listed in the Catalog and available through its QR or direct link.</span></div></article>
            <article><UserRoundCheck /><div><strong>Unlisted</strong><span>Kept out of the Catalog, but available to anyone with the QR or direct link.</span></div></article>
            <article><LockKeyhole /><div><strong>Private</strong><span>Available only to the signed-in owner and authorized QRguitar administration.</span></div></article>
          </div>
        </section> : null}

        {visibleSectionIds.has("features") ? <section className="section product-guide-uses" id="profile-capabilities" style={sectionStyle("features")}>
          <div className="shell">
            <div className="section-heading centered-heading">
              <div className="eyebrow">One Profile, useful for years</div>
              <h2>Keep the information people actually need.</h2>
            </div>
            <div className="product-guide-use-grid product-guide-capability-grid">
              {blocks("features").map((item) => <article key={item.id}><span><EditorialIcon name={item.icon} /></span><h3>{item.title}</h3><p>{item.body}</p></article>)}
            </div>
          </div>
        </section> : null}

        {visibleSectionIds.has("service") ? <section className="section product-guide-identity" id="service-providers" style={sectionStyle("service")}>
          <div className="shell">
            <div className="section-heading centered-heading"><div className="eyebrow">Service and ownership</div><h2>Keep real work and real handoffs connected.</h2><p>Owners stay in control of what becomes part of the permanent Profile.</p></div>
            <div className="product-guide-dual-flow">
              <article>
                <Wrench /><div><h3>Service the owner approves</h3><p>A provider submits completed work and private evidence. The owner reviews, requests changes, declines, or approves it before anything is published.</p><Link href="/how-it-works#service-providers">Provider work stays clearly attributed</Link></div>
              </article>
              <article id="ownership">
                <Repeat2 /><div><h3>Transfer the same Profile</h3><p>The current owner sends a recipient-bound claim. The next owner accepts the existing Profile, while its QRguitar ID, URL, photos, and protected history stay connected.</p><span>A public scan can never take ownership.</span></div>
              </article>
            </div>
          </div>
        </section> : null}

        {visibleSectionIds.has("roles") ? <section className="section product-guide-uses" id="who-it-is-for" style={sectionStyle("roles")}>
          <div className="shell">
            <div className="section-heading centered-heading"><div className="eyebrow">Made for the instrument community</div><h2>Useful at home, at the bench, and across the counter.</h2></div>
            <div className="product-guide-role-switcher">
              <div className="product-guide-role-tabs" role="tablist" aria-label="Choose your role">
                {roleBlocks.map((item, index) => <button className={index === activeAudience ? "is-active" : ""} type="button" role="tab" aria-selected={index === activeAudience} key={item.id} onClick={() => setActiveAudience(index)}>{item.title}</button>)}
              </div>
              {selectedAudience ? <article className="product-guide-role-panel" role="tabpanel">
                <span>{String(activeAudience + 1).padStart(2, "0")}</span>
                <div><h3>{selectedAudience.title}</h3><p>{selectedAudience.body}</p></div>
                <Link className="button secondary" href={selectedAudience.ctaUrl || "/create"}>{selectedAudience.ctaLabel || "Create a Profile"}</Link>
              </article> : null}
            </div>
          </div>
        </section> : null}

        {visibleSectionIds.has("faq") ? <section className="section product-guide-faq" style={sectionStyle("faq")}>
          <div className="shell product-guide-faq-inner">
            <div><div className="eyebrow">Common questions</div><h2>Know what happens before you create a Profile.</h2></div>
            <div className="product-guide-faq-list">
              {blocks("faq").map((item) => <details key={item.id}><summary>{item.title}</summary><p>{item.body}</p></details>)}
            </div>
          </div>
        </section> : null}

        {visibleSectionIds.has("finalCta") ? <section className="section product-guide-cta" style={sectionStyle("finalCta")}>
          <div className="shell product-guide-cta-inner">
            <div><div className="eyebrow">Ready to start?</div><h2>Create the Profile that stays with the instrument.</h2></div>
            <div className="product-guide-actions">
              <Link className="button" href="/create">Create Profile <ArrowRight size={16} /></Link>
              <Link className="button secondary" href="/catalog">Browse Profiles</Link>
            </div>
          </div>
        </section> : null}
      </main>
      <Footer />
    </>
  );
}

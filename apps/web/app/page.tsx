"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { CheckoutButton } from "../components/CheckoutButton";
import { Footer } from "../components/Footer";
import { LatestPublicRecord } from "../components/LatestPublicRecord";
import { Nav } from "../components/Nav";
import { siteCopy } from "../content/site-copy";
import { readSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import type { PaymentItemId } from "../lib/payments";

export default function HomePage() {
  const [settings, setSettings] = useState<EditableSiteSettings | null>(null);

  useEffect(() => {
    setSettings(readSiteSettings());

    function onSettings() {
      setSettings(readSiteSettings());
    }

    window.addEventListener("qrguitar:site-settings", onSettings);
    window.addEventListener("storage", onSettings);

    return () => {
      window.removeEventListener("qrguitar:site-settings", onSettings);
      window.removeEventListener("storage", onSettings);
    };
  }, []);

  const copy = useMemo(() => {
    if (!settings) {
      return siteCopy;
    }

    return {
      ...siteCopy,
      hero: {
        ...siteCopy.hero,
        ...settings.hero
      },
      workflow: {
        ...siteCopy.workflow,
        headline: settings.sections.howHeadline,
        body: settings.sections.howBody
      },
      customization: {
        ...siteCopy.customization,
        headline: settings.sections.detailsHeadline,
        body: settings.sections.detailsBody
      },
      audiences: {
        ...siteCopy.audiences,
        headline: settings.sections.audienceHeadline,
        body: settings.sections.audienceBody
      },
      pricing: {
        ...siteCopy.pricing,
        headline: settings.sections.pricingHeadline,
        body: settings.sections.pricingBody
      }
    };
  }, [settings]);

  return (
    <>
      <Nav />
      <main>
        <section className="hero">
          <div className="shell hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">{copy.hero.eyebrow}</div>
              <h1>{copy.hero.headline}</h1>
              <p>{copy.hero.body}</p>
              <div className="hero-actions">
                <Link className="button" href="/create">
                  {copy.hero.primaryCta}
                </Link>
                <Link className="button secondary" href="/i/QRG-PI260001">
                  {copy.hero.secondaryCta}
                </Link>
              </div>
              <div className="trust-row" aria-label="Platform highlights">
                {copy.hero.trust.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            <LatestPublicRecord />
          </div>
        </section>

        <section className="section alt">
          <div className="shell">
            <div className="section-header">
              <div className="eyebrow">{copy.workflow.eyebrow}</div>
              <h2>{copy.workflow.headline}</h2>
              <p>{copy.workflow.body}</p>
            </div>
            <div className="grid three">
              {copy.workflow.cards.map((item) => (
                <Card key={item.title} icon={<item.icon size={30} />} title={item.title} copy={item.copy} />
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="shell split">
            <div>
              <div className="eyebrow">{copy.customization.eyebrow}</div>
              <h2>{copy.customization.headline}</h2>
              <p>{copy.customization.body}</p>
              <div className="check-list">
                {copy.customization.checks.map((item) => (
                  <div className="check-item" key={item.copy}>
                    <item.icon size={18} />
                    <span>{item.copy}</span>
                  </div>
                ))}
              </div>
              <div className="inline-cta-row">
                <Link className="button" href="/create">
                  {copy.customization.cta}
                </Link>
              </div>
            </div>
            <div className="profile-board">
              <div className="board-top">
                <span className="status-pill">Instrument identity</span>
                <span className="muted">QRG-PI260001</span>
              </div>
              <div className="board-hero">
                <h3>Verified record</h3>
                <p>Specs, photos, service notes, warranty documents, ownership status, and transfer tools in one scan.</p>
              </div>
              <div className="board-grid">
                <Mini icon={<copy.preview.specsIcon size={18} />} label="Inventory" />
                <Mini icon={<copy.preview.mediaIcon size={18} />} label="Media" />
                <Mini icon={<copy.preview.timelineIcon size={18} />} label="Service" />
                <Mini icon={<copy.preview.docsIcon size={18} />} label="Warranty" />
              </div>
            </div>
          </div>
        </section>

        <section className="section alt">
          <div className="shell">
            <div className="section-header">
              <div className="eyebrow">{copy.audiences.eyebrow}</div>
              <h2>{copy.audiences.headline}</h2>
              <p>{copy.audiences.body}</p>
            </div>
            <div className="grid four">
              {copy.audiences.cards.map((item) => (
                <Card key={item.title} icon={<item.icon size={28} />} title={item.title} copy={item.copy} />
              ))}
            </div>
          </div>
        </section>

        <section className="section pricing-section" id="pricing">
          <div className="shell">
            <div className="section-header">
              <div className="eyebrow">{copy.pricing.eyebrow}</div>
              <h2>{copy.pricing.headline}</h2>
              <p>{copy.pricing.body}</p>
            </div>
            <div className="pricing-grid">
              {copy.pricing.plans.map((plan) => (
                <PricingCard key={plan.name} {...plan} itemId={pricingItemIdForPlan(plan.name)} />
              ))}
            </div>
            <div className="enterprise-note">
              <strong>{copy.pricing.enterpriseTitle}</strong>
              <span>{copy.pricing.enterpriseBody}</span>
            </div>
          </div>
        </section>
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

function Mini({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="mini">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function PricingCard({
  name,
  price,
  copy,
  badge,
  features,
  itemId
}: {
  name: string;
  price: string;
  copy: string;
  badge?: string;
  features: string[];
  itemId: PaymentItemId;
}) {
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
      <CheckoutButton itemId={itemId}>Get Started</CheckoutButton>
    </article>
  );
}

function pricingItemIdForPlan(planName: string): PaymentItemId {
  if (planName.includes("10")) {
    return "pack10";
  }

  if (planName.includes("25")) {
    return "pack25";
  }

  if (planName.toLowerCase().includes("commercial")) {
    return "commercial";
  }

  return "single";
}

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../components/Footer";
import { LatestPublicRecord } from "../components/LatestPublicRecord";
import { Nav } from "../components/Nav";
import { siteCopy } from "../content/site-copy";
import { buildEditableHomeCopy, readSiteSettings, type EditableSiteSettings } from "../lib/site-settings";

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
          <div className="shell split record-holds-layout">
            <div className="record-holds-copy">
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
            {copy.audiences.cta ? (
              <div className="section-cta">
                <Link className="button" href="/dashboard">
                  {copy.audiences.cta}
                </Link>
              </div>
            ) : null}
          </div>
        </section>

        <section className="section pricing-section">
          <div className="shell">
            <div className="section-header">
              <div className="eyebrow">{copy.pricing.eyebrow}</div>
              <h2>{copy.pricing.headline}</h2>
              <p>{copy.pricing.body}</p>
            </div>
            <div className="pricing-grid">
              {copy.pricing.plans.map((plan) => (
                <PricingCard key={plan.name} {...plan} />
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

function PricingCard({
  name,
  price,
  copy,
  badge,
  features
}: {
  name: string;
  price: string;
  copy: string;
  badge?: string;
  features: string[];
}) {
  const normalizedName = name.trim().toLowerCase();
  const cta =
    normalizedName === "launch registry"
      ? "Create Free Record"
      : normalizedName === "verified record help"
        ? "Request Verification"
        : normalizedName === "local qr install"
          ? "Contact Support"
          : normalizedName === "builder / shop beta"
            ? "Join Builder Beta"
            : normalizedName === "custom qr hardware"
              ? "Contact Support"
            : "Contact Support";
  const href = normalizedName === "launch registry" ? "/create" : `mailto:support@qrguitar.com?subject=${encodeURIComponent(`QRguitar ${name}`)}`;

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
      <Link className="button" href={href}>
        {cta}
      </Link>
    </article>
  );
}

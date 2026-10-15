"use client";
import Link from "./CheckoutAwareLink";
import { ArrowRight, Camera, History, QrCode, Wrench } from "lucide-react";
import { getContentValue } from "../lib/content-registry";
import { resolveInstrumentPresentation } from "../lib/instrument-profile-contract";
import { resolveCollectibleCard } from "../lib/collectible-card";
import type { DemoInstrument } from "../lib/local-demo";
import styles from "./BoutiqueHome.module.css";

type Copy = Record<string, string>;
/** Only the existing public presentation may supply example details or counts. */
export function HomeProductStory({ record, content }: { record: DemoInstrument | null; content: Copy }) {
  const text = (key: string) => getContentValue(content, key);
  const card = record ? resolveCollectibleCard(record) : null;
  const publicView = record ? resolveInstrumentPresentation(record, "public") : null;
  const specs = record ? [[text("home.product.maker"), record.brand], [text("home.product.model"), record.model], [text("home.product.year"), record.year], [text("home.product.type"), record.instrumentType]].filter(([, value]) => String(value || "").trim()) : [];
  const steps = [1, 2, 3].map(index => ({ index, title: text("home.steps." + index + ".title"), body: text("home.steps." + index + ".body") })).filter(step => step.title || step.body);
  return <>
    <section className={styles.productSection} aria-labelledby="home-product-title">
      <div className={"shell " + styles.productGrid}>
        <div className={styles.productCopy}>
          {text("home.product.eyebrow") ? <p className={styles.eyebrow}>{text("home.product.eyebrow")}</p> : null}
          <h2 id="home-product-title">{text("home.product.headline")}</h2>
          {text("home.product.body") ? <p>{text("home.product.body")}</p> : null}
          <ul className={styles.featureList}>
            {[Camera, QrCode, History].map((Icon, index) => text("home.product.feature" + (index + 1)) ? <li key={index}><Icon size={20} aria-hidden="true" /><span>{text("home.product.feature" + (index + 1))}</span></li> : null)}
          </ul>
          {card ? <Link className={styles.textLink} href={card.profileUrl}>{text("home.product.cta")}<ArrowRight size={16} aria-hidden="true" /></Link> : null}
        </div>
        {card && publicView ? <div className={styles.recordPreview}>
          <div className={styles.recordHeading}><span>{text("home.product.example")}</span><Link href={card.profileUrl}>{card.code}</Link></div>
          <h3>{card.title}</h3>
          <dl className={styles.specPreview}>{specs.map(([label, value], index) => <div key={index}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <div className={styles.recordStats}>
            <div><Camera size={18} aria-hidden="true" /><strong>{publicView.counts.photos}</strong><span>{text("home.product.photos")}</span></div>
            <div><History size={18} aria-hidden="true" /><strong>{publicView.counts.timeline}</strong><span>{text("home.product.history")}</span></div>
            <div><Wrench size={18} aria-hidden="true" /><strong>{publicView.counts.service}</strong><span>{text("home.product.service")}</span></div>
          </div>
          {text("home.product.privacy") ? <p className={styles.privacyNote}>{text("home.product.privacy")}</p> : null}
        </div> : null}
      </div>
    </section>
    {steps.length ? <section className={styles.processSection} aria-labelledby="home-process-title"><div className="shell">
      <div className={styles.sectionHeading}><h2 id="home-process-title">{text("home.steps.headline")}</h2><Link className={styles.textLink} href="/how-it-works">{text("home.steps.cta")}<ArrowRight size={16} aria-hidden="true" /></Link></div>
      <ol className={styles.processGrid}>{steps.map(step => <li key={step.index}><span className={styles.stepNumber}>{"0" + step.index}</span><div>{step.title ? <h3>{step.title}</h3> : null}{step.body ? <p>{step.body}</p> : null}</div></li>)}</ol>
    </div></section> : null}
  </>;
}

export function HomeAudiences({ content }: { content: Copy }) {
  const text = (key: string) => getContentValue(content, key);
  const audiences = ["players", "shops", "builders"].map(key => ({ key, title: text("home.audience." + key + ".title"), body: text("home.audience." + key + ".body") })).filter(item => item.title || item.body);
  return audiences.length ? <section className={styles.audienceSection} aria-labelledby="home-audience-title"><div className="shell">
    <div className={styles.sectionHeading}><h2 id="home-audience-title">{text("home.audience.headline")}</h2></div>
    <div className={styles.audienceGrid}>{audiences.map(item => <article key={item.key}>{item.title ? <h3>{item.title}</h3> : null}{item.body ? <p>{item.body}</p> : null}</article>)}</div>
  </div></section> : null;
}

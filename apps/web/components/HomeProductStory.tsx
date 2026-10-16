"use client";
import Link from "./CheckoutAwareLink";
import { useUiText } from "./UiTextProvider";
import { ArrowRight, Camera, History, QrCode, Wrench } from "lucide-react";
import { defaultContentValues, getContentValue } from "../lib/content-registry";
import { resolveInstrumentPresentation, normalizeRecordedServiceDate, formatRecordedServiceDate } from "../lib/instrument-profile-contract";
import { resolveCollectibleCard } from "../lib/collectible-card";
import type { DemoInstrument } from "../lib/local-demo";
import styles from "./BoutiqueHome.module.css";

type Copy = Record<string, string>;
/** Only the existing public presentation may supply example details or counts. */
export function HomeProductStory({ record, content }: { record: DemoInstrument | null; content: Copy }) {
  const text = (key: string) => getContentValue(content, key);
  const card = record ? resolveCollectibleCard(record) : null;
  const publicView = record ? resolveInstrumentPresentation(record, "public") : null;
  const ui = useUiText("components.HomeProductStory");
  const countLabel = (key: string, count: number, singular: string) => count === 1 && text(key) === defaultContentValues[key] ? singular : text(key);
  const serviceExample = publicView?.serviceEntries.find(event => event.title.trim());
  const serviceDate = serviceExample ? normalizeRecordedServiceDate(serviceExample.serviceDate, serviceExample.datePrecision) : undefined;
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
            <div><Camera size={18} aria-hidden="true" /><strong>{publicView.counts.photos}</strong><span>{countLabel("home.product.photos", publicView.counts.photos, ui("ui.components.HomeProductStory.count.photos.singular", "photo"))}</span></div>
            {publicView.counts.timeline > 0 ? <div><History size={18} aria-hidden="true" /><strong>{publicView.counts.timeline}</strong><span>{countLabel("home.product.history", publicView.counts.timeline, ui("ui.components.HomeProductStory.count.history.singular", "history entry"))}</span></div> : null}
            {publicView.counts.service > 0 ? <div><Wrench size={18} aria-hidden="true" /><strong>{publicView.counts.service}</strong><span>{countLabel("home.product.service", publicView.counts.service, ui("ui.components.HomeProductStory.count.service.singular", "service entry"))}</span></div> : null}
          </div>
          {serviceExample ? <div className={styles.serviceExample}>
            <div><Wrench size={17} aria-hidden="true" /><span>{text("home.product.service")}</span>{serviceDate ? <time dateTime={serviceDate.date}>{formatRecordedServiceDate(serviceDate)}</time> : null}</div>
            <h4>{serviceExample.title}</h4>
            <p>{serviceExample.sourceKind === "provider_submitted_owner_approved" ? ui("ui.components.HomeProductStory.home.service.ownerApprovedProvider", "Owner-approved provider record") : ui("ui.components.HomeProductStory.home.service.ownerReported", "Owner-reported service")}</p>
            <Link className={styles.textLink} href={card.profileUrl}>{text("home.product.cta")}<ArrowRight size={16} aria-hidden="true" /></Link>
          </div> : null}
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

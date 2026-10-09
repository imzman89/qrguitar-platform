"use client";
import { useState } from "react";
import Link from "./CheckoutAwareLink";
import { ArrowRight } from "lucide-react";
import { getContentValue } from "../lib/content-registry";
import type { EditorialBlock } from "../lib/site-settings";
import styles from "./HomeRoleSelector.module.css";

const groups = [
  {
    "id": "collection",
    "blocks": [
      "home-role-owner",
      "home-role-collector",
      "home-role-buyer"
    ],
    "label": "home.roles.collection.label",
    "headline": "home.roles.collection.headline",
    "body": "home.roles.collection.body",
    "details": "home.roles.collection.details",
    "features": [
      {
        "title": "home.roles.collection.feature1.title",
        "body": "home.roles.collection.feature1.body"
      },
      {
        "title": "home.roles.collection.feature2.title",
        "body": "home.roles.collection.feature2.body"
      },
      {
        "title": "home.roles.collection.feature3.title",
        "body": "home.roles.collection.feature3.body"
      }
    ]
  },
  {
    "id": "workshop",
    "blocks": [
      "home-role-provider"
    ],
    "label": "home.roles.workshop.label",
    "headline": "home.roles.workshop.headline",
    "body": "home.roles.workshop.body",
    "details": "home.roles.workshop.details",
    "features": [
      {
        "title": "home.roles.workshop.feature1.title",
        "body": "home.roles.workshop.feature1.body"
      },
      {
        "title": "home.roles.workshop.feature2.title",
        "body": "home.roles.workshop.feature2.body"
      },
      {
        "title": "home.roles.workshop.feature3.title",
        "body": "home.roles.workshop.feature3.body"
      }
    ]
  },
  {
    "id": "business",
    "blocks": [
      "home-role-shop",
      "home-role-builder"
    ],
    "label": "home.roles.business.label",
    "headline": "home.roles.business.headline",
    "body": "home.roles.business.body",
    "details": "home.roles.business.details",
    "features": [
      {
        "title": "home.roles.business.feature1.title",
        "body": "home.roles.business.feature1.body"
      },
      {
        "title": "home.roles.business.feature2.title",
        "body": "home.roles.business.feature2.body"
      },
      {
        "title": "home.roles.business.feature3.title",
        "body": "home.roles.business.feature3.body"
      }
    ]
  }
];

function roleHref(block: EditorialBlock) {
  const href = block.ctaUrl || "/how-it-works";
  const guideRoles: Record<string, string> = { "home-role-provider": "how-role-provider", "home-role-shop": "how-role-shop", "home-role-builder": "how-role-builder" };
  const audience = Object.hasOwn(guideRoles, block.id) ? guideRoles[block.id] : undefined;
  return audience && ["/how-it-works#service-providers", "/how-it-works#who-it-is-for"].includes(href)
    ? `/how-it-works?audience=${audience}#who-it-is-for`
    : href;
}

export function HomeRoleSelector({ blocks, content, label, fallbackAction, installerLabel }: { blocks: EditorialBlock[]; content: Record<string, string>; label: string; fallbackAction: string; installerLabel: string }) {
  const [selectedId, setSelectedId] = useState(groups[0].id);
  const visibleBlocks = blocks.filter(block => block.visible);
  const available = groups.filter(group => visibleBlocks.some(block => group.blocks.includes(block.id)));
  const otherBlocks = visibleBlocks.filter(block => !groups.some(group => group.blocks.includes(block.id)));
  const text = (key: string) => getContentValue(content, key);
  const otherRoles = otherBlocks.length ? <details className={styles.details}><summary>{getContentValue(content, "home.roles.other")}<span aria-hidden="true">+</span></summary><div className={styles.roleDetails}>{otherBlocks.map(block => <div key={block.id}><h4>{block.title}</h4><p>{block.body}</p><Link href={roleHref(block)}>{block.ctaLabel || fallbackAction}<ArrowRight size={16} aria-hidden="true" /></Link></div>)}</div></details> : null;
  if (!available.length) return otherRoles ? <div className={styles.selector}>{otherRoles}</div> : null;
  const selectedIndex = Math.max(0, available.findIndex(group => group.id === selectedId));
  const selected = available[selectedIndex];
  const selectedBlocks = visibleBlocks.filter(block => selected.blocks.includes(block.id));
  const primary = selectedBlocks[0];
  const workflowHref = roleHref(primary);
  const directSetup = selected.id !== "collection" && ["/how-it-works#service-providers", "/how-it-works#who-it-is-for"].includes(primary.ctaUrl || "");
  return <div className={styles.selector}>
    <div className={styles.tabs} role="tablist" aria-label={label} onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const next = event.key === "ArrowRight" ? (selectedIndex + 1) % available.length : event.key === "ArrowLeft" ? (selectedIndex - 1 + available.length) % available.length : event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : null;
      if (next !== null) { event.preventDefault(); setSelectedId(available[next].id); event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus(); }
    }}>
      {available.map((group, index) => <button type="button" role="tab" key={group.id} id={`home-role-${group.id}`} aria-controls="home-role-panel" aria-label={text(group.label)} aria-selected={index === selectedIndex} tabIndex={index === selectedIndex ? 0 : -1} onClick={() => setSelectedId(group.id)}><span><strong>{text(group.label)}</strong><small>{text(group.features[0].title)}</small></span><ArrowRight size={16} aria-hidden="true" /></button>)}
    </div>
    <article className={styles.panel} role="tabpanel" id="home-role-panel" aria-labelledby={`home-role-${selected.id}`} tabIndex={0}>
      <div className={styles.statement}>
        <h3>{text(selected.headline)}</h3><p>{text(selected.body)}</p>
        <div className={styles.actions}>
          <Link className={styles.action} href={directSetup ? "/account?section=profile" : workflowHref}>{directSetup ? text(`home.roles.${selected.id}.startCta`) : primary.ctaLabel || fallbackAction}<ArrowRight size={18} aria-hidden="true" /></Link>
          {directSetup ? <Link className={styles.workflow} href={workflowHref}>{text("home.roles.workflowCta")}<ArrowRight size={16} aria-hidden="true" /></Link> : null}
        </div>
        <p className={styles.access}>{getContentValue(content, "home.hero.accessNote")}</p>
      </div>
      <details className={styles.details} key={selected.id}><summary>{text(selected.details)}<span aria-hidden="true">+</span></summary><ol className={styles.features}>
        {selected.features.map((feature, index) => <li key={feature.title}><span className={styles.number} aria-hidden="true">{String(index+1).padStart(2,"0")}</span><div><h4>{text(feature.title)}</h4><p>{text(feature.body)}</p></div></li>)}
      </ol><div className={styles.roleDetails}>{selectedBlocks.map(block => <div key={block.id}><h4>{block.title}</h4><p>{block.body}</p><Link href={roleHref(block)}>{block.ctaLabel || fallbackAction}<ArrowRight size={16} aria-hidden="true" /></Link></div>)}</div>{selected.id !== "collection" ? <Link className={styles.installer} href="/installers">{installerLabel}<ArrowRight size={16} aria-hidden="true" /></Link> : null}</details>
    </article>
    {otherRoles}
  </div>;
}

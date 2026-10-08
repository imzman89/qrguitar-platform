
import { createUiText } from "../../lib/ui-text";
import { buildInstallerEmailDraft, supportEmailAddress } from "../../lib/support-email-draft";
import Link from "next/link";
import styles from "./installers.module.css";
import type { CSSProperties } from "react";
import { EditorialIcon } from "../../components/EditorialIcon";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import type { Metadata } from "next";
import { getContentValue } from "../../lib/content-registry";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";
import { buildManagedPageMetadata } from "../../lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildManagedPageMetadata("installers", "/installers");
}

const providerRequirements = [
  "Business name and contact information",
  "Website or professional work examples",
  "Services offered",
  "Service area",
  "Finish or refinish experience",
  "Ability to document installations with photos"
];

export default async function InstallersPage() {
  const ui = createUiText((await loadPublishedSiteSettings()).content, "app.installers.page");
  const settings = await loadPublishedSiteSettings();
  const content = settings.content;
  const sections = settings.composition.installers.sections;
  const sectionStyle = (sectionId: string): CSSProperties => {
    const index = sections.findIndex((section) => section.id === sectionId);
    return { order: index < 0 ? 99 : index, display: sections[index]?.visible === false ? "none" : undefined };
  };
  const vettingSteps = sections.find((section) => section.id === "process")?.blocks.filter((block) => block.visible) || [];
  const applicationGuidance = ui("ui.app.installers.page.applicationEmailGuidance", "Complete these six details, review your email, and send it to support@qrguitar.com. Opening a draft does not submit an application. Applications are reviewed manually; applying does not approve or publish your business. Do not include passwords, payment-card numbers, reset links, or unrelated personal documents.");
  const applicationDraft = buildInstallerEmailDraft(ui("ui.app.installers.page.applicationEmailSubject", "QRguitar Provider Network Application"), providerRequirements, applicationGuidance);
  const applicationHref = applicationDraft.href || `mailto:${supportEmailAddress}`;
  return (
    <>
      <Nav />
      <main className={`${styles.page} editorial-composed-page`}>
        <section className="section installer-hero" style={sectionStyle("hero")}>
          <div className="shell installer-hero-grid">
            <div>
              <div className="eyebrow">{getContentValue(content, "installers.hero.eyebrow")}</div>
              <h1>{getContentValue(content, "installers.hero.headline")}</h1>
              <p>{getContentValue(content, "installers.hero.body")}</p>
              <div className="hero-actions">
                <Link className="button" href={applicationHref}>
                  {getContentValue(content, "installers.actions.apply")}
                </Link>
              </div>
              <p className="installer-beta-note">{ui("ui.app.installers.page.f6d3c70532d2", "Applications are reviewed manually. QRguitar connects approved shops and owners manually, and applying never publishes your business automatically.")}</p>
            </div>
            <div className="installer-feature-card">
              <div className="eyebrow">{ui("ui.app.installers.page.213ee4bccc52", "For working professionals")}</div>
              <h2>{ui("ui.app.installers.page.5ac60128dbd5", "Document work without taking ownership.")}</h2>
              <p>{ui("ui.app.installers.page.64327c61d93a", "Approved providers can submit service dates, notes, photos, and evidence to an existing QRguitar Profile. The owner reviews the submission before it becomes part of the instrument history.")}</p>
              <div className="installer-service-list">
                {["No ownership transfer from a scan", "No public update without owner approval", "One permanent Profile before and after service"].map((requirement) => (
                  <span key={requirement}>{requirement}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section alt" id="apply" style={sectionStyle("apply")}>
          <div className="shell installer-apply">
            <div>
              <div className="eyebrow">{ui("ui.app.installers.page.b6967ae53bf4", "Provider application")}</div>
              <h2>{ui("ui.app.installers.page.fb719a28dd43", "Show us your business and the work you do.")}</h2>
              <p>{ui("ui.app.installers.page.a8de0366bbf0", "Repair shops, luthiers, builders, retailers, and technicians can apply to add owner-approved service records and prepare customer-ready QR handouts.")}</p>
            </div>
            <div className="installer-apply-panel">
              <h3>{ui("ui.app.installers.page.d9094d538a44", "Application details")}</h3>
              <ul>
                {providerRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
              </ul>
              <Link className="button" href={applicationHref}>
                {getContentValue(content, "installers.actions.apply")}
              </Link>
              <p className="fine-print">{applicationGuidance}</p>
              <a href={`mailto:${supportEmailAddress}`}>{supportEmailAddress}</a>
            </div>
          </div>
        </section>

        <section className="section" style={sectionStyle("process")}>
          <div className="shell">
            <div className="section-header">
              <div className="eyebrow">{ui("ui.app.installers.page.0b2520fca0ea", "Provider review")}</div>
              <h2>{getContentValue(content, "installers.process.heading")}</h2>
            </div>
            <div className="grid three">
              {vettingSteps.map((step, index) => (
                <article className="card" key={step.id}>
                  <div className="step-number"><EditorialIcon name={step.icon} /> {index + 1}</div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

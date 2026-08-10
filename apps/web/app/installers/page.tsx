import Link from "next/link";
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
  const settings = await loadPublishedSiteSettings();
  const content = settings.content;
  const sections = settings.composition.installers.sections;
  const sectionStyle = (sectionId: string): CSSProperties => {
    const index = sections.findIndex((section) => section.id === sectionId);
    return { order: index < 0 ? 99 : index, display: sections[index]?.visible === false ? "none" : undefined };
  };
  const vettingSteps = sections.find((section) => section.id === "process")?.blocks.filter((block) => block.visible) || [];
  return (
    <>
      <Nav />
      <main className="editorial-composed-page">
        <section className="section installer-hero" style={sectionStyle("hero")}>
          <div className="shell installer-hero-grid">
            <div>
              <div className="eyebrow">{getContentValue(content, "installers.hero.eyebrow")}</div>
              <h1>{getContentValue(content, "installers.hero.headline")}</h1>
              <p>{getContentValue(content, "installers.hero.body")}</p>
              <div className="hero-actions">
                <Link className="button" href="mailto:support@qrguitar.com?subject=QRguitar%20Provider%20Network%20Application">
                  {getContentValue(content, "installers.actions.apply")}
                </Link>
              </div>
              <p className="installer-beta-note">Applications are reviewed manually during beta. QRguitar connects approved shops and owners manually, and applying never publishes your business automatically.</p>
            </div>
            <div className="installer-feature-card">
              <div className="eyebrow">For working professionals</div>
              <h2>Document work without taking ownership.</h2>
              <p>Approved providers can submit service dates, notes, photos, and evidence to an existing QRguitar Profile. The owner reviews the submission before it becomes part of the instrument history.</p>
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
              <div className="eyebrow">Provider application</div>
              <h2>Show us your business and the work you do.</h2>
              <p>Repair shops, luthiers, builders, retailers, and technicians can apply to add owner-approved service records and prepare customer-ready QR handouts.</p>
            </div>
            <div className="installer-apply-panel">
              <h3>Application details</h3>
              <ul>
                {providerRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
              </ul>
              <Link className="button" href="mailto:support@qrguitar.com?subject=QRguitar%20Provider%20Network%20Application">
                {getContentValue(content, "installers.actions.apply")}
              </Link>
            </div>
          </div>
        </section>

        <section className="section" style={sectionStyle("process")}>
          <div className="shell">
            <div className="section-header">
              <div className="eyebrow">Provider review</div>
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

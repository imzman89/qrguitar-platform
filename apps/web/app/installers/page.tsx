import { Paintbrush, ShieldCheck } from "lucide-react";
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

const installerServices = [
  "Under-finish QR placement",
  "Clear coat and finish-safe application",
  "Repair intake documentation",
  "Serial/photo verification",
  "Ownership handoff assistance"
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
                <Link className="button" href="mailto:support@qrguitar.com?subject=QRguitar%20Installer%20Network%20Application">
                  Contact QRguitar
                </Link>
              </div>
            </div>
            <div className="installer-feature-card">
              <div className="icon"><Paintbrush size={28} /></div>
              <h2>Under-finish ready</h2>
              <p>
                Built for permanent instrument IDs that can be applied, documented, and protected as part of a guitar's
                physical history.
              </p>
              <div className="installer-service-list">
                {installerServices.map((service) => (
                  <span key={service}><ShieldCheck size={15} />{service}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section alt" style={sectionStyle("process")}>
          <div className="shell">
            <div className="section-header">
              <div className="eyebrow">How it works</div>
              <h2>A trusted path from QR code to permanent install.</h2>
              <p>Owners can start with a QRguitar Profile now. QRguitar connects approved shops and owners manually during beta.</p>
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

        <section className="section alt" id="apply" style={sectionStyle("apply")}>
          <div className="shell installer-apply">
            <div>
              <div className="eyebrow">For luthiers and repair shops</div>
              <h2>Become a QRguitar vetted installer.</h2>
              <p>
                Join the network early and help shape the standard for permanent QRguitar installation, verification
                photos, repair documentation, and owner-transfer planning while ownership tools are in beta.
              </p>
            </div>
            <div className="installer-apply-panel">
              <h3>Early partner intake</h3>
              <p>Email these details to start a manual beta review:</p>
              <ul>
                <li>Business name, address, website, and contact email</li>
                <li>Finish/refinish experience and example work</li>
                <li>Services offered and travel/service region</li>
                <li>Whether they can document installs with photos</li>
              </ul>
              <Link className="button" href="mailto:support@qrguitar.com?subject=QRguitar%20Installer%20Network">
                Contact QRguitar
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

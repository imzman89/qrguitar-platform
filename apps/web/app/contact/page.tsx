import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { EditorialIcon } from "../../components/EditorialIcon";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getContentValue } from "../../lib/content-registry";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";
import { buildManagedPageMetadata } from "../../lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildManagedPageMetadata("contact", "/contact");
}

export default async function ContactPage() {
  const settings = await loadPublishedSiteSettings();
  const sections = settings.composition.contact.sections;
  const sectionStyle = (sectionId: string): CSSProperties => {
    const index = sections.findIndex((section) => section.id === sectionId);
    return { order: index < 0 ? 99 : index, display: sections[index]?.visible === false ? "none" : undefined };
  };
  const supportTopics = sections.find((section) => section.id === "categories")?.blocks.filter((block) => block.visible) || [];

  return (
    <>
      <Nav />
      <main className="editorial-composed-page">
        <section className="section" style={sectionStyle("hero")}>
          <div className="shell legal-page contact-page">
            <div className="contact-hero">
              <div>
                <div className="eyebrow">Support</div>
                <h1>{getContentValue(settings.content, "contact.hero.headline")}</h1>
                <p>{getContentValue(settings.content, "contact.hero.body")}</p>
              </div>
              <div className="contact-direct-card">
                <span>Public support inbox</span>
                <a className="button" href="mailto:support@qrguitar.com">support@qrguitar.com</a>
                <small>Use the email attached to your QRguitar account and include the QRguitar ID when the question is about a specific profile.</small>
              </div>
            </div>

          </div>
        </section>

        <section className="section" style={sectionStyle("categories")}>
          <div className="shell legal-page contact-page">
            <div className="contact-topic-grid">
              {supportTopics.map((topic) => (
                <a className="contact-topic-card" href={topic.ctaUrl || "mailto:support@qrguitar.com"} key={topic.id}>
                  <EditorialIcon name={topic.icon} />
                  <strong>{topic.title}</strong>
                  <span>{topic.body}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={sectionStyle("checklist")}>
          <div className="shell legal-page contact-page">
            <div className="legal-card contact-checklist">
              <h2>What to include</h2>
              <ul>
                <li>QRguitar ID or profile link, if you have one.</li>
                <li>The account email you used to create the profile.</li>
                <li>Photos, receipts, service notes, or proof details relevant to the request.</li>
                <li>A short note explaining what you need changed, reviewed, or fixed.</li>
              </ul>
              <p className="fine-print">Do not email card numbers, passwords, private reset links, or unrelated personal documents.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

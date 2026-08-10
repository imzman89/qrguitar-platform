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
                <div className="eyebrow">{getContentValue(settings.content, "contact.hero.eyebrow")}</div>
                <h1>{getContentValue(settings.content, "contact.hero.headline")}</h1>
                <p>{getContentValue(settings.content, "contact.hero.body")}</p>
              </div>
              <div className="contact-direct-card">
                <span>Support email</span>
                <a className="button" href="mailto:support@qrguitar.com">support@qrguitar.com</a>
                <small>Use the email on your QRguitar account and include the QRguitar ID when your question is about a specific Profile.</small>
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
              <h2>{getContentValue(settings.content, "contact.support.heading")}</h2>
              <ul>
                <li>QRguitar ID or Profile link, if applicable</li>
                <li>The email on your QRguitar account</li>
                <li>Relevant photos, documents, or service information</li>
                <li>A short description of what you need</li>
              </ul>
              <p className="fine-print">{getContentValue(settings.content, "contact.support.body")}</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

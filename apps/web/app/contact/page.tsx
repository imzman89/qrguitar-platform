
import { createUiText } from "../../lib/ui-text";
import styles from "./contact.module.css";
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
  const ui = createUiText((await loadPublishedSiteSettings()).content, "app.contact.page");
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
      <main className={`editorial-composed-page ${styles.contact}`}>
        <section className="section" style={sectionStyle("hero")}>
          <div className="shell legal-page contact-page">
            <div className="contact-hero">
              <div>
                <div className="eyebrow">{getContentValue(settings.content, "contact.hero.eyebrow")}</div>
                <h1>{getContentValue(settings.content, "contact.hero.headline")}</h1>
                <p>{getContentValue(settings.content, "contact.hero.body")}</p>
              </div>
              <div className="contact-direct-card">
                <span>{ui("ui.app.contact.page.86700824f25e", "Support email")}</span>
                <a className="button" href="mailto:support@qrguitar.com">support@qrguitar.com</a>
                <small>{ui("ui.app.contact.page.ca07ed3aeab0", "Use the email on your QRguitar account and include the QRguitar ID when your question is about a specific Profile.")}</small>
              </div>
            </div>

          </div>
        </section>

        <section className="section" style={sectionStyle("categories")}>
          <div className="shell legal-page contact-page">
            <div className="contact-topic-grid">
              {supportTopics.map((topic) => {
                const separateDestination = topic.ctaUrl && topic.ctaUrl.split("?")[0].trim().toLowerCase() !== "mailto:support@qrguitar.com";
                const Topic = separateDestination ? "a" : "article";
                return <Topic className="contact-topic-card" href={separateDestination ? topic.ctaUrl : undefined} key={topic.id}>
                  <EditorialIcon name={topic.icon} />
                  <strong>{topic.title}</strong>
                  <span>{topic.body}</span>
                </Topic>;
              })}
            </div>
          </div>
        </section>

        <section className="section" style={sectionStyle("checklist")}>
          <div className="shell legal-page contact-page">
            <div className="legal-card contact-checklist">
              <h2>{getContentValue(settings.content, "contact.support.heading")}</h2>
              <ul>
                <li>{ui("ui.app.contact.page.033917c675c9", "QRguitar ID or Profile link, if applicable")}</li>
                <li>{ui("ui.app.contact.page.13cf847c78fe", "The email on your QRguitar account")}</li>
                <li>{ui("ui.app.contact.page.b326afdcfd83", "Relevant photos, documents, or service information")}</li>
                <li>{ui("ui.app.contact.page.a1a5b42347d6", "A short description of what you need")}</li>
              </ul>
              <p className="fine-print">{getContentValue(settings.content, "contact.support.body")}</p>
              {getContentValue(settings.content, "contact.support.body") !== getContentValue(settings.content, "contact.support.securityGuidance") ? <p className="fine-print">{getContentValue(settings.content, "contact.support.securityGuidance")}</p> : null}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

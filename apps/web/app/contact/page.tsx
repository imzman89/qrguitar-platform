
import { createUiText } from "../../lib/ui-text";
import { ContactEmailDraft, type SupportDraftCopy } from "./ContactEmailDraft";
import styles from "./contact.module.css";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
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
  const draftCopy: SupportDraftCopy = {
    heading: ui("ui.app.contact.page.draftHeading", "Contact support"),
    intro: ui("ui.app.contact.page.draftIntro", "Send a message here or use your email app."),
    security: getContentValue(settings.content, "contact.support.securityGuidance"),
    name: ui("ui.app.contact.page.draftName", "Name"),
    email: ui("ui.app.contact.page.draftEmail", "Email"),
    topic: ui("ui.app.contact.page.draftTopic", "Topic"),
    message: ui("ui.app.contact.page.draftMessage", "Message"),
    subject: ui("ui.app.contact.page.draftSubject", "QRguitar support"),
    general: ui("ui.app.contact.page.draftGeneral", "General support"),
    prepare: ui("ui.app.contact.page.draftPrepare", "Use email instead"),
    prepared: ui("ui.app.contact.page.draftPrepared", "Draft prepared on this device. Opening it does not send email. Review and send it in your email app."),
    open: ui("ui.app.contact.page.draftOpen", "Open email draft"),
    manual: ui("ui.app.contact.page.draftManual", "If your email app does not open, select and copy the text below into a new email to"),
    longDraft: ui("ui.app.contact.page.draftLong", "This draft is too long for a reliable email link. Copy the complete text below into your email app."),
    noScript: ui("ui.app.contact.page.draftNoScript", "The draft helper needs JavaScript. You can still email support directly using the address above."),
    required: ui("ui.app.contact.page.draftRequired", "Enter your name, email, and message."),
    invalidEmail: ui("ui.app.contact.page.draftInvalidEmail", "Enter a valid email address."),
    tooLong: ui("ui.app.contact.page.draftTooLong", "Shorten the name, email, topic, or message and try again."),
    send: ui("ui.app.contact.page.contactSend", "Send to support"),
    sending: ui("ui.app.contact.page.contactSending", "Sending request…"),
    accepted: ui("ui.app.contact.page.contactAccepted", "Your message was accepted for delivery. Your text is still here if you need to keep a copy."),
    unconfirmed: ui("ui.app.contact.page.contactUnconfirmed", "We couldn’t confirm delivery. Your message is still here. Please check before sending it again."),
    rejected: ui("ui.app.contact.page.contactRejected", "Your message wasn’t accepted. Check the details and try again, or use your email app."),
    unavailable: ui("ui.app.contact.page.contactUnavailable", "Messages can’t be sent from this page right now. Your text is still here. Use your email app instead."),
    limited: ui("ui.app.contact.page.contactLimited", "Too many attempts. Please wait before trying again. Your message is still here."),
    website: ui("ui.app.contact.page.contactWebsite", "Leave this field empty")
  };

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
            <ContactEmailDraft copy={draftCopy} topics={supportTopics.map(topic => ({ id: topic.id, title: topic.title }))} />
          </div>
        </section>

        <section className="section" style={sectionStyle("categories")}>
          <div className="shell legal-page contact-page">
            <div className="contact-topic-grid">
              {supportTopics.map((topic) => {
                const separateDestination = Boolean(topic.ctaUrl?.trim());
                const Topic = separateDestination ? "a" : "article";
                return <Topic className="contact-topic-card" href={separateDestination ? topic.ctaUrl : undefined} key={topic.id}>
                  <EditorialIcon name={topic.icon} />
                  <strong>{topic.title}</strong>
                  <span>{topic.body}</span>
                  {separateDestination && topic.ctaLabel ? <span className="contact-topic-action">{topic.ctaLabel}<ArrowUpRight aria-hidden="true" /></span> : null}
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

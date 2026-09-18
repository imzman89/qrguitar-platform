import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getContentValue } from "../../lib/content-registry";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";
import { buildManagedPageMetadata } from "../../lib/site-metadata";
import { configuredOptionalTracking } from "../../lib/optional-tracking-consent";

export async function generateMetadata(): Promise<Metadata> {
  return buildManagedPageMetadata("privacy", "/privacy");
}

export default async function PrivacyPage() {
  const settings = await loadPublishedSiteSettings();
  const sections = [
    {
      title: getContentValue(settings.content, "privacy.sections.dataCollected.heading"),
      copy: getContentValue(settings.content, "privacy.sections.dataCollected.body")
    },
    {
      title: getContentValue(settings.content, "privacy.sections.visibility.heading"),
      copy: getContentValue(settings.content, "privacy.sections.visibility.body")
    },
    {
      title: getContentValue(settings.content, "privacy.sections.serial.heading"),
      copy: getContentValue(settings.content, "privacy.sections.serial.body")
    },
    {
      title: getContentValue(settings.content, "privacy.sections.documents.heading"),
      copy: getContentValue(settings.content, "privacy.sections.documents.body")
    },
    {
      title: getContentValue(settings.content, "privacy.sections.security.heading"),
      copy: getContentValue(settings.content, "privacy.sections.security.body")
    }
  ];

  return (
    <>
      <Nav />
      <main>
        <section className="section">
          <div className="shell legal-page">
            <div className="eyebrow">Privacy</div>
            <h1>{getContentValue(settings.content, "privacy.hero.headline")}</h1>
            <p>{getContentValue(settings.content, "privacy.hero.intro")}</p>
            {sections.map((section) => (
              <div className="legal-card" key={section.title}>
                <h2>{section.title}</h2>
                <p>{section.copy}</p>
              </div>
            ))}
            <div className="legal-card">
              <h2>Cookies and browser storage</h2>
              <p>
                QRguitar uses essential cookies and browser storage for sign-in, session security, authorized
                previews, app preferences, and drafts or pending work you choose to save. These product features
                remain available if you deny optional tracking.
              </p>
              <p>
                {configuredOptionalTracking.enabled
                  ? "Configured optional analytics or advertising measurement stays off until you choose Accept. Deny keeps it off. QRguitar stores only your consent choice in your browser."
                  : "Optional analytics and advertising are not currently configured. If either is added later, it will stay off until you choose Accept. Deny will keep it off, and QRguitar will store only your consent choice in your browser."}
              </p>
            </div>
            <div className="legal-card legal-final-note">
              <p>{getContentValue(settings.content, "privacy.finalNote")}</p>
              <a href="mailto:support@qrguitar.com">support@qrguitar.com</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

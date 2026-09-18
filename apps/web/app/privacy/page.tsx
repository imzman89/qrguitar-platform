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
    },
    {
      title: getContentValue(settings.content, "privacy.sections.payments.heading"),
      copy: getContentValue(settings.content, "privacy.sections.payments.body")
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
                  ? "Configured optional analytics or advertising measurement stays off until you choose Accept. Deny keeps it off. A compact Privacy choices control remains available so you can turn optional tracking off at any time. QRguitar stores your consent choice and anonymous one-way session markers that prevent duplicate success counts; those markers contain no account, Profile, transfer, or payment identifiers."
                  : "Optional analytics and advertising are not currently configured. If either is added later, it will stay off until you choose Accept. Deny will keep it off, and QRguitar will store only your consent choice in your browser."}
              </p>
              <p>
                When optional analytics is enabled and accepted, QRguitar can measure successful public Profile views,
                registrations, Profile creation, checkout starts, completed credit purchases, and completed ownership
                transfers using fixed anonymous properties. QRguitar does not label an ordinary Profile visit as a QR scan.
                Names, email addresses, serial numbers, QRguitar IDs, Profile URLs, transfer tokens, and payment IDs are
                excluded from optional event details.
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

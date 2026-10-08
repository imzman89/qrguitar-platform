
import { createUiText } from "../../lib/ui-text";
import styles from "../../components/LegalDocument.module.css";
import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getContentValue } from "../../lib/content-registry";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";
import { buildManagedPageMetadata } from "../../lib/site-metadata";
import { configuredGoogleAnalytics, hasConfiguredOptionalTrackingProvider } from "../../lib/google-analytics-config";

export async function generateMetadata(): Promise<Metadata> {
  return buildManagedPageMetadata("privacy", "/privacy");
}

export default async function PrivacyPage() {
  const ui = createUiText((await loadPublishedSiteSettings()).content, "app.privacy.page");
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
      <main className={styles.document}>
        <section className="section">
          <div className="shell legal-page">
            <div className="eyebrow">{ui("ui.app.privacy.page.54a57c3147c4", "Privacy")}</div>
            <h1>{getContentValue(settings.content, "privacy.hero.headline")}</h1>
            <p>{getContentValue(settings.content, "privacy.hero.intro")}</p>
            {sections.map((section) => (
              <div className="legal-card" key={section.title}>
                <h2>{section.title}</h2>
                <p>{section.copy}</p>
              </div>
            ))}
            <div className="legal-card">
              <h2>{ui("ui.app.privacy.page.38458ed6b62e", "Cookies and browser storage")}</h2>
              <p>{ui("ui.app.privacy.page.4cf444b26662", "QRguitar uses essential cookies and browser storage for sign-in, session security, authorized previews, app preferences, and drafts or pending work you choose to save. These product features remain available if you deny optional tracking.")}</p>
              <p>
                {hasConfiguredOptionalTrackingProvider()
                  ? ui("ui.app.privacy.page.084629fdbfbd", "Configured optional analytics or advertising measurement stays off until you choose Accept. Deny keeps it off. A compact Privacy choices control remains available so you can turn optional tracking off at any time. QRguitar stores your consent choice and, after acceptance, up to 128 pseudonymous conversion markers made with a one-way hash in local browser storage to reduce duplicate counts for recent successes across visits and tabs. Denying clears those markers. A marker does not contain the raw account, Profile, transfer, or payment identifier, but it is not anonymous and may be linkable by a party that already knows the source identifier.")
                  : ui("ui.app.privacy.page.9b5ddedc6008", "Optional analytics and advertising are not currently configured. If either is added later, it will stay off until you choose Accept. Deny will keep it off, and QRguitar will store only your consent choice in your browser.")}
              </p>
              <details className={styles.technicalDetails}>
                <summary>{ui("ui.app.privacy.page.26f0c9c46640", "Optional analytics: events, identifiers and provider details")}</summary>
              <p>{ui("ui.app.privacy.page.602456163092", "When optional analytics is enabled and accepted, QRguitar can measure successful public Profile views, registrations, Profile creation, checkout starts, completed credit purchases, and completed ownership transfers using fixed event properties that exclude direct identifiers. Business conversion events also include a stable pseudonymous idempotency token. The Google Analytics adapter sends it as")}{" "}<code>{ui("ui.app.privacy.page.57c7c8267db4", "event_id")}</code>{ui("ui.app.privacy.page.15857cf6a632", ", and also as")}<code>{ui("ui.app.privacy.page.4b481c9c4cd2", "transaction_id")}</code>{" "}{ui("ui.app.privacy.page.da973ba86fbc", "for completed purchases. Google Analytics documents transaction ID deduplication for purchases; its other web events do not provide the same cross-device deduplication guarantee; ordinary Profile page views remain repeatable and carry no such token. QRguitar does not label an ordinary Profile visit as a QR scan. Names, email addresses, serial numbers, raw QRguitar IDs, Profile URLs, transfer tokens, and raw payment IDs are excluded from optional event details.")}</p>
              <p>
                {configuredGoogleAnalytics.enabled
                  ? ui("ui.app.privacy.page.f3661ca7e824", "After acceptance, QRguitar loads Google Analytics 4 and may set its _ga cookies. QRguitar sends manual page views using coarse categories such as catalog, public Profile, or billing instead of dynamic URLs, query values, page titles, or referrer URLs. Advertising storage, Google signals, and ad personalization remain disabled. Turning tracking off stops new QRguitar dispatch, tells the tag that analytics storage is denied, removes the loaded script, and attempts to remove its first-party cookies. It cannot erase information Google already received.")
                  : ui("ui.app.privacy.page.1a093b1f9e20", "Google Analytics 4 is not currently configured. Adding it requires both an approved Measurement ID and the analytics purpose; until then it does not load, expand the browser security policy, or create a Google Analytics consent prompt by itself.")}
              </p>
              </details>
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

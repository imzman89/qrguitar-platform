import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getContentValue } from "../../lib/content-registry";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";
import { buildManagedPageMetadata } from "../../lib/site-metadata";

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

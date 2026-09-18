import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getContentValue } from "../../lib/content-registry";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";
import { buildManagedPageMetadata } from "../../lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildManagedPageMetadata("terms", "/terms");
}

export default async function TermsPage() {
  const settings = await loadPublishedSiteSettings();
  const sections = [
    {
      title: getContentValue(settings.content, "terms.sections.content.heading"),
      copy: getContentValue(settings.content, "terms.sections.content.body")
    },
    {
      title: getContentValue(settings.content, "terms.sections.ids.heading"),
      copy: getContentValue(settings.content, "terms.sections.ids.body")
    },
    {
      title: getContentValue(settings.content, "terms.sections.verification.heading"),
      copy: getContentValue(settings.content, "terms.sections.verification.body")
    },
    {
      title: getContentValue(settings.content, "terms.sections.ownership.heading"),
      copy: getContentValue(settings.content, "terms.sections.ownership.body")
    },
    {
      title: getContentValue(settings.content, "terms.sections.beta.heading"),
      copy: getContentValue(settings.content, "terms.sections.beta.body")
    },
    {
      title: getContentValue(settings.content, "terms.sections.payments.heading"),
      copy: getContentValue(settings.content, "terms.sections.payments.body")
    }
  ];

  return (
    <>
      <Nav />
      <main>
        <section className="section">
          <div className="shell legal-page">
            <div className="eyebrow">Terms</div>
            <h1>{getContentValue(settings.content, "terms.hero.headline")}</h1>
            <p>{getContentValue(settings.content, "terms.hero.intro")}</p>
            {sections.map((section) => (
              <div className="legal-card" key={section.title}>
                <h2>{section.title}</h2>
                <p>{section.copy}</p>
              </div>
            ))}
            <div className="legal-card">
              <h2>{getContentValue(settings.content, "terms.sections.support.heading")}</h2>
              <p>{getContentValue(settings.content, "terms.sections.support.body")}</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

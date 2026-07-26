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
      title: "Visibility choices",
      copy: "Public profiles can appear in the catalog and can be opened by QR code or direct link. Private profiles stay out of public browsing. Unlisted profiles stay out of the catalog but can be opened by direct link when enabled."
    },
    {
      title: "Serial Number and document privacy",
      copy: "Owners can hide a Serial Number from public display. Hidden Serial Numbers, private notes, private files, and private document paths do not appear on public Profile pages, public API responses, search metadata, or Catalog cards."
    },
    {
      title: "Documents and safety status",
      copy: "Public documents are visible to people viewing the profile. Private proof documents stay restricted to the account owner and authorized admin tools. Lost/stolen alerts are shown only when set by the owner or an authorized admin."
    },
    {
      title: "Account and support data",
      copy: "QRguitar uses account email, authentication data, and support messages to run login, password reset, profile ownership, transfer tools, safety review, and support. QRguitar does not sell private user data."
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
            <p>
              QRguitar is built around user-controlled instrument profiles. Some profile data is intended to be visible
              when an owner makes a profile public or unlisted. Other data, including hidden serials and private proof
              documents, is kept out of public views.
            </p>
            {sections.map((section) => (
              <div className="legal-card" key={section.title}>
                <h2>{section.title}</h2>
                <p>{section.copy}</p>
              </div>
            ))}
            <div className="legal-card">
              <h2>Beta limits</h2>
              <p>Do not upload passwords, payment card numbers, reset links, unrelated personal documents, or anything you do not have the right to store or share. For privacy questions or removal requests, contact <a href="mailto:support@qrguitar.com">support@qrguitar.com</a>.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

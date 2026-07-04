import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";

export const metadata: Metadata = {
  title: "Contact | QRguitar",
  description: "Contact QRguitar support for public beta help."
};

export default function ContactPage() {
  const supportTopics = [
    {
      title: "Account or login help",
      copy: "Password reset, account access, profile details, and session issues.",
      href: "mailto:support@qrguitar.com?subject=QRguitar%20account%20help"
    },
    {
      title: "Record or QR help",
      copy: "Permanent QRguitar IDs, photo uploads, QR downloads, public/private visibility, and profile edits.",
      href: "mailto:support@qrguitar.com?subject=QRguitar%20record%20or%20QR%20help"
    },
    {
      title: "Verification review",
      copy: "Manual beta review for specs, provenance, documents, serial/build IDs, and authenticity evidence.",
      href: "mailto:support@qrguitar.com?subject=QRguitar%20verification%20review"
    },
    {
      title: "Lost, stolen, or transfer help",
      copy: "Safety alerts, ownership transfer questions, claim links, and edge cases that need manual support.",
      href: "mailto:support@qrguitar.com?subject=QRguitar%20safety%20or%20transfer%20help"
    }
  ];

  return (
    <>
      <Nav />
      <main>
        <section className="section">
          <div className="shell legal-page contact-page">
            <div className="contact-hero">
              <div>
                <div className="eyebrow">Support</div>
                <h1>QRguitar help, records, and verification support.</h1>
                <p>
                  Get help with account access, permanent records, QR downloads, hidden documents, service history,
                  lost/stolen alerts, transfers, and manual beta verification review.
                </p>
              </div>
              <div className="contact-direct-card">
                <span>Public support inbox</span>
                <a className="button" href="mailto:support@qrguitar.com">support@qrguitar.com</a>
                <small>Include your QRguitar ID when the question is about a specific record.</small>
              </div>
            </div>

            <div className="contact-topic-grid">
              {supportTopics.map((topic) => (
                <a className="contact-topic-card" href={topic.href} key={topic.title}>
                  <strong>{topic.title}</strong>
                  <span>{topic.copy}</span>
                </a>
              ))}
            </div>

            <div className="legal-card contact-checklist">
              <h2>What to include</h2>
              <ul>
                <li>QRguitar ID or public record link, if you have one.</li>
                <li>The account email you used to create the record.</li>
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

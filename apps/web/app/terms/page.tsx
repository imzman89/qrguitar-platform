import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";

export const metadata: Metadata = {
  title: "Terms",
  description: "Public beta terms for using QRguitar instrument profiles."
};

export default function TermsPage() {
  const sections = [
    {
      title: "Your content and responsibility",
      copy: "You are responsible for the photos, specs, Serial Number and instrument information, notes, documents, and links you add. Do not upload content you do not have permission to store or share."
    },
    {
      title: "Permanent QR concept",
      copy: "QRguitar is designed so the QRguitar ID and /i/[code] profile URL stay with the instrument as details are edited. QRguitar cannot guarantee eternal hosting by every third-party provider, network, phone, browser, or storage service."
    },
    {
      title: "Verification and authenticity",
      copy: "Verification and authenticity review are based on available evidence at the time of review. They are not an appraisal, insurance guarantee, fraud-proof certificate, guarantee of future condition, or guarantee against undisclosed modifications."
    },
    {
      title: "Safety and transfers",
      copy: "Lost/stolen reports must be truthful. Ownership transfers must be started and accepted by people with proper authorization. Abuse, fraud, impersonation, or infringing uploads may result in account restrictions."
    },
    {
      title: "Beta and future paid features",
      copy: "QRguitar is in public beta. Features, limits, and paid services may change. No checkout or payment flow is live unless it is clearly presented inside the product at the time you use it."
    }
  ];

  return (
    <>
      <Nav />
      <main>
        <section className="section">
          <div className="shell legal-page">
            <div className="eyebrow">Terms</div>
            <h1>QRguitar is in public beta.</h1>
            <p>
              QRguitar provides QR-linked instrument profiles for guitars, basses, amps, pedals, builders, shops,
              collectors, and future owners. These terms explain the practical rules for using the beta.
            </p>
            {sections.map((section) => (
              <div className="legal-card" key={section.title}>
                <h2>{section.title}</h2>
                <p>{section.copy}</p>
              </div>
            ))}
            <div className="legal-card">
              <h2>Support</h2>
              <p>Questions can be sent to <a href="mailto:support@qrguitar.com">support@qrguitar.com</a>.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";

export const metadata: Metadata = {
  title: "Privacy | QRguitar",
  description: "Public beta privacy notes for QRguitar Profiles, private documents, and instrument data."
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section">
          <div className="shell legal-page">
            <div className="eyebrow">Privacy</div>
            <h1>QRguitar public beta privacy notes.</h1>
            <p>
              QRguitar stores account data and instrument record data needed to run the platform. That includes record
              details, photos, documents, service history, ownership-transfer information, safety status, and proof
              vault details that users choose to add.
            </p>
            <div className="legal-card">
              <h2>Public and private records</h2>
              <p>Public QRguitar Profiles can be viewed by anyone with the QR code, catalog listing, or direct link.</p>
              <p>Private records and private documents are intended to be visible only to authorized users.</p>
            </div>
            <div className="legal-card">
              <h2>Uploaded content</h2>
              <p>Users are responsible for what they upload and for choosing whether a record or document is public.</p>
              <p>
                QRguitar uses uploaded data to operate records, verification, authenticity review, transfers, service
                history, safety status, and proof vault features.
              </p>
            </div>
            <div className="legal-card">
              <h2>Support</h2>
              <p>For privacy questions or removal requests, contact <a href="mailto:support@qrguitar.com">support@qrguitar.com</a>.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

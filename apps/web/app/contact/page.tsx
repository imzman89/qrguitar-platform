import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";

export const metadata: Metadata = {
  title: "Contact | QRguitar",
  description: "Contact QRguitar support for public beta help."
};

export default function ContactPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section">
          <div className="shell legal-page">
            <div className="eyebrow">Contact</div>
            <h1>Need help with QRguitar?</h1>
            <p>
              For public beta support, record questions, verification help, QR install questions, or account issues,
              email the QRguitar support inbox.
            </p>
            <div className="legal-card">
              <h2>Support</h2>
              <p><a className="button" href="mailto:support@qrguitar.com">support@qrguitar.com</a></p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

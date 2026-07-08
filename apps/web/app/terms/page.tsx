import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";

export const metadata: Metadata = {
  title: "Terms | QRguitar",
  description: "Public beta terms for using QRguitar instrument profiles."
};

export default function TermsPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section">
          <div className="shell legal-page">
            <div className="eyebrow">Terms</div>
            <h1>QRguitar is in public beta.</h1>
            <p>
              QRguitar provides permanent instrument profiles for guitars, amps, pedals, builders, shops, collectors,
              and future owners. Public beta features may change as the platform improves.
            </p>
            <div className="legal-card">
              <h2>User content</h2>
              <p>Users are responsible for uploaded content and should not upload content they do not have the right to store or share.</p>
            </div>
            <div className="legal-card">
              <h2>Verification and authenticity</h2>
              <p>
                Verification and authenticity review are based on available evidence. They are not guarantees of future
                condition, future ownership, market value, or future originality.
              </p>
            </div>
            <div className="legal-card">
              <h2>Safety status</h2>
              <p>
                Lost and stolen reports are user-submitted and informational. QRguitar is not an insurance provider,
                appraisal guarantee, or law enforcement system.
              </p>
            </div>
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

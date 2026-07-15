import { Paintbrush, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QRguitar installer network",
  robots: {
    index: false,
    follow: false
  }
};

const installerServices = [
  "Under-finish QR placement",
  "Clear coat and finish-safe application",
  "Repair intake documentation",
  "Serial/photo verification",
  "Ownership handoff assistance"
];

const vettingSteps = [
  {
    title: "Apply",
    copy: "Luthiers, repair shops, and guitar retailers submit shop details, service area, finish experience, and references."
  },
  {
    title: "Verify",
    copy: "QRguitar reviews the shop, confirms the real business, and labels qualified partners as vetted installers."
  },
  {
    title: "Install",
    copy: "Owners can find a nearby shop to place the QR code under finish or document a repair-linked installation."
  }
];

export default function InstallersPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section installer-hero">
          <div className="shell installer-hero-grid">
            <div>
              <div className="eyebrow">QRguitar installer network</div>
              <h1>Help shape the QRguitar installer network.</h1>
              <p>
                QRguitar is reviewing early partners for permanent, finish-safe QR placement. Public installer search is
                not live yet; shops and owners can contact QRguitar for manual beta guidance.
              </p>
              <div className="hero-actions">
                <Link className="button" href="mailto:support@qrguitar.com?subject=QRguitar%20Installer%20Network%20Application">
                  Contact QRguitar
                </Link>
              </div>
            </div>
            <div className="installer-feature-card">
              <div className="icon"><Paintbrush size={28} /></div>
              <h2>Under-finish ready</h2>
              <p>
                Built for permanent instrument IDs that can be applied, documented, and protected as part of a guitar's
                physical history.
              </p>
              <div className="installer-service-list">
                {installerServices.map((service) => (
                  <span key={service}><ShieldCheck size={15} />{service}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section alt">
          <div className="shell">
            <div className="section-header">
              <div className="eyebrow">How it works</div>
              <h2>A trusted path from QR code to permanent install.</h2>
              <p>Owners can start with a QRguitar Profile now. Physical installation support is handled manually during beta.</p>
            </div>
            <div className="grid three">
              {vettingSteps.map((step, index) => (
                <article className="card" key={step.title}>
                  <div className="step-number">{index + 1}</div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section alt" id="apply">
          <div className="shell installer-apply">
            <div>
              <div className="eyebrow">For luthiers and repair shops</div>
              <h2>Become a QRguitar vetted installer.</h2>
              <p>
                Join the network early and help shape the standard for permanent QRguitar installation, verification
                photos, repair documentation, and owner-transfer planning while ownership tools are in beta.
              </p>
            </div>
            <div className="installer-apply-panel">
              <h3>Early partner intake</h3>
              <p>Email these details to start a manual beta review:</p>
              <ul>
                <li>Business name, address, website, and contact email</li>
                <li>Finish/refinish experience and example work</li>
                <li>Services offered and travel/service region</li>
                <li>Whether they can document installs with photos</li>
              </ul>
              <Link className="button" href="mailto:support@qrguitar.com?subject=QRguitar%20Installer%20Network">
                Contact QRguitar
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

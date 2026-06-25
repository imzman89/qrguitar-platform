import { BadgeCheck, MapPin, Paintbrush, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";

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

const exampleInstallers = [
  {
    name: "Proper Instruments",
    region: "Cranston, Rhode Island",
    services: "Custom builds, finish work, QR placement",
    status: "Founding installer"
  },
  {
    name: "Northeast Guitar Repair",
    region: "New England",
    services: "Repairs, setup, clear coat application",
    status: "Example listing"
  },
  {
    name: "Midwest Luthier Bench",
    region: "Great Lakes",
    services: "Restoration, refinishing, verification photos",
    status: "Example listing"
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
              <h1>Find vetted shops that can install a QR code under finish.</h1>
              <p>
                QRguitar should work in the real world. This network helps owners, builders, and shops connect with
                qualified luthiers and repair benches for permanent, finish-safe QR placement.
              </p>
              <div className="hero-actions">
                <Link className="button" href="#apply">
                  Apply as a Shop
                </Link>
                <Link className="button secondary" href="#finder">
                  Find an Installer
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
              <p>Owners can start with a normal QRguitar record, then find a vetted shop if they want a permanent physical installation later.</p>
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

        <section className="section" id="finder">
          <div className="shell split">
            <div>
              <div className="eyebrow">Public finder</div>
              <h2>Browse vetted installers by region, service, and shop type.</h2>
              <p>
                The first version starts with a curated directory. Later, this can become a searchable national map with
                service areas, verified reviews, repair specialties, and booking requests.
              </p>
              <div className="check-list">
                <div className="check-item"><MapPin size={18} /><span>Search by city, state, or region</span></div>
                <div className="check-item"><Wrench size={18} /><span>Filter by finish, repair, builder, or retail services</span></div>
                <div className="check-item"><BadgeCheck size={18} /><span>Show vetted and founding installer badges</span></div>
              </div>
            </div>
            <div className="installer-directory">
              {exampleInstallers.map((installer) => (
                <article className="installer-card" key={installer.name}>
                  <div>
                    <span className="status-pill">{installer.status}</span>
                    <h3>{installer.name}</h3>
                    <p>{installer.region}</p>
                  </div>
                  <strong>{installer.services}</strong>
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
                photos, repair documentation, and customer handoff.
              </p>
            </div>
            <div className="installer-apply-panel">
              <h3>Early partner intake</h3>
              <p>For now, collect these details from shops before the real application form is connected:</p>
              <ul>
                <li>Business name, address, website, and contact email</li>
                <li>Finish/refinish experience and example work</li>
                <li>Services offered and travel/service region</li>
                <li>Whether they can document installs with photos</li>
              </ul>
              <Link className="button" href="mailto:partners@qrguitar.com?subject=QRguitar%20Installer%20Network">
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

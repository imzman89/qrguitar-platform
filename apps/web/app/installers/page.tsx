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
    copy: "Shops submit business details, service area, finish experience, repair specialties, and references."
  },
  {
    title: "Verify",
    copy: "QRguitar confirms the shop is a real business and reviews whether its finish work is appropriate for under-finish QR installs."
  },
  {
    title: "Install",
    copy: "Owners can find a qualified shop to install the QR, photograph the work, and attach the install notes to the instrument record."
  }
];

const installerListings = [
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
    status: "Regional candidate"
  },
  {
    name: "Midwest Luthier Bench",
    region: "Great Lakes",
    services: "Restoration, refinishing, verification photos",
    status: "Regional candidate"
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
              <h1>Find shops that can install a QR code under finish.</h1>
              <p>
                Some owners will want the QR built into the instrument, not just printed on a card. This directory is for luthiers,
                repair benches, and guitar shops that can handle finish-safe QR placement and document the work properly.
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
              <h2>Finish-safe installation</h2>
              <p>
                A proper install should be photographed, dated, and attached to the same record as the serial, service history,
                ownership, and warranty notes.
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
              <h2>From printed QR to permanent install.</h2>
              <p>Owners can start with a normal QRguitar record, then work with a qualified shop if they want the code protected under finish.</p>
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
              <div className="eyebrow">Installer finder</div>
              <h2>Search by region, finish work, repair work, and shop type.</h2>
              <p>
                This directory starts with approved partner listings and regional candidates. Each listing should make it clear
                what the shop can do, where it works, and whether it can document the installation with photos.
              </p>
              <div className="check-list">
                <div className="check-item"><MapPin size={18} /><span>Search by city, state, or region</span></div>
                <div className="check-item"><Wrench size={18} /><span>Filter by finish, repair, builder, or retail services</span></div>
                <div className="check-item"><BadgeCheck size={18} /><span>Show vetted and founding installer badges</span></div>
              </div>
            </div>
            <div className="installer-directory">
              {installerListings.map((installer) => (
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
                Apply to be listed for under-finish QR installs, repair documentation, verification photos, and customer handoff support.
              </p>
            </div>
            <div className="installer-apply-panel">
              <h3>Early partner intake</h3>
              <p>Send these details so QRguitar can review the shop before listing it:</p>
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

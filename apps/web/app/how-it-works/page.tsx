import Link from "next/link";
import { ArrowRight, Building2, Eye, FileCheck2, Images, QrCode, Repeat2, ShieldCheck, Store, UserRoundCheck } from "lucide-react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";

const steps = [
  ["1", "Create the profile", "Add the instrument's make, model, year, serial or build ID, and at least one real photo."],
  ["2", "Choose visibility", "Make it visible in the Catalog, keep it private, or use an unlisted direct link."],
  ["3", "Use the permanent QR", "Download the QR for a case card, hang tag, service handout, display, or the instrument itself."],
  ["4", "Keep its story current", "Add photos, service history, proof documents, safety alerts, and ownership changes without changing its permanent link."]
];

const uses = [
  { icon: <Store />, title: "Retail and repair counters", copy: "Let a customer scan the QR in store to see the profile, specifications, photos, trust status, and public history before buying or picking up an instrument." },
  { icon: <Repeat2 />, title: "Ownership transfers", copy: "The current owner starts a transfer from the dashboard. The recipient signs in with the invited email, reviews the profile, and accepts the same permanent identity." },
  { icon: <Images />, title: "Collections worth sharing", copy: "Visible profiles appear in the Catalog and can be shared individually. Private profiles remain in the owner's dashboard; unlisted profiles work by direct link only." },
  { icon: <Building2 />, title: "Shops and builders", copy: "Create the first profile carefully, then use bulk import for up to 50 inventory rows at a time. Brand, photo, serial, condition, visibility, and sale status remain structured." }
];

export default function HowItWorksPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section product-guide-hero">
          <div className="shell product-guide-hero-inner">
            <div>
              <div className="eyebrow">How QRguitar works</div>
              <h1>One lasting identity for the life of an instrument.</h1>
              <p>
                A QRguitar Profile keeps the useful facts, images, service history, proof, safety status, and ownership trail connected to one QR link.
              </p>
              <div className="product-guide-actions">
                <Link className="button" href="/create">Create Profile <ArrowRight size={16} /></Link>
                <Link className="button secondary" href="/catalog">Browse Profiles</Link>
              </div>
            </div>
            <div className="product-guide-principles" aria-label="QRguitar essentials">
              <div><QrCode /><strong>Permanent</strong><span>The QR link stays the same as the profile grows.</span></div>
              <div><ShieldCheck /><strong>Privacy controlled</strong><span>The owner chooses visible, private, or unlisted.</span></div>
              <div><FileCheck2 /><strong>Evidence first</strong><span>Verification and authenticity remain separate, evidence-based signals.</span></div>
            </div>
          </div>
        </section>

        <section className="section product-guide-flow">
          <div className="shell">
            <div className="section-heading centered-heading">
              <div className="eyebrow">From instrument to profile</div>
              <h2>A simple workflow that keeps paying off.</h2>
            </div>
            <ol className="product-guide-steps">
              {steps.map(([number, title, copy]) => (
                <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section product-guide-identity" id="identity-privacy">
          <div className="shell product-guide-split">
            <div>
              <div className="eyebrow">Identity and serial privacy</div>
              <h2>Permanent identity without giving up control.</h2>
              <p>When a serial or build ID is provided, QRguitar uses the clear format <strong>QRG-SERIAL</strong>. If the instrument has no serial, QRguitar assigns a permanent generated identity.</p>
              <p>The serial remains stored with the owner profile. For a visible profile, the owner can show or hide it from the profile editor without changing the QRguitar ID or QR URL.</p>
              <p>Profiles without a serial can be created normally. Verification or authenticity confirmation without a serial requires prior QRguitar approval, including legitimate builders and brands that do not use serial numbers.</p>
            </div>
            <div className="product-guide-visibility">
              <div><Eye /><strong>Visible</strong><span>Discoverable in the Catalog and available by direct link.</span></div>
              <div><ShieldCheck /><strong>Private</strong><span>Available only to the signed-in owner.</span></div>
              <div><UserRoundCheck /><strong>Unlisted</strong><span>Not in the Catalog; available to people with the direct link.</span></div>
            </div>
          </div>
        </section>

        <section className="section product-guide-uses">
          <div className="shell">
            <div className="section-heading">
              <div className="eyebrow">Built for real guitar workflows</div>
              <h2>Useful at the bench, on the wall, and between owners.</h2>
            </div>
            <div className="product-guide-use-grid">
              {uses.map((use) => <article key={use.title}><span>{use.icon}</span><h3>{use.title}</h3><p>{use.copy}</p></article>)}
            </div>
            <p className="product-guide-note">Direct member-to-member messaging is not part of the current beta. Share a profile link or use published contact information; QRguitar never exposes a private account email.</p>
          </div>
        </section>

        <section className="section product-guide-cta">
          <div className="shell product-guide-cta-inner">
            <div><div className="eyebrow">Start with one instrument</div><h2>Create the profile. Print the QR. Keep the story connected.</h2></div>
            <Link className="button" href="/create">Create Profile <ArrowRight size={16} /></Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

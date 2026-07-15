import Link from "next/link";
import { ArrowRight, Building2, Eye, FileCheck2, Images, QrCode, Repeat2, ShieldCheck, Store, UserRoundCheck } from "lucide-react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";

const steps = [
  ["Create or find the Profile", "Enter the exact Serial Number before creating. If a Profile already exists, use the secure ownership or transfer path instead of making a duplicate."],
  ["Add identity and evidence", "Add real photos, specifications, known history, service work, media, and documents. Choose what stays private."],
  ["Use the permanent QR", "Download the QR for a case card, hang tag, service handout, display, or the instrument itself. Scanning never grants ownership."],
  ["Keep ownership current", "The current owner or store starts a secure transfer. The Profile and QR stay with the instrument after acceptance."]
];

const uses = [
  { icon: <Store />, title: "Retail and repair counters", copy: "Let a customer scan the QR in store to see the profile, specifications, photos, trust status, and public history before buying or picking up an instrument." },
  { icon: <Repeat2 />, title: "Ownership transfers", copy: "The current owner starts a transfer from the dashboard. The recipient signs in with the invited email, reviews the profile, and accepts the same permanent identity." },
  { icon: <Images />, title: "Collections worth sharing", copy: "Visible profiles appear in the Catalog and can be shared individually. Private profiles remain in the owner's dashboard; unlisted profiles work by direct link only." },
  { icon: <Building2 />, title: "Shops and builders", copy: "Create the first Profile carefully, then use bulk import for up to 50 inventory rows at a time. Brand, photo, serial, condition, visibility, and Availability remain structured." }
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
              {steps.map(([title, copy]) => (
                <li key={title}><div><h3>{title}</h3><p>{copy}</p></div></li>
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
              <p><strong>Legacy identity note:</strong> some existing QRguitar IDs were created from a serial. Hiding the separate serial field does not remove a serial already present in that permanent legacy ID or printed QR URL.</p>
              <p>Profiles without a serial can be created normally. Verification or authenticity confirmation without a serial requires prior QRguitar approval, including legitimate builders and brands that do not use serial numbers.</p>
            </div>
            <div className="product-guide-visibility">
              <div><Eye /><strong>Visible</strong><span>Discoverable in the Catalog and available by direct link.</span></div>
              <div><ShieldCheck /><strong>Private</strong><span>Available only to the signed-in owner.</span></div>
              <div><UserRoundCheck /><strong>Unlisted</strong><span>Not in the Catalog; available to people with the direct link.</span></div>
            </div>
          </div>
        </section>

        <section className="section product-guide-uses" id="history-media-documents">
          <div className="shell">
            <div className="section-heading centered-heading">
              <div className="eyebrow">Build a useful instrument history</div>
              <h2>Keep facts, milestones, media, and evidence in the right place.</h2>
            </div>
            <div className="product-guide-use-grid">
              <article><span><Repeat2 /></span><h3>Timeline and service</h3><p>Add purchases, ownership milestones, setups, repairs, modifications, and restoration. Each entry can stay private or appear on the Profile.</p></article>
              <article><span><Images /></span><h3>Media</h3><p>Keep the photo gallery with the instrument and add safe video or audio links. Owners control which media appears publicly.</p></article>
              <article><span><FileCheck2 /></span><h3>Documents</h3><p>Store receipts, invoices, appraisals, service slips, and build sheets privately. Share only the documents intentionally marked public.</p></article>
              <article><span><ShieldCheck /></span><h3>Trust signals</h3><p>Verification, authenticity, and originality are separate. Verification is QRguitar review, authenticity concerns the instrument, and originality describes disclosed modification status.</p></article>
            </div>
          </div>
        </section>

        <section className="section product-guide-identity" id="ownership-claims">
          <div className="shell product-guide-split">
            <div>
              <div className="eyebrow">Ownership without shortcuts</div>
              <h2>A QR scan opens the Profile. It never transfers ownership.</h2>
              <p>For a normal sale, the current owner or store starts a secure, recipient-bound transfer. The recipient signs in, reviews the Profile, and accepts the handoff.</p>
              <p>If an older Profile already matches an instrument, a signed-in claimant can submit an exact serial, acquisition details, a truthful declaration, and private evidence for owner or admin review. A serial match alone never changes ownership.</p>
            </div>
            <div className="product-guide-visibility">
              <div><Store /><strong>Buying from a store</strong><span>The store prepares the transfer for the purchaser instead of relying on the public QR.</span></div>
              <div><UserRoundCheck /><strong>Claiming an existing Profile</strong><span>Provide evidence for review; duplicate Profiles are not created for the same identity.</span></div>
              <div><Repeat2 /><strong>Permanent handoff</strong><span>Accepted ownership changes keep the same QRguitar ID, Profile URL, and instrument history.</span></div>
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

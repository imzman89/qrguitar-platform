import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Eye,
  FileCheck2,
  FileText,
  Images,
  LockKeyhole,
  QrCode,
  Repeat2,
  ShieldCheck,
  Store,
  UserRoundCheck,
  Wrench
} from "lucide-react";
import { CollectibleRecordCard } from "../../components/CollectibleRecordCard";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getPublicInstruments } from "../../lib/public-instruments";

export const dynamic = "force-dynamic";

const steps = [
  ["Create or find the Profile", "Add the Serial Number to check whether the instrument already has a QRguitar Profile. If it does, use the secure ownership or transfer process instead of creating a duplicate."],
  ["Add its identity and history", "Add photos, specifications, ownership history, service work, media, and documents. The Profile can grow throughout the instrument's life."],
  ["Use the permanent QR", "Download or print the QR for the instrument, case, hang tag, shop display, or paperwork. A visible Profile opens without requiring an account."],
  ["Keep ownership current", "When the instrument changes hands, the existing owner or store can transfer the same Profile. Scanning the QR by itself never gives someone ownership."]
];

const capabilities = [
  { icon: <Images />, title: "Photos and specifications", copy: "Keep identifying photos, condition, finish, hardware, electronics, and the details people ask about together." },
  { icon: <Repeat2 />, title: "Timeline and ownership history", copy: "Build a lasting chronology without letting a new owner rewrite verified history from the past." },
  { icon: <Wrench />, title: "Service and repair history", copy: "Add setups, repairs, restoration, and maintenance with a public or private setting for each entry." },
  { icon: <Images />, title: "Media and video", copy: "Show the instrument clearly with a real photo gallery and safe external media links." },
  { icon: <FileText />, title: "Documents and proof", copy: "Store receipts, appraisals, invoices, and build sheets privately, then publish only what you choose." },
  { icon: <AlertTriangle />, title: "Lost or stolen alerts", copy: "Mark a Profile lost or stolen so anyone scanning the QR sees an unmistakable safety alert." },
  { icon: <Repeat2 />, title: "Ownership transfers", copy: "Send the existing Profile to the next owner through a recipient-bound handoff that preserves its permanent identity." },
  { icon: <LockKeyhole />, title: "Serial privacy", copy: "Keep the Serial Number available to the owner while hiding the separate public field when privacy matters." },
  { icon: <Eye />, title: "Flexible visibility", copy: "Choose Visible for the Catalog, Unlisted for direct-link sharing, or Private for owner and admin access only." }
];

const audiences = [
  ["Players and collectors", "Keep a collection organized, show the instruments you love, and carry their useful history forward."],
  ["Guitar shops", "Give customers a scannable Profile at the counter, prepare print kits, and transfer the same identity after a sale."],
  ["Builders and brands", "Create consistent Profiles for new builds while keeping official brand identity under controlled administration."],
  ["Repair shops", "Return an instrument with updated service history, a printable QR handout, and better documentation for its owner."],
  ["Buyers and future owners", "Review the identity, public history, photos, condition, and trust signals before an instrument changes hands."]
];

const faq = [
  ["Is the QRguitar ID permanent?", "Yes. The ID and Profile URL stay with the instrument even when its details, photos, or ownership change."],
  ["Can I hide the Serial Number?", "Yes. A visible Profile can hide the separate Serial Number field while the signed-in owner and authorized admin retain it."],
  ["What if the instrument already has a Profile?", "Do not create a duplicate. Use the ownership transfer flow or submit a proof-based ownership claim for review."],
  ["Can anyone claim a guitar by scanning its QR?", "No. A scan is view-only. Ownership requires a secure transfer or reviewed claim with supporting evidence."],
  ["Can I make a Profile private?", "Yes. Private Profiles are available only to the owner and authorized admin. Unlisted Profiles work by direct link without appearing in the Catalog."],
  ["What happens when I sell the instrument?", "Start a transfer from the owner dashboard. The recipient accepts the existing Profile, preserving its QRguitar ID and history."],
  ["Can I add older ownership or service history?", "Yes. Add accurate milestones and service entries, then decide which details should be visible and which should stay private."],
  ["What can I upload?", "You can add instrument photos, specifications, notes, service entries, receipts, appraisals, build sheets, and other useful supporting documents."]
];

export default async function HowItWorksPage() {
  const profiles = await getPublicInstruments().catch(() => []);
  const exampleProfile = profiles[0];

  return (
    <>
      <Nav />
      <main>
        <section className="section product-guide-hero">
          <div className="shell product-guide-hero-inner">
            <div>
              <div className="eyebrow">How QRguitar works</div>
              <h1>One permanent Profile for every instrument.</h1>
              <p>Create or find a QRguitar Profile, add the instrument's identity and history, then keep it connected through every owner.</p>
              <div className="product-guide-actions">
                <Link className="button" href="/create">Create Profile <ArrowRight size={16} /></Link>
                <Link className="button secondary" href="/catalog">Browse QRguitar Profiles</Link>
              </div>
            </div>
            <div className="product-guide-example" aria-label="Example QRguitar Profile">
              {exampleProfile ? (
                <CollectibleRecordCard record={exampleProfile} variant="spotlight" />
              ) : (
                <div className="product-guide-principles">
                  <div><QrCode /><strong>Permanent identity</strong><span>The QR link stays the same as the Profile grows.</span></div>
                  <div><ShieldCheck /><strong>Privacy controlled</strong><span>The owner chooses Visible, Private, or Unlisted.</span></div>
                  <div><FileCheck2 /><strong>Evidence connected</strong><span>Photos, history, service, and proof stay with the instrument.</span></div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="section product-guide-flow">
          <div className="shell">
            <div className="section-heading centered-heading">
              <div className="eyebrow">From instrument to Profile</div>
              <h2>Four steps. One identity that stays useful.</h2>
            </div>
            <ol className="product-guide-steps">
              {steps.map(([title, copy], index) => (
                <li key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{copy}</p></div></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section product-guide-uses" id="profile-capabilities">
          <div className="shell">
            <div className="section-heading centered-heading">
              <div className="eyebrow">What a Profile can hold</div>
              <h2>The identity, history, and evidence people actually need.</h2>
            </div>
            <div className="product-guide-use-grid product-guide-capability-grid">
              {capabilities.map((item) => <article key={item.title}><span>{item.icon}</span><h3>{item.title}</h3><p>{item.copy}</p></article>)}
            </div>
          </div>
        </section>

        <section className="section product-guide-identity" id="identity-privacy">
          <div className="shell product-guide-split">
            <div>
              <div className="eyebrow">Serial Number and QRguitar ID</div>
              <h2>A permanent identity with practical privacy controls.</h2>
              <p>When a Serial Number exists, the QRguitar ID uses the clear format <strong>QRG-[Serial Number]</strong>. If there is no Serial Number, QRguitar creates a secure generated ID.</p>
              <p>The owner and authorized admin retain the Serial Number. On a visible Profile, the owner can hide the separate public Serial Number field without changing the permanent QRguitar ID or printed QR link.</p>
              <p>If a legitimate builder or brand does not use Serial Numbers, QRguitar can review the Profile through the approved no-serial process.</p>
            </div>
            <div className="product-guide-visibility">
              <div><QrCode /><strong>QRguitar ID</strong><span>Permanent and used by the Profile URL and printable QR.</span></div>
              <div><FileCheck2 /><strong>Serial Number</strong><span>Manufacturer or builder identity retained for the owner and shown publicly only when allowed.</span></div>
              <div><ShieldCheck /><strong>Existing QR links</strong><span>Printed QR codes remain valid as Profile details and ownership change.</span></div>
            </div>
          </div>
        </section>

        <section className="section product-guide-uses" id="visibility">
          <div className="shell">
            <div className="section-heading centered-heading"><div className="eyebrow">Choose who can see it</div><h2>Visibility that matches the instrument and the moment.</h2></div>
            <div className="product-guide-use-grid product-guide-three-grid">
              <article><span><Eye /></span><h3>Visible</h3><p>Listed in the Catalog and available through its direct QR or Profile link.</p></article>
              <article><span><UserRoundCheck /></span><h3>Unlisted</h3><p>Not listed in the Catalog, but available to anyone with the direct QR or Profile link.</p></article>
              <article><span><LockKeyhole /></span><h3>Private</h3><p>Available only to the signed-in owner and authorized QRguitar administration.</p></article>
            </div>
          </div>
        </section>

        <section className="section product-guide-identity" id="ownership">
          <div className="shell product-guide-split">
            <div>
              <div className="eyebrow">Ownership without shortcuts</div>
              <h2>A QR scan opens the Profile. It never transfers ownership.</h2>
              <p>The current owner or store sends a recipient-bound transfer. The recipient signs in, reviews the Profile, and accepts the same permanent identity.</p>
              <p>If an older Profile already matches an instrument, a claimant can submit acquisition details and private evidence for review. An exact Serial Number match alone never changes ownership.</p>
            </div>
            <div className="product-guide-visibility">
              <div><Store /><strong>Store handoff</strong><span>A shop prepares the transfer for the purchaser instead of relying on the public QR.</span></div>
              <div><UserRoundCheck /><strong>Proof-based claims</strong><span>Older ownership questions are reviewed without exposing private evidence publicly.</span></div>
              <div><Repeat2 /><strong>Same Profile</strong><span>An accepted transfer preserves the QRguitar ID, URL, photos, and instrument history.</span></div>
            </div>
          </div>
        </section>

        <section className="section product-guide-uses" id="who-it-is-for">
          <div className="shell">
            <div className="section-heading centered-heading"><div className="eyebrow">Made for the instrument community</div><h2>Useful at home, at the bench, and across the counter.</h2></div>
            <div className="product-guide-audience-grid">
              {audiences.map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}
            </div>
          </div>
        </section>

        <section className="section product-guide-faq">
          <div className="shell product-guide-faq-inner">
            <div><div className="eyebrow">Frequently asked</div><h2>Clear answers before you create a Profile.</h2></div>
            <div className="product-guide-faq-list">
              {faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
            </div>
          </div>
        </section>

        <section className="section product-guide-cta">
          <div className="shell product-guide-cta-inner">
            <div><div className="eyebrow">Ready when the instrument is</div><h2>Start the Profile that stays with the instrument.</h2></div>
            <div className="product-guide-actions">
              <Link className="button" href="/create">Create Profile <ArrowRight size={16} /></Link>
              <Link className="button secondary" href="/catalog">Browse QRguitar Profiles</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
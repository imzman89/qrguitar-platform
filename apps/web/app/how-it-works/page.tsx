import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
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
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";

const steps = [
  ["Check the identity", "Enter the Serial Number first. If a matching Profile exists, use ownership transfer or a reviewed claim instead of creating a duplicate."],
  ["Add the essentials", "Add the brand, model, one clear photo, and the details you know. You can expand the Profile later."],
  ["Choose visibility", "Public Profiles appear in the Catalog. Unlisted Profiles open by direct link. Private Profiles stay with the owner account."],
  ["Use the permanent QR", "Download or print the QR for the instrument, case, counter card, or paperwork. The link stays the same as the Profile grows."]
];

const capabilities = [
  { icon: <Images />, title: "Photos and details", copy: "Show the instrument clearly and keep its specifications in one place." },
  { icon: <Wrench />, title: "Service history", copy: "Record setups, repairs, restoration, and maintenance as they happen." },
  { icon: <FileText />, title: "Documents", copy: "Keep receipts, appraisals, invoices, and build sheets private or publish selected documents." },
  { icon: <Repeat2 />, title: "Ownership transfer", copy: "Send the same permanent Profile to the next owner through a secure email handoff." },
  { icon: <AlertTriangle />, title: "Lost or stolen notice", copy: "Display a clear public alert when an instrument is reported lost or stolen." },
  { icon: <ShieldCheck />, title: "Trust review", copy: "QRguitar verification and authenticity review remain separate, controlled trust signals." }
];

const audiences = [
  ["Owners and collectors", "Organize a collection, share selected Profiles, and keep useful history with each instrument."],
  ["Shops and repair teams", "Give customers a scannable Profile, add service history, and print a handout at pickup."],
  ["Builders and brands", "Create consistent Profiles for new instruments and manage larger inventories from one account."],
  ["Buyers and future owners", "Review visible photos, identity, history, and trust signals before an instrument changes hands."]
];

const faq = [
  ["What if my instrument has a Serial Number?", "Its QRguitar ID uses QRG- followed by that Serial Number. The owner can hide the separate Serial Number field on a public Profile without changing the QRguitar ID or QR link."],
  ["What if there is no Serial Number?", "QRguitar assigns a unique six-digit ID. Records without a Serial Number need QRguitar approval before verification or authenticity confirmation."],
  ["Can scanning the QR transfer ownership?", "No. A scan only opens the Profile. The current owner or shop must start a secure, recipient-bound transfer."],
  ["Can I keep a Profile out of the Catalog?", "Yes. Choose Unlisted for direct-link access or Private for owner and authorized admin access only."],
  ["Can another owner rewrite old history?", "Owners can add current photos and details, but protected history and reviewed evidence are not silently rewritten."],
  ["Does the QR change when I edit the Profile?", "No. Photos, details, visibility, and ownership can change while the permanent Profile URL stays the same."]
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
              <h1>Create the Profile once. Keep it with the instrument.</h1>
              <p>Start with one real photo and the instrument identity. Add history over time, then share the same permanent QRguitar Profile wherever the instrument goes.</p>
              <div className="product-guide-actions">
                <Link className="button" href="/create">Create Profile <ArrowRight size={16} /></Link>
                <Link className="button secondary" href="/catalog">Browse QRguitar Profiles</Link>
              </div>
            </div>
            <div className="product-guide-principles" aria-label="QRguitar essentials">
              <div><Images /><strong>Add one clear photo</strong><span>Every Profile starts with a real image of the instrument.</span></div>
              <div><Eye /><strong>Choose who can see it</strong><span>Use Public, Unlisted, or Private without changing the permanent ID.</span></div>
              <div><QrCode /><strong>Print or share the QR</strong><span>The same link stays with the instrument as its Profile grows.</span></div>
            </div>
          </div>
        </section>

        <section className="section product-guide-flow">
          <div className="shell">
            <div className="section-heading centered-heading">
              <div className="eyebrow">Start in minutes</div>
              <h2>Four clear steps.</h2>
            </div>
            <ol className="product-guide-steps">
              {steps.map(([title, copy], index) => (
                <li key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{copy}</p></div></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section product-guide-identity" id="identity-privacy">
          <div className="shell product-guide-split">
            <div>
              <div className="eyebrow">Identity and privacy</div>
              <h2>The Serial Number and QRguitar ID have different jobs.</h2>
              <p><strong>With a Serial Number:</strong> the permanent ID uses the clear format QRG-[Serial Number]. The owner can hide the separate public Serial Number field without changing the ID or printed QR.</p>
              <p><strong>Without a Serial Number:</strong> QRguitar creates a unique six-digit ID. The Profile still works normally, but trust approval requires QRguitar review.</p>
            </div>
            <div className="product-guide-visibility">
              <div><QrCode /><strong>QRguitar ID</strong><span>The permanent system identity used by the Profile URL and printable QR.</span></div>
              <div><FileText /><strong>Serial Number</strong><span>The manufacturer or builder identity, shown publicly only when the owner allows it.</span></div>
              <div><ShieldCheck /><strong>Permanent link</strong><span>Editing details never changes the Profile URL or an already printed QR.</span></div>
            </div>
          </div>
        </section>

        <section className="section product-guide-uses" id="profile-capabilities">
          <div className="shell">
            <div className="section-heading centered-heading">
              <div className="eyebrow">One Profile, useful for years</div>
              <h2>Keep the information people actually need.</h2>
            </div>
            <div className="product-guide-use-grid product-guide-capability-grid">
              {capabilities.map((item) => <article key={item.title}><span>{item.icon}</span><h3>{item.title}</h3><p>{item.copy}</p></article>)}
            </div>
          </div>
        </section>

        <section className="section product-guide-uses" id="visibility">
          <div className="shell">
            <div className="section-heading centered-heading"><div className="eyebrow">Visibility</div><h2>You decide how the Profile is shared.</h2></div>
            <div className="product-guide-use-grid product-guide-three-grid">
              <article><span><Eye /></span><h3>Public</h3><p>Appears in the Catalog and opens through its direct QR or link.</p></article>
              <article><span><UserRoundCheck /></span><h3>Unlisted</h3><p>Stays out of the Catalog but opens for anyone with the direct QR or link.</p></article>
              <article><span><LockKeyhole /></span><h3>Private</h3><p>Opens only for the signed-in owner and authorized QRguitar administration.</p></article>
            </div>
          </div>
        </section>

        <section className="section product-guide-identity" id="ownership">
          <div className="shell product-guide-split">
            <div>
              <div className="eyebrow">When ownership changes</div>
              <h2>Transfer the Profile, not a copy of it.</h2>
              <p>The current owner or shop enters the recipient email and sends a secure claim link. The recipient signs in and accepts the existing Profile.</p>
              <p>Photos, the permanent QRguitar ID, and protected history stay connected. A public scan alone can never take ownership.</p>
            </div>
            <div className="product-guide-visibility">
              <div><Store /><strong>1. Start the handoff</strong><span>The current owner or shop sends the transfer from the dashboard.</span></div>
              <div><UserRoundCheck /><strong>2. Recipient accepts</strong><span>The recipient signs in with the intended email and reviews the Profile.</span></div>
              <div><Repeat2 /><strong>3. Same Profile continues</strong><span>The QRguitar ID and URL remain unchanged for the next owner.</span></div>
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
            <div><div className="eyebrow">Common questions</div><h2>Know what happens before you create a Profile.</h2></div>
            <div className="product-guide-faq-list">
              {faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
            </div>
          </div>
        </section>

        <section className="section product-guide-cta">
          <div className="shell product-guide-cta-inner">
            <div><div className="eyebrow">Ready to start?</div><h2>Create the Profile that stays with the instrument.</h2></div>
            <div className="product-guide-actions">
              <Link className="button" href="/create">Create Profile <ArrowRight size={16} /></Link>
              <Link className="button secondary" href="/catalog">Browse Profiles</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
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
  ["Create or find the Profile", "Enter the Serial Number first. If a matching Profile exists, use transfer or a reviewed claim instead of creating a duplicate."],
  ["Add identity, photos, and history", "Start with the instrument identity and one clear photo, then add the details and history you know."],
  ["Use the permanent QR", "Download, share, or print the QR for the instrument, case, counter card, or paperwork."],
  ["Maintain service and ownership", "Add approved service, media, documents, and ownership changes to the same permanent Profile over time."]
];

const capabilities = [
  { icon: <QrCode />, title: "Identity and QR", copy: "Keep the QRguitar ID, permitted Serial Number, and permanent Profile link together." },
  { icon: <Images />, title: "Photos, specs, and media", copy: "Show the instrument clearly with useful details, video, and audio." },
  { icon: <Wrench />, title: "Timeline and service", copy: "Record ownership milestones and owner-approved provider work." },
  { icon: <FileText />, title: "Documents and print", copy: "Keep private evidence, share selected documents, and print handouts or QR labels." },
  { icon: <Eye />, title: "Public, Unlisted, or Private", copy: "Choose how each Profile is discovered without changing its permanent identity." },
  { icon: <AlertTriangle />, title: "Safety and provenance", copy: "Publish lost or stolen alerts and preserve reviewed historical evidence." },
  { icon: <Repeat2 />, title: "Transfers and claims", copy: "Hand the same Profile to its next owner through a recipient-bound workflow." },
  { icon: <Store />, title: "Collections and Bulk Import", copy: "Opt into a public collection or prepare larger inventories privately before publishing." }
];

const audiences = [
  ["Players", "Document an instrument, maintain its history, share it, and transfer it when ownership changes."],
  ["Collectors", "Choose privacy per Profile, preserve provenance, and opt into a public collection when ready."],
  ["Shops", "Bulk import private inventory, refine Profiles, print counter or pickup materials, and transfer to customers."],
  ["Builders", "Create build Profiles with official specifications, media, and a clean purchaser handoff."],
  ["Brands", "Keep product identity consistent across new and used instruments while supporting larger rollouts."],
  ["Luthiers / Technicians", "Submit repair, restoration, setup, and service work for owner approval so accepted history stays with the instrument."],
  ["Buyers", "Review public identity, history, trust signals, and seller collections before transfer or claim."]
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
  const [activeAudience, setActiveAudience] = useState(0);
  const selectedAudience = audiences[activeAudience] || audiences[0];

  return (
    <>
      <Nav />
      <main>
        <section className="section product-guide-hero">
          <div className="shell product-guide-hero-inner">
            <div>
              <div className="eyebrow">How QRguitar works</div>
              <h1>One permanent Profile that grows with the instrument.</h1>
              <p>Create or find the instrument identity, add one real photo, and keep service, media, documents, and ownership connected to the same QR.</p>
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
          <div className="shell product-guide-visibility-grid" aria-label="Profile visibility options">
            <article><Eye /><div><strong>Public</strong><span>Listed in the Catalog and available through its QR or direct link.</span></div></article>
            <article><UserRoundCheck /><div><strong>Unlisted</strong><span>Kept out of the Catalog, but available to anyone with the QR or direct link.</span></div></article>
            <article><LockKeyhole /><div><strong>Private</strong><span>Available only to the signed-in owner and authorized QRguitar administration.</span></div></article>
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

        <section className="section product-guide-identity" id="service-providers">
          <div className="shell">
            <div className="section-heading centered-heading"><div className="eyebrow">Service and ownership</div><h2>Keep real work and real handoffs connected.</h2><p>Owners stay in control of what becomes part of the permanent Profile.</p></div>
            <div className="product-guide-dual-flow">
              <article>
                <Wrench /><div><h3>Service the owner approves</h3><p>A provider submits completed work and private evidence. The owner reviews, requests changes, declines, or approves it before anything is published.</p><Link href="/how-it-works#service-providers">Provider work stays clearly attributed</Link></div>
              </article>
              <article id="ownership">
                <Repeat2 /><div><h3>Transfer the same Profile</h3><p>The current owner sends a recipient-bound claim. The next owner accepts the existing Profile, while its QRguitar ID, URL, photos, and protected history stay connected.</p><span>A public scan can never take ownership.</span></div>
              </article>
            </div>
          </div>
        </section>

        <section className="section product-guide-uses" id="who-it-is-for">
          <div className="shell">
            <div className="section-heading centered-heading"><div className="eyebrow">Made for the instrument community</div><h2>Useful at home, at the bench, and across the counter.</h2></div>
            <div className="product-guide-role-switcher">
              <div className="product-guide-role-tabs" role="tablist" aria-label="Choose your role">
                {audiences.map(([title], index) => <button className={index === activeAudience ? "is-active" : ""} type="button" role="tab" aria-selected={index === activeAudience} key={title} onClick={() => setActiveAudience(index)}>{title}</button>)}
              </div>
              <article className="product-guide-role-panel" role="tabpanel">
                <span>{String(activeAudience + 1).padStart(2, "0")}</span>
                <div><h3>{selectedAudience[0]}</h3><p>{selectedAudience[1]}</p></div>
                <Link className="button secondary" href={activeAudience === 5 ? "/account#service-provider" : activeAudience === 6 ? "/ownership-claim" : activeAudience === 2 || activeAudience === 3 || activeAudience === 4 ? "/dashboard/import" : "/create"}>{activeAudience === 5 ? "Set up provider tools" : activeAudience === 6 ? "Open Claim Center" : activeAudience === 2 || activeAudience === 3 || activeAudience === 4 ? "Open inventory tools" : "Create a Profile"}</Link>
              </article>
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

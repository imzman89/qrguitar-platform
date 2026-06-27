export type KnowledgeTopic =
  | "about"
  | "pricing"
  | "create"
  | "visibility"
  | "qr"
  | "catalog"
  | "documents"
  | "builders"
  | "collectors"
  | "repair-shops"
  | "transfers"
  | "install"
  | "cranston"
  | "proper-instruments"
  | "proper-passive"
  | "listing"
  | "photos"
  | "gear"
  | "support";

type KnowledgeEntry = {
  topic: KnowledgeTopic;
  triggers: string[];
  answer: string;
  evidence: string[];
  nextSteps: string[];
};

export const supportEmail = "support@qrguitar.com";

const entries: KnowledgeEntry[] = [
  {
    topic: "about",
    triggers: ["what is qrguitar", "what does qrguitar do", "why qrguitar", "serial number"],
    answer:
      "QRguitar gives a guitar, amp, pedal, or instrument a permanent digital record tied to one QRguitar ID. A serial number identifies a thing; a QRguitar record keeps the story with it: specs, photos, repairs, documents, ownership notes, and sale or transfer history.",
    evidence: ["QRguitar product scope", "Permanent record workflow"],
    nextSteps: ["Create a record with make, model, serial, condition, photos, and visibility.", "Add proof over time instead of trying to finish everything on day one."]
  },
  {
    topic: "pricing",
    triggers: ["cost", "price", "pricing", "plan", "free", "beta", "paid help"],
    answer:
      "QRguitar records are free during public beta. Paid help is separate and handled by request for verification review, record cleanup, QR installs, custom QR hardware, and builder/shop onboarding. There is no public checkout live yet.",
    evidence: ["QRguitar launch pricing model"],
    nextSteps: ["Create a free beta record to test the system.", "Email support@qrguitar.com for verification help, QR installs, hardware, or builder/shop onboarding."]
  },
  {
    topic: "create",
    triggers: ["create a record", "make a record", "register", "upload", "first record"],
    answer:
      "To create a solid record, start with make, model, serial, year, type, condition, finish, location, owner status, photos, specs, notes, service notes, and documents. You can keep it basic first and add deeper proof later.",
    evidence: ["QRguitar create flow"],
    nextSteps: ["Use /create while signed in.", "Set public/private/unlisted before sharing.", "Upload the best main photo first."]
  },
  {
    topic: "visibility",
    triggers: ["private", "public", "unlisted", "visibility", "hidden"],
    answer:
      "Public records can appear in the catalog. Private records do not appear publicly. Unlisted records stay out of the catalog but can load by direct QRguitar link. Hidden documents stay private unless the owner marks them public.",
    evidence: ["Visibility rules", "Hidden document policy"],
    nextSteps: ["Use public for records meant to be discovered.", "Use unlisted for direct-link sharing.", "Keep receipts and sensitive docs hidden by default."]
  },
  {
    topic: "qr",
    triggers: ["download qr", "print qr", "qr code", "neck plate", "hang tag", "case card"],
    answer:
      "A QRguitar QR should point to the permanent record URL. Use it on a hang tag, case card, sales listing, repair intake form, certificate, shipping paperwork, or neck plate. Paid/verified records should be used for printable production QR work.",
    evidence: ["QR workflow"],
    nextSteps: ["Use a high-contrast QR style.", "Test scan before printing.", "Keep the permanent QRguitar ID unchanged."]
  },
  {
    topic: "catalog",
    triggers: ["catalog", "public entries", "show up", "listing card"],
    answer:
      "The catalog is for public QRguitar records only. If a record is public, it can appear there. If it is private, it stays out. If it is unlisted, it should not appear in browsing but can be opened by its direct link.",
    evidence: ["Catalog visibility rules"],
    nextSteps: ["Set visibility to Public to show in catalog.", "Edit the record if a public listing needs updated specs or photos."]
  },
  {
    topic: "documents",
    triggers: ["document", "receipt", "certificate", "warranty", "hidden document", "private document"],
    answer:
      "Documents can support provenance, warranty, repairs, and ownership history. Public documents can help buyers. Hidden documents should be used for receipts, private notes, IDs, or anything sensitive.",
    evidence: ["Document visibility policy"],
    nextSteps: ["Keep receipts hidden unless you intend to share them.", "Make certificates or general build sheets public when useful."]
  },
  {
    topic: "builders",
    triggers: ["builder", "luthier", "brand", "warranty", "build sheet"],
    answer:
      "Builders can ship each instrument with a clean digital spec sheet, setup notes, photos, warranty details, and transfer-ready ownership record. It gives the next owner a better starting point than a paper card in a case.",
    evidence: ["Builder workflow"],
    nextSteps: ["Create records at final setup.", "Add warranty terms and builder contact links.", "Attach final photos and setup measurements."]
  },
  {
    topic: "collectors",
    triggers: ["collector", "collection", "insurance", "provenance", "values"],
    answer:
      "Collectors can use QRguitar to keep provenance, photos, values, receipts, insurance details, case candy, repair history, and private notes organized by instrument.",
    evidence: ["Collector workflow"],
    nextSteps: ["Record serials and main photos first.", "Add private receipts and public provenance notes separately."]
  },
  {
    topic: "repair-shops",
    triggers: ["repair shop", "repair", "service", "setup", "bench", "fretwork"],
    answer:
      "Repair shops can scan an instrument, review prior work, add intake photos, record setup measurements, document parts and repairs, and send the customer home with a better service trail.",
    evidence: ["Repair workflow"],
    nextSteps: ["Add service date, work performed, measurements, parts, and photos.", "Keep sensitive customer docs hidden."]
  },
  {
    topic: "transfers",
    triggers: ["transfer", "ownership", "claim ownership", "sell the guitar", "new owner", "handoff"],
    answer:
      "Transfers are the ownership-change path. For MVP, treat transfers as a controlled flow: seller starts it, buyer confirms identity, and the record moves only after the right proof is reviewed. Do not treat a transfer as authentication by itself.",
    evidence: ["Ownership workflow"],
    nextSteps: ["Keep buyer email correct.", "Add sale/condition notes.", "Keep proof attached before final owner change."]
  },
  {
    topic: "install",
    triggers: ["under finish", "install qr", "neck plate", "decal", "cranston ri"],
    answer:
      "QRguitar can support QR placement on hang tags, case cards, labels, neck plates, and under-finish installs. Under-finish work should be handled by a qualified local shop or luthier because finish work is permanent.",
    evidence: ["Install workflow"],
    nextSteps: ["Use removable placement first if unsure.", "For under-finish work, document the install with photos and shop notes."]
  },
  {
    topic: "cranston",
    triggers: ["cranston guitars", "cranston", "rhode island", "ri"],
    answer:
      "Cranston Guitars is part of the QRguitar world as a local shop context in Cranston, Rhode Island. For shop-specific help, contact support@qrguitar.com or use the public record/shop links when they are available.",
    evidence: ["QRguitar local shop context"],
    nextSteps: ["Use QRguitar records for shop inventory, service notes, and owner-transfer support while the tools are in beta.", `Email ${supportEmail} for direct support.`]
  },
  {
    topic: "proper-instruments",
    triggers: ["proper instruments", "reptile", "proper build"],
    answer:
      "Proper Instruments records should lean on builder proof: build specs, serial, finish, pickups, setup notes, final photos, warranty notes, and ownership history. The Reptile demo record is meant to show that kind of builder-grade profile.",
    evidence: ["Proper Instruments context"],
    nextSteps: ["Keep builder specs public.", "Keep receipts or internal notes hidden unless they should be shared."]
  },
  {
    topic: "proper-passive",
    triggers: ["proper passive", "pickup", "pickups"],
    answer:
      "Proper Passive/pickup details should be documented like any other spec: model or set name, magnet/winding notes when known, wiring, switch layout, install date, and whether the parts are original or changed.",
    evidence: ["Pickup/spec documentation workflow"],
    nextSteps: ["Add pickup set and wiring as specs.", "Add cavity or install photos if they help future service."]
  },
  {
    topic: "listing",
    triggers: ["listing", "sell", "for sale", "photos should i upload", "write a listing"],
    answer:
      "A strong listing needs a plain title, honest condition summary, serial/year/specs, clear photos, repair/mod notes, included items, and what proof is attached. Separate completed-sale comps from active asking prices when setting the price.",
    evidence: ["Listing workflow"],
    nextSteps: ["Upload front, back, headstock, serial, neck, electronics/hardware, wear, and case/accessory photos.", "Add service and ownership notes before sharing."]
  },
  {
    topic: "photos",
    triggers: ["what photos", "upload photos", "main photo", "media"],
    answer:
      "Upload one strong main photo, then add front, back, headstock, serial, neck joint, bridge, pickups/electronics, finish wear, repairs, case, and documents as needed. Do not add dummy photos just to fill space.",
    evidence: ["Media workflow"],
    nextSteps: ["Set the best image as the main photo.", "Use close-ups for proof, not decoration."]
  },
  {
    topic: "gear",
    triggers: ["amps", "amp", "amplifier", "pedals", "pedal"],
    answer:
      "QRguitar can be used for guitars, amps, pedals, and other music gear. The record should match the object: amps need transformer, speaker, tube, service, and safety notes; pedals need version, PCB/revision, power, mods, and condition notes.",
    evidence: ["Gear support scope"],
    nextSteps: ["Use the type field to label the gear correctly.", "Add photos and service/mod notes that match the item."]
  },
  {
    topic: "support",
    triggers: ["support", "contact", "help", "order", "problem", "issue", "login", "account", "password", "checkout", "payment"],
    answer:
      `For account, order, payment, login, or shop setup help, email ${supportEmail}. Include your email address, any QRguitar ID, what you were trying to do, and what went wrong. Do not send card numbers or private payment details in chat.`,
    evidence: ["Support policy"],
    nextSteps: [`Email ${supportEmail} with the QRguitar ID if the issue is record-specific.`, "Tell me the instrument or account issue and I can help you organize what to send."]
  }
];

function normalize(value: string) {
  return String(value || "").toLowerCase();
}

export function findKnowledgeMatches(message: string, limit = 3) {
  const text = normalize(message);
  const scored = entries
    .map((entry) => ({
      entry,
      score:
        entry.triggers.reduce((sum, trigger) => sum + (text.includes(trigger) ? 3 : 0), 0) +
        (entry.topic === "photos" && /\b(photo|photos|media|image|images)\b/.test(text) ? 5 : 0) +
        (entry.topic === "gear" && /\b(amp|amps|amplifier|pedal|pedals)\b/.test(text) ? 5 : 0)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.entry);

  return scored.length ? scored : [];
}

export function buildKnowledgeAnswer(message: string) {
  const matches = findKnowledgeMatches(message, 2);
  if (!matches.length) {
    return null;
  }

  return {
    answer: matches.map((entry) => entry.answer).join(" "),
    evidenceUsed: Array.from(new Set(matches.flatMap((entry) => entry.evidence))),
    suggestedNextSteps: Array.from(new Set(matches.flatMap((entry) => entry.nextSteps))).slice(0, 4)
  };
}

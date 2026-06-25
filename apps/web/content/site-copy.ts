import {
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Fingerprint,
  Gem,
  Globe2,
  Image,
  Layers3,
  LockKeyhole,
  Network,
  QrCode,
  Repeat2,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Store,
  UserRoundCheck,
  Wrench
} from "lucide-react";

export const siteCopy = {
  hero: {
    eyebrow: "BUILT FOR BUILDERS, SHOPS, & COLLECTORS",
    headline: "The Permanent Record for Every Instrument.",
    body:
      "Give any guitar, amp, pedal, or custom build a permanent record tied to its own QR code: serial, specs, photos, service history, ownership, warranty notes, documents, and sale details.",
    primaryCta: "Create a Record",
    secondaryCta: "View a Demo Record",
    trust: ["Unique QR for each instrument", "Specs, photos, repairs, and receipts", "Owner handoff when it sells"]
  },
  workflow: {
    eyebrow: "How it works",
    headline: "Simple enough for one guitar. Useful enough for a whole shop.",
    body:
      "Create the record once, put the QR where buyers and techs will scan it, then keep the instrument's history current after every setup, repair, sale, or transfer.",
    cards: [
      {
        icon: QrCode,
        title: "Create the record",
        copy: "Start with make, model, serial number, year, condition, owner status, and a main photo. Add deeper specs when you have them."
      },
      {
        icon: Smartphone,
        title: "Attach or share the QR",
        copy: "Use it on a hang tag, case card, sales listing, repair intake sheet, certificate, shipping paperwork, or under-finish install."
      },
      {
        icon: BadgeCheck,
        title: "Update it for life",
        copy: "Add setup notes, service records, fretwork, receipts, videos, warranty claims, sale notes, and ownership transfers whenever the record changes."
      }
    ],
    cta: "Create Your First Record"
  },
  customization: {
    eyebrow: "What each record holds",
    headline: "The proof buyers, shops, and builders ask for.",
    body:
      "A strong record answers the questions that usually slow down a sale or repair: what it is, what changed, who worked on it, what paperwork exists, and what proof is missing.",
    checks: [
      { icon: CheckCircle2, copy: "Serial number, year, weight, finish, neck shape, pickup set, wiring, and build specs" },
      { icon: CheckCircle2, copy: "Setup measurements, fretwork, repairs, mods, parts, service dates, and shop notes" },
      { icon: CheckCircle2, copy: "Receipts, warranty info, certificates, appraisals, case candy, manuals, and documents" },
      { icon: CheckCircle2, copy: "Photos, videos, sale notes, provenance, private notes, and ownership transfers" }
    ],
    cta: "Build a Record"
  },
  audiences: {
    eyebrow: "Built for guitar people",
    headline: "For the bench, the sales floor, the collection room, and the next owner.",
    body: "Builders, shops, collectors, repair techs, and buyers all need the same truth in different moments. QRguitar keeps that record attached to the instrument instead of scattered across texts, binders, inboxes, and old listings.",
    cards: [
      {
        icon: Wrench,
        title: "Builders",
        copy: "Ship every build with a clean digital spec sheet, warranty record, photos, setup notes, and a record the customer can keep."
      },
      {
        icon: Store,
        title: "Shops and Retailers",
        copy: "Keep serials, condition notes, service work, floor photos, sale notes, and buyer handoff details in one record from intake to checkout."
      },
      {
        icon: Fingerprint,
        title: "Collectors",
        copy: "Keep provenance, photos, value notes, receipts, insurance details, case candy, and private owner notes organized across the whole collection."
      },
      {
        icon: UserRoundCheck,
        title: "Repair Shops",
        copy: "Scan the instrument before touching it. See previous work, add intake photos, setup measurements, parts, repairs, and completion notes."
      }
    ],
    cta: "Open the Dashboard"
  },
  vision: {
    eyebrow: "Daily use",
    headline: "A QR code that earns its keep.",
    body:
      "The QR is the doorway. The record is the asset: the place a buyer, tech, shop, or owner can open the instrument's story when the instrument is in hand.",
    cards: [
      {
        icon: Store,
        title: "Sales floor and listings",
        copy: "Put the QR on hang tags, case cards, online listings, and certificates so buyers can check specs, photos, condition, and history."
      },
      {
        icon: Network,
        title: "Service intake",
        copy: "Scan at drop-off, review prior work, add bench notes, upload photos, and send the instrument home with the service trail attached."
      },
      {
        icon: ShieldCheck,
        title: "Warranty and claims",
        copy: "Keep warranty terms, proof of purchase, claim notes, repair documents, and owner communication tied to the instrument."
      },
      {
        icon: Database,
        title: "Inventory",
        copy: "Track serials, locations, condition, asking price, ownership status, sale readiness, and missing documentation."
      },
      {
        icon: Gem,
        title: "Collections",
        copy: "Keep rare pieces organized with media, history, value notes, appraisals, receipts, private notes, and public showcase pages."
      },
      {
        icon: BarChart3,
        title: "Resale and transfer",
        copy: "When the instrument sells, transfer the record so the next owner gets the history instead of starting with a blank page."
      }
    ],
    cta: "See Public Records"
  },
  platform: {
    appIcon: Building2,
    appTitle: "Commercial plans start at $199/year.",
    appBody:
      "For builders, retailers, repair shops, and brands that need staff access, batch records, warranty tracking, and customer handoff tools.",
    steps: ["Bulk record creation", "Staff and inventory tools", "Warranty, catalog, and handoff tools"],
    eyebrow: "For businesses",
    headline: "When the records become part of how the shop runs.",
    body:
      "Commercial plans start at $199/year because a shop account does more than make QR codes. It supports staff access, inventory views, warranty records, catalog pages, imports, customer handoffs, and setup help.",
    cards: [
      {
        icon: Database,
        title: "Inventory",
        copy: "Create records in batches, search serials, track locations, flag missing info, and keep shop inventory cleaner."
      },
      {
        icon: Building2,
        title: "Brand and catalog",
        copy: "Give builders, retailers, and repair shops a sharper public presence with branded records and catalog pages."
      },
      {
        icon: ShieldCheck,
        title: "Warranty",
        copy: "Keep warranty terms, claims, service documents, proof of purchase, and owner history where staff can find them."
      },
      {
        icon: BarChart3,
        title: "Customer handoff",
        copy: "Hand the record to the buyer at sale, keep your brand attached to the instrument, and make future service easier."
      }
    ],
    cta: "Start a Commercial Plan"
  },
  pricing: {
    eyebrow: "Pricing",
    headline: "Straightforward pricing for one guitar or a whole wall of them.",
    body:
      "Buy one permanent record, choose a pack for a collection or small batch, or start a commercial plan when records become part of the business.",
    plans: [
      {
        name: "Single Instrument",
        price: "$12",
        copy: "For one guitar, amp, pedal, or instrument",
        features: ["1 permanent QRguitar record", "Unique QR code", "Photos, specs, repairs, receipts, and documents", "Public or private visibility"]
      },
      {
        name: "10-Code Pack",
        price: "$50",
        copy: "For collections and small batches",
        badge: "Most Popular",
        features: ["10 permanent records", "Only $5 per instrument", "Good for collections, shop pieces, or small builds", "Ready for future owner transfer"]
      },
      {
        name: "25-Code Pack",
        price: "$99",
        copy: "For builders, shops, and serious collections",
        badge: "Best Value",
        features: [
          "25 permanent records",
          "Under $4 per instrument",
          "One free transfer per instrument",
          "Built for sales, batches, and inventory"
        ]
      },
      {
        name: "Commercial",
        price: "$199/yr",
        copy: "For shops, builders, retailers, and brands",
        badge: "For Shops",
        features: [
          "Starts at $199 per year",
          "Staff, inventory, warranty, and catalog tools",
          "Customer handoff at sale",
          "For builders, retailers, brands, and repair shops"
        ]
      }
    ],
    enterpriseTitle: "Why commercial plans are annual",
    enterpriseBody:
      "A business account needs live records, staff access, imports, catalog pages, warranty tools, support, and customer handoff tools. Larger shops and brands can add onboarding, custom setup, and deeper inventory help."
  },
  preview: {
    specsIcon: Layers3,
    mediaIcon: Image,
    timelineIcon: Clock3,
    docsIcon: ScrollText
  }
};

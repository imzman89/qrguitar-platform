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
      "Create a digital identity for any guitar, amp, pedal, or custom build. Keep specs, service history, ownership records, warranty info, photos, documents, and sale details connected for life.",
    primaryCta: "Create a Record",
    secondaryCta: "Browse Public Records",
    trust: ["Unique QR for each instrument", "Specs, photos, repairs, and receipts", "Owner-transfer tools in beta"]
  },
  workflow: {
    eyebrow: "How it works",
    headline: "Simple enough for one guitar. Useful enough for a whole shop.",
    body:
      "Start with the basic facts, put the QR where people will actually use it, then keep adding the things that usually get lost.",
    cards: [
      {
        icon: QrCode,
        title: "Create the record",
        copy: "Add the make, model, serial number, year, photos, owner status, build notes, and anything already known about the instrument."
      },
      {
        icon: Smartphone,
        title: "Attach or share the QR",
        copy: "Use it on a hang tag, case card, sales listing, repair intake sheet, certificate, shipping paperwork, or under-finish install."
      },
      {
        icon: BadgeCheck,
        title: "Update it for life",
        copy: "Add setup notes, service records, fretwork, receipts, videos, warranty claims, sale notes, and manual owner-change notes as the years go on."
      }
    ],
    cta: "Create Your First Record"
  },
  customization: {
    eyebrow: "What each record holds",
    headline: "The details guitar people ask for, before they ask.",
    body:
      "A QRguitar record can be as simple or as deep as the instrument needs. Start with the basics, then add the bench notes, proof, media, and history that make the piece easier to sell, service, insure, or pass on.",
    checks: [
      { icon: CheckCircle2, copy: "Serial number, year, weight, finish, neck shape, pickup set, wiring, and build specs" },
      { icon: CheckCircle2, copy: "Setup measurements, fretwork, repairs, mods, parts, service dates, and shop notes" },
      { icon: CheckCircle2, copy: "Receipts, warranty info, certificates, appraisals, case candy, manuals, and documents" },
      { icon: CheckCircle2, copy: "Photos, videos, sale notes, provenance, private notes, and beta owner-change support" }
    ],
    cta: "Build a Record"
  },
  audiences: {
    eyebrow: "Built for guitar people",
    headline: "For the bench, the sales floor, the collection room, and the next owner.",
    body: "Different people need different details. QRguitar keeps those details attached to the instrument instead of buried in texts, folders, binders, and old listings.",
    cards: [
      {
        icon: Wrench,
        title: "Builders",
        copy: "Ship every build with a clean digital spec sheet, warranty record, photos, setup notes, and a record the customer can keep."
      },
      {
        icon: Store,
        title: "Shops and Retailers",
        copy: "Stop losing info between the bench, sales floor, website, and buyer. Keep serials, condition notes, service work, and sale notes together."
      },
      {
        icon: Fingerprint,
        title: "Collectors",
        copy: "Keep provenance, photos, values, receipts, insurance details, case candy, and private notes organized across the whole collection."
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
      "The code is not the product. The record is. The QR just makes the record easy to open when the instrument is in someone's hands.",
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
        copy: "When the instrument sells, keep the sale notes and record history ready. Owner-change tools are in beta with support available."
      }
    ],
    cta: "See Public Records"
  },
  platform: {
    appIcon: Building2,
    appTitle: "Commercial tools are opening by request.",
    appBody:
      "For builders, retailers, repair shops, and brands that need more than a few codes and a spreadsheet.",
    steps: ["Bulk record creation", "Staff and inventory tools", "Warranty, catalog, and owner-transfer tools in beta"],
    eyebrow: "For businesses",
    headline: "When the records become part of how the shop runs.",
    body:
      "Commercial tools are opening carefully because shops and brands need more: staff access, inventory views, warranty records, catalog pages, imports, owner-transfer support in beta, and help getting set up.",
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
        title: "Owner-transfer beta",
        copy: "Prepare the record for the buyer at sale, keep your brand attached to the instrument, and use QRguitar support for manual help while ownership tools are in beta."
      }
    ],
    cta: "Start a Commercial Plan"
  },
  pricing: {
    eyebrow: "Public beta",
    headline: "Create records free. Commercial setup starts at $99+.",
    body:
      "During public beta, users can create instrument records without a hard paywall. Verification, QR hardware, install help, builder/shop onboarding, and commercial setup are available as paid services.",
    plans: [
      {
        name: "Free Public Beta",
        price: "$0",
        copy: "Create up to 25 records during public beta. Add photos, specs, documents, notes, visibility settings, and QR downloads without a hard paywall.",
        features: [
          "Up to 25 records during beta",
          "Public, private, or unlisted",
          "No verified badge included",
          "Verify important records later",
          "Photos, specs, documents, and notes",
        ]
      },
      {
        name: "Commercial / Brand Setup",
        price: "From $99+",
        copy: "For builders, retailers, repair shops, brands, and commercial accounts that want onboarding help, bulk setup, QR hardware, verification support, or a branded rollout.",
        features: [
          "Builder, retailer, and shop onboarding",
          "Bulk record setup and inventory help",
          "QR plates, tags, stickers, and install options",
          "Verification support available",
          "Custom pricing based on business needs"
        ]
      }
    ],
    enterpriseTitle: "Commercial setup by request",
    enterpriseBody:
      "Create records for free during beta. Paid help is handled manually by request."
  },
  preview: {
    specsIcon: Layers3,
    mediaIcon: Image,
    timelineIcon: Clock3,
    docsIcon: ScrollText
  }
};

import {
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
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
    eyebrow: "FOR OWNERS, SHOPS, BUILDERS & COLLECTORS",
    headline: "One Profile for the life of an instrument.",
    body:
      "Keep the photos, specs, service, documents, ownership, and permanent QR with the instrument.",
    primaryCta: "Create a Profile",
    secondaryCta: "Explore the Catalog",
    trust: ["Permanent QRguitar ID", "Owner-controlled privacy"]
  },
  workflow: {
    eyebrow: "HOW IT WORKS",
    headline: "Create it once. Keep it current.",
    body:
      "Start with the instrument. Add the history as it happens.",
    cards: [
      {
        icon: QrCode,
        title: "Identify",
        copy: "Serial Number, photos, specifications, and the permanent QRguitar ID."
      },
      {
        icon: ScrollText,
        title: "Document",
        copy: "Service, documents, media, safety, and ownership history."
      },
      {
        icon: Repeat2,
        title: "Carry Forward",
        copy: "Transfer the same Profile when the instrument changes hands."
      }
    ],
    cta: "Create a Profile"
  },
  customization: {
    eyebrow: "INSIDE A PROFILE",
    headline: "See the details that matter.",
    body:
      "Photos, specifications, service, documents, and ownership stay attached to the same Profile.",
    checks: [
      { icon: CheckCircle2, copy: "Identity: Serial Number, specifications, condition, and QRguitar ID." },
      { icon: CheckCircle2, copy: "History: service, Timeline events, ownership, and safety." },
      { icon: CheckCircle2, copy: "Documents: receipts, appraisals, build sheets, and files you choose to share." }
    ],
    cta: "Explore a Profile"
  },
  audiences: {
    eyebrow: "WHO USES QRGUITAR",
    headline: "One system. Different jobs.",
    body: "",
    cards: [
      {
        icon: UserRoundCheck,
        title: "Owners",
        copy: "Keep your instruments organized, control what's public, and hand the same Profile to the next owner."
      },
      {
        icon: Fingerprint,
        title: "Collectors",
        copy: "Preserve photos, documents, service, and provenance without losing the story."
      },
      {
        icon: Store,
        title: "Shops",
        copy: "Create or import inventory, print QR materials, and transfer Profiles to buyers."
      },
      {
        icon: Building2,
        title: "Builders / Brands",
        copy: "Issue consistent Profiles for new builds and hand the same Profile to the first owner."
      },
      {
        icon: Wrench,
        title: "Luthiers / Technicians",
        copy: "Submit completed service with private evidence for the owner to review."
      },
      {
        icon: Eye,
        title: "Buyers",
        copy: "Review the public history, then receive the same Profile through a secure transfer or claim."
      }
    ],
    cta: ""
  },
  vision: {
    eyebrow: "Daily use",
    headline: "A QR code that earns its keep.",
    body:
      "The code is not the product. The profile is. The QR just makes the profile easy to open when the instrument is in someone's hands.",
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
        copy: "When the instrument sells, keep the sale notes and record history ready. Use the ownership tools to hand the same Profile to its next owner."
      }
    ],
    cta: "See QRguitar Profiles"
  },
  platform: {
    appIcon: Building2,
    appTitle: "Commercial tools are opening by request.",
    appBody:
      "For builders, retailers, repair shops, and brands that need more than a few codes and a spreadsheet.",
    steps: ["Bulk record creation", "Staff and inventory tools", "Warranty, catalog, and owner-transfer tools"],
    eyebrow: "For businesses",
    headline: "When the records become part of how the shop runs.",
    body:
      "Commercial tools are opening carefully because shops and brands need more: staff access, inventory views, warranty profiles, catalog pages, imports, owner-transfer support, and help getting set up.",
    cards: [
      {
        icon: Database,
        title: "Inventory",
        copy: "Create QRguitar Profiles in batches, search serials, track locations, flag missing info, and keep shop inventory cleaner."
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
        title: "Owner transfers",
        copy: "Prepare the record for the buyer at sale, keep your brand attached to the instrument, and use QRguitar support for manual help when a handoff needs extra help."
      }
    ],
    cta: "Start a Commercial Plan"
  },
  pricing: {
    eyebrow: "PROFILE ACCESS",
    headline: "Start free. Get help when you need it.",
    body: "",
    plans: [
      {
        name: "For owners and collectors",
        price: "Free",
        copy: "Create up to 5 Profiles with photos, specifications, privacy controls, history, and downloadable QR codes.",
        features: [
          "5 free Profiles",
          "Public, Unlisted, or Private",
          "Downloadable QR codes",
          "Service and ownership history"
        ]
      },
      {
        name: "For shops, builders & brands",
        price: "From $99",
        copy: "Need help with bulk setup, QR hardware, verification, or a commercial rollout? We'll help you get started.",
        features: [
          "Bulk Profile setup",
          "Business onboarding",
          "QR hardware and print support",
          "Verification support"
        ]
      }
    ],
    enterpriseTitle: "Commercial setup by request",
    enterpriseBody:
      "Start with five free Profiles. Assisted setup is available by request."
  },
  preview: {
    specsIcon: Layers3,
    mediaIcon: Image,
    timelineIcon: Clock3,
    docsIcon: ScrollText
  }
};

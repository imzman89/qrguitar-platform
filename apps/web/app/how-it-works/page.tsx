import { getPublicInstruments } from "../../lib/public-instruments";
import { selectHomeFeaturedProfile } from "../../lib/home-featured-profile";
import { unstable_noStore as noStore } from "next/cache";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";
import { resolveVisibleEditorialSections } from "../../lib/site-settings";
import { serializeJsonLd } from "../../lib/seo";
import { buildManagedPageMetadata } from "../../lib/site-metadata";
import { HowItWorksClient } from "./HowItWorksClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() { return buildManagedPageMetadata("howItWorks", "/how-it-works"); }

export default async function HowItWorksPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await props?.searchParams;
  const initialAudienceId = typeof query?.audience === "string" ? query.audience : "";
  noStore();
  const [settings, records] = await Promise.all([loadPublishedSiteSettings(), getPublicInstruments().catch(() => [])]);
  const faq = resolveVisibleEditorialSections(settings, "howItWorks").find(section => section.id === "faq")?.blocks.filter(block => block.visible && block.title.trim() && block.body.trim()) || [];
  const faqJsonLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(block => ({ "@type": "Question", name: block.title, acceptedAnswer: { "@type": "Answer", text: block.body } })) };
  return <><HowItWorksClient key={initialAudienceId} settings={settings} example={selectHomeFeaturedProfile(records)} initialAudienceId={initialAudienceId} />{faq.length ? <script id="qrguitar-guide-faq-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }} /> : null}</>;
}

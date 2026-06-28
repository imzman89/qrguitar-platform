import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { ProfileClient } from "./ProfileClient";
import { getPublicInstrumentByCode } from "../../../lib/public-instruments";
import { buildRecordJsonLd, buildRecordMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadInstrument(codeParam: string) {
  noStore();
  const code = String(codeParam || "").trim().toUpperCase();
  const instrument = code ? await getPublicInstrumentByCode(code).catch(() => null) : null;
  return { code, instrument };
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const { instrument } = await loadInstrument(params.code);

  if (!instrument) {
    return {
      title: "Record not found",
      robots: {
        index: false,
        follow: false
      }
    };
  }

  return buildRecordMetadata(instrument);
}

export default async function PublicProfilePage({ params }: { params: { code: string } }) {
  const { code, instrument } = await loadInstrument(params.code);

  if (!instrument) {
    notFound();
  }

  return (
    <>
      <script
        id={`qrguitar-record-jsonld-${code}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildRecordJsonLd(instrument)) }}
      />
      <ProfileClient code={code} initialInstrument={instrument} />
    </>
  );
}

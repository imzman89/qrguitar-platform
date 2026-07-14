import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ProfileClient } from "./ProfileClient";
import { getPublicInstrumentByCode } from "../../../lib/public-instruments";
import { isRetiredPublicProfileCode, normalizePublicProfileCode } from "../../../lib/public-profile-eligibility";
import { buildRecordJsonLd, buildRecordMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeCode(codeParam: string) {
  return normalizePublicProfileCode(codeParam);
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = normalizeCode(params.code);
  if (!code || isRetiredPublicProfileCode(code)) {
    return {
      title: "QRguitar Profile Not Found",
      robots: { index: false, follow: false }
    };
  }

  const instrument = await getPublicInstrumentByCode(code);
  if (instrument) {
    return buildRecordMetadata(instrument);
  }

  return {
    title: "QRguitar Profile Not Found",
    robots: { index: false, follow: false }
  };
}

export default async function PublicProfilePage({ params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  if (!code || isRetiredPublicProfileCode(code)) {
    notFound();
  }

  const instrument = await getPublicInstrumentByCode(code);
  if (!instrument) {
    notFound();
  }

  if (instrument && instrument.qrCode.toUpperCase() !== code) {
    permanentRedirect(instrument.permanentPath || `/i/${instrument.qrCode}`);
  }

  return (
    <>
      {instrument ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildRecordJsonLd(instrument)).replace(/</g, "\\u003c") }}
        />
      ) : null}
      <ProfileClient code={code} initialInstrument={instrument} />
    </>
  );
}

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ProfileClient } from "./ProfileClient";
import { getPublicInstrumentByCode } from "../../../lib/public-instruments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const retiredProfileCodes = new Set(["QRG-PI260001", "QRG-0001"]);

function normalizeCode(codeParam: string) {
  return String(codeParam || "").trim().toUpperCase();
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = String(params.code || "").trim().toUpperCase();

  return {
    title: code ? `QRguitar Profile ${code}` : "QRguitar Profile",
    description: "Permanent QRguitar Profile with instrument photos, specs, service history, documents, and ownership context.",
    alternates: {
      canonical: code ? `https://www.qrguitar.com/i/${code}` : "https://www.qrguitar.com/catalog"
    }
  };
}

export default async function PublicProfilePage({ params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  if (!code || retiredProfileCodes.has(code)) {
    notFound();
  }

  const instrument = await getPublicInstrumentByCode(code);
  if (instrument && instrument.qrCode.toUpperCase() !== code) {
    permanentRedirect(instrument.permanentPath || `/i/${instrument.qrCode}`);
  }

  return <ProfileClient code={code} initialInstrument={instrument} />;
}

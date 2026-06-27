import { notFound } from "next/navigation";
import { ProfileClient } from "./ProfileClient";
import { getPublicInstrumentByCode } from "../../../lib/public-instruments";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: { params: { code: string } }) {
  const code = String(params.code || "").trim().toUpperCase();
  const instrument = code ? await getPublicInstrumentByCode(code).catch(() => null) : null;

  if (!instrument) {
    notFound();
  }

  return <ProfileClient code={code} initialInstrument={instrument} />;
}

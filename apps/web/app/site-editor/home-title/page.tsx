import type { Metadata } from "next";
import { HomeTitleCorrection } from "../../../components/HomeTitleCorrection";

export const metadata: Metadata = { title: "Homepage title correction | QRguitar", robots: { index: false, follow: false } };
export default function HomeTitlePage() { return <main><HomeTitleCorrection /></main>; }

import Link from "next/link";
import { UnavailablePage } from "../components/UnavailablePage";

export default function NotFound() {
  return (
    <UnavailablePage
      title="This page isn’t available."
      description="Check the address, or explore the instruments and collections on QRguitar."
    >
      <Link href="/catalog">Explore the Catalog</Link>
      <Link href="/">Back to home</Link>
    </UnavailablePage>
  );
}

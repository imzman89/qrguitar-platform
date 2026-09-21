import Link from "next/link";
import { UnavailablePage } from "../../../components/UnavailablePage";

export default function ProfileNotFound() {
  return (
    <UnavailablePage
      title="This Profile isn’t available."
      description="Check the link, or explore other instrument Profiles in the Catalog."
    >
      <Link href="/catalog">Explore the Catalog</Link>
      <Link href="/">Back to home</Link>
    </UnavailablePage>
  );
}

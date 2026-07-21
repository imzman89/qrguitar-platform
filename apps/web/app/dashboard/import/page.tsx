import { BulkImportWorkspace } from "../../../components/BulkImportWorkspace";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";

export const metadata = { title: "Bulk Import | QRguitar", robots: { index: false, follow: false } };

export default function BulkImportPage() {
  return <><Nav /><main className="section bulk-import-page"><div className="shell"><BulkImportWorkspace /></div></main><Footer /></>;
}

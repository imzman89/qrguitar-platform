import QRCode from "qrcode";
import { publicProfileUrl } from "./profile-url";
import { buildQrBatchPlan, type QrBatchRequest, type QrBatchSettings } from "./qr-batch-layout";

/** Pure vector PDF: physical paper/cell sizes and four-module quiet zones match the preview. */
export function createQrBatchPdf(requests: QrBatchRequest[], settings: QrBatchSettings): Uint8Array {
  const plan = buildQrBatchPlan(requests, settings), pointsPerMm = 72 / 25.4;
  const objects: string[] = [];
  const add = (value = "") => { objects.push(value); return objects.length; };
  const set = (id: number, value: string) => { objects[id - 1] = value; };
  const catalogId = add(), pagesId = add();
  const number = (value: number) => {
    const fixed = value.toFixed(8).replace(/\.?0+$/, "");
    return fixed === "-0" ? "0" : fixed;
  };
  const stream = (body: string, dictionary = "") => `<< ${dictionary} /Length ${Buffer.byteLength(body, "ascii")} >>\nstream\n${body}\nendstream`;
  const forms = new Map<string, { id: number; name: string; modules: number }>();
  for (const request of requests) {
    const matrix = QRCode.create(publicProfileUrl(request.code), { errorCorrectionLevel: "H" }).modules;
    const modules = matrix.size + 8;
    const paths = [`1 g 0 0 ${modules} ${modules} re f`, "0 g"];
    for (let row = 0; row < matrix.size; row++) for (let column = 0; column < matrix.size;) {
      if (!matrix.get(row, column)) { column++; continue; }
      const start = column;
      while (column < matrix.size && matrix.get(row, column)) column++;
      paths.push(`${start + 4} ${matrix.size - row + 3} ${column - start} 1 re f`);
    }
    const id = add(stream(paths.join("\n"), `/Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 ${modules} ${modules}] /Resources << >>`));
    forms.set(request.code, { id, name: `QR${forms.size}`, modules });
  }
  const resources = `/Resources << /XObject << ${[...forms.values()].map(form => `/${form.name} ${form.id} 0 R`).join(" ")} >> >>`;
  const pageIds: number[] = [];
  for (const cells of plan.pages) {
    const pageId = add(), contentId = add(); pageIds.push(pageId);
    const paths = cells.map(cell => {
      const form = forms.get(cell.code)!;
      const scale = cell.sideMm * pointsPerMm / form.modules;
      const left = cell.xMm * pointsPerMm, bottom = (plan.heightMm - cell.yMm - cell.sideMm) * pointsPerMm;
      return `q ${number(scale)} 0 0 ${number(scale)} ${number(left)} ${number(bottom)} cm /${form.name} Do Q`;
    });
    set(contentId, stream(paths.join("\n")));
    set(pageId, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${number(plan.widthMm * pointsPerMm)} ${number(plan.heightMm * pointsPerMm)}] ${resources} /Contents ${contentId} 0 R >>`);
  }
  set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R /ViewerPreferences << /PrintScaling /None >> >>`);
  set(pagesId, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const infoId = add("<< /Producer (QRguitar) /Title (Permanent instrument Profile QR labels) >>");
  const parts = [Buffer.from("%PDF-1.4\n%QRguitar\n", "ascii")], offsets = [0];
  let offset = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(offset); const part = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "ascii"); parts.push(part); offset += part.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}`, "0000000000 65535 f ", ...offsets.slice(1).map(value => `${String(value).padStart(10, "0")} 00000 n `)].join("\n");
  parts.push(Buffer.from(`${xref}\ntrailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, "ascii"));
  return new Uint8Array(Buffer.concat(parts));
}

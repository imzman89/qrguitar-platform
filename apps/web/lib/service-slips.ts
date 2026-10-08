/** Private professional workspace records; account preference is not provider verification. */
export const serviceSlipTextLimits = {
  instrument: 160, make: 80, model: 100, serial: 120, qrReference: 80,
  jobReference: 80, jobDate: 10, businessName: 120, businessContact: 240,
  customerName: 160, customerContact: 240, requestedWork: 4000,
  completedWork: 4000, privateNotes: 4000, footer: 400
} as const;
export type SlipTextField = keyof typeof serviceSlipTextLimits;
export type ServiceSlip = Record<SlipTextField, string> & {
  paper: "letter" | "a4"; printCustomer: boolean; printPrivateNotes: boolean;
};
export type SavedServiceSlip = {
  id: string; owner_id: string; revision: number; data: ServiceSlip; created_at: string; updated_at: string;
};
export function canUsePrivateServiceSlips(accountType: unknown) {
  return accountType === "shop" || accountType === "luthier";
}
export function isSlipId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function emptyServiceSlip(): ServiceSlip {
  return { instrument: "", make: "", model: "", serial: "", qrReference: "", jobReference: "", jobDate: "",
    businessName: "", businessContact: "", customerName: "", customerContact: "", requestedWork: "",
    completedWork: "", privateNotes: "", footer: "", paper: "letter", printCustomer: false, printPrivateNotes: false };
}
export function readServiceSlip(value: unknown): ServiceSlip {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Check the service slip details.");
  const input = value as Record<string, unknown>;
  const allowed = new Set([...Object.keys(serviceSlipTextLimits), "paper", "printCustomer", "printPrivateNotes"]);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error("Unexpected service slip field.");
  const result = emptyServiceSlip();
  for (const key of Object.keys(serviceSlipTextLimits) as SlipTextField[]) {
    const text = input[key];
    if (typeof text !== "string" || text.length > serviceSlipTextLimits[key] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
      throw new Error("Check the length and format of " + key + ".");
    }
    result[key] = text.trim();
  }
  if (!result.instrument) throw new Error("Describe the instrument before saving.");
  if (result.jobDate && (!/^\d{4}-\d{2}-\d{2}$/.test(result.jobDate) || !Number.isFinite(Date.parse(result.jobDate)) || new Date(result.jobDate).toISOString().slice(0,10) !== result.jobDate)) {
    throw new Error("Choose a valid job date.");
  }
  if (result.qrReference && !/^QRG-[A-Z0-9][A-Z0-9-]{0,75}$/i.test(result.qrReference)) throw new Error("Enter a QRG code or leave the reference empty.");
  result.qrReference = result.qrReference.toUpperCase();
  if (input.paper !== "letter" && input.paper !== "a4") throw new Error("Choose Letter or A4 paper.");
  if (typeof input.printCustomer !== "boolean" || typeof input.printPrivateNotes !== "boolean") throw new Error("Check the print options.");
  result.paper = input.paper; result.printCustomer = input.printCustomer; result.printPrivateNotes = input.printPrivateNotes;
  if (new TextEncoder().encode(JSON.stringify(result)).length > 60000) throw new Error("This slip is too long. Shorten the work notes.");
  return result;
}
export function readSavedServiceSlip(value: unknown, actor: string): SavedServiceSlip {
  if (!value || typeof value !== "object") throw new Error("Could not verify the saved slip.");
  const row = value as SavedServiceSlip;
  if (!isSlipId(row.id) || row.owner_id !== actor || !Number.isSafeInteger(row.revision) || row.revision < 1
    || typeof row.created_at !== "string" || typeof row.updated_at !== "string"
    || !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.updated_at))) throw new Error("Could not verify the saved slip.");
  return { id: row.id, owner_id: row.owner_id, revision: row.revision, data: readServiceSlip(row.data), created_at: row.created_at, updated_at: row.updated_at };
}

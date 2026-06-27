import { sampleGuitar, type GuitarProfile } from "@qrguitar/shared";

export async function getGuitarByCode(code: string): Promise<GuitarProfile> {
  // Supabase hookup goes here. For now this keeps the MVP runnable with no backend.
  return {
    ...sampleGuitar,
    qrCode: code.toUpperCase()
  };
}

export const dashboardStats = [
  { label: "Registered instruments", value: "1" },
  { label: "Verified records", value: "1" },
  { label: "Transfers pending", value: "0" },
  { label: "Public scans", value: "24" }
];

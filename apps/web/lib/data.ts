import { sampleGuitar, type GuitarProfile } from "@qrguitar/shared";

export async function getGuitarByCode(code: string): Promise<GuitarProfile> {
  // Replace this fallback with the production instrument query when database storage is connected.
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

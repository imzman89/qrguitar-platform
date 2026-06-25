type GuitarProfile = {
  qrCode: string;
  name: string;
  brand: string;
  model: string;
  serial: string;
  year: string;
  owner: string;
  location: string;
  summary: string;
};

const sampleGuitar: GuitarProfile = {
  qrCode: "QRG-PI260001",
  name: "Reptile",
  brand: "Proper Instruments",
  model: "1-of-1",
  serial: "PI260001",
  year: "2026",
  owner: "Unclaimed",
  location: "Cranston, Rhode Island, USA",
  summary: "Permanent QRguitar demo record for a Proper Instruments custom build."
};

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

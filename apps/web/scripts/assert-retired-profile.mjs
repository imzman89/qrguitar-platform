const baseUrl = (process.env.QRGUITAR_TEST_BASE_URL || "http://127.0.0.1:3003").replace(/\/$/, "");
const retiredCode = "QRG-PI260001";
const paths = [
  `/i/${retiredCode}`,
  `/i/${retiredCode.toLowerCase()}`,
  `/api/instruments?code=${retiredCode}`,
  `/api/instruments?code=${retiredCode.toLowerCase()}`
];

for (const path of paths) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  if (response.status !== 404) {
    throw new Error(`${path} returned ${response.status}; expected 404.`);
  }
}

console.log("Retired profile route and API assertions passed.");

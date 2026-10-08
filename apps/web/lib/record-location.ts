type LocationLike = {
  city?: string | null;
  location?: string | null;
  region?: string | null;
  state?: string | null;
  province?: string | null;
  country?: string | null;
};

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC"
};

const CANADA_PROVINCE_ABBREVIATIONS: Record<string, string> = {
  alberta: "AB",
  "british columbia": "BC",
  manitoba: "MB",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  "northwest territories": "NT",
  "nova scotia": "NS",
  nunavut: "NU",
  ontario: "ON",
  "prince edward island": "PE",
  quebec: "QC",
  saskatchewan: "SK",
  yukon: "YT"
};

const US_STATE_CODES = new Set(Object.values(US_STATE_ABBREVIATIONS));
const CANADA_PROVINCE_CODES = new Set(Object.values(CANADA_PROVINCE_ABBREVIATIONS));
const UK_REGIONS = new Set(["england", "scotland", "wales", "northern ireland"]);

function clean(value?: string | null) {
  return String(value || "").trim();
}

function dedupeParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of parts) {
    const cleaned = clean(value);
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(cleaned);
  }

  return output;
}

function normalizeCountry(value: string) {
  const normalized = clean(value);
  const key = normalized.toLowerCase();

  if (!normalized) {
    return "";
  }

  if (["us", "u.s.", "u.s.a.", "usa", "united states", "united states of america"].includes(key)) {
    return "United States";
  }

  if (["uk", "u.k.", "united kingdom", "great britain", "britain"].includes(key)) {
    return "UK";
  }

  if (["ca", "canada"].includes(key)) {
    return "Canada";
  }

  return normalized;
}

function normalizeUsState(value: string) {
  const normalized = clean(value);
  const key = normalized.toLowerCase();

  if (!normalized) {
    return "";
  }

  if (/^[A-Z]{2}$/.test(normalized)) {
    return normalized;
  }

  return US_STATE_ABBREVIATIONS[key] || normalized;
}

function normalizeCanadaProvince(value: string) {
  const normalized = clean(value);
  const key = normalized.toLowerCase();

  if (!normalized) {
    return "";
  }

  if (/^[A-Z]{2}$/.test(normalized)) {
    return normalized;
  }

  return CANADA_PROVINCE_ABBREVIATIONS[key] || normalized;
}

function inferCountryFromRegion(region: string, country: string) {
  const normalizedCountry = normalizeCountry(country);
  const normalizedRegion = clean(region);
  const regionKey = normalizedRegion.toLowerCase();

  if (normalizedCountry) {
    return normalizedCountry;
  }

  if (!normalizedRegion) {
    return "";
  }

  const usRegion = normalizeUsState(normalizedRegion);
  if (US_STATE_CODES.has(usRegion) || US_STATE_ABBREVIATIONS[regionKey]) {
    return "United States";
  }

  const canadaRegion = normalizeCanadaProvince(normalizedRegion);
  if (CANADA_PROVINCE_CODES.has(canadaRegion) || CANADA_PROVINCE_ABBREVIATIONS[regionKey]) {
    return "Canada";
  }

  if (regionKey === "uk" || UK_REGIONS.has(regionKey)) {
    return "UK";
  }

  return "";
}

function parseLooseLocation(location: string) {
  const pieces = location
    .split(",")
    .map((piece) => clean(piece))
    .filter(Boolean);

  if (!pieces.length) {
    return { city: "", region: "", country: "" };
  }

  if (pieces.length === 1) {
    return { city: "", region: "", country: pieces[0] };
  }

  if (pieces.length === 2) {
    return { city: pieces[0], region: pieces[1], country: "" };
  }

  return {
    city: pieces[0],
    region: pieces.slice(1, -1).join(", "),
    country: pieces[pieces.length - 1]
  };
}

function deriveLocationParts(record: LocationLike) {
  const explicitCity = clean(record.city);
  const explicitRegion = clean(record.state || record.province || record.region);
  const explicitCountry = normalizeCountry(clean(record.country));

  if (explicitCity || explicitRegion || explicitCountry) {
    return {
      city: explicitCity,
      region: explicitRegion,
      country: explicitCountry
    };
  }

  return parseLooseLocation(clean(record.location));
}

export function formatRecordLocation(record: LocationLike) {
  const derived = deriveLocationParts(record);
  const city = clean(derived.city);
  const country = inferCountryFromRegion(derived.region, derived.country);
  let region = clean(derived.region);

  if (country === "United States") {
    region = normalizeUsState(region);
  } else if (country === "Canada") {
    region = normalizeCanadaProvince(region);
  }

  const regionIsUkSubdivision = UK_REGIONS.has(region.toLowerCase());

  if (country === "United States") {
    return dedupeParts([city, region]).join(", ");
  }

  if (country === "Canada") {
    return dedupeParts([city, region]).join(", ");
  }

  if (country === "UK") {
    return dedupeParts([city, regionIsUkSubdivision ? region : "", regionIsUkSubdivision ? "" : country]).join(", ");
  }

  const parts = dedupeParts([city, region, country]);
  return parts.join(", ");
}

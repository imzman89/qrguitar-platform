import {
  demoInstrument,
  type DemoInstrument
} from "./local-demo";

export type BotSearchParams = {
  get: (key: string) => string | null;
};

export type BotRouteContext = {
  instrument: DemoInstrument | null;
  source: "route" | "query" | "none";
};

function normalizeCode(raw: string) {
  return String(raw || "").trim().toUpperCase();
}

function parseInstrumentCodeFromPath(pathname: string): string | null {
  const normalized = `/${String(pathname || "").replace(/^\/+/, "")}`;

  const fromI = normalized.match(/^\/i\/([^/?#]+)/i);
  if (fromI?.[1]) {
    return normalizeCode(fromI[1]);
  }

  const fromEdit = normalized.match(/^\/edit\/([^/?#]+)/i);
  if (fromEdit?.[1]) {
    return normalizeCode(fromEdit[1]);
  }

  return null;
}

function parseBoolean(value: string | null): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function buildFromQuery(rawCode: string, query: BotSearchParams | null) {
  const brand = String(query?.get("brand") || "").trim();
  const model = String(query?.get("model") || "").trim();
  const serial = String(query?.get("serial") || "").trim();
  const year = String(query?.get("year") || "").trim();
  const name = String(query?.get("name") || "").trim();
  const location = String(query?.get("location") || "").trim();
  const instrumentType = String(query?.get("instrumentType") || "").trim();
  const builder = String(query?.get("builder") || "").trim();
  const summary = String(query?.get("summary") || "").trim();
  const owner = String(query?.get("owner") || "").trim();
  const visibility = String(query?.get("visibility") || "").trim();
  const condition = String(query?.get("instrumentCondition") || "").trim().toLowerCase() as "new" | "used" | "";
  const code = normalizeCode(rawCode);

  if (!brand && !model && !serial && !year && !name && !query?.get("name")) {
    return null;
  }

  return {
    ...demoInstrument,
    qrCode: code,
    permanentPath: `/i/${code}`,
    name: name || `${brand || "Unknown"} ${model || "Instrument"}`.trim() || "Instrument",
    brand: brand || "Unknown maker",
    model: model || "Instrument",
    serial: serial || `${code}`,
    year: year || "Unknown",
    location: location || "Unlisted location",
    instrumentType: instrumentType || demoInstrument.instrumentType,
    builder: builder || demoInstrument.builder,
    summary: summary || `Instrument record loaded from query context for ${code}.`,
    owner: owner || demoInstrument.owner,
    instrumentCondition: condition === "new" ? "new" : "used",
    visibility: visibility === "private" ? "private" : "public",
    packageIncludesFirstTransfer: parseBoolean(query && query.get ? query.get("packageIncludesFirstTransfer") : null),
    creatorAccountType: "customer",
    createdAt: new Date().toISOString(),
    galleryImageDataUrls: demoInstrument.galleryImageDataUrls,
    qrStyle: demoInstrument.qrStyle
  } as DemoInstrument;
}

export function getBotInstrumentContext(pathname: string, searchParams: BotSearchParams | null): BotRouteContext {
  const codeFromPath = parseInstrumentCodeFromPath(pathname || "");

  if (codeFromPath) {
    const demoMatch = buildFromQuery(codeFromPath, searchParams);
    if (codeFromPath.toUpperCase() === demoInstrument.qrCode.toUpperCase()) {
      return { instrument: demoInstrument, source: "route" };
    }

    if (demoMatch) {
      return { instrument: demoMatch, source: "query" };
    }
  }

  const queryCode = normalizeCode(searchParams?.get("code") || searchParams?.get("qrCode") || "");
  if (queryCode) {
    const demoMatch = buildFromQuery(queryCode, searchParams);
    if (demoMatch) {
      return { instrument: demoMatch, source: "query" };
    }
  }

  return { instrument: null, source: "none" };
}


import sharp from "sharp";

export type DeletionContainerInspection = {
  structureValid: boolean;
  metadataFindings: string[];
  safeToRetain: boolean;
};

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
const uint32be = (bytes: Uint8Array, at: number) =>
  ((bytes[at] * 0x1000000) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]) >>> 0;
const uint32le = (bytes: Uint8Array, at: number) =>
  (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function jpegStructure(bytes: Uint8Array, findings: Set<string>) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let at = 2, sawFrame = false, sawScan = false, ended = false;
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (at < bytes.length && !ended) {
    if (bytes[at] !== 0xff) return false;
    while (at < bytes.length && bytes[at] === 0xff) at += 1;
    if (at >= bytes.length) return false;
    const marker = bytes[at++];
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) return false;
    if (marker === 0xd9) {
      ended = true;
      break;
    }
    if (at + 2 > bytes.length) return false;
    const length = (bytes[at] << 8) | bytes[at + 1];
    if (length < 2 || at + length > bytes.length) return false;
    const payloadStart = at + 2, payloadEnd = at + length;
    if (frameMarkers.has(marker)) {
      if (length < 11 || ((bytes[payloadStart + 1] << 8) | bytes[payloadStart + 2]) === 0
        || ((bytes[payloadStart + 3] << 8) | bytes[payloadStart + 4]) === 0 || bytes[payloadStart + 5] === 0) return false;
      sawFrame = true;
    }
    if (marker >= 0xe0 && marker <= 0xef) {
      const signature = ascii(bytes, payloadStart, Math.min(payloadEnd, payloadStart + 20));
      if (marker === 0xe0) {
        const jfif = signature.startsWith("JFIF\u0000") && length === 16
          && bytes[payloadStart + 12] === 0 && bytes[payloadStart + 13] === 0;
        if (!jfif) findings.add("application-metadata");
      } else if (marker === 0xe1) {
        findings.add(signature.startsWith("Exif\u0000\u0000") ? "exif" : signature.toLowerCase().includes("xmp") ? "xmp" : "application-metadata");
      } else if (marker === 0xe2) {
        findings.add(signature.startsWith("ICC_PROFILE\u0000") ? "icc" : "application-metadata");
      } else if (marker === 0xee) {
        if (!(signature.startsWith("Adobe") && length === 14)) findings.add("application-metadata");
      } else {
        findings.add(marker === 0xed ? "iptc" : "application-metadata");
      }
    }
    if (marker === 0xfe) findings.add("comment");
    at = payloadEnd;
    if (marker !== 0xda) continue;
    const components = bytes[payloadStart];
    if (components < 1 || components > 4 || length !== 6 + (2 * components)) return false;
    sawScan = true;
    let foundMarker = false;
    while (at < bytes.length) {
      if (bytes[at] !== 0xff) {
        at += 1;
        continue;
      }
      const markerStart = at;
      while (at < bytes.length && bytes[at] === 0xff) at += 1;
      if (at >= bytes.length) return false;
      const scanMarker = bytes[at];
      if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
        at += 1;
        continue;
      }
      at = markerStart;
      foundMarker = true;
      break;
    }
    if (!foundMarker) return false;
  }
  return ended && sawFrame && sawScan && at === bytes.length;
}

function pngStructure(bytes: Uint8Array, findings: Set<string>) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 20 || !signature.every((value, index) => bytes[index] === value)) return false;
  const knownCritical = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);
  let at = 8, index = 0, sawHeader = false, sawData = false, sawEnd = false;
  while (at + 12 <= bytes.length && !sawEnd) {
    const length = uint32be(bytes, at), type = ascii(bytes, at + 4, at + 8);
    const dataStart = at + 8, dataEnd = dataStart + length, end = dataEnd + 4;
    if (!/^[A-Za-z]{4}$/.test(type) || length > bytes.length - at - 12 || end > bytes.length) return false;
    if (crc32(bytes.slice(at + 4, dataEnd)) !== uint32be(bytes, dataEnd)) return false;
    if (index === 0) {
      if (type !== "IHDR" || length !== 13) return false;
      const width = uint32be(bytes, dataStart), height = uint32be(bytes, dataStart + 4);
      if (width === 0 || height === 0 || bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0 || bytes[dataStart + 12] > 1) return false;
      sawHeader = true;
    } else if (type === "IHDR") return false;
    if (type === "IDAT") sawData = true;
    if (type === "IEND") {
      if (length !== 0 || !sawData) return false;
      sawEnd = true;
    }
    if (["eXIf", "iTXt", "tEXt", "zTXt", "iCCP"].includes(type)) findings.add(type === "eXIf" ? "exif" : type === "iCCP" ? "icc" : "text-metadata");
    if (type[0] === type[0].toUpperCase() && !knownCritical.has(type)) return false;
    at = end;
    index += 1;
  }
  return sawHeader && sawData && sawEnd && at === bytes.length;
}

function webpStructure(bytes: Uint8Array, findings: Set<string>) {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP" || uint32le(bytes, 4) + 8 !== bytes.length) return false;
  let at = 12, imageChunks = 0, extended = false;
  while (at + 8 <= bytes.length) {
    const type = ascii(bytes, at, at + 4), length = uint32le(bytes, at + 4), dataStart = at + 8;
    const paddedEnd = dataStart + length + (length % 2);
    if (!/^[\x20-\x7e]{4}$/.test(type) || paddedEnd > bytes.length) return false;
    if (type === "VP8 ") {
      if (length < 10 || (bytes[dataStart] & 1) !== 0 || bytes[dataStart + 3] !== 0x9d || bytes[dataStart + 4] !== 0x01 || bytes[dataStart + 5] !== 0x2a) return false;
      imageChunks += 1;
    } else if (type === "VP8L") {
      if (length < 5 || bytes[dataStart] !== 0x2f) return false;
      imageChunks += 1;
    } else if (type === "VP8X") {
      if (at !== 12 || length !== 10 || (bytes[dataStart] & 0xc1) !== 0) return false;
      extended = true;
    }
    if (["EXIF", "XMP ", "ICCP"].includes(type)) findings.add(type === "ICCP" ? "icc" : type.trim().toLowerCase());
    at = paddedEnd;
  }
  return at === bytes.length && imageChunks === 1 && (!extended || bytes.length > 30);
}

function dictionaryEnd(text: string, start: number) {
  let depth = 0, stringDepth = 0, escaped = false, hex = false;
  for (let at = start; at < text.length; at += 1) {
    const char = text[at], next = text[at + 1];
    if (stringDepth > 0) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "(") stringDepth += 1;
      else if (char === ")") stringDepth -= 1;
      continue;
    }
    if (hex) {
      if (char === ">") hex = false;
      continue;
    }
    if (char === "%") {
      while (at < text.length && !"\r\n".includes(text[at])) at += 1;
      continue;
    }
    if (char === "(") { stringDepth = 1; continue; }
    if (char === "<" && next !== "<") { hex = true; continue; }
    if (char === "<" && next === "<") { depth += 1; at += 1; continue; }
    if (char === ">" && next === ">") {
      depth -= 1; at += 1;
      if (depth === 0) return at + 1;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

function classicPdfStructure(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes);
  if (!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\r|\n)/.test(text)) return false;
  const final = /startxref[ \t]*(?:\r\n|\r|\n)(\d+)[ \t]*(?:\r\n|\r|\n)%%EOF[ \t\r\n]*$/.exec(text);
  if (!final || final.index < 1) return false;
  const xrefOffset = Number(final[1]);
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset < 9 || xrefOffset >= final.index || text.slice(xrefOffset, xrefOffset + 4) !== "xref") return false;
  const readLine = (position: number) => {
    const end = text.slice(position).search(/[\r\n]/);
    if (end < 0) return null;
    const lineEnd = position + end, next = text[lineEnd] === "\r" && text[lineEnd + 1] === "\n" ? lineEnd + 2 : lineEnd + 1;
    return { line: text.slice(position, lineEnd), next };
  };
  let cursor = xrefOffset, line = readLine(cursor);
  if (!line || line.line !== "xref") return false;
  cursor = line.next;
  const entries = new Map<string, { offset: number; generation: number; state: "n" | "f" }>();
  while (cursor < final.index) {
    line = readLine(cursor);
    if (!line) return false;
    if (line.line === "trailer") { cursor = line.next; break; }
    const header = /^(\d+) (\d+)$/.exec(line.line);
    if (!header) return false;
    const first = Number(header[1]), count = Number(header[2]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(count) || count < 1 || count > 100_000 || first + count > 10_000_000) return false;
    cursor = line.next;
    for (let index = 0; index < count; index += 1) {
      line = readLine(cursor);
      if (!line) return false;
      const entry = /^(\d{10}) (\d{5}) ([nf]) ?$/.exec(line.line);
      if (!entry) return false;
      const key = String(first + index);
      if (entries.has(key)) return false;
      entries.set(key, { offset: Number(entry[1]), generation: Number(entry[2]), state: entry[3] as "n" | "f" });
      cursor = line.next;
    }
  }
  while (/[ \t\r\n]/.test(text[cursor] || "")) cursor += 1;
  if (text.slice(cursor, cursor + 2) !== "<<") return false;
  const trailerEnd = dictionaryEnd(text, cursor);
  if (trailerEnd < 0 || !/^[ \t\r\n]*$/.test(text.slice(trailerEnd, final.index))) return false;
  const trailer = text.slice(cursor, trailerEnd);
  if (/\/(?:Prev|XRefStm)\b/.test(trailer)) return false;
  const root = /\/Root\s+(\d+)\s+(\d+)\s+R\b/.exec(trailer), size = /\/Size\s+(\d+)\b/.exec(trailer);
  if (!root || !size || Number(size[1]) < entries.size) return false;
  const objectZero = entries.get("0");
  if (!objectZero || objectZero.state !== "f") return false;
  let inUse = 0;
  for (const [objectNumber, entry] of entries) {
    if (entry.state === "f") continue;
    inUse += 1;
    if (!Number.isSafeInteger(entry.offset) || entry.offset < 9 || entry.offset >= xrefOffset) return false;
    const prefix = new RegExp(`^${objectNumber} ${entry.generation} obj\\b`).exec(text.slice(entry.offset));
    if (!prefix) return false;
    const endObject = text.indexOf("endobj", entry.offset + prefix[0].length);
    if (endObject < 0 || endObject >= xrefOffset) return false;
  }
  const rootEntry = entries.get(root[1]);
  return inUse > 0 && Boolean(rootEntry && rootEntry.state === "n" && rootEntry.generation === Number(root[2]));
}

export async function analyzeDeletionContainer(bytes: Uint8Array, mimeType: string): Promise<DeletionContainerInspection> {
  const findings = new Set<string>();
  let valid = mimeType === "image/jpeg" ? jpegStructure(bytes, findings)
    : mimeType === "image/png" ? pngStructure(bytes, findings)
      : mimeType === "image/webp" ? webpStructure(bytes, findings)
        : mimeType === "application/pdf" ? classicPdfStructure(bytes) : false;
  if (valid && mimeType.startsWith("image/")) {
    try {
      const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000, sequentialRead: true }).metadata();
      if (metadata.exif) findings.add("exif");
      if (metadata.xmp) findings.add("xmp");
      if (metadata.iptc) findings.add("iptc");
      if (metadata.icc) findings.add("icc");
      await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000, sequentialRead: true }).raw().toBuffer();
    } catch {
      valid = false;
    }
  }
  if (mimeType === "application/pdf") {
    const text = new TextDecoder("latin1").decode(bytes);
    findings.add("document-container");
    const tokens: [RegExp, string][] = [
      [/\/(Author|Creator|Producer|Title|Subject|Keywords)\b/, "document-properties"],
      [/\/(Metadata|PieceInfo)\b|<x:xmpmeta\b/i, "xmp"],
      [/\/(JavaScript|JS|OpenAction|AA)\b/, "active-content"],
      [/\/(EmbeddedFiles|Filespec)\b/, "embedded-files"]
    ];
    for (const [pattern, label] of tokens) if (pattern.test(text)) findings.add(label);
  }
  if (!valid) findings.add("malformed-container");
  return { structureValid: valid, metadataFindings: [...findings].sort(), safeToRetain: valid && findings.size === 0 };
}


export type RelayAcceptance = Readonly<{
  schema: "qrguitar-zoho-smtp-acceptance/v1";
  provider: "zoho-smtp";
  responseCode: 250;
}>;

export type ConfirmedEmailAcceptance =
  | { kind: "provider"; providerMessageId: string }
  | { kind: "relay"; relayAcceptance: RelayAcceptance };

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function confirmedEmailAcceptance(value: unknown): ConfirmedEmailAcceptance | null {
  if (!isRecord(value) || value.outcome !== "accepted") return null;

  if (Object.prototype.hasOwnProperty.call(value, "relayAcceptance")) {
    const evidence = value.relayAcceptance;
    if (
      value.providerMessageId != null ||
      !isRecord(evidence) ||
      Object.keys(evidence).sort().join(",") !== "provider,responseCode,schema" ||
      evidence.schema !== "qrguitar-zoho-smtp-acceptance/v1" ||
      evidence.provider !== "zoho-smtp" ||
      evidence.responseCode !== 250
    ) return null;

    return {
      kind: "relay",
      relayAcceptance: {
        schema: "qrguitar-zoho-smtp-acceptance/v1",
        provider: "zoho-smtp",
        responseCode: 250
      }
    };
  }

  const id = value.providerMessageId;
  if (
    typeof id !== "string" ||
    !id.trim() ||
    id.length > 300 ||
    /[\x00-\x1f\x7f]/.test(id)
  ) return null;

  return { kind: "provider", providerMessageId: id };
}

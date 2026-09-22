export type UiTextValues = Record<string, string | number | boolean | null | undefined>;

/** Only explicitly connected, site-authored presentation text is resolved here.
 * Never call this on Profile names, descriptions, messages or other user data. */
export function createUiText(content: Record<string, string>, scope: string) {
  return (key: string, source: string, values?: UiTextValues): string => {
    if (!key.startsWith(`ui.${scope}.`)) return source;
    const text = key && typeof content[key] === "string" ? content[key] : source;
    return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, name: string) =>
      values && Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
  };
}

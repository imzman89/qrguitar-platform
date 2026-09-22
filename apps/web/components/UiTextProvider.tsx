"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createUiText } from "../lib/ui-text";

const UiTextContext = createContext<Record<string, string>>({});

/** Request-scoped published or authorized draft content, seeded by the server.
 * No DOM rewriting, global mutable store, extra fetch per label or user-data lookup. */
export function UiTextProvider({ content, children }: { content: Record<string, string>; children: ReactNode }) {
  return <UiTextContext.Provider value={content}>{children}</UiTextContext.Provider>;
}

export function useUiText(scope: string) {
  const content = useContext(UiTextContext);
  return useMemo(() => createUiText(content, scope), [content, scope]);
}

export function useUiTextContent() { return useContext(UiTextContext); }

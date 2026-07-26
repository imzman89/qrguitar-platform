"use client";

import { useEffect, useState } from "react";
import { defaultContentValues } from "./content-registry";
import { fetchPublishedSiteSettings } from "./site-settings";

export function useSiteContent() {
  const [content, setContent] = useState<Record<string, string>>(defaultContentValues);

  useEffect(() => {
    let active = true;
    void fetchPublishedSiteSettings().then((settings) => {
      if (active && settings?.content) setContent(settings.content);
    });
    return () => {
      active = false;
    };
  }, []);

  return content;
}

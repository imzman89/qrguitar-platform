"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

type FallbackImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src?: string | null;
  alt: string;
  fallback: ReactNode;
};

export function FallbackImage({ src, alt, fallback, onError, ...imageProps }: FallbackImageProps) {
  const source = String(src || "").trim();
  const [failedSource, setFailedSource] = useState("");

  if (!source || failedSource === source) return <>{fallback}</>;

  return (
    <img
      {...imageProps}
      src={source}
      alt={alt}
      onError={(event) => {
        setFailedSource(source);
        onError?.(event);
      }}
    />
  );
}

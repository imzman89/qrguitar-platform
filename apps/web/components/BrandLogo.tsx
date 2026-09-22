
"use client";
import { useUiText } from "./UiTextProvider";
import { FallbackImage } from "./FallbackImage";

type BrandLogoProps = {
  className?: string;
  appearance?: "dark" | "paper";
};

export function BrandLogo({ className, appearance = "dark" }: BrandLogoProps) {
  const ui = useUiText("components.BrandLogo");
  const source = appearance === "paper" ? "/qrguitar-logo-ink-orange.svg" : "/qrguitar-logo-white-orange.svg";
  return (
    <FallbackImage
      className={className}
      src={source}
      alt={ui("ui.components.BrandLogo.c5eb5d7d6633", "QRguitar logo")}
      width={520}
      height={120}
      decoding="async"
      referrerPolicy="no-referrer"
      fallback={<span className={`${className || ""} brand-logo-fallback`} role="img" aria-label={ui("ui.components.BrandLogo.1a32cd5a3a29", "QRguitar")}><b>{ui("ui.components.BrandLogo.a439fba430a3", "QR")}</b><span>{ui("ui.components.BrandLogo.d081f5e40298", "guitar")}</span></span>}
    />
  );
}

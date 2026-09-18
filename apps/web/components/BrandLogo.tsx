import { FallbackImage } from "./FallbackImage";

type BrandLogoProps = {
  className?: string;
  appearance?: "dark" | "paper";
};

export function BrandLogo({ className, appearance = "dark" }: BrandLogoProps) {
  const source = appearance === "paper" ? "/qrguitar-logo-ink-orange.svg" : "/qrguitar-logo-white-orange.svg";
  return (
    <FallbackImage
      className={className}
      src={source}
      alt="QRguitar logo"
      width={520}
      height={120}
      decoding="async"
      referrerPolicy="no-referrer"
      fallback={<span className={`${className || ""} brand-logo-fallback`} role="img" aria-label="QRguitar"><b>QR</b><span>guitar</span></span>}
    />
  );
}

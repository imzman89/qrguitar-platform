type BrandLogoProps = {
  className?: string;
  appearance?: "dark" | "paper";
};

export function BrandLogo({ className, appearance = "dark" }: BrandLogoProps) {
  return (
    <img className={className} src={appearance === "paper" ? "/qrguitar-logo-ink-orange.svg" : "/qrguitar-logo-white-orange.svg"} alt="QRguitar logo" />
  );
}

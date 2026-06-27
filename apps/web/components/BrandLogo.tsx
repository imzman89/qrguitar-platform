type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img className={className} src="/qrguitar-logo-white-orange.svg" alt="QRguitar logo" />
  );
}


"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { crossesCheckoutBoundary } from "../lib/checkout-navigation";

type Props = Omit<ComponentProps<typeof NextLink>, "href" | "onNavigate"> & { href: string };

/** Load the destination's security headers when entering or leaving checkout. */
export default function CheckoutAwareLink(props: Props) {
  const pathname = usePathname() || "/";
  const documentNavigation = crossesCheckoutBoundary(pathname, props.href);
  return <NextLink {...props} prefetch={documentNavigation ? false : props.prefetch}
    onNavigate={documentNavigation ? event => {
      event.preventDefault();
      if (props.replace) window.location.replace(props.href);
      else window.location.assign(props.href);
    } : undefined} />;
}

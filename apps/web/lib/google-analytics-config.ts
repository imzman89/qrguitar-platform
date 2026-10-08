import {
  configuredOptionalTracking,
  parseOptionalTrackingConfig,
  type OptionalTrackingConfig
} from "./optional-tracking-consent";

export const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,20}$/;

export type GoogleAnalyticsConfig = Readonly<{
  enabled: boolean;
  measurementId: string | null;
}>;

export function parseGoogleAnalyticsMeasurementId(raw: string | undefined) {
  const value = (raw || "").trim();
  return GA4_MEASUREMENT_ID_PATTERN.test(value) ? value : null;
}

export function parseGoogleAnalyticsConfig(
  rawMeasurementId: string | undefined,
  rawPurposes: string | undefined
): GoogleAnalyticsConfig {
  const measurementId = parseGoogleAnalyticsMeasurementId(rawMeasurementId);
  const tracking = parseOptionalTrackingConfig(rawPurposes);
  const enabled = Boolean(measurementId && tracking.enabled && tracking.purposes.includes("analytics"));
  return Object.freeze({ enabled, measurementId: enabled ? measurementId : null });
}

export const configuredGoogleAnalytics = parseGoogleAnalyticsConfig(
  process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
  process.env.NEXT_PUBLIC_OPTIONAL_TRACKING_PURPOSES
);

// A choice is useful only when this build has a reviewed provider for it.
// GA4 is currently the only installed optional-tracking provider.
export function hasConfiguredOptionalTrackingProvider(
  tracking: OptionalTrackingConfig = configuredOptionalTracking,
  googleAnalytics: GoogleAnalyticsConfig = configuredGoogleAnalytics
) {
  return tracking.enabled
    && tracking.purposes.includes("analytics")
    && googleAnalytics.enabled;
}

type TelemetryPayload = Record<string, any>;

const isAnalyticsAvailable = (): boolean => {
  return (
    typeof window !== "undefined" &&
    typeof window.analytics?.track === "function"
  );
};

export const trackTelemetry = (
  eventName: string,
  payload: TelemetryPayload = {},
): void => {
  const enrichedPayload = {
    source: "logger-ui",
    timestamp: new Date().toISOString(),
    ...payload,
  };

  if (isAnalyticsAvailable()) {
    window.analytics?.track(eventName, enrichedPayload);
  } else {
    console.debug(`[telemetry] ${eventName}`, enrichedPayload);
  }
};

declare global {
  interface Window {
    analytics?: {
      track: (event: string, payload?: TelemetryPayload) => void;
    };
  }
}

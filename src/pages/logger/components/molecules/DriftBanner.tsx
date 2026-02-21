interface DriftBannerProps {
  show: boolean;
  driftSeconds: number;
  onResync: () => void;
  t: any;
}

export default function DriftBanner({
  show,
  driftSeconds,
  onResync,
  t,
}: DriftBannerProps) {
  if (!show) return null;

  return (
    <div
      className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3"
      data-testid="clock-drift-banner"
    >
      <div className="text-xs font-medium">
        {t(
          "clockDriftDetected",
          "Clock drift detected (~{{seconds}}s). Refresh to resync with server time.",
          {
            seconds: driftSeconds.toFixed(1),
          },
        )}
      </div>
      <button
        type="button"
        onClick={onResync}
        className="text-xs font-semibold px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700"
        data-testid="clock-drift-resync"
      >
        {t("resync", "Resync")}
      </button>
    </div>
  );
}

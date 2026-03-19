import { useMemo } from "react";
import type { Match, Player } from "../../types";
import { Activity, Clock, Users } from "../../../../components/icons";

interface LiveMatchContextBannerProps {
  match: Match;
  onFieldHomePlayers: Player[];
  onFieldAwayPlayers: Player[];
  effectiveTime: number;
  ineffectiveSeconds: number;
  t: (key: string, fallback: string) => string;
}

const formatSecondsAsClock = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const parseBirthDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const ageInYears = (birthDate: Date, atDate: Date = new Date()) => {
  let age = atDate.getFullYear() - birthDate.getFullYear();
  const m = atDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && atDate.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
};

const calculateOnFieldAverageAge = (players: Player[]): number | null => {
  const ages = players
    .map((p) => parseBirthDate(p.birth_date))
    .filter((d): d is Date => d !== null)
    .map((d) => ageInYears(d))
    .filter((a) => Number.isFinite(a) && a > 0);
  if (!ages.length) return null;
  return ages.reduce((s, a) => s + a, 0) / ages.length;
};

export default function LiveMatchContextBanner({
  match,
  onFieldHomePlayers,
  onFieldAwayPlayers,
  effectiveTime,
  ineffectiveSeconds,
  t,
}: LiveMatchContextBannerProps) {
  const homeAge = useMemo(
    () => calculateOnFieldAverageAge(onFieldHomePlayers),
    [onFieldHomePlayers],
  );
  const awayAge = useMemo(
    () => calculateOnFieldAverageAge(onFieldAwayPlayers),
    [onFieldAwayPlayers],
  );
  const na = t("analytics.notAvailable", "N/A");

  return (
    <div
      data-testid="live-match-context"
      className="rounded-xl border border-purple-700/40 bg-gradient-to-r from-purple-900/60 via-slate-900/80 to-purple-900/60 px-4 py-3 shadow-lg"
    >
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-purple-300">
        <Activity size={14} />
        {t("analytics.liveMatchContext", "Live Match Context")}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Global Effective Time */}
        <div
          data-testid="stat-total-effective-time"
          className="flex flex-col items-center rounded-lg bg-white/5 px-3 py-2"
        >
          <span className="text-[10px] uppercase tracking-wide text-emerald-400 flex items-center gap-1">
            <Clock size={12} />
            {t("analytics.totalEffectiveTime", "Total Effective Time")}
          </span>
          <span className="mt-0.5 font-mono text-lg font-bold text-emerald-300">
            {formatSecondsAsClock(effectiveTime)}
          </span>
        </div>

        {/* Global Ineffective Time */}
        <div
          data-testid="stat-total-ineffective-time"
          className="flex flex-col items-center rounded-lg bg-white/5 px-3 py-2"
        >
          <span className="text-[10px] uppercase tracking-wide text-rose-400 flex items-center gap-1">
            <Clock size={12} />
            {t("analytics.totalIneffectiveTime", "Total Ineffective Time")}
          </span>
          <span className="mt-0.5 font-mono text-lg font-bold text-rose-300">
            {formatSecondsAsClock(ineffectiveSeconds)}
          </span>
        </div>

        {/* On-Field Average Age — Home */}
        <div
          data-testid="stat-on-field-age-home"
          className="flex flex-col items-center rounded-lg bg-white/5 px-3 py-2"
        >
          <span className="text-[10px] uppercase tracking-wide text-sky-400 flex items-center gap-1">
            <Users size={12} />
            {match.home_team.short_name}{" "}
            {t("analytics.onFieldAvgAge", "Avg Age")}
          </span>
          <span className="mt-0.5 font-mono text-lg font-bold text-sky-300">
            {homeAge !== null ? homeAge.toFixed(1) : na}
          </span>
        </div>

        {/* On-Field Average Age — Away */}
        <div
          data-testid="stat-on-field-age-away"
          className="flex flex-col items-center rounded-lg bg-white/5 px-3 py-2"
        >
          <span className="text-[10px] uppercase tracking-wide text-amber-400 flex items-center gap-1">
            <Users size={12} />
            {match.away_team.short_name}{" "}
            {t("analytics.onFieldAvgAge", "Avg Age")}
          </span>
          <span className="mt-0.5 font-mono text-lg font-bold text-amber-300">
            {awayAge !== null ? awayAge.toFixed(1) : na}
          </span>
        </div>
      </div>
    </div>
  );
}

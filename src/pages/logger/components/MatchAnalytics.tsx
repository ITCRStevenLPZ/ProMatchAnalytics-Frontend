import { useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { MatchEvent } from "../../../store/useMatchLogStore";
import { Match } from "../types";
import {
  computeIneffectiveBreakdown,
  IneffectiveBreakdown,
  IneffectiveAction,
} from "../utils";
import {
  TrendingUp,
  Activity,
  Target,
  Users,
  Zap,
  Shield,
  Award,
  Clock,
} from "lucide-react";

interface MatchAnalyticsProps {
  match: Match | null;
  events: MatchEvent[];
  effectiveTime: number;
  timeOffSeconds?: number;
  ineffectiveSeconds?: number;
  ineffectiveBreakdown?: IneffectiveBreakdown | null;
  t: any;
}

interface EventTimeline {
  minute: number;
  home: number;
  away: number;
}

interface EventTypeCount {
  type: string;
  count: number;
  [key: string]: any;
}

interface TeamComparison {
  metric: string;
  home: number;
  away: number;
}

interface PlayerActivity {
  player_id: string;
  player_name: string;
  events: number;
  passes: number;
  shots: number;
}

interface ComparativeRow {
  label: string;
  home: string | number;
  away: string | number;
  testId: string;
}

const COLORS = {
  home: "#10b981", // green
  away: "#3b82f6", // blue
  primary: "#8b5cf6", // purple
  secondary: "#f59e0b", // amber
  accent: "#ec4899", // pink
  neutral: "#6b7280", // gray
};

const EVENT_COLORS = [
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#a855f7",
  "#06b6d4",
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const formatSecondsAsClock = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export function MatchAnalytics({
  match,
  events,
  effectiveTime,
  timeOffSeconds = 0,
  ineffectiveSeconds = 0,
  ineffectiveBreakdown,
  t,
}: MatchAnalyticsProps) {
  // Calculate analytics data
  const analytics = useMemo(() => {
    if (!match || events.length === 0) {
      return null;
    }

    const homeTeamId = match.home_team.id;
    const awayTeamId = match.away_team.id;
    const breakdown =
      ineffectiveBreakdown ||
      computeIneffectiveBreakdown(events, homeTeamId, awayTeamId, Date.now());

    // Event timeline (events per 5-minute interval)
    const timelineMap = new Map<number, { home: number; away: number }>();
    const maxMinute = Math.ceil(effectiveTime / 60);

    for (let i = 0; i <= maxMinute; i += 5) {
      timelineMap.set(i, { home: 0, away: 0 });
    }

    events.forEach((event) => {
      const [minutes] = event.match_clock.split(":").map(Number);
      const interval = Math.floor(minutes / 5) * 5;
      const entry = timelineMap.get(interval);
      if (entry) {
        if (event.team_id === homeTeamId) {
          entry.home++;
        } else if (event.team_id === awayTeamId) {
          entry.away++;
        }
      }
    });

    const timeline: EventTimeline[] = Array.from(timelineMap.entries())
      .map(([minute, counts]) => ({
        minute,
        home: counts.home,
        away: counts.away,
      }))
      .filter(
        (_, idx, arr) =>
          idx === 0 ||
          idx === arr.length - 1 ||
          timelineMap.get((_ as any).minute)!.home +
            timelineMap.get((_ as any).minute)!.away >
            0,
      );

    // Event type distribution
    const eventTypeMap = new Map<string, number>();
    events.forEach((event) => {
      eventTypeMap.set(event.type, (eventTypeMap.get(event.type) || 0) + 1);
    });

    const eventTypes: EventTypeCount[] = Array.from(eventTypeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Team comparison metrics
    const homeEvents = events.filter((e) => e.team_id === homeTeamId);
    const awayEvents = events.filter((e) => e.team_id === awayTeamId);

    const getEventCount = (teamEvents: MatchEvent[], type: string) =>
      teamEvents.filter((e) => e.type === type).length;

    const getShotOutcomeCount = (
      teamEvents: MatchEvent[],
      outcomes: string[],
    ) =>
      teamEvents.filter(
        (e) =>
          e.type === "Shot" && outcomes.includes(String(e.data?.outcome || "")),
      ).length;

    const getCardCount = (teamEvents: MatchEvent[], types: string[]) =>
      teamEvents.filter(
        (e) => e.type === "Card" && types.includes(String(e.data?.card_type)),
      ).length;

    const getPassCounts = (teamEvents: MatchEvent[]) => {
      const total = teamEvents.filter((e) => e.type === "Pass").length;
      const accurate = teamEvents.filter(
        (e) => e.type === "Pass" && e.data?.outcome === "Complete",
      ).length;
      return { total, accurate };
    };

    const homePasses = getPassCounts(homeEvents);
    const awayPasses = getPassCounts(awayEvents);
    const homeShots = getEventCount(homeEvents, "Shot");
    const awayShots = getEventCount(awayEvents, "Shot");
    const homeShotsOnTarget = getShotOutcomeCount(homeEvents, [
      "OnTarget",
      "Saved",
      "Goal",
    ]);
    const awayShotsOnTarget = getShotOutcomeCount(awayEvents, [
      "OnTarget",
      "Saved",
      "Goal",
    ]);
    const homeShotsOffTarget = getShotOutcomeCount(homeEvents, [
      "OffTarget",
      "Post",
    ]);
    const awayShotsOffTarget = getShotOutcomeCount(awayEvents, [
      "OffTarget",
      "Post",
    ]);
    const homeCorners = homeEvents.filter(
      (e) => e.type === "SetPiece" && e.data?.set_piece_type === "Corner",
    ).length;
    const awayCorners = awayEvents.filter(
      (e) => e.type === "SetPiece" && e.data?.set_piece_type === "Corner",
    ).length;
    const homeOffsides =
      getEventCount(homeEvents, "Offside") +
      homeEvents.filter(
        (e) => e.type === "Pass" && e.data?.outcome === "Pass Offside",
      ).length;
    const awayOffsides =
      getEventCount(awayEvents, "Offside") +
      awayEvents.filter(
        (e) => e.type === "Pass" && e.data?.outcome === "Pass Offside",
      ).length;
    const homeFouls = getEventCount(homeEvents, "FoulCommitted");
    const awayFouls = getEventCount(awayEvents, "FoulCommitted");
    const homeYellows = getCardCount(homeEvents, ["Yellow", "Yellow (Second)"]);
    const awayYellows = getCardCount(awayEvents, ["Yellow", "Yellow (Second)"]);
    const homeReds = getCardCount(homeEvents, ["Red", "Yellow (Second)"]);
    const awayReds = getCardCount(awayEvents, ["Red", "Yellow (Second)"]);

    const ineffectiveTotals = breakdown?.totals ?? {
      home: 0,
      away: 0,
      neutral: 0,
      byAction: {} as Record<
        IneffectiveAction,
        { home: number; away: number; neutral: number }
      >,
    };

    const getIneffectiveAction = (
      action: IneffectiveAction,
      team: "home" | "away" | "neutral",
    ) => ineffectiveTotals.byAction?.[action]?.[team] ?? 0;

    const teamComparison: TeamComparison[] = [
      {
        metric: t("analytics.passes", "Passes"),
        home: getEventCount(homeEvents, "Pass"),
        away: getEventCount(awayEvents, "Pass"),
      },
      {
        metric: t("analytics.shots", "Shots"),
        home: getEventCount(homeEvents, "Shot"),
        away: getEventCount(awayEvents, "Shot"),
      },
      {
        metric: t("analytics.duels", "Duels"),
        home: getEventCount(homeEvents, "Duel"),
        away: getEventCount(awayEvents, "Duel"),
      },
      {
        metric: t("analytics.fouls", "Fouls"),
        home: getEventCount(homeEvents, "FoulCommitted"),
        away: getEventCount(awayEvents, "FoulCommitted"),
      },
      {
        metric: t("analytics.interceptions", "Interceptions"),
        home: getEventCount(homeEvents, "Interception"),
        away: getEventCount(awayEvents, "Interception"),
      },
    ];

    // Player activity (top 6 most active players)
    const playerMap = new Map<string, PlayerActivity>();

    events.forEach((event) => {
      if (event.player_id) {
        if (!playerMap.has(event.player_id)) {
          const team =
            event.team_id === homeTeamId ? match.home_team : match.away_team;
          const player = team.players.find((p) => p.id === event.player_id);
          playerMap.set(event.player_id, {
            player_id: event.player_id,
            player_name:
              player?.short_name || player?.full_name || `#${event.player_id}`,
            events: 0,
            passes: 0,
            shots: 0,
          });
        }
        const activity = playerMap.get(event.player_id)!;
        activity.events++;
        if (event.type === "Pass") activity.passes++;
        if (event.type === "Shot") activity.shots++;
      }
    });

    const topPlayers = Array.from(playerMap.values())
      .sort((a, b) => b.events - a.events)
      .slice(0, 6);

    // Possession approximation (based on passes)
    const totalPasses = homePasses.total + awayPasses.total;
    const homePossession =
      totalPasses > 0 ? Math.round((homePasses.total / totalPasses) * 100) : 50;

    // Key stats
    const totalEvents = events.length;
    const avgEventsPerMinute =
      maxMinute > 0 ? (totalEvents / maxMinute).toFixed(1) : "0.0";
    const mostActiveMinute = Array.from(timelineMap.entries()).reduce(
      (max, [min, counts]) => {
        const total = counts.home + counts.away;
        return total > max.count ? { minute: min, count: total } : max;
      },
      { minute: 0, count: 0 },
    );

    return {
      timeline,
      eventTypes,
      teamComparison,
      topPlayers,
      homePossession,
      awayPossession: 100 - homePossession,
      ineffectiveTotals,
      ineffectiveActionRows: [
        {
          action: "Goal",
          label: t("analytics.ineffectiveGoal", "Goal"),
          home: getIneffectiveAction("Goal", "home"),
          away: getIneffectiveAction("Goal", "away"),
          neutral: getIneffectiveAction("Goal", "neutral"),
        },
        {
          action: "OutOfBounds",
          label: t("analytics.ineffectiveOut", "Out of bounds"),
          home: getIneffectiveAction("OutOfBounds", "home"),
          away: getIneffectiveAction("OutOfBounds", "away"),
          neutral: getIneffectiveAction("OutOfBounds", "neutral"),
        },
        {
          action: "Card",
          label: t("analytics.ineffectiveCard", "Card"),
          home: getIneffectiveAction("Card", "home"),
          away: getIneffectiveAction("Card", "away"),
          neutral: getIneffectiveAction("Card", "neutral"),
        },
        {
          action: "Foul",
          label: t("analytics.ineffectiveFoul", "Foul"),
          home: getIneffectiveAction("Foul", "home"),
          away: getIneffectiveAction("Foul", "away"),
          neutral: getIneffectiveAction("Foul", "neutral"),
        },
        {
          action: "Substitution",
          label: t("analytics.ineffectiveSubstitution", "Substitution"),
          home: getIneffectiveAction("Substitution", "home"),
          away: getIneffectiveAction("Substitution", "away"),
          neutral: getIneffectiveAction("Substitution", "neutral"),
        },
        {
          action: "Injury",
          label: t("analytics.ineffectiveInjury", "Injury"),
          home: getIneffectiveAction("Injury", "home"),
          away: getIneffectiveAction("Injury", "away"),
          neutral: getIneffectiveAction("Injury", "neutral"),
        },
        {
          action: "VAR",
          label: t("analytics.ineffectiveVar", "VAR"),
          home: getIneffectiveAction("VAR", "home"),
          away: getIneffectiveAction("VAR", "away"),
          neutral: getIneffectiveAction("VAR", "neutral"),
        },
        {
          action: "Other",
          label: t("analytics.ineffectiveOther", "Other"),
          home: getIneffectiveAction("Other", "home"),
          away: getIneffectiveAction("Other", "away"),
          neutral: getIneffectiveAction("Other", "neutral"),
        },
      ],
      comparativeRows: [
        {
          label: t("analytics.possession", "Possession"),
          home: `${homePossession}%`,
          away: `${100 - homePossession}%`,
          testId: "stat-possession",
        },
        {
          label: t("analytics.accuratePasses", "Accurate Passes"),
          home: `${homePasses.total} (${homePasses.accurate})`,
          away: `${awayPasses.total} (${awayPasses.accurate})`,
          testId: "stat-accurate-passes",
        },
        {
          label: t("analytics.corners", "Corners"),
          home: homeCorners,
          away: awayCorners,
          testId: "stat-corners",
        },
        {
          label: t("analytics.shots", "Shots"),
          home: homeShots,
          away: awayShots,
          testId: "stat-shots",
        },
        {
          label: t("analytics.shotsOnTarget", "Shots on Target"),
          home: homeShotsOnTarget,
          away: awayShotsOnTarget,
          testId: "stat-shots-on-target",
        },
        {
          label: t("analytics.shotsOffTarget", "Shots off Target"),
          home: homeShotsOffTarget,
          away: awayShotsOffTarget,
          testId: "stat-shots-off-target",
        },
        {
          label: t("analytics.offsides", "Offsides"),
          home: homeOffsides,
          away: awayOffsides,
          testId: "stat-offsides",
        },
        {
          label: t("analytics.fouls", "Fouls"),
          home: homeFouls,
          away: awayFouls,
          testId: "stat-fouls",
        },
        {
          label: t("analytics.yellowCards", "Yellow Cards"),
          home: homeYellows,
          away: awayYellows,
          testId: "stat-yellow",
        },
        {
          label: t("analytics.redCards", "Red Cards"),
          home: homeReds,
          away: awayReds,
          testId: "stat-red",
        },
        {
          label: t("analytics.ineffectiveTime", "Ineffective Time"),
          home: formatSecondsAsClock(ineffectiveTotals.home),
          away: formatSecondsAsClock(ineffectiveTotals.away),
          testId: "stat-ineffective-time",
        },
        {
          label: t("analytics.effectiveTime", "Effective Time"),
          home: formatSecondsAsClock(effectiveTime),
          away: formatSecondsAsClock(effectiveTime),
          testId: "stat-effective-time",
        },
        {
          label: t("analytics.varTime", "VAR Time"),
          home: formatSecondsAsClock(timeOffSeconds),
          away: formatSecondsAsClock(timeOffSeconds),
          testId: "stat-var-time",
        },
      ] as ComparativeRow[],
      totalMatchSeconds: effectiveTime + ineffectiveSeconds + timeOffSeconds,
      totalEvents,
      avgEventsPerMinute,
      mostActiveMinute: mostActiveMinute.minute,
      homeTotal: homeEvents.length,
      awayTotal: awayEvents.length,
    };
  }, [
    match,
    events,
    effectiveTime,
    ineffectiveSeconds,
    timeOffSeconds,
    ineffectiveBreakdown,
    t,
  ]);

  if (!match || !analytics) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Activity size={48} className="mr-3" />
        <div className="text-lg">
          {t(
            "analytics.noData",
            "No data available yet. Start logging events!",
          )}
        </div>
      </div>
    );
  }

  const StatCard = ({
    icon: Icon,
    label,
    value,
    color,
    subtitle,
    testId,
  }: {
    icon: any;
    label: string;
    value: string | number;
    color: string;
    subtitle?: string;
    testId?: string;
  }) => (
    <div
      className={`bg-gradient-to-br ${color} rounded-lg p-4 text-white shadow-lg`}
    >
      <div className="flex items-center justify-between mb-2">
        <Icon size={24} className="opacity-80" />
        <div className="text-3xl font-bold" data-testid={testId}>
          {value}
        </div>
      </div>
      <div className="text-sm font-medium opacity-90">{label}</div>
      {subtitle && <div className="text-xs opacity-75 mt-1">{subtitle}</div>}
    </div>
  );

  return (
    <div className="space-y-6" data-testid="analytics-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-2xl font-bold text-gray-900 flex items-center gap-2"
          data-testid="analytics-title"
        >
          <TrendingUp className="text-purple-600" />
          {t("analytics.title", "Live Match Analytics")}
        </h2>
        <div className="text-sm text-gray-500">
          {t("analytics.realtime", "Real-time data visualization")}
        </div>
      </div>

      {/* Comparative Table */}
      <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm uppercase tracking-wider text-emerald-200">
            {t("analytics.totalTime", "Total Time")}:
          </div>
          <div className="text-lg font-mono font-semibold text-emerald-100">
            {formatSecondsAsClock(analytics.totalMatchSeconds)}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-4">
          <div className="flex flex-col gap-2">
            <div className="text-lg font-semibold">{match.home_team.name}</div>
            <div
              className="relative h-16 w-16"
              data-testid="analytics-possession-home"
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(${COLORS.home} ${analytics.homePossession}%, rgba(255,255,255,0.12) 0)`,
                }}
              />
              <div className="absolute inset-2 rounded-full bg-slate-900 flex items-center justify-center text-sm font-bold">
                {analytics.homePossession}%
              </div>
            </div>
          </div>
          <div className="text-sm text-emerald-200 font-semibold uppercase tracking-wide">
            VS
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-lg font-semibold">{match.away_team.name}</div>
            <div
              className="relative h-16 w-16"
              data-testid="analytics-possession-away"
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(${COLORS.away} ${analytics.awayPossession}%, rgba(255,255,255,0.12) 0)`,
                }}
              />
              <div className="absolute inset-2 rounded-full bg-slate-900 flex items-center justify-center text-sm font-bold">
                {analytics.awayPossession}%
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] text-xs uppercase tracking-wide text-emerald-200 mb-2">
          <div>{match.home_team.short_name}</div>
          <div className="text-center">{t("analytics.metric", "Metric")}</div>
          <div className="text-right">{match.away_team.short_name}</div>
        </div>

        <div className="space-y-2" data-testid="analytics-comparison-table">
          {analytics.comparativeRows.map((row) => (
            <div
              key={row.testId}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-white/5 rounded-lg px-3 py-2"
              data-testid={row.testId}
            >
              <div className="text-sm font-semibold text-emerald-50">
                {row.home}
              </div>
              <div className="text-xs text-emerald-200 text-center">
                {row.label}
              </div>
              <div className="text-sm font-semibold text-emerald-50 text-right">
                {row.away}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6" data-testid="analytics-ineffective-breakdown">
          <div className="text-xs uppercase tracking-wide text-emerald-200 mb-2">
            {t("analytics.ineffectiveBreakdown", "Ineffective Breakdown")}
          </div>
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 text-[10px] uppercase tracking-wider text-emerald-200 mb-2">
            <div>{t("analytics.metric", "Metric")}</div>
            <div className="text-center">{match.home_team.short_name}</div>
            <div className="text-center">
              {t("analytics.neutral", "Neutral")}
            </div>
            <div className="text-right">{match.away_team.short_name}</div>
          </div>
          <div className="space-y-2">
            {analytics.ineffectiveActionRows.map((row: any) => (
              <div
                key={row.action}
                className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 bg-white/5 rounded-lg px-3 py-2"
                data-testid={`stat-ineffective-${row.action.toLowerCase()}`}
              >
                <div className="text-xs text-emerald-100">{row.label}</div>
                <div className="text-xs font-semibold text-emerald-50 text-center">
                  {formatSecondsAsClock(row.home)}
                </div>
                <div className="text-xs font-semibold text-amber-100 text-center">
                  {formatSecondsAsClock(row.neutral)}
                </div>
                <div className="text-xs font-semibold text-emerald-50 text-right">
                  {formatSecondsAsClock(row.away)}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 bg-emerald-500/20 rounded-lg px-3 py-2">
              <div className="text-xs text-emerald-50 font-semibold">
                {t("analytics.ineffectiveTotals", "Totals")}
              </div>
              <div className="text-xs font-semibold text-emerald-50 text-center">
                {formatSecondsAsClock(analytics.ineffectiveTotals.home)}
              </div>
              <div className="text-xs font-semibold text-amber-100 text-center">
                {formatSecondsAsClock(analytics.ineffectiveTotals.neutral)}
              </div>
              <div className="text-xs font-semibold text-emerald-50 text-right">
                {formatSecondsAsClock(analytics.ineffectiveTotals.away)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label={t("analytics.totalEvents", "Total Events")}
          value={analytics.totalEvents}
          color="from-purple-500 to-purple-600"
          testId="analytics-total-events"
        />
        <StatCard
          icon={Zap}
          label={t("analytics.eventRate", "Events/Min")}
          value={analytics.avgEventsPerMinute}
          color="from-blue-500 to-blue-600"
          testId="analytics-event-rate"
        />
        <StatCard
          icon={Clock}
          label={t("analytics.mostActive", "Peak Minute")}
          value={`${analytics.mostActiveMinute}'`}
          color="from-green-500 to-green-600"
          testId="analytics-peak-minute"
        />
        <StatCard
          icon={Target}
          label={t("analytics.possession", "Possession Est.")}
          value={`${analytics.homePossession}% - ${analytics.awayPossession}%`}
          color="from-pink-500 to-pink-600"
          subtitle={`${match.home_team.short_name} - ${match.away_team.short_name}`}
          testId="analytics-possession"
        />
      </div>

      {/* Event Timeline Chart */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="text-purple-600" />
          {t("analytics.eventTimeline", "Event Timeline (5-min intervals)")}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={analytics.timeline}>
            <defs>
              <linearGradient id="colorHome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.home} stopOpacity={0.8} />
                <stop offset="95%" stopColor={COLORS.home} stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorAway" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.away} stopOpacity={0.8} />
                <stop offset="95%" stopColor={COLORS.away} stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="minute"
              label={{
                value: t("analytics.minutes", "Minutes"),
                position: "insideBottom",
                offset: -5,
              }}
              stroke="#6b7280"
            />
            <YAxis
              label={{
                value: t("analytics.events", "Events"),
                angle: -90,
                position: "insideLeft",
              }}
              stroke="#6b7280"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
              }}
              labelFormatter={(value) => `${value}'`}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="home"
              name={match.home_team.short_name}
              stroke={COLORS.home}
              fillOpacity={1}
              fill="url(#colorHome)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="away"
              name={match.away_team.short_name}
              stroke={COLORS.away}
              fillOpacity={1}
              fill="url(#colorAway)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
        <div
          className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600"
          data-testid="analytics-timeline-summary"
        >
          <div data-testid="analytics-home-total">
            {match.home_team.short_name}: {analytics.homeTotal}
          </div>
          <div data-testid="analytics-away-total">
            {match.away_team.short_name}: {analytics.awayTotal}
          </div>
          <div data-testid="analytics-most-active-minute">
            {t("analytics.mostActive", "Peak Minute")}:{" "}
            {analytics.mostActiveMinute}'
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Event Type Distribution */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Target className="text-blue-600" />
            {t("analytics.eventTypes", "Event Type Distribution")}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={analytics.eventTypes}
                dataKey="count"
                nameKey="type"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry: any) =>
                  `${entry.type} ${((entry.percent || 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {analytics.eventTypes.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={EVENT_COLORS[index % EVENT_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <ul
            className="mt-4 space-y-1 text-sm text-gray-700"
            data-testid="analytics-event-types"
          >
            {analytics.eventTypes.map((evt) => (
              <li
                key={evt.type}
                data-testid={`analytics-event-type-${slugify(evt.type)}`}
              >
                {evt.type}: {evt.count}
              </li>
            ))}
          </ul>
        </div>

        {/* Team Comparison Radar */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="text-green-600" />
            {t("analytics.teamComparison", "Team Comparison")}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={analytics.teamComparison}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="metric" stroke="#6b7280" />
              <PolarRadiusAxis stroke="#6b7280" />
              <Radar
                name={match.home_team.short_name}
                dataKey="home"
                stroke={COLORS.home}
                fill={COLORS.home}
                fillOpacity={0.6}
              />
              <Radar
                name={match.away_team.short_name}
                dataKey="away"
                stroke={COLORS.away}
                fill={COLORS.away}
                fillOpacity={0.6}
              />
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Players Activity */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="text-amber-600" />
          {t("analytics.topPlayers", "Most Active Players")}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analytics.topPlayers} layout="horizontal">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" stroke="#6b7280" />
            <YAxis
              dataKey="player_name"
              type="category"
              width={100}
              stroke="#6b7280"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
              }}
            />
            <Legend />
            <Bar
              dataKey="events"
              name={t("analytics.totalEvents", "Total")}
              fill={COLORS.primary}
              radius={[0, 4, 4, 0]}
            />
            <Bar
              dataKey="passes"
              name={t("analytics.passes", "Passes")}
              fill={COLORS.secondary}
              radius={[0, 4, 4, 0]}
            />
            <Bar
              dataKey="shots"
              name={t("analytics.shots", "Shots")}
              fill={COLORS.accent}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Team Activity Comparison */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Award className="text-purple-600" />
          {t("analytics.activityComparison", "Activity Comparison by Metric")}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analytics.teamComparison}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="metric" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
              }}
            />
            <Legend />
            <Bar
              dataKey="home"
              name={match.home_team.short_name}
              fill={COLORS.home}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="away"
              name={match.away_team.short_name}
              fill={COLORS.away}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Stats */}
      <div className="bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg shadow-lg p-6 text-white">
        <h3 className="text-xl font-bold mb-4">
          {t("analytics.matchSummary", "Match Summary")}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-3xl font-bold">{analytics.homeTotal}</div>
            <div className="text-sm opacity-90">
              {match.home_team.name} {t("analytics.events", "Events")}
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold">{analytics.awayTotal}</div>
            <div className="text-sm opacity-90">
              {match.away_team.name} {t("analytics.events", "Events")}
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold">
              {analytics.eventTypes[0]?.type || "N/A"}
            </div>
            <div className="text-sm opacity-90">
              {t("analytics.mostCommon", "Most Common Event")}
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold">
              {analytics.topPlayers[0]?.player_name || "N/A"}
            </div>
            <div className="text-sm opacity-90">
              {t("analytics.mvp", "Most Active Player")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

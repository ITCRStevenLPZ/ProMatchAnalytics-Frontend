import { useMemo, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import {
  PROMATCH_TITLE_LOGO_PATH,
  PROMATCH_TITLE_LOGO_VIEWBOX,
} from "../../../../components/ProMatchTitleLogo";
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
import { MatchEvent } from "../../../../store/useMatchLogStore";
import { Match } from "../../types";
import {
  computeIneffectiveBreakdown,
  computeTimerFormulas,
  IneffectiveBreakdown,
  IneffectiveAction,
} from "../../utils";
import {
  TrendingUp,
  Activity,
  Target,
  Users,
  Zap,
  Shield,
  Award,
  Clock,
  Info,
} from "../../../../components/icons";

interface MatchAnalyticsProps {
  match: Match | null;
  events: MatchEvent[];
  effectiveTime: number;
  varTimeSeconds?: number;
  timeoutSeconds?: number;
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
  tooltip?: string;
}

interface TeamCardTotals {
  yellow: number;
  red: number;
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

const parseClockToSeconds = (clock?: string) => {
  if (!clock) return 0;
  const [mm, rest] = clock.split(":");
  const seconds = parseFloat(rest || "0");
  return Number(mm) * 60 + seconds;
};

const compareCardEventOrder = (
  left: { event: MatchEvent; index: number },
  right: { event: MatchEvent; index: number },
) => {
  const leftPeriod = Number(left.event.period || 0);
  const rightPeriod = Number(right.event.period || 0);
  if (leftPeriod !== rightPeriod) return leftPeriod - rightPeriod;

  const leftTs = Date.parse(left.event.timestamp || "");
  const rightTs = Date.parse(right.event.timestamp || "");
  const leftHasTs = Number.isFinite(leftTs);
  const rightHasTs = Number.isFinite(rightTs);
  if (leftHasTs && rightHasTs && leftTs !== rightTs) return leftTs - rightTs;

  const leftClock = parseClockToSeconds(left.event.match_clock);
  const rightClock = parseClockToSeconds(right.event.match_clock);
  if (leftClock !== rightClock) return leftClock - rightClock;

  return left.index - right.index;
};

const getNetCardTotalsByTeam = (
  events: MatchEvent[],
  homeTeamId: string,
  awayTeamId: string,
) => {
  const stateByPlayer = new Map<
    string,
    {
      teamId: string;
      yellow: number;
      red: number;
      suppressNextRed: number;
    }
  >();

  const orderedCards = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === "Card" && Boolean(event.player_id))
    .sort(compareCardEventOrder);

  orderedCards.forEach(({ event }) => {
    const playerId = event.player_id;
    if (!playerId) return;
    const current = stateByPlayer.get(playerId) ?? {
      teamId: event.team_id,
      yellow: 0,
      red: 0,
      suppressNextRed: 0,
    };
    current.teamId = event.team_id || current.teamId;

    const cardType = String(event.data?.card_type || "").toLowerCase();

    if (cardType.includes("cancel")) {
      if (current.red > 0 && current.yellow >= 2) {
        current.red -= 1;
        current.yellow -= 1;
      } else if (current.red > 0) {
        current.red -= 1;
      } else if (current.yellow > 0) {
        current.yellow -= 1;
      }
      stateByPlayer.set(playerId, current);
      return;
    }

    if (cardType.includes("yellow (second)")) {
      current.yellow += 1;
      current.red += 1;
      current.suppressNextRed += 1;
      stateByPlayer.set(playerId, current);
      return;
    }

    if (cardType.includes("yellow")) {
      current.yellow += 1;
      stateByPlayer.set(playerId, current);
      return;
    }

    if (cardType.includes("red")) {
      if (current.suppressNextRed > 0) {
        current.suppressNextRed -= 1;
      } else {
        current.red += 1;
      }
      stateByPlayer.set(playerId, current);
      return;
    }
  });

  const totalsByTeam: Record<string, TeamCardTotals> = {
    [homeTeamId]: { yellow: 0, red: 0 },
    [awayTeamId]: { yellow: 0, red: 0 },
  };

  stateByPlayer.forEach(({ teamId, yellow, red }) => {
    if (!totalsByTeam[teamId]) {
      totalsByTeam[teamId] = { yellow: 0, red: 0 };
    }
    totalsByTeam[teamId].yellow += yellow;
    totalsByTeam[teamId].red += red;
  });

  return totalsByTeam;
};

export function MatchAnalytics({
  match,
  events,
  effectiveTime,
  varTimeSeconds = 0,
  timeoutSeconds = 0,
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

    const summedTeamIneffective = Object.entries(
      ineffectiveTotals.byAction || {},
    ).reduce(
      (acc, [action, totals]) => {
        if (action === "VAR" || action === "Injury") return acc;
        acc.home += totals?.home ?? 0;
        acc.away += totals?.away ?? 0;
        return acc;
      },
      { home: 0, away: 0 },
    );

    const teamIneffectiveTotals = {
      home:
        summedTeamIneffective.home > 0 || summedTeamIneffective.away > 0
          ? summedTeamIneffective.home
          : ineffectiveTotals.home,
      away:
        summedTeamIneffective.home > 0 || summedTeamIneffective.away > 0
          ? summedTeamIneffective.away
          : ineffectiveTotals.away,
    };

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

    const getPassCounts = (teamEvents: MatchEvent[]) => {
      const total = teamEvents.filter((e) => e.type === "Pass").length;
      const accurate = teamEvents.filter(
        (e) => e.type === "Pass" && e.data?.outcome === "Complete",
      ).length;
      return { total, accurate };
    };

    const cardTotalsByTeam = getNetCardTotalsByTeam(
      events,
      homeTeamId,
      awayTeamId,
    );

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
    const homeGoals = getShotOutcomeCount(homeEvents, ["Goal"]);
    const awayGoals = getShotOutcomeCount(awayEvents, ["Goal"]);
    const homeScore = homeGoals > 0 ? homeGoals : match.home_team.score || 0;
    const awayScore = awayGoals > 0 ? awayGoals : match.away_team.score || 0;
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
    const homeYellows = cardTotalsByTeam[homeTeamId]?.yellow ?? 0;
    const awayYellows = cardTotalsByTeam[awayTeamId]?.yellow ?? 0;
    const homeReds = cardTotalsByTeam[homeTeamId]?.red ?? 0;
    const awayReds = cardTotalsByTeam[awayTeamId]?.red ?? 0;

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
    // Global time matches useMatchTimer: effective + ineffective + timeout (VAR excluded, shown separately)
    const {
      globalSeconds,
      homeEffectiveSeconds,
      awayEffectiveSeconds,
      homeEffectivePercent,
      awayEffectivePercent,
      homeIneffectivePercent,
      awayIneffectivePercent,
    } = computeTimerFormulas({
      effectiveTime,
      ineffectiveSeconds,
      timeoutSeconds,
      varTimeSeconds,
      teamIneffective: teamIneffectiveTotals,
    });
    const totalMatchSeconds = globalSeconds;
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
      ineffectiveTotals: {
        ...ineffectiveTotals,
        home: teamIneffectiveTotals.home,
        away: teamIneffectiveTotals.away,
      },
      ineffectiveActionRows: [
        {
          action: "Goal",
          label: t("analytics.ineffectiveGoal", "Goal"),
          home: getIneffectiveAction("Goal", "home"),
          neutral: getIneffectiveAction("Goal", "neutral"),
          away: getIneffectiveAction("Goal", "away"),
        },
        {
          action: "OutOfBounds",
          label: t("analytics.ineffectiveOut", "Out of bounds"),
          home: getIneffectiveAction("OutOfBounds", "home"),
          neutral: getIneffectiveAction("OutOfBounds", "neutral"),
          away: getIneffectiveAction("OutOfBounds", "away"),
        },
        {
          action: "Card",
          label: t("analytics.ineffectiveCard", "Card"),
          home: getIneffectiveAction("Card", "home"),
          neutral: getIneffectiveAction("Card", "neutral"),
          away: getIneffectiveAction("Card", "away"),
        },
        {
          action: "Foul",
          label: t("analytics.ineffectiveFoul", "Foul"),
          home: getIneffectiveAction("Foul", "home"),
          neutral: getIneffectiveAction("Foul", "neutral"),
          away: getIneffectiveAction("Foul", "away"),
        },
        {
          action: "Substitution",
          label: t("analytics.ineffectiveSubstitution", "Substitution"),
          home: getIneffectiveAction("Substitution", "home"),
          neutral: getIneffectiveAction("Substitution", "neutral"),
          away: getIneffectiveAction("Substitution", "away"),
        },
        {
          action: "VAR",
          label: t("analytics.ineffectiveVar", "VAR"),
          home: getIneffectiveAction("VAR", "home"),
          neutral: getIneffectiveAction("VAR", "neutral"),
          away: getIneffectiveAction("VAR", "away"),
        },
        {
          action: "Other",
          label: t("analytics.ineffectiveOther", "Other"),
          home: getIneffectiveAction("Other", "home"),
          neutral: getIneffectiveAction("Other", "neutral"),
          away: getIneffectiveAction("Other", "away"),
        },
      ],
      comparativeRows: [
        {
          label: t("analytics.score", "Score"),
          home: homeScore,
          away: awayScore,
          testId: "stat-score",
        },
        {
          label: t("analytics.possession", "Possession"),
          home: `${homePossession}%`,
          away: `${100 - homePossession}%`,
          testId: "stat-possession",
          tooltip: t(
            "analytics.tooltipPossession",
            "Estimated from total completed passes per team. Not a direct time-based measurement.",
          ),
        },
        {
          label: t("analytics.accuratePasses", "Passes (Total/Accurate)"),
          home: `${homePasses.total} (${homePasses.accurate})`,
          away: `${awayPasses.total} (${awayPasses.accurate})`,
          testId: "stat-accurate-passes",
          tooltip: t(
            "analytics.tooltipPasses",
            "Total passes attempted and accurate passes completed (good outcome).",
          ),
        },
        {
          label: t("analytics.shots", "Total Shots"),
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
          label: t("analytics.corners", "Corners"),
          home: homeCorners,
          away: awayCorners,
          testId: "stat-corners",
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
      ] as ComparativeRow[],
      perTeamTimeRows: [
        {
          label: t("analytics.ineffectiveTime", "Ineffective Time"),
          home: formatSecondsAsClock(ineffectiveTotals.home),
          away: formatSecondsAsClock(ineffectiveTotals.away),
          testId: "stat-ineffective-time",
          tooltip: t(
            "analytics.tooltipIneffectiveTime",
            "Total clock time attributed to each team's stoppages (goals, fouls, cards, substitutions, out-of-bounds). VAR and injury time are excluded from the per-team split.",
          ),
        },
        {
          label: t("analytics.ineffectiveTimePercent", "Ineffective Time %"),
          home: homeIneffectivePercent,
          away: awayIneffectivePercent,
          testId: "stat-ineffective-time-percent",
          tooltip: t(
            "analytics.tooltipIneffectivePercent",
            "Each team's ineffective time as a percentage of (effective + that team's ineffective) time.",
          ),
        },
        {
          label: t("analytics.effectiveTime", "Effective Time"),
          home: formatSecondsAsClock(homeEffectiveSeconds),
          away: formatSecondsAsClock(awayEffectiveSeconds),
          testId: "stat-effective-time",
          tooltip: t(
            "analytics.tooltipEffectiveTime",
            "Ball-in-play time. This is the same for both teams since effective time is shared.",
          ),
        },
        {
          label: t("analytics.effectiveTimePercent", "Effective Time %"),
          home: homeEffectivePercent,
          away: awayEffectivePercent,
          testId: "stat-effective-time-percent",
          tooltip: t(
            "analytics.tooltipEffectivePercent",
            "Effective time as a percentage of (effective + that team's ineffective) time.",
          ),
        },
      ] as ComparativeRow[],
      totalMatchSeconds,
      totalEvents,
      avgEventsPerMinute,
      mostActiveMinute: mostActiveMinute.minute,
      homeTotal: homeEvents.length,
      awayTotal: awayEvents.length,
      varTimeSeconds,
      homeScore,
      awayScore,
    };
  }, [
    match,
    events,
    effectiveTime,
    ineffectiveSeconds,
    ineffectiveBreakdown,
    t,
    varTimeSeconds,
    timeoutSeconds,
  ]);

  const statsTableRef = useRef<HTMLDivElement>(null);

  if (!match || !analytics) {
    return (
      <div
        className="flex items-center justify-center h-64 text-gray-400"
        data-testid="analytics-panel"
      >
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

  const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportJpg = async () => {
    const el = statsTableRef.current;
    if (!el) return;

    // Wide capture width so grid columns render without clipping
    const CAPTURE_WIDTH = 1100;
    const RENDER_SCALE = 2;

    const html2canvasOpts: Parameters<typeof html2canvas>[1] = {
      backgroundColor: "#0f172a",
      scale: RENDER_SCALE,
      windowWidth: CAPTURE_WIDTH,
      useCORS: true,
    };

    // Helper: force element to export-friendly layout (no truncation / overflow)
    const prepareForCapture = (root: HTMLElement) => {
      const prev = {
        minWidth: root.style.minWidth,
        maxWidth: root.style.maxWidth,
        overflow: root.style.overflow,
      };
      root.style.minWidth = `${CAPTURE_WIDTH}px`;
      root.style.maxWidth = `${CAPTURE_WIDTH}px`;
      root.style.overflow = "visible";

      // Temporarily remove truncate / overflow-hidden on descendants
      const restored: {
        el: HTMLElement;
        ov: string;
        ws: string;
        to: string;
      }[] = [];
      root
        .querySelectorAll<HTMLElement>(".truncate, [class*='overflow-hidden']")
        .forEach((child) => {
          restored.push({
            el: child,
            ov: child.style.overflow,
            ws: child.style.whiteSpace,
            to: child.style.textOverflow,
          });
          child.style.overflow = "visible";
          child.style.whiteSpace = "normal";
          child.style.textOverflow = "clip";
        });

      return () => {
        root.style.minWidth = prev.minWidth;
        root.style.maxWidth = prev.maxWidth;
        root.style.overflow = prev.overflow;
        restored.forEach(({ el: c, ov, ws, to }) => {
          c.style.overflow = ov;
          c.style.whiteSpace = ws;
          c.style.textOverflow = to;
        });
      };
    };

    // 1. Capture the comparative stats table
    const restoreStats = prepareForCapture(el);
    const statsCanvas = await html2canvas(el, html2canvasOpts);
    restoreStats();

    // 2. Capture the heat-map section (sibling rendered in AnalyticsView)
    const heatmapEl = document.querySelector<HTMLElement>(
      '[data-testid="heatmap-section"]',
    );
    let heatmapCanvas: HTMLCanvasElement | null = null;
    if (heatmapEl) {
      const restoreHm = prepareForCapture(heatmapEl);
      heatmapCanvas = await html2canvas(heatmapEl, html2canvasOpts);
      restoreHm();
    }

    // 3. Composite both captures into a single canvas
    const gap = heatmapCanvas ? 24 * RENDER_SCALE : 0;
    const totalWidth = Math.max(statsCanvas.width, heatmapCanvas?.width ?? 0);
    const totalHeight = statsCanvas.height + gap + (heatmapCanvas?.height ?? 0);

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = totalWidth;
    finalCanvas.height = totalHeight;
    const fCtx = finalCanvas.getContext("2d");
    if (!fCtx) return;

    // Background fill
    fCtx.fillStyle = "#0f172a";
    fCtx.fillRect(0, 0, totalWidth, totalHeight);

    // Draw stats table centred horizontally
    fCtx.drawImage(
      statsCanvas,
      Math.round((totalWidth - statsCanvas.width) / 2),
      0,
    );

    // Draw heat maps below stats table
    if (heatmapCanvas) {
      fCtx.drawImage(
        heatmapCanvas,
        Math.round((totalWidth - heatmapCanvas.width) / 2),
        statsCanvas.height + gap,
      );
    }

    // 4. Tile the ProMatch logo as a repeating watermark across the image
    const logoTileW = Math.round(totalWidth * 0.06);
    const logoTileH = Math.round(
      logoTileW *
        (PROMATCH_TITLE_LOGO_VIEWBOX.height /
          PROMATCH_TITLE_LOGO_VIEWBOX.width),
    );
    const spacingX = logoTileW * 3;
    const spacingY = logoTileH * 3;
    const scale = logoTileW / PROMATCH_TITLE_LOGO_VIEWBOX.width;
    const logoPath = new Path2D(PROMATCH_TITLE_LOGO_PATH);

    fCtx.save();
    fCtx.globalAlpha = 0.12;
    fCtx.fillStyle = "#ffffff";
    for (let y = spacingY / 2; y < totalHeight; y += spacingY) {
      for (let x = spacingX / 2; x < totalWidth; x += spacingX) {
        fCtx.save();
        fCtx.translate(x - logoTileW / 2, y - logoTileH / 2);
        fCtx.scale(scale, scale);
        fCtx.fill(logoPath, "evenodd");
        fCtx.restore();
      }
    }
    fCtx.restore();

    finalCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const timestamp = new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[:T]/g, "-");
        downloadBlob(`analytics-${match.id || "match"}-${timestamp}.jpg`, blob);
      },
      "image/jpeg",
      0.92,
    );
  };

  /** Draw repeating ProMatch logo watermark across every page of a jsPDF doc */
  const drawPdfWatermark = (doc: jsPDF) => {
    const pageCount = doc.getNumberOfPages();
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();

    // Render the SVG logo path onto a small canvas, then export as PNG data-URL
    const logoW = 60;
    const logoH = Math.round(
      logoW *
        (PROMATCH_TITLE_LOGO_VIEWBOX.height /
          PROMATCH_TITLE_LOGO_VIEWBOX.width),
    );
    const offscreen = document.createElement("canvas");
    offscreen.width = logoW * 2;
    offscreen.height = logoH * 2;
    const oCtx = offscreen.getContext("2d");
    if (!oCtx) return;
    const s = (logoW * 2) / PROMATCH_TITLE_LOGO_VIEWBOX.width;
    oCtx.scale(s, s);
    oCtx.fillStyle = "#94a3b8"; // slate-400
    oCtx.fill(new Path2D(PROMATCH_TITLE_LOGO_PATH), "evenodd");
    const logoDataUrl = offscreen.toDataURL("image/png");

    const gapX = logoW * 3;
    const gapY = logoH * 3;

    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      for (let ly = gapY / 2; ly < ph; ly += gapY) {
        for (let lx = gapX / 2; lx < pw; lx += gapX) {
          doc.saveGraphicsState();
          const gState = (doc as any).GState
            ? new (doc as any).GState({ opacity: 0.07 })
            : null;
          if (gState) doc.setGState(gState);
          doc.addImage(
            logoDataUrl,
            "PNG",
            lx - logoW / 2,
            ly - logoH / 2,
            logoW,
            logoH,
          );
          doc.restoreGraphicsState();
        }
      }
    }
  };

  const exportPdf = async () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });
    const marginX = 36;
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 84, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(t("analytics.title", "Live Match Analytics"), marginX, 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`${match.home_team.name} vs ${match.away_team.name}`, marginX, 54);
    doc.text(
      `${t("statusLabel", "Status")}: ${String(match.status || "")}`,
      marginX,
      70,
    );

    let y = 104;
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(t("analytics.teamComparison", "Team Comparison"), marginX, y);

    autoTable(doc, {
      startY: y + 8,
      head: [["Metric", match.home_team.name, match.away_team.name]],
      body: analytics.comparativeRows.map((row) => [
        row.label,
        String(row.home),
        String(row.away),
      ]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5, lineColor: [226, 232, 240] },
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
    });

    y = ((doc as any).lastAutoTable?.finalY || y + 120) + 22;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(t("analytics.perTeamTime", "Per-Team Time Detail"), marginX, y);

    autoTable(doc, {
      startY: y + 8,
      head: [["Metric", match.home_team.name, match.away_team.name]],
      body: analytics.perTeamTimeRows.map((row) => [
        row.label,
        String(row.home),
        String(row.away),
      ]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5, lineColor: [226, 232, 240] },
      headStyles: {
        fillColor: [234, 179, 8],
        textColor: [15, 23, 42],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
    });

    y = ((doc as any).lastAutoTable?.finalY || y + 120) + 22;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(
      t("analytics.ineffectiveBreakdown", "Ineffective Breakdown"),
      marginX,
      y,
    );

    autoTable(doc, {
      startY: y + 8,
      head: [
        [
          "Metric",
          match.home_team.name,
          t("analytics.neutral", "Neutral"),
          match.away_team.name,
        ],
      ],
      body: analytics.ineffectiveActionRows.map((row: any) => [
        row.label,
        formatSecondsAsClock(row.home),
        formatSecondsAsClock(row.neutral),
        formatSecondsAsClock(row.away),
      ]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5, lineColor: [226, 232, 240] },
      headStyles: {
        fillColor: [14, 116, 144],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
    });

    y = ((doc as any).lastAutoTable?.finalY || y + 120) + 22;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(t("analytics.eventTypes", "Event Type Distribution"), marginX, y);

    autoTable(doc, {
      startY: y + 8,
      head: [["Event", "Count"]],
      body: analytics.eventTypes.map((entry) => [
        entry.type,
        String(entry.count),
      ]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5, lineColor: [226, 232, 240] },
      headStyles: {
        fillColor: [124, 58, 237],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
    });

    // ── Heat maps ──
    const heatmapEl = document.querySelector<HTMLElement>(
      '[data-testid="heatmap-section"]',
    );
    if (heatmapEl) {
      const CAPTURE_WIDTH = 1100;
      const prevW = heatmapEl.style.minWidth;
      const prevMaxW = heatmapEl.style.maxWidth;
      const prevOv = heatmapEl.style.overflow;
      heatmapEl.style.minWidth = `${CAPTURE_WIDTH}px`;
      heatmapEl.style.maxWidth = `${CAPTURE_WIDTH}px`;
      heatmapEl.style.overflow = "visible";
      const restored: {
        el: HTMLElement;
        ov: string;
        ws: string;
        to: string;
      }[] = [];
      heatmapEl
        .querySelectorAll<HTMLElement>(".truncate, [class*='overflow-hidden']")
        .forEach((child) => {
          restored.push({
            el: child,
            ov: child.style.overflow,
            ws: child.style.whiteSpace,
            to: child.style.textOverflow,
          });
          child.style.overflow = "visible";
          child.style.whiteSpace = "normal";
          child.style.textOverflow = "clip";
        });

      const hmCanvas = await html2canvas(heatmapEl, {
        backgroundColor: "#0f172a",
        scale: 2,
        windowWidth: CAPTURE_WIDTH,
        useCORS: true,
      });

      heatmapEl.style.minWidth = prevW;
      heatmapEl.style.maxWidth = prevMaxW;
      heatmapEl.style.overflow = prevOv;
      restored.forEach(({ el: c, ov, ws, to }) => {
        c.style.overflow = ov;
        c.style.whiteSpace = ws;
        c.style.textOverflow = to;
      });

      const hmDataUrl = hmCanvas.toDataURL("image/png");
      const imgW = pageWidth - marginX * 2;
      const imgH = (hmCanvas.height / hmCanvas.width) * imgW;

      // Check if heat map fits on current page; if not, add a new page
      y = ((doc as any).lastAutoTable?.finalY || y + 120) + 22;
      const pageH = doc.internal.pageSize.getHeight();
      if (y + imgH + 30 > pageH) {
        doc.addPage();
        y = 36;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(t("analytics.heatMaps", "Field Heat Maps"), marginX, y);
      doc.addImage(hmDataUrl, "PNG", marginX, y + 10, imgW, imgH);
    }

    // ── Footer on last page ──
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${t(
        "analytics.realtime",
        "Real-time data visualization",
      )} • ${new Date().toLocaleString()}`,
      marginX,
      doc.internal.pageSize.getHeight() - 18,
    );

    // ── Repeating watermark on every page ──
    drawPdfWatermark(doc);

    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");
    doc.save(`analytics-${match.id || "match"}-${timestamp}.pdf`);
  };

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
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500">
            {t("analytics.realtime", "Real-time data visualization")}
          </div>
          <button
            type="button"
            data-testid="export-analytics-jpg"
            onClick={exportJpg}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {t("analytics.exportJpg", "Export JPG")}
          </button>
          <button
            type="button"
            data-testid="export-analytics-pdf"
            onClick={exportPdf}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-700 text-white hover:bg-slate-800"
          >
            {t("analytics.exportPdf", "Export PDF")}
          </button>
        </div>
      </div>

      {/* Comparative Table */}
      <div
        ref={statsTableRef}
        className="bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-900 rounded-2xl p-4 sm:p-5 md:p-6 text-white shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-base uppercase tracking-wider text-emerald-200">
            {t("analytics.totalTime", "Total Time")}:
          </div>
          <div className="text-xl font-mono font-semibold text-emerald-100">
            {formatSecondsAsClock(analytics.totalMatchSeconds)}
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4 mb-4">
          <div className="flex flex-col gap-2">
            <div
              className="text-lg md:text-xl font-semibold truncate"
              title={match.home_team.name}
            >
              {match.home_team.name}
            </div>
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
              <div className="absolute inset-2 rounded-full bg-slate-900 flex items-center justify-center text-base font-bold">
                {analytics.homePossession}%
              </div>
            </div>
          </div>
          <div className="text-base text-emerald-200 font-semibold uppercase tracking-wide">
            VS
          </div>
          <div className="flex flex-col items-end gap-2">
            <div
              className="text-lg md:text-xl font-semibold truncate"
              title={match.away_team.name}
            >
              {match.away_team.name}
            </div>
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
              <div className="absolute inset-2 rounded-full bg-slate-900 flex items-center justify-center text-base font-bold">
                {analytics.awayPossession}%
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(80px,1fr)_minmax(130px,170px)_minmax(80px,1fr)] md:grid-cols-[minmax(80px,1fr)_minmax(150px,190px)_minmax(80px,1fr)] text-sm md:text-base uppercase tracking-wide text-emerald-200 mb-2 gap-2">
          <div className="truncate" data-testid="analytics-shortname-home">
            {match.home_team.short_name}
          </div>
          <div className="text-center truncate">
            {t("analytics.metric", "Metric")}
          </div>
          <div
            className="text-right truncate"
            data-testid="analytics-shortname-away"
          >
            {match.away_team.short_name}
          </div>
        </div>

        <div className="space-y-2" data-testid="analytics-comparison-table">
          {analytics.comparativeRows.map((row) => (
            <div
              key={row.testId}
              className="grid grid-cols-[minmax(80px,1fr)_minmax(130px,170px)_minmax(80px,1fr)] md:grid-cols-[minmax(80px,1fr)_minmax(150px,190px)_minmax(80px,1fr)] items-center gap-2 md:gap-3 bg-white/5 rounded-lg px-2.5 md:px-3 py-2.5 md:py-3"
              data-testid={row.testId}
            >
              <div className="text-base sm:text-lg md:text-xl font-semibold text-emerald-50">
                {row.home}
              </div>
              <div
                className="text-sm sm:text-base md:text-lg text-emerald-200 text-center font-medium leading-tight px-1 flex items-center justify-center gap-1"
                title={row.label}
              >
                <span className="truncate">{row.label}</span>
                {row.tooltip && (
                  <span className="group relative flex-shrink-0">
                    <Info
                      size={14}
                      className="text-emerald-400/60 cursor-help"
                    />
                    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-md bg-slate-800 px-3 py-2 text-xs leading-relaxed text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 z-50 normal-case tracking-normal text-left">
                      {row.tooltip}
                    </span>
                  </span>
                )}
              </div>
              <div className="text-base sm:text-lg md:text-xl font-semibold text-emerald-50 text-right">
                {row.away}
              </div>
            </div>
          ))}
        </div>

        {/* Per-team Time Detail */}
        <div className="mt-6" data-testid="analytics-per-team-time">
          <div className="text-sm uppercase tracking-wide text-emerald-200 mb-2">
            {t("analytics.perTeamTime", "Per-Team Time Detail")}
          </div>
          <div className="grid grid-cols-[minmax(80px,1fr)_minmax(130px,170px)_minmax(80px,1fr)] md:grid-cols-[minmax(80px,1fr)_minmax(150px,190px)_minmax(80px,1fr)] text-sm md:text-base uppercase tracking-wide text-emerald-200 mb-2 gap-2">
            <div className="truncate">{match.home_team.short_name}</div>
            <div className="text-center truncate">
              {t("analytics.metric", "Metric")}
            </div>
            <div className="text-right truncate">
              {match.away_team.short_name}
            </div>
          </div>
          <div className="space-y-2">
            {analytics.perTeamTimeRows.map((row) => (
              <div
                key={row.testId}
                className="grid grid-cols-[minmax(80px,1fr)_minmax(130px,170px)_minmax(80px,1fr)] md:grid-cols-[minmax(80px,1fr)_minmax(150px,190px)_minmax(80px,1fr)] items-center gap-2 md:gap-3 bg-white/5 rounded-lg px-2.5 md:px-3 py-2.5 md:py-3"
                data-testid={row.testId}
              >
                <div className="text-base sm:text-lg md:text-xl font-semibold text-emerald-50">
                  {row.home}
                </div>
                <div
                  className="text-sm sm:text-base md:text-lg text-emerald-200 text-center font-medium leading-tight px-1 flex items-center justify-center gap-1"
                  title={row.label}
                >
                  <span className="truncate">{row.label}</span>
                  {row.tooltip && (
                    <span className="group relative flex-shrink-0">
                      <Info
                        size={14}
                        className="text-emerald-400/60 cursor-help"
                      />
                      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-md bg-slate-800 px-3 py-2 text-xs leading-relaxed text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 z-50 normal-case tracking-normal text-left">
                        {row.tooltip}
                      </span>
                    </span>
                  )}
                </div>
                <div className="text-base sm:text-lg md:text-xl font-semibold text-emerald-50 text-right">
                  {row.away}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6" data-testid="analytics-ineffective-breakdown">
          <div className="text-sm uppercase tracking-wide text-emerald-200 mb-2">
            {t("analytics.ineffectiveBreakdown", "Ineffective Breakdown")}
          </div>
          <div className="grid grid-cols-[minmax(120px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)] md:grid-cols-[minmax(180px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] gap-2 text-xs md:text-sm uppercase tracking-wider text-emerald-200 mb-2">
            <div className="text-left">{t("analytics.metric", "Metric")}</div>
            <div className="text-center">{match.home_team.short_name}</div>
            <div className="text-center">
              {t("analytics.neutral", "Neutral")}
            </div>
            <div className="text-center">{match.away_team.short_name}</div>
          </div>
          <div className="space-y-2">
            {analytics.ineffectiveActionRows.map((row: any) => (
              <div
                key={row.action}
                className="grid grid-cols-[minmax(120px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)] md:grid-cols-[minmax(180px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] items-center gap-2 bg-white/5 rounded-lg px-2.5 md:px-3 py-2"
                data-testid={`stat-ineffective-${row.action.toLowerCase()}`}
              >
                <div
                  className="text-sm md:text-base text-emerald-100 truncate"
                  title={row.label}
                >
                  {row.label}
                </div>
                <div className="text-sm md:text-base font-semibold text-emerald-50 text-center">
                  {formatSecondsAsClock(row.home)}
                </div>
                <div className="text-sm md:text-base font-semibold text-emerald-50 text-center">
                  {formatSecondsAsClock(row.neutral)}
                </div>
                <div className="text-sm md:text-base font-semibold text-emerald-50 text-center">
                  {formatSecondsAsClock(row.away)}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(120px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)] md:grid-cols-[minmax(180px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] items-center gap-2 bg-emerald-500/20 rounded-lg px-2.5 md:px-3 py-2">
              <div className="text-sm md:text-base text-emerald-50 font-semibold">
                {t("analytics.ineffectiveTotals", "Totals")}
              </div>
              <div className="text-sm md:text-base font-semibold text-emerald-50 text-center">
                {formatSecondsAsClock(analytics.ineffectiveTotals.home)}
              </div>
              <div className="text-sm md:text-base font-semibold text-emerald-50 text-center">
                {formatSecondsAsClock(analytics.ineffectiveTotals.neutral)}
              </div>
              <div className="text-sm md:text-base font-semibold text-emerald-50 text-center">
                {formatSecondsAsClock(analytics.ineffectiveTotals.away)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
          icon={Clock}
          label={t("analytics.varTime", "VAR Time")}
          value={formatSecondsAsClock(analytics.varTimeSeconds)}
          color="from-amber-500 to-amber-600"
          testId="analytics-var-time"
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

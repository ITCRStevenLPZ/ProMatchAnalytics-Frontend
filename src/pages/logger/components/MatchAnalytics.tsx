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

export function MatchAnalytics({
  match,
  events,
  effectiveTime,
  t,
}: MatchAnalyticsProps) {
  // Calculate analytics data
  const analytics = useMemo(() => {
    if (!match || events.length === 0) {
      return null;
    }

    const homeTeamId = match.home_team.id;
    const awayTeamId = match.away_team.id;

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
    const totalPasses =
      getEventCount(homeEvents, "Pass") + getEventCount(awayEvents, "Pass");
    const homePossession =
      totalPasses > 0
        ? Math.round((getEventCount(homeEvents, "Pass") / totalPasses) * 100)
        : 50;

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
      totalEvents,
      avgEventsPerMinute,
      mostActiveMinute: mostActiveMinute.minute,
      homeTotal: homeEvents.length,
      awayTotal: awayEvents.length,
    };
  }, [match, events, effectiveTime, t]);

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

import React, { useState, useMemo } from "react";
import {
  CheckCircle,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  Edit,
  Check,
  X,
} from "../../../../components/icons";
import type { MatchEvent } from "../../../../store/useMatchLogStore";
import type { Match } from "../../types";
import type { Player } from "../../types";
import { ACTION_FLOWS } from "../../constants";

// ─── Props ──────────────────────────────────────────────────────────────

interface ReviewViewProps {
  match: Match | null;
  liveEvents: MatchEvent[];
  isAdmin: boolean;
  onUpdateEventData?: (
    event: MatchEvent,
    updates: Partial<MatchEvent>,
  ) => Promise<void> | void;
  onUpdateEventNotes?: (
    event: MatchEvent,
    notes: string | null,
  ) => Promise<void> | void;
  onDeleteEvent?: (event: MatchEvent) => Promise<void> | void;
  t: any;
}

// ─── Helpers (mirrors LiveEventFeed) ────────────────────────────────────

const getPlayerName = (
  playerId: string | undefined,
  match: Match | null,
): string => {
  if (!playerId || !match) return "—";
  const allPlayers = [...match.home_team.players, ...match.away_team.players];
  const player = allPlayers.find((p) => p.id === playerId);
  return player ? `#${player.jersey_number} ${player.full_name}` : playerId;
};

const getTeamName = (teamId: string | null, match: Match | null): string => {
  if (!teamId || !match) return "—";
  if (teamId === match.home_team.id) return match.home_team.short_name;
  if (teamId === match.away_team.id) return match.away_team.short_name;
  return teamId;
};

const getDisplayType = (event: MatchEvent): string => {
  if (event.type === "Shot" && event.data?.outcome === "Goal") return "Goal";
  return event.type;
};

const getEventKey = (event: MatchEvent): string =>
  event._id || event.client_id || event.timestamp;

const EVENT_TYPE_KEYS = Object.keys(ACTION_FLOWS);

// ─── Component ──────────────────────────────────────────────────────────

const ReviewView: React.FC<ReviewViewProps> = ({
  match,
  liveEvents,
  isAdmin,
  onUpdateEventData,
  onUpdateEventNotes,
  onDeleteEvent,
  t,
}) => {
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Editing state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    type?: string;
    outcome?: string;
    player_id?: string;
    team_id?: string;
    period?: number;
    match_clock?: string;
    notes?: string;
  }>({});
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());

  // Filters
  const [filterType, setFilterType] = useState<string>("");
  const [filterTeam, setFilterTeam] = useState<string>("");
  const [filterPeriod, setFilterPeriod] = useState<string>("");

  // All players for dropdowns
  const allPlayers: Player[] = useMemo(() => {
    if (!match) return [];
    return [...match.home_team.players, ...match.away_team.players];
  }, [match]);

  // Filtered + paginated events (newest first)
  const filteredEvents = useMemo(() => {
    let events = [...liveEvents].reverse();
    if (filterType) events = events.filter((e) => e.type === filterType);
    if (filterTeam) events = events.filter((e) => e.team_id === filterTeam);
    if (filterPeriod)
      events = events.filter((e) => e.period === Number(filterPeriod));
    return events;
  }, [liveEvents, filterType, filterTeam, filterPeriod]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const startIdx = (currentPage - 1) * pageSize;
  const pageEvents = filteredEvents.slice(startIdx, startIdx + pageSize);

  // Unique periods for filter
  const periods = useMemo(() => {
    const ps = new Set(liveEvents.map((e) => e.period));
    return [...ps].sort((a, b) => a - b);
  }, [liveEvents]);

  // Begin editing
  const beginEdit = (event: MatchEvent) => {
    const key = getEventKey(event);
    setEditingKey(key);
    setDraft({
      type: event.type,
      outcome: event.data?.outcome || "",
      player_id: event.player_id || "",
      team_id: event.team_id || "",
      period: event.period,
      match_clock: event.match_clock,
      notes: event.notes || "",
    });
  };

  const cancelEdit = () => setEditingKey(null);

  const saveEdit = async (event: MatchEvent) => {
    const key = getEventKey(event);
    if (savingKeys.has(key)) return;

    setSavingKeys((prev) => new Set(prev).add(key));
    try {
      // Build the updates payload
      const updates: Partial<MatchEvent> = {};

      if (draft.type && draft.type !== event.type) {
        updates.type = draft.type;
      }
      if (
        draft.player_id !== undefined &&
        draft.player_id !== (event.player_id || "")
      ) {
        updates.player_id = draft.player_id || undefined;
      }
      if (draft.team_id && draft.team_id !== event.team_id) {
        updates.team_id = draft.team_id;
      }
      if (draft.period !== undefined && draft.period !== event.period) {
        updates.period = draft.period;
      }
      if (draft.match_clock && draft.match_clock !== event.match_clock) {
        updates.match_clock = draft.match_clock;
      }

      // Handle outcome within data
      const currentOutcome = event.data?.outcome || "";
      if (draft.outcome !== undefined && draft.outcome !== currentOutcome) {
        updates.data = { ...event.data, outcome: draft.outcome || undefined };
      }

      // Notes
      if (draft.notes !== undefined) {
        const trimmedNotes = draft.notes.trim();
        const currentNotes = event.notes || "";
        if (trimmedNotes !== currentNotes) {
          if (onUpdateEventNotes && !onUpdateEventData) {
            await onUpdateEventNotes(event, trimmedNotes || null);
          } else {
            updates.notes = trimmedNotes || undefined;
          }
        }
      }

      if (Object.keys(updates).length > 0 && onUpdateEventData) {
        await onUpdateEventData(event, updates);
      }

      setEditingKey(null);
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleDelete = async (event: MatchEvent) => {
    if (!onDeleteEvent) return;
    const key = getEventKey(event);
    if (deletingKeys.has(key)) return;
    setDeletingKeys((prev) => new Set(prev).add(key));
    try {
      await onDeleteEvent(event);
    } finally {
      setDeletingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // Get available outcomes for a given event type
  const getOutcomesForType = (type: string): string[] => {
    const flow = ACTION_FLOWS[type];
    if (!flow) return [];
    return [...new Set(Object.values(flow.outcomes ?? {}).flat())];
  };

  // Determine which team's players to show when editing a player
  const getTeamPlayers = (teamId: string): Player[] => {
    if (!match) return [];
    if (teamId === match.home_team.id) return match.home_team.players;
    if (teamId === match.away_team.id) return match.away_team.players;
    return allPlayers;
  };

  return (
    <div
      className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col"
      data-testid="review-panel"
    >
      {/* Header */}
      <div className="border-b border-slate-700 p-4 bg-slate-900/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100">
            {t("reviewTitle", "Event Review & Corrections")}
          </h2>
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium text-slate-400 bg-slate-700 px-3 py-1 rounded-full border border-slate-600"
              data-testid="review-total"
            >
              {filteredEvents.length} {t("eventsLabel", "events")}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {t("type", "Type")}
            </span>
            <select
              data-testid="review-filter-type"
              className="text-xs bg-slate-900 text-slate-200 border border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">{t("all", "All")}</option>
              {EVENT_TYPE_KEYS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {t("team", "Team")}
            </span>
            <select
              data-testid="review-filter-team"
              className="text-xs bg-slate-900 text-slate-200 border border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
              value={filterTeam}
              onChange={(e) => {
                setFilterTeam(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">{t("all", "All")}</option>
              {match && (
                <>
                  <option value={match.home_team.id}>
                    {match.home_team.short_name}
                  </option>
                  <option value={match.away_team.id}>
                    {match.away_team.short_name}
                  </option>
                </>
              )}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {t("periodLabel", "Period")}
            </span>
            <select
              data-testid="review-filter-period"
              className="text-xs bg-slate-900 text-slate-200 border border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
              value={filterPeriod}
              onChange={(e) => {
                setFilterPeriod(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">{t("all", "All")}</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  P{p}
                </option>
              ))}
            </select>
          </div>

          {/* Page size */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {t("show", "Show")}
            </span>
            {[10, 25, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                className={`text-xs px-2 py-1 rounded ${
                  pageSize === size
                    ? "bg-teal-900/40 text-teal-300 font-medium border border-teal-800"
                    : "text-slate-500 hover:bg-slate-700"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[75vh] scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        {filteredEvents.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-12">
            <Users size={48} className="mx-auto mb-3 text-slate-700" />
            <p>{t("noEvents", "No events yet")}</p>
          </div>
        ) : (
          pageEvents.map((event, idx) => {
            const eventKey = getEventKey(event);
            const isEditing = editingKey === eventKey;
            const isSaving = savingKeys.has(eventKey);
            const isDeleting = deletingKeys.has(eventKey);
            const displayType = getDisplayType(event);
            const teamName = getTeamName(event.team_id, match);
            const playerName = getPlayerName(
              event.player_id ?? event.data?.trigger_player_id,
              match,
            );
            const isPending = Boolean(event.client_id && !event._id);
            const canEdit =
              Boolean(onUpdateEventData) && Boolean(event._id) && isAdmin;
            const canDelete =
              Boolean(onDeleteEvent) && Boolean(event._id) && isAdmin;

            return (
              <div
                key={`${eventKey}-${startIdx + idx}`}
                data-testid="review-event-item"
                className={`border rounded-lg transition-all ${
                  isEditing
                    ? "border-teal-500/50 bg-teal-900/10 shadow-md ring-1 ring-teal-500/30"
                    : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
                }`}
              >
                {isEditing ? (
                  /* ───── Inline edit form ───── */
                  <div className="p-3 space-y-3" data-testid="review-edit-form">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                      {/* Type */}
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                          {t("type", "Type")}
                        </label>
                        <select
                          data-testid="review-edit-type"
                          className="w-full text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={draft.type || event.type}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              type: e.target.value,
                              outcome: "", // reset outcome when type changes
                            }))
                          }
                        >
                          {EVENT_TYPE_KEYS.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Outcome */}
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                          {t("outcome", "Outcome")}
                        </label>
                        <select
                          data-testid="review-edit-outcome"
                          className="w-full text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={draft.outcome ?? ""}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              outcome: e.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {t("selectOutcome", "— Select —")}
                          </option>
                          {getOutcomesForType(draft.type || event.type).map(
                            (o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ),
                          )}
                        </select>
                      </div>

                      {/* Team */}
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                          {t("team", "Team")}
                        </label>
                        <select
                          data-testid="review-edit-team"
                          className="w-full text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={draft.team_id || event.team_id}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              team_id: e.target.value,
                              player_id: "", // reset player when team changes
                            }))
                          }
                        >
                          {match && (
                            <>
                              <option value={match.home_team.id}>
                                {match.home_team.short_name}
                              </option>
                              <option value={match.away_team.id}>
                                {match.away_team.short_name}
                              </option>
                            </>
                          )}
                        </select>
                      </div>

                      {/* Player */}
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                          {t("player", "Player")}
                        </label>
                        <select
                          data-testid="review-edit-player"
                          className="w-full text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={draft.player_id ?? event.player_id ?? ""}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              player_id: e.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {t("teamEvent", "Team Event")}
                          </option>
                          {getTeamPlayers(draft.team_id || event.team_id).map(
                            (p) => (
                              <option key={p.id} value={p.id}>
                                #{p.jersey_number} {p.full_name}
                              </option>
                            ),
                          )}
                        </select>
                      </div>

                      {/* Period */}
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                          {t("periodLabel", "Period")}
                        </label>
                        <select
                          data-testid="review-edit-period"
                          className="w-full text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={draft.period ?? event.period}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              period: Number(e.target.value),
                            }))
                          }
                        >
                          {[1, 2, 3, 4, 5].map((p) => (
                            <option key={p} value={p}>
                              P{p}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Clock */}
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                          {t("clock", "Clock")}
                        </label>
                        <input
                          type="text"
                          data-testid="review-edit-clock"
                          className="w-full text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={draft.match_clock ?? event.match_clock}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              match_clock: e.target.value,
                            }))
                          }
                          placeholder="MM:SS"
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                        {t("notes", "Notes")}
                      </label>
                      <textarea
                        data-testid="review-edit-notes"
                        className="w-full text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        rows={2}
                        value={draft.notes ?? ""}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            notes: e.target.value,
                          }))
                        }
                        placeholder={t("notesPlaceholder", "Add a note...")}
                      />
                    </div>

                    {/* Save / Cancel */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="review-edit-save"
                        disabled={isSaving}
                        onClick={() => saveEdit(event)}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-teal-600/30 text-teal-200 border border-teal-500/40 hover:bg-teal-600/50 disabled:opacity-50 font-semibold"
                      >
                        <Check size={12} />
                        {isSaving
                          ? t("saving", "Saving…")
                          : t("saveChanges", "Save changes")}
                      </button>
                      <button
                        type="button"
                        data-testid="review-edit-cancel"
                        onClick={cancelEdit}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 font-semibold"
                      >
                        <X size={12} />
                        {t("cancel", "Cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ───── Display row ───── */
                  <div className="p-3 flex items-center gap-3">
                    {/* Clock & period */}
                    <div className="flex flex-col items-center shrink-0 w-16">
                      <span className="text-sm font-mono font-semibold text-slate-300">
                        {event.match_clock}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        P{event.period}
                      </span>
                    </div>

                    {/* Type badge */}
                    <span
                      className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        displayType === "Goal"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      }`}
                    >
                      {displayType}
                    </span>

                    {/* Team */}
                    <span className="shrink-0 text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-medium">
                      {teamName}
                    </span>

                    {/* Player */}
                    <span className="flex-1 text-xs text-slate-300 truncate min-w-0">
                      {playerName}
                    </span>

                    {/* Outcome */}
                    {event.data?.outcome && (
                      <span
                        className={`shrink-0 text-xs font-medium ${
                          event.data.outcome.toLowerCase().includes("goal") ||
                          event.data.outcome
                            .toLowerCase()
                            .includes("complete") ||
                          event.data.outcome
                            .toLowerCase()
                            .includes("success") ||
                          event.data.outcome.toLowerCase().includes("won")
                            ? "text-green-400"
                            : event.data.outcome
                                  .toLowerCase()
                                  .includes("incomplete") ||
                                event.data.outcome
                                  .toLowerCase()
                                  .includes("failed") ||
                                event.data.outcome
                                  .toLowerCase()
                                  .includes("lost")
                              ? "text-red-400"
                              : "text-slate-400"
                        }`}
                      >
                        {event.data.outcome}
                      </span>
                    )}

                    {/* Notes indicator */}
                    {event.notes && (
                      <span
                        className="shrink-0 text-[10px] text-amber-400 bg-amber-900/20 px-1.5 py-0.5 rounded border border-amber-700/30"
                        title={event.notes}
                      >
                        📝
                      </span>
                    )}

                    {/* Status badges */}
                    {isPending && (
                      <span className="shrink-0 text-[10px] bg-yellow-900/30 text-yellow-500 px-2 py-0.5 rounded-full border border-yellow-900/50">
                        {t("pending", "Pending")}
                      </span>
                    )}
                    {event._confirmed && (
                      <span className="shrink-0">
                        <CheckCircle size={14} className="text-green-500" />
                      </span>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && (
                        <button
                          type="button"
                          data-testid="review-event-edit"
                          onClick={() => beginEdit(event)}
                          className="text-slate-400 hover:text-teal-300 p-1.5 rounded hover:bg-slate-800 transition-colors"
                          title={t("editEvent", "Edit event")}
                        >
                          <Edit size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          data-testid="review-event-delete"
                          onClick={() => handleDelete(event)}
                          disabled={isDeleting}
                          className="text-slate-400 hover:text-rose-300 p-1.5 rounded hover:bg-slate-800 transition-colors disabled:opacity-50"
                          title={t("deleteEvent", "Delete event")}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-slate-700 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {t("showing", "Showing")} {startIdx + 1}-
              {Math.min(startIdx + pageSize, filteredEvents.length)}{" "}
              {t("of", "of")} {filteredEvents.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium text-slate-300 px-3">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewView;

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Search,
  X,
  Users,
  Filter,
} from "lucide-react";
import { apiClient } from "../lib/api";
import { normalizePlayers, type PlayerApiResponse } from "../lib/players";
import {
  buildTeamPayload,
  normalizeTeams,
  type TeamApiResponse,
} from "../lib/teams";
import type {
  Team,
  TeamPlayer,
  PlayerData,
  PlayerPosition,
  PaginatedResponse,
  TechnicalStaffMember,
} from "../types";
import { getCountriesSorted } from "../lib/countries";
import { useDuplicateCheck } from "../hooks/useDuplicateCheck";
import { useChangeDetection } from "../hooks/useChangeDetection";
import { useLoading } from "../hooks/useLoading";
import DuplicateWarning from "../components/DuplicateWarning";
import ChangeConfirmation from "../components/ChangeConfirmation";
import SimilarRecordsViewer from "../components/SimilarRecordsViewer";
import { useAuthStore } from "../store/authStore";
import Pagination from "../components/Pagination";
import LoadingSpinner from "../components/LoadingSpinner";
import AutocompleteSearch from "../components/AutocompleteSearch";
import { useFormValidation } from "../hooks/useFormValidation";
import { teamSchema } from "../lib/validationSchemas";
import {
  applyBackendValidationErrors,
  resolveKnownFieldError,
} from "../lib/backendErrorUtils";

// Technical staff roles (stored in English in DB, translated in UI)
// Note: Manager and Technical Director are not included as they are leadership positions
const TECHNICAL_STAFF_ROLES = [
  "Assistant Coach",
  "Goalkeeper Coach",
  "Fitness Coach",
  "Team Doctor",
  "Physiotherapist",
  "Nutritionist",
  "Sports Psychologist",
  "Video Analyst",
  "Scout",
  "Equipment Manager",
  "Other",
] as const;

const ADMIN_LOCALES = ["en", "es"] as const;
type AdminLocale = (typeof ADMIN_LOCALES)[number];

const withTeamFormDefaults = (data?: Partial<Team>): Partial<Team> => {
  const merged = { ...(data ?? {}) };
  const localizedNames: Record<string, string> = {
    ...(merged.i18n_names ?? {}),
  };

  ADMIN_LOCALES.forEach((locale) => {
    localizedNames[locale] = localizedNames[locale] ?? "";
  });

  return {
    ...merged,
    name: merged.name ?? "",
    short_name: merged.short_name ?? "",
    country_name: merged.country_name ?? "",
    gender: merged.gender ?? "male",
    manager: merged.manager ?? {
      name: "",
      country_name: "",
      start_date: null,
    },
    managers: merged.managers ?? [],
    technical_staff: merged.technical_staff ?? [],
    i18n_names: localizedNames,
  };
};

export default function TeamsManager() {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const user = useAuthStore((state) => state.user);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const { loading, withLoading } = useLoading(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState<"male" | "female" | "">("");
  const [showForm, setShowForm] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Team | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamRoster, setTeamRoster] = useState<TeamPlayer[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<PlayerData[]>([]);
  const [rosterSearch, setRosterSearch] = useState("");
  const [availableSearch, setAvailableSearch] = useState("");
  const [availablePositionFilter, setAvailablePositionFilter] = useState<
    PlayerPosition | ""
  >("");
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [showChangeWarning, setShowChangeWarning] = useState(false);
  const [showSimilarRecords, setShowSimilarRecords] = useState(false);
  const [similarRecords, setSimilarRecords] = useState<any[] | null>(null);
  const [originalFormData, setOriginalFormData] =
    useState<Partial<Team> | null>(null);
  const currentLang = i18n.language as "en" | "es";
  const { checkDuplicates, duplicates, clearDuplicates } = useDuplicateCheck();
  const { detectChanges, changeResult, duplicateResult, clearChangeResult } =
    useChangeDetection();

  // Form validation
  const {
    validateForm,
    validateAndSetFieldError,
    clearErrors,
    getFieldError,
    setFieldError,
  } = useFormValidation<Partial<Team>>(teamSchema, t);

  const formatDeleteGuardError = (detail: unknown): string | null => {
    if (typeof detail !== "string") return null;
    const match = detail.match(/Cannot delete team with (\d+) match(?:es)?/i);
    if (match) return detail;
    return null;
  };

  const [formData, setFormData] = useState<Partial<Team>>(
    withTeamFormDefaults(),
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [rosterPage, setRosterPage] = useState(1);
  const [rosterPageSize, setRosterPageSize] = useState(20);
  const [rosterTotalItems, setRosterTotalItems] = useState(0);
  const [rosterTotalPages, setRosterTotalPages] = useState(1);
  const [rosterFormData, setRosterFormData] = useState<{
    player_id: string;
    jersey_number: number;
    position: PlayerPosition;
    is_starter: boolean;
  }>({
    player_id: "",
    jersey_number: 1,
    position: "CM",
    is_starter: false,
  });
  const [rosterFormError, setRosterFormError] = useState<string | null>(null);
  const [rosterFieldErrors, setRosterFieldErrors] = useState<
    Record<string, string>
  >({});
  const [rosterEdits, setRosterEdits] = useState<
    Record<string, Partial<TeamPlayer>>
  >({});
  const [selectedRosterIds, setSelectedRosterIds] = useState<string[]>([]);
  const [rosterBulkSaving, setRosterBulkSaving] = useState(false);
  const [rosterOriginals, setRosterOriginals] = useState<
    Record<string, TeamPlayer>
  >({});

  const asErrorMessage = (detail: any): string => {
    if (!detail) return t("errorFetchingData");
    if (typeof detail === "string") return detail;
    if (
      Array.isArray(detail) &&
      detail.length > 0 &&
      typeof detail[0]?.msg === "string"
    ) {
      return detail.map((d) => d.msg).join("; ");
    }
    if (typeof detail === "object" && detail.msg) return String(detail.msg);
    try {
      return JSON.stringify(detail);
    } catch {
      return t("errorFetchingData");
    }
  };

  const clearRosterFieldErrors = () => setRosterFieldErrors({});
  const setRosterFieldError = (field: string, message: string) => {
    setRosterFieldErrors((prev) => ({ ...prev, [field]: message }));
  };
  const clearRosterFieldError = (field: string) => {
    setRosterFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };
  const getManagerDraft = () =>
    formData.manager ?? { name: "", country_name: "", start_date: null };
  const handleRosterStringError = (detail?: string): boolean => {
    if (!detail) {
      return false;
    }
    console.warn("[TeamsManager] roster string error", detail);
    const normalized = detail.toLowerCase();
    if (normalized.includes("jersey number")) {
      setRosterFieldError("jersey_number", detail);
      setRosterFormError(t("validation.fixErrors"));
      return true;
    }
    if (normalized.includes("already in team")) {
      setRosterFieldError("player_id", detail);
      setRosterFormError(t("validation.fixErrors"));
      return true;
    }
    return false;
  };

  useEffect(() => {
    fetchTeams();
    fetchAllPlayers();
  }, [currentPage, pageSize, genderFilter, searchTerm]);

  useEffect(() => {
    if (!showRosterModal || !selectedTeam) return;
    const rosterIds = new Set(teamRoster.map((tp) => tp.player_id));
    const filtered = players.filter((p) => !rosterIds.has(p.player_id));
    setAvailablePlayers(filtered);
  }, [players, teamRoster, selectedTeam, showRosterModal]);

  const fetchTeams = async () => {
    await withLoading(async () => {
      try {
        setError(null);
        const params: any = {
          page: currentPage,
          page_size: pageSize,
        };

        if (genderFilter) {
          params.gender = genderFilter;
        }

        if (searchTerm) {
          params.search = searchTerm;
        }

        const response = await apiClient.get<
          PaginatedResponse<TeamApiResponse>
        >("/teams/", { params });
        setTeams(normalizeTeams(response.items));
        setTotalItems(response.total);
        setTotalPages(response.total_pages);
      } catch (err: any) {
        setError(err.response?.data?.detail || t("errorFetchingData"));
      }
    });
  };

  const fetchAllPlayers = async () => {
    try {
      const pageSize = 100;
      let page = 1;
      const all: PlayerData[] = [];
      let hasMore = true;

      while (hasMore) {
        const response = await apiClient.get<
          PaginatedResponse<PlayerApiResponse>
        >("/players/", {
          params: { page, page_size: pageSize },
        });
        all.push(...normalizePlayers(response.items));
        hasMore = response.items.length === pageSize;
        page += 1;
      }

      setPlayers(all);
    } catch (err: any) {
      console.error("Error fetching players:", err);
    }
  };

  const fetchTeamRoster = async (teamId: string) => {
    setRosterLoading(true);
    try {
      const params: any = {
        page: rosterPage,
        page_size: rosterPageSize,
      };

      const response = await apiClient.get<PaginatedResponse<TeamPlayer>>(
        `/teams/${teamId}/players`,
        { params },
      );
      const normalizedItems = response.items.map((tp) => ({
        ...tp,
        is_starter: tp.is_starter ?? false,
      }));
      setTeamRoster(normalizedItems);
      setRosterOriginals(
        normalizedItems.reduce<Record<string, TeamPlayer>>((acc, tp) => {
          acc[tp.player_id] = tp;
          return acc;
        }, {}),
      );
      setRosterTotalItems(response.total);
      setRosterTotalPages(response.total_pages);

      // Fetch full roster list in pages (backend may cap page_size)
      const rosterPlayerIds: string[] = [];
      let page = 1;
      const pageSize = 100; // backend caps page_size at 100
      let hasMore = true;
      while (hasMore) {
        const pageResp = await apiClient.get<PaginatedResponse<TeamPlayer>>(
          `/teams/${teamId}/players`,
          {
            params: { page, page_size: pageSize },
          },
        );
        rosterPlayerIds.push(...pageResp.items.map((tp) => tp.player_id));
        hasMore = pageResp.items.length === pageSize;
        page += 1;
      }

      const filtered = players.filter(
        (p) => !rosterPlayerIds.includes(p.player_id),
      );
      setAvailablePlayers(filtered);
      setRosterEdits({});
      setSelectedRosterIds([]);
      setRosterOriginals((prev) => prev);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(asErrorMessage(detail));
    } finally {
      setRosterLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form before submission
    if (!validateForm(formData)) {
      setError(t("validation.fixErrors"));
      return;
    }

    const backendPayload = buildTeamPayload(formData);

    // EDIT MODE: Always show changes for confirmation
    if (editingItem && editingItem.team_id) {
      // If we haven't shown the change warning yet, detect changes with duplicate check
      if (!showChangeWarning) {
        // Always clear previous result and detect fresh with combined duplicate check
        clearChangeResult();
        clearDuplicates();

        // Detect changes AND check duplicates in single API call
        const result = await detectChanges(
          "teams",
          editingItem.team_id,
          backendPayload,
          true,
        );

        // Always show change confirmation, even for small changes
        if (result && result.changes.length > 0) {
          setShowChangeWarning(true);
          return;
        } else if (result && result.changes.length === 0) {
          // No changes detected, just save
          setError(t("validation.noChangesDetected"));
          return;
        }
      }

      // After change confirmation, check if duplicates were already detected
      if (showChangeWarning && changeResult) {
        // Duplicates were already checked in combined call, just show them if found
        if (
          duplicateResult &&
          duplicateResult.has_duplicates &&
          !showSimilarRecords
        ) {
          setShowChangeWarning(false);
          setSimilarRecords(duplicateResult.duplicates ?? []);
          setShowSimilarRecords(true);
          return;
        }
      }
    }

    // CREATE MODE: Check for duplicates
    if (!editingItem) {
      const result = await checkDuplicates("teams", backendPayload);

      // Check for 100% duplicates (should be rejected automatically)
      const exactDuplicate = result.duplicates?.find(
        (d) => d.similarity_score === 1.0 || d.match_score === 100,
      );

      if (exactDuplicate) {
        setError(t("validation.exactDuplicateExists"));
        return;
      }

      // Check for similar duplicates (80%+)
      if (result.has_duplicates && !showDuplicateWarning) {
        setShowDuplicateWarning(true);
        return;
      }
    }

    await saveTeam(backendPayload);
  };

  const saveTeam = async (payloadOverride?: Record<string, unknown>) => {
    try {
      const payload = payloadOverride ?? buildTeamPayload(formData);

      if (editingItem) {
        await apiClient.put(`/teams/${editingItem.team_id}`, payload);
      } else {
        await apiClient.post("/teams/", payload);
      }
      await fetchTeams();
      handleCloseForm();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const handled = applyBackendValidationErrors(detail, {
        setFieldError,
        clearErrors,
        translate: t,
      });
      if (handled) {
        setError(t("validation.fixErrors"));
        return;
      }

      const knownFieldError = resolveKnownFieldError(detail);
      if (knownFieldError) {
        setFieldError(knownFieldError.field, t(knownFieldError.translationKey));
        setError(t("validation.fixErrors"));
        return;
      }
      if (typeof detail === "string") {
        setError(detail);
      } else {
        setError(t("errorSavingData"));
      }
    }
  };

  const handleContinueWithDuplicates = async () => {
    setShowDuplicateWarning(false);
    clearDuplicates();
    await saveTeam(buildTeamPayload(formData));
  };

  const handleCancelDuplicates = () => {
    setShowDuplicateWarning(false);
    clearDuplicates();
  };

  const handleConfirmChanges = async () => {
    // User confirmed the changes, proceed to next step (duplicate check)
    setShowChangeWarning(false);
    // Don't clear changeResult here, we need it for the duplicate check

    // Continue with the duplicate check and save flow
    await handleSubmit(new Event("submit") as any);
  };

  const handleCancelChanges = () => {
    // User canceled, reset everything
    setShowChangeWarning(false);
    clearChangeResult();
    setError(null);

    // Revert to original data
    if (originalFormData) {
      setFormData(originalFormData);
    }
  };

  const handleCloseSimilarRecords = () => {
    setShowSimilarRecords(false);
    setSimilarRecords(null);
    clearChangeResult();
  };

  const handleOpenSimilarRecord = (record: any) => {
    setShowSimilarRecords(false);
    setSimilarRecords(null);
    clearChangeResult();
    handleEdit(record);
  };

  const handleLocalizedNameChange = (locale: AdminLocale, value: string) => {
    setFormData((prev) => ({
      ...prev,
      i18n_names: {
        ...(prev.i18n_names ?? {}),
        [locale]: value,
      },
    }));
    validateAndSetFieldError(`i18n_names.${locale}`, value);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      await apiClient.delete(`/teams/${id}`);
      await fetchTeams();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const guardMessage = formatDeleteGuardError(detail);
      if (guardMessage) {
        setError(guardMessage);
        return;
      }
      setError(typeof detail === "string" ? detail : t("errorDeletingData"));
    }
  };

  const handleEdit = (item: Team) => {
    setEditingItem(item);
    const formDataToSet = withTeamFormDefaults(item);
    setFormData(formDataToSet);
    setOriginalFormData(formDataToSet); // Store original data for revert
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setShowDuplicateWarning(false);
    setShowChangeWarning(false);
    setShowSimilarRecords(false);
    setOriginalFormData(null);
    clearDuplicates();
    clearChangeResult();
    clearErrors();
    setError(null);
    setFormData(withTeamFormDefaults());
  };

  // Technical staff handlers
  const handleAddStaff = () => {
    const newStaff: TechnicalStaffMember = {
      name: "",
      role: "",
      country_name: "",
      start_date: null,
    };
    setFormData({
      ...formData,
      technical_staff: [...(formData.technical_staff || []), newStaff],
    });
  };

  const handleRemoveStaff = (index: number) => {
    const updatedStaff = [...(formData.technical_staff || [])];
    updatedStaff.splice(index, 1);
    setFormData({ ...formData, technical_staff: updatedStaff });
  };

  const handleUpdateStaff = (
    index: number,
    field: keyof TechnicalStaffMember,
    value: any,
  ) => {
    const updatedStaff = [...(formData.technical_staff || [])];
    updatedStaff[index] = { ...updatedStaff[index], [field]: value };
    setFormData({ ...formData, technical_staff: updatedStaff });
  };

  // Fetch team suggestions for autocomplete
  const fetchTeamSuggestions = async (
    query: string,
  ): Promise<TeamApiResponse[]> => {
    try {
      const response = await apiClient.get<TeamApiResponse[]>(
        "/teams/search/suggestions",
        {
          params: { q: query },
        },
      );
      return response;
    } catch (error) {
      console.error("Error fetching team suggestions:", error);
      return [];
    }
  };

  // Handle selecting an existing team from autocomplete
  const handleSelectExistingTeam = (teamData: TeamApiResponse) => {
    const normalizedTeam = normalizeTeams([teamData])[0];
    setEditingItem(normalizedTeam);
    setFormData(withTeamFormDefaults(normalizedTeam));
  };

  const handleManageRoster = async (team: Team) => {
    setSelectedTeam(team);
    clearRosterFieldErrors();
    setRosterFormError(null);
    setShowRosterModal(true);
    fetchTeamRoster(team.team_id);
  };

  const handleRosterFieldChange = (
    playerId: string,
    field: "jersey_number" | "is_starter" | "position",
    value: any,
  ) => {
    setTeamRoster((prev) =>
      prev.map((tp) =>
        tp.player_id === playerId ? { ...tp, [field]: value } : tp,
      ),
    );
    setRosterEdits((prev) => {
      const original = rosterOriginals[playerId];
      const next = { ...(prev[playerId] ?? {}), [field]: value };
      if (original && (original as any)[field] === value) {
        delete next[field];
      }
      if (original) {
        // Remove keys that match original to avoid stale diffs
        Object.keys(next).forEach((k) => {
          if ((original as any)[k] === (next as any)[k])
            delete (next as any)[k];
        });
      }
      const updatedEdits = { ...prev };
      if (Object.keys(next).length === 0) {
        delete updatedEdits[playerId];
      } else {
        updatedEdits[playerId] = next;
      }
      // Auto-select when edited; deselect if no changes remain
      setSelectedRosterIds((sel) => {
        if (Object.keys(next).length === 0)
          return sel.filter((id) => id !== playerId);
        return sel.includes(playerId) ? sel : [...sel, playerId];
      });
      return updatedEdits;
    });
  };

  const handleSaveSelectedRoster = async () => {
    if (!selectedTeam) return;
    const targets = selectedRosterIds.filter((id) => rosterEdits[id]);
    if (targets.length === 0) return;
    try {
      setRosterFormError(null);
      setRosterBulkSaving(true);
      for (const playerId of targets) {
        const payload = rosterEdits[playerId];
        if (!payload || Object.keys(payload).length === 0) continue;
        await apiClient.put(
          `/teams/${selectedTeam.team_id}/players/${playerId}`,
          payload,
        );
      }
      await fetchTeamRoster(selectedTeam.team_id);
      setSelectedRosterIds([]);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setRosterFormError(
        typeof detail === "string" ? detail : t("errorSavingData"),
      );
    } finally {
      setRosterBulkSaving(false);
    }
  };

  const handleAddPlayerToRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam) return;

    try {
      setRosterFormError(null);
      clearRosterFieldErrors();
      const payload = {
        ...rosterFormData,
        team_id: selectedTeam.team_id,
      };
      await apiClient.post(`/teams/${selectedTeam.team_id}/players`, payload);
      await fetchTeamRoster(selectedTeam.team_id);
      setRosterFormData({
        player_id: "",
        jersey_number: 1,
        position: "CM",
        is_starter: false,
      });
      clearRosterFieldErrors();
      setRosterFormError(null);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const handled = applyBackendValidationErrors(detail, {
        setFieldError: setRosterFieldError,
        clearErrors: clearRosterFieldErrors,
        translate: t,
      });
      if (handled) {
        setRosterFormError(t("validation.fixErrors"));
        return;
      }
      if (typeof detail === "string") {
        if (handleRosterStringError(detail)) {
          return;
        }
        setRosterFormError(detail);
      } else {
        setRosterFormError(asErrorMessage(detail));
      }
    }
  };

  const handleRemovePlayerFromRoster = async (playerId: string) => {
    if (!selectedTeam) return;
    if (!window.confirm(t("confirmDelete"))) return;

    try {
      await apiClient.delete(
        `/teams/${selectedTeam.team_id}/players/${playerId}`,
      );
      await fetchTeamRoster(selectedTeam.team_id);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") {
        setRosterFormError(detail);
      } else {
        setRosterFormError(t("errorDeletingData"));
      }
    }
  };

  const handleCloseRosterModal = () => {
    setShowRosterModal(false);
    setSelectedTeam(null);
    setTeamRoster([]);
    setAvailablePlayers([]);
    setRosterSearch("");
    setAvailableSearch("");
    setAvailablePositionFilter("");
    setRosterEdits({});
    setSelectedRosterIds([]);
    clearRosterFieldErrors();
    setRosterFormError(null);
  };

  const getPlayerName = (playerId: string): string => {
    const player = players.find((p) => p.player_id === playerId);
    return player?.name || playerId;
  };

  const getPositionBadgeColor = (position: PlayerPosition) => {
    // Goalkeeper
    if (position === "GK") return "bg-purple-100 text-purple-800";
    // Defenders
    if (["CB", "LB", "RB", "LWB", "RWB", "SW"].includes(position)) {
      return "bg-blue-100 text-blue-800";
    }
    // Midfielders
    if (["CDM", "CM", "CAM", "LM", "RM", "LW", "RW"].includes(position)) {
      return "bg-green-100 text-green-800";
    }
    // Forwards
    if (["CF", "ST", "LF", "RF", "SS"].includes(position)) {
      return "bg-red-100 text-red-800";
    }
    return "bg-gray-100 text-gray-800";
  };

  const filteredRoster = teamRoster.filter((tp) => {
    const query = rosterSearch.trim().toLowerCase();
    if (!query) return true;
    const name = getPlayerName(tp.player_id).toLowerCase();
    return name.includes(query) || tp.player_id.toLowerCase().includes(query);
  });

  const filteredAvailablePlayers = availablePlayers.filter((player) => {
    const query = availableSearch.trim().toLowerCase();
    const matchesQuery =
      !query ||
      player.name.toLowerCase().includes(query) ||
      player.player_id.toLowerCase().includes(query);
    const matchesPosition =
      !availablePositionFilter || player.position === availablePositionFilter;
    return matchesQuery && matchesPosition;
  });

  const filteredTeams = teams.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.country_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGender = !genderFilter || item.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  if (loading) {
    return <LoadingSpinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Shield className="h-8 w-8 text-indigo-600" />
          <h1 className="text-3xl font-bold text-gray-900">{t("teams")}</h1>
        </div>
        {user?.role === "admin" && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>{t("createTeam")}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="card grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t("common:common.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <select
            value={genderFilter}
            onChange={(e) =>
              setGenderFilter(e.target.value as "male" | "female" | "")
            }
            className="input pl-10 w-full"
          >
            <option value="">
              {t("common:common.gender")}: {t("common:common.filter")}
            </option>
            <option value="male">{t("common:common.male")}</option>
            <option value="female">{t("common:common.female")}</option>
          </select>
        </div>
      </div>

      <div className="card">
        {filteredTeams.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchTerm || genderFilter ? t("noData") : t("noTeams")}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("common:common.name")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("localizedNames")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("shortName")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("common:common.country")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("common:common.gender")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("manager")}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {t("common:common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTeams.map((item) => (
                    <tr key={item._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {item.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="space-y-1">
                          {ADMIN_LOCALES.map((locale) => (
                            <div
                              key={locale}
                              className="flex items-center text-xs"
                            >
                              <span className="font-semibold uppercase text-gray-500 mr-2">
                                {locale}
                              </span>
                              <span>{item.i18n_names?.[locale] || "-"}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {item.short_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {item.country_name}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            item.gender === "male"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-pink-100 text-pink-800"
                          }`}
                        >
                          {t(item.gender)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {item.manager?.name || "-"}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleManageRoster(item)}
                          className="text-green-600 hover:text-green-900"
                          title={t("roster")}
                        >
                          <Users className="h-5 w-5 inline" />
                        </button>
                        {user?.role === "admin" && (
                          <>
                            <button
                              onClick={() => handleEdit(item)}
                              className="text-blue-600 hover:text-blue-900"
                              title={t("common:common.edit")}
                            >
                              <Edit className="h-5 w-5 inline" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.team_id)}
                              className="text-red-600 hover:text-red-900"
                              title={t("common:common.delete")}
                            >
                              <Trash2 className="h-5 w-5 inline" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newPageSize) => {
                setPageSize(newPageSize);
                setCurrentPage(1);
              }}
            />
          </>
        )}
      </div>

      {/* Team Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-2xl font-bold">
                {editingItem ? t("common:common.edit") : t("createTeam")}
              </h2>
              <button
                onClick={handleCloseForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <form
              id="team-form"
              onSubmit={handleSubmit}
              className="p-6 space-y-4 max-h-[calc(90vh-8rem)] overflow-y-auto"
            >
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              {showChangeWarning &&
                changeResult &&
                changeResult.changes.length > 0 && (
                  <ChangeConfirmation
                    changePercentage={changeResult.change_percentage}
                    changes={changeResult.changes}
                    onConfirm={handleConfirmChanges}
                    onCancel={handleCancelChanges}
                  />
                )}
              {showDuplicateWarning &&
                duplicates &&
                duplicates.has_duplicates && (
                  <DuplicateWarning
                    duplicates={duplicates.duplicates}
                    onContinue={handleContinueWithDuplicates}
                    onCancel={handleCancelDuplicates}
                    entityType="team"
                    onViewSimilarRecords={
                      duplicates.duplicates.length > 0
                        ? () => {
                            setSimilarRecords(duplicates.duplicates);
                            setShowSimilarRecords(true);
                          }
                        : undefined
                    }
                  />
                )}
              <div>
                <AutocompleteSearch<TeamApiResponse>
                  name="name"
                  value={formData.name || ""}
                  onChange={(value) => {
                    setFormData({ ...formData, name: value });
                    validateAndSetFieldError("name", value);
                  }}
                  onSelectSuggestion={handleSelectExistingTeam}
                  fetchSuggestions={fetchTeamSuggestions}
                  getDisplayText={(team) => team.name}
                  getSecondaryText={(team) =>
                    `${team.short_name} • ${team.country_name} • ${team.gender}`
                  }
                  placeholder={t("teamNamePlaceholder")}
                  label={t("common:common.name")}
                  required
                  minChars={3}
                />
                {getFieldError("name") && (
                  <p className="mt-1 text-sm text-red-600">
                    {getFieldError("name")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {t("localizedNames")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t("localizedNamesDescription")}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ADMIN_LOCALES.map((locale) => {
                    const fieldKey = `i18n_names.${locale}`;
                    return (
                      <div key={locale}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {locale === "en"
                            ? t("localizedNameEn")
                            : t("localizedNameEs")}
                        </label>
                        <input
                          type="text"
                          maxLength={100}
                          value={formData.i18n_names?.[locale] ?? ""}
                          onChange={(e) =>
                            handleLocalizedNameChange(locale, e.target.value)
                          }
                          onBlur={(e) =>
                            validateAndSetFieldError(fieldKey, e.target.value)
                          }
                          className={`input w-full ${
                            getFieldError(fieldKey) ? "border-red-500" : ""
                          }`}
                        />
                        {getFieldError(fieldKey) && (
                          <p className="mt-1 text-sm text-red-600">
                            {getFieldError(fieldKey)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("shortName")} *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.short_name}
                    onChange={(e) => {
                      setFormData({ ...formData, short_name: e.target.value });
                      validateAndSetFieldError("short_name", e.target.value);
                    }}
                    onBlur={(e) =>
                      validateAndSetFieldError("short_name", e.target.value)
                    }
                    className={`input w-full ${
                      getFieldError("short_name") ? "border-red-500" : ""
                    }`}
                  />
                  {getFieldError("short_name") && (
                    <p className="mt-1 text-sm text-red-600">
                      {getFieldError("short_name")}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("common:common.country")} *
                  </label>
                  <select
                    required
                    value={formData.country_name}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        country_name: e.target.value,
                      });
                      validateAndSetFieldError("country_name", e.target.value);
                    }}
                    onBlur={(e) =>
                      validateAndSetFieldError("country_name", e.target.value)
                    }
                    className={`input w-full ${
                      getFieldError("country_name") ? "border-red-500" : ""
                    }`}
                  >
                    <option value="">{t("common:common.selectCountry")}</option>
                    {getCountriesSorted(currentLang).map((country) => (
                      <option key={country.en} value={country.en}>
                        {country[currentLang]}
                      </option>
                    ))}
                  </select>
                  {getFieldError("country_name") && (
                    <p className="mt-1 text-sm text-red-600">
                      {getFieldError("country_name")}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("common:common.gender")} *
                  </label>
                  <select
                    required
                    value={formData.gender}
                    onChange={(e) => {
                      const value = e.target.value as "male" | "female";
                      setFormData({ ...formData, gender: value });
                      validateAndSetFieldError("gender", value);
                    }}
                    onBlur={(e) =>
                      validateAndSetFieldError("gender", e.target.value)
                    }
                    className={`input w-full ${
                      getFieldError("gender") ? "border-red-500" : ""
                    }`}
                  >
                    <option value="male">{t("common:common.male")}</option>
                    <option value="female">{t("common:common.female")}</option>
                  </select>
                  {getFieldError("gender") && (
                    <p className="mt-1 text-sm text-red-600">
                      {getFieldError("gender")}
                    </p>
                  )}
                </div>
              </div>
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-3">{t("manager")}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t("managerName")} *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.manager?.name || ""}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          manager: {
                            ...getManagerDraft(),
                            name: e.target.value,
                          },
                        });
                        validateAndSetFieldError(
                          "manager.name",
                          e.target.value,
                        );
                      }}
                      onBlur={(e) =>
                        validateAndSetFieldError("manager.name", e.target.value)
                      }
                      className={`input w-full ${
                        getFieldError("manager.name") ? "border-red-500" : ""
                      }`}
                    />
                    {getFieldError("manager.name") && (
                      <p className="mt-1 text-sm text-red-600">
                        {getFieldError("manager.name")}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t("managerNationality")}
                    </label>
                    <select
                      value={formData.manager?.country_name || ""}
                      onChange={(e) => {
                        const value = e.target.value || "";
                        setFormData({
                          ...formData,
                          manager: {
                            ...getManagerDraft(),
                            country_name: value,
                          },
                        });
                        validateAndSetFieldError(
                          "manager.country_name",
                          value || undefined,
                        );
                      }}
                      onBlur={(e) =>
                        validateAndSetFieldError(
                          "manager.country_name",
                          e.target.value || undefined,
                        )
                      }
                      className={`input w-full ${
                        getFieldError("manager.country_name")
                          ? "border-red-500"
                          : ""
                      }`}
                    >
                      <option value="">
                        {t("common:common.selectCountry")}
                      </option>
                      {getCountriesSorted(currentLang).map((country) => (
                        <option key={country.en} value={country.en}>
                          {country[currentLang]}
                        </option>
                      ))}
                    </select>
                    {getFieldError("manager.country_name") && (
                      <p className="mt-1 text-sm text-red-600">
                        {getFieldError("manager.country_name")}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Technical Staff Section */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">
                    {t("technicalStaff")}
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddStaff}
                    className="btn btn-sm btn-secondary flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" /> {t("addStaff")}
                  </button>
                </div>
                {formData.technical_staff &&
                  formData.technical_staff.length > 0 && (
                    <div className="space-y-4">
                      {formData.technical_staff.map((staff, index) => (
                        <div
                          key={index}
                          className="border rounded-lg p-4 bg-gray-50"
                        >
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-medium text-sm text-gray-700">
                              {t("staffMember")} #{index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveStaff(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  {t("common:common.name")}
                                </label>
                                <input
                                  type="text"
                                  value={staff.name || ""}
                                  onChange={(e) =>
                                    handleUpdateStaff(
                                      index,
                                      "name",
                                      e.target.value,
                                    )
                                  }
                                  className="input w-full"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  {t("role")}
                                </label>
                                <select
                                  value={staff.role || ""}
                                  onChange={(e) =>
                                    handleUpdateStaff(
                                      index,
                                      "role",
                                      e.target.value,
                                    )
                                  }
                                  className="input w-full"
                                >
                                  <option value="">
                                    {t("rolePlaceholder")}
                                  </option>
                                  {TECHNICAL_STAFF_ROLES.map((role) => (
                                    <option key={role} value={role}>
                                      {t(`technicalStaffRoles.${role}`)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {t("common:common.country")}
                              </label>
                              <select
                                value={staff.country_name || ""}
                                onChange={(e) =>
                                  handleUpdateStaff(
                                    index,
                                    "country_name",
                                    e.target.value,
                                  )
                                }
                                className="input w-full"
                              >
                                <option value="">
                                  {t("common:common.selectCountry")}
                                </option>
                                {getCountriesSorted(currentLang).map(
                                  (country) => (
                                    <option key={country.en} value={country.en}>
                                      {country[currentLang]}
                                    </option>
                                  ),
                                )}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 sticky bottom-0 bg-white border-t border-gray-200 -mx-6 px-6 py-4">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="btn btn-secondary"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={showChangeWarning || showSimilarRecords}
                >
                  {t("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Roster Management Modal */}
      {showRosterModal && selectedTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-2xl font-bold">
                {t("roster")} - {selectedTeam.name}
              </h2>
              <button
                onClick={handleCloseRosterModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <div className="lg:col-span-2 bg-gradient-to-r from-indigo-600 to-blue-500 text-white rounded-2xl p-5 shadow-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-90">{t("roster")}</p>
                    <p className="text-3xl font-semibold">
                      {rosterTotalItems} {t("players")}
                    </p>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-sm text-gray-700 font-semibold flex items-center gap-2">
                    <Search className="h-4 w-4 text-gray-400" />{" "}
                    {t("common:common.search")}
                  </p>
                  <div className="flex items-center mt-2 space-x-2">
                    <input
                      type="text"
                      data-testid="roster-search-input"
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      placeholder={t("common:common.search")}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Current Roster */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">
                      {t("starters")} ({filteredRoster.length})
                    </h3>
                    {rosterSearch && (
                      <span className="text-sm text-gray-500">
                        {filteredRoster.length} {t("common:common.matches")}
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-xs btn-primary"
                        onClick={handleSaveSelectedRoster}
                        disabled={
                          selectedRosterIds.length === 0 || rosterBulkSaving
                        }
                      >
                        {rosterBulkSaving
                          ? t("common:common.saving")
                          : t("common:common.save")}{" "}
                        ({selectedRosterIds.length})
                      </button>
                    </div>
                  </div>
                  {rosterLoading ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner size="md" />
                    </div>
                  ) : filteredRoster.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      {t("noPlayers")}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {filteredRoster.map((tp) => (
                          <div
                            key={tp.player_id}
                            data-testid={`roster-row-${tp.player_id}`}
                            className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm"
                          >
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center space-x-3">
                                <input
                                  type="number"
                                  data-testid={`roster-jersey-${tp.player_id}`}
                                  className="w-20 input"
                                  min={1}
                                  max={99}
                                  value={tp.jersey_number}
                                  onChange={(e) =>
                                    handleRosterFieldChange(
                                      tp.player_id,
                                      "jersey_number",
                                      parseInt(e.target.value, 10),
                                    )
                                  }
                                />
                                <div className="flex flex-col">
                                  <span className="font-semibold text-gray-900">
                                    {getPlayerName(tp.player_id)}
                                  </span>
                                  <div className="flex items-center space-x-2">
                                    <span
                                      className={`px-2 py-1 rounded text-xs font-medium ${getPositionBadgeColor(
                                        tp.position,
                                      )}`}
                                    >
                                      {t(`positions.${tp.position}`)}
                                    </span>
                                    <label className="inline-flex items-center space-x-2 text-xs font-medium text-gray-700">
                                      <input
                                        type="checkbox"
                                        data-testid={`roster-starter-${tp.player_id}`}
                                        checked={tp.is_starter ?? false}
                                        onChange={(e) =>
                                          handleRosterFieldChange(
                                            tp.player_id,
                                            "is_starter",
                                            e.target.checked,
                                          )
                                        }
                                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                      />
                                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                                        Titular
                                      </span>
                                    </label>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() =>
                                  handleRemovePlayerFromRoster(tp.player_id)
                                }
                                className="text-red-500 hover:text-red-700"
                                title={t("removeFromRoster")}
                                data-testid={`roster-remove-${tp.player_id}`}
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4">
                        <Pagination
                          currentPage={rosterPage}
                          totalPages={rosterTotalPages}
                          totalItems={rosterTotalItems}
                          pageSize={rosterPageSize}
                          onPageChange={(page) => {
                            setRosterPage(page);
                            if (selectedTeam) {
                              fetchTeamRoster(selectedTeam.team_id);
                            }
                          }}
                          onPageSizeChange={(newPageSize) => {
                            setRosterPageSize(newPageSize);
                            setRosterPage(1);
                            if (selectedTeam) {
                              fetchTeamRoster(selectedTeam.team_id);
                            }
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Add Player Form */}
                <div>
                  <h3 className="text-lg font-semibold mb-2">
                    {t("addToRoster")}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        data-testid="roster-available-search-input"
                        value={availableSearch}
                        onChange={(e) => setAvailableSearch(e.target.value)}
                        placeholder={t("common:common.search")}
                        className="input w-full pl-9"
                      />
                    </div>
                    <select
                      data-testid="roster-available-position-filter"
                      value={availablePositionFilter}
                      onChange={(e) =>
                        setAvailablePositionFilter(
                          e.target.value as PlayerPosition | "",
                        )
                      }
                      className="input w-full"
                    >
                      <option value="">
                        {t("position")} — {t("common:common.filter")}
                      </option>
                      <option value="GK">{t("positions.GK")}</option>
                      <option value="CB">{t("positions.CB")}</option>
                      <option value="LB">{t("positions.LB")}</option>
                      <option value="RB">{t("positions.RB")}</option>
                      <option value="LWB">{t("positions.LWB")}</option>
                      <option value="RWB">{t("positions.RWB")}</option>
                      <option value="SW">{t("positions.SW")}</option>
                      <option value="CDM">{t("positions.CDM")}</option>
                      <option value="CM">{t("positions.CM")}</option>
                      <option value="CAM">{t("positions.CAM")}</option>
                      <option value="LM">{t("positions.LM")}</option>
                      <option value="RM">{t("positions.RM")}</option>
                      <option value="LW">{t("positions.LW")}</option>
                      <option value="RW">{t("positions.RW")}</option>
                      <option value="CF">{t("positions.CF")}</option>
                      <option value="ST">{t("positions.ST")}</option>
                      <option value="LF">{t("positions.LF")}</option>
                      <option value="RF">{t("positions.RF")}</option>
                      <option value="SS">{t("positions.SS")}</option>
                    </select>
                  </div>
                  <form
                    onSubmit={handleAddPlayerToRoster}
                    className="space-y-4"
                  >
                    {rosterFormError && (
                      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                        {rosterFormError}
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t("players")} *
                      </label>
                      <select
                        required
                        data-testid="roster-available-player-select"
                        value={rosterFormData.player_id}
                        onChange={(e) => {
                          clearRosterFieldError("player_id");
                          const nextPlayerId = e.target.value;
                          const selectedPlayer = availablePlayers.find(
                            (p) => p.player_id === nextPlayerId,
                          );
                          setRosterFormData({
                            ...rosterFormData,
                            player_id: nextPlayerId,
                            position:
                              (selectedPlayer?.position as PlayerPosition) ||
                              rosterFormData.position,
                          });
                        }}
                        className={`input w-full ${
                          rosterFieldErrors.player_id ? "border-red-500" : ""
                        }`}
                      >
                        <option value="">{t("selectPlayers")}</option>
                        {filteredAvailablePlayers.map((player) => (
                          <option
                            key={player.player_id}
                            value={player.player_id}
                          >
                            {player.name} - {t(`positions.${player.position}`)}
                          </option>
                        ))}
                      </select>
                      {rosterFieldErrors.player_id && (
                        <p className="mt-1 text-sm text-red-600">
                          {rosterFieldErrors.player_id}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t("jerseyNumber")} *
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          max="99"
                          value={rosterFormData.jersey_number}
                          onChange={(e) => {
                            clearRosterFieldError("jersey_number");
                            const nextNumber = parseInt(e.target.value);
                            setRosterFormData({
                              ...rosterFormData,
                              jersey_number: nextNumber,
                            });
                          }}
                          className={`input w-full ${
                            rosterFieldErrors.jersey_number
                              ? "border-red-500"
                              : ""
                          }`}
                        />
                        {rosterFieldErrors.jersey_number && (
                          <p className="mt-1 text-sm text-red-600">
                            {rosterFieldErrors.jersey_number}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t("position")} *
                        </label>
                        <select
                          required
                          value={rosterFormData.position}
                          onChange={(e) => {
                            clearRosterFieldError("position");
                            setRosterFormData({
                              ...rosterFormData,
                              position: e.target.value as PlayerPosition,
                            });
                          }}
                          className={`input w-full ${
                            rosterFieldErrors.position ? "border-red-500" : ""
                          }`}
                        >
                          <optgroup label={t("positionGroups.goalkeeper")}>
                            <option value="GK">{t("positions.GK")}</option>
                          </optgroup>
                          <optgroup label={t("positionGroups.defenders")}>
                            <option value="CB">{t("positions.CB")}</option>
                            <option value="LB">{t("positions.LB")}</option>
                            <option value="RB">{t("positions.RB")}</option>
                            <option value="LWB">{t("positions.LWB")}</option>
                            <option value="RWB">{t("positions.RWB")}</option>
                            <option value="SW">{t("positions.SW")}</option>
                          </optgroup>
                          <optgroup label={t("positionGroups.midfielders")}>
                            <option value="CDM">{t("positions.CDM")}</option>
                            <option value="CM">{t("positions.CM")}</option>
                            <option value="CAM">{t("positions.CAM")}</option>
                            <option value="LM">{t("positions.LM")}</option>
                            <option value="RM">{t("positions.RM")}</option>
                            <option value="LW">{t("positions.LW")}</option>
                            <option value="RW">{t("positions.RW")}</option>
                          </optgroup>
                          <optgroup label={t("positionGroups.forwards")}>
                            <option value="CF">{t("positions.CF")}</option>
                            <option value="ST">{t("positions.ST")}</option>
                            <option value="LF">{t("positions.LF")}</option>
                            <option value="RF">{t("positions.RF")}</option>
                            <option value="SS">{t("positions.SS")}</option>
                          </optgroup>
                        </select>
                        {rosterFieldErrors.position && (
                          <p className="mt-1 text-sm text-red-600">
                            {rosterFieldErrors.position}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="is_starter"
                        checked={rosterFormData.is_starter}
                        onChange={(e) =>
                          setRosterFormData({
                            ...rosterFormData,
                            is_starter: e.target.checked,
                          })
                        }
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label
                        htmlFor="is_starter"
                        className="ml-2 block text-sm text-gray-900"
                      >
                        Titular
                      </label>
                    </div>
                    <button type="submit" className="btn btn-primary w-full">
                      <Plus className="h-5 w-5 inline mr-2" />
                      {t("addToRoster")}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Similar Records Viewer Modal */}
      {showSimilarRecords && similarRecords && similarRecords.length > 0 && (
        <SimilarRecordsViewer
          records={similarRecords}
          currentData={formData}
          entityType="team"
          onClose={handleCloseSimilarRecords}
          onOpenRecord={handleOpenSimilarRecord}
        />
      )}
    </div>
  );
}

// End of TeamsManager component

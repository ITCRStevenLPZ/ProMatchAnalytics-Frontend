import type { IneffectiveAction } from "../../types";

const INEFFECTIVE_ACTION_OPTIONS: {
  value: IneffectiveAction;
  labelKey: string;
  fallback: string;
  isNeutral?: boolean;
}[] = [
  { value: "Goal", labelKey: "ineffectiveReasonGoal", fallback: "Goal" },
  {
    value: "OutOfBounds",
    labelKey: "ineffectiveReasonOutOfBounds",
    fallback: "Out of Bounds",
  },
  { value: "Card", labelKey: "ineffectiveReasonCard", fallback: "Card" },
  { value: "Foul", labelKey: "ineffectiveReasonFoul", fallback: "Foul" },
  {
    value: "Offside",
    labelKey: "ineffectiveReasonOffside",
    fallback: "Offside",
  },
  {
    value: "Substitution",
    labelKey: "ineffectiveReasonSubstitution",
    fallback: "Substitution",
  },
  {
    value: "Injury",
    labelKey: "ineffectiveReasonInjury",
    fallback: "Injury",
  },
  {
    value: "VAR",
    labelKey: "ineffectiveReasonVAR",
    fallback: "VAR",
    isNeutral: true,
  },
  {
    value: "Referee",
    labelKey: "ineffectiveReasonReferee",
    fallback: "Referee (Neutral)",
    isNeutral: true,
  },
  { value: "Other", labelKey: "ineffectiveReasonOther", fallback: "Other" },
];

interface IneffectiveNoteModalProps {
  open: boolean;
  ineffectiveActionType: string;
  ineffectiveTeamSelection: "home" | "away";
  ineffectiveActionDropdownOpen: boolean;
  ineffectiveTeamDropdownOpen: boolean;
  ineffectiveNoteText: string;
  manualHomeTeamLabel: string;
  manualAwayTeamLabel: string;
  setIneffectiveActionDropdownOpen: (
    open: boolean | ((prev: boolean) => boolean),
  ) => void;
  setIneffectiveTeamDropdownOpen: (
    open: boolean | ((prev: boolean) => boolean),
  ) => void;
  setIneffectiveActionType: (value: any) => void;
  setIneffectiveTeamSelection: (value: "home" | "away") => void;
  setIneffectiveNoteText: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  t: any;
}

export default function IneffectiveNoteModal({
  open,
  ineffectiveActionType,
  ineffectiveTeamSelection,
  ineffectiveActionDropdownOpen,
  ineffectiveTeamDropdownOpen,
  ineffectiveNoteText,
  manualHomeTeamLabel,
  manualAwayTeamLabel,
  setIneffectiveActionDropdownOpen,
  setIneffectiveTeamDropdownOpen,
  setIneffectiveActionType,
  setIneffectiveTeamSelection,
  setIneffectiveNoteText,
  onCancel,
  onConfirm,
  t,
}: IneffectiveNoteModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl"
        data-testid="ineffective-note-modal"
      >
        <h3 className="text-lg font-bold mb-3 text-black">
          {t("ineffectiveNoteTitle", "Ineffective time note")}
        </h3>
        <p className="text-sm text-black mb-3">
          {t(
            "ineffectiveNoteHelp",
            "Add a note for why effective time stopped.",
          )}
        </p>
        <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1">
          {t("ineffectiveReasonLabel", "Ineffective reason")}
        </label>
        <div className="relative mb-3">
          <button
            type="button"
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-left text-black bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="ineffective-note-action"
            onClick={() => {
              setIneffectiveActionDropdownOpen((prev) => !prev);
              setIneffectiveTeamDropdownOpen(false);
            }}
          >
            {(() => {
              const opt = INEFFECTIVE_ACTION_OPTIONS.find(
                (o) => o.value === ineffectiveActionType,
              );
              return opt
                ? t(opt.labelKey, opt.fallback)
                : ineffectiveActionType;
            })()}
          </button>
          {ineffectiveActionDropdownOpen && (
            <div
              className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
              data-testid="ineffective-note-action-menu"
            >
              {INEFFECTIVE_ACTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`w-full px-3 py-2 text-left text-black hover:bg-slate-100 ${
                    ineffectiveActionType === opt.value
                      ? "bg-amber-50 font-semibold"
                      : ""
                  }`}
                  data-testid={`ineffective-note-action-option-${opt.value}`}
                  onClick={() => {
                    setIneffectiveActionType(opt.value);
                    setIneffectiveActionDropdownOpen(false);
                  }}
                >
                  {t(opt.labelKey, opt.fallback)}
                  {opt.isNeutral && (
                    <span className="ml-2 text-xs text-slate-400">
                      {t("neutral", "neutral")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1">
          {t("ineffectiveTeamLabel", "Team")}
        </label>
        <div className="relative mb-3">
          <button
            type="button"
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-left text-black bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="ineffective-note-team"
            onClick={() => {
              setIneffectiveTeamDropdownOpen((prev) => !prev);
              setIneffectiveActionDropdownOpen(false);
            }}
          >
            {ineffectiveTeamSelection === "home"
              ? manualHomeTeamLabel
              : manualAwayTeamLabel}
          </button>
          {ineffectiveTeamDropdownOpen && (
            <div
              className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-md shadow-lg"
              data-testid="ineffective-note-team-menu"
            >
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-black hover:bg-slate-100"
                data-testid="ineffective-note-team-option-home"
                onClick={() => {
                  setIneffectiveTeamSelection("home");
                  setIneffectiveTeamDropdownOpen(false);
                }}
              >
                {manualHomeTeamLabel}
              </button>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-black hover:bg-slate-100"
                data-testid="ineffective-note-team-option-away"
                onClick={() => {
                  setIneffectiveTeamSelection("away");
                  setIneffectiveTeamDropdownOpen(false);
                }}
              >
                {manualAwayTeamLabel}
              </button>
            </div>
          )}
        </div>

        <textarea
          value={ineffectiveNoteText}
          onChange={(e) => setIneffectiveNoteText(e.target.value)}
          data-testid="ineffective-note-input"
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-black placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          placeholder={t("notesPlaceholder", "Add a note...")}
          rows={3}
          autoFocus
        />

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onCancel}
            data-testid="ineffective-note-cancel"
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
          >
            {t("cancel", "Cancel")}
          </button>
          <button
            onClick={onConfirm}
            data-testid="ineffective-note-save"
            className="px-4 py-2 bg-amber-600 text-white hover:bg-amber-700 rounded"
          >
            {t("save", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

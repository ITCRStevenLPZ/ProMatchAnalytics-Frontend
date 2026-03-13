import { Flag, ShieldAlert } from "../../../../components/icons";

interface RefereeActionBarProps {
  disabled: boolean;
  switchDisabled?: boolean;
  onActionSelect: (actionId: string) => void;
  hasActiveIneffective?: boolean;
  ineffectiveTeamLabel?: string;
  onSwitchIneffectiveTeam?: () => void;
  t: any;
}

const REFEREE_ACTIONS = [
  {
    id: "interference",
    labelKey: "refereeActionInterference",
    fallback: "Ball hits referee / interference",
  },
  {
    id: "discussion",
    labelKey: "refereeActionDiscussion",
    fallback: "Referee discussion / explanation",
  },
  {
    id: "injury",
    labelKey: "refereeActionInjury",
    fallback: "Referee injury",
  },
  {
    id: "equipment",
    labelKey: "refereeActionEquipment",
    fallback: "Equipment / communication issue",
  },
];

export default function RefereeActionBar({
  disabled,
  switchDisabled = false,
  onActionSelect,
  hasActiveIneffective = false,
  ineffectiveTeamLabel,
  onSwitchIneffectiveTeam,
  t,
}: RefereeActionBarProps) {
  return (
    <section
      className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3 shadow-lg shadow-slate-950/20"
      data-testid="referee-action-bar"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-300">
            <Flag size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">
                {t("refereeNeutralBarTitle", "Referee")}
              </span>
              <span className="rounded-full border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                {t("neutral", "Neutral")}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {t(
                "refereeNeutralBarHelp",
                "Trigger neutral ineffective time for referee interruptions.",
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <button
            type="button"
            data-testid="referee-switch-ineffective-team"
            onClick={onSwitchIneffectiveTeam}
            disabled={
              switchDisabled ||
              !hasActiveIneffective ||
              !onSwitchIneffectiveTeam
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2 text-left text-xs font-semibold text-orange-100 transition-colors hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">↔</span>
            <span>
              {t("switchTeam", "Switch Team")}
              {ineffectiveTeamLabel ? ` (${ineffectiveTeamLabel})` : ""}
            </span>
          </button>
          {REFEREE_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              data-testid={`referee-action-${action.id}`}
              onClick={() => onActionSelect(action.id)}
              disabled={disabled}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-left text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldAlert size={14} />
              <span>{t(action.labelKey, action.fallback)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

import { AlertCircle } from "lucide-react";
import { TFunction } from "i18next";
import { ActionStep, Player } from "../types";

interface InstructionBannerProps {
  t: TFunction<"logger">;
  currentStep: ActionStep;
  selectedPlayer: Player | null;
  selectedAction: string | null;
  cardSelection?: string | null;
}

const InstructionBanner = ({
  t,
  currentStep,
  selectedPlayer,
  selectedAction,
  cardSelection,
}: InstructionBannerProps) => (
  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
    <div className="flex items-start gap-2">
      <AlertCircle className="text-blue-400 mt-0.5" size={20} />
      <div className="text-sm text-blue-200">
        {cardSelection &&
          t("instructionSelectCardPlayer", {
            card: cardSelection,
          })}
        {!cardSelection &&
          currentStep === "selectPlayer" &&
          t("instructionSelectPlayer")}
        {!cardSelection &&
          currentStep === "selectQuickAction" &&
          t("instructionSelectQuickAction", {
            player: selectedPlayer?.full_name,
          })}
        {!cardSelection &&
          currentStep === "selectDestination" &&
          t("instructionSelectDestination", {
            action: selectedAction,
          })}
        {!cardSelection &&
          currentStep === "selectAction" &&
          t("instructionSelectAction", { player: selectedPlayer?.full_name })}
        {!cardSelection &&
          currentStep === "selectOutcome" &&
          t("instructionSelectOutcome", { action: selectedAction })}
        {!cardSelection &&
          currentStep === "selectRecipient" &&
          t("instructionSelectRecipient")}
      </div>
    </div>
  </div>
);

export default InstructionBanner;

import { AlertCircle } from "lucide-react";
import { TFunction } from "i18next";
import { ActionStep, Player } from "../types";

interface InstructionBannerProps {
  t: TFunction<"logger">;
  currentStep: ActionStep;
  selectedPlayer: Player | null;
  selectedAction: string | null;
}

const InstructionBanner = ({
  t,
  currentStep,
  selectedPlayer,
  selectedAction,
}: InstructionBannerProps) => (
  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
    <div className="flex items-start gap-2">
      <AlertCircle className="text-blue-400 mt-0.5" size={20} />
      <div className="text-sm text-blue-200">
        {currentStep === "selectPlayer" && t("instructionSelectPlayer")}
        {currentStep === "selectQuickAction" &&
          t("instructionSelectQuickAction", {
            player: selectedPlayer?.full_name,
          })}
        {currentStep === "selectDestination" &&
          t("instructionSelectDestination", {
            action: selectedAction,
          })}
        {currentStep === "selectAction" &&
          t("instructionSelectAction", { player: selectedPlayer?.full_name })}
        {currentStep === "selectOutcome" &&
          t("instructionSelectOutcome", { action: selectedAction })}
        {currentStep === "selectRecipient" && t("instructionSelectRecipient")}
      </div>
    </div>
  </div>
);

export default InstructionBanner;

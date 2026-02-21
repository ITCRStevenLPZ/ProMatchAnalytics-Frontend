import React from "react";
import { Coffee, Play } from "lucide-react";

interface HalftimePanelProps {
  onStartSecondHalf: () => void;
  t: any;
}

export const HalftimePanel: React.FC<HalftimePanelProps> = ({
  onStartSecondHalf,
  t,
}) => {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-6 shadow-lg">
      <div className="flex items-center justify-center mb-4">
        <div className="bg-blue-100 p-3 rounded-full">
          <Coffee size={32} className="text-blue-600" />
        </div>
      </div>

      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-blue-900 mb-2">
          {t("halftime.title", "Halftime Break")}
        </h2>
        <p className="text-sm text-blue-700">
          {t(
            "halftime.description",
            "Halftime break. Start the second half when ready.",
          )}
        </p>
      </div>

      <button
        onClick={onStartSecondHalf}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-base font-bold rounded-lg transition-all shadow-md hover:shadow-lg transform hover:scale-[1.02]"
      >
        <Play size={20} />
        {t("halftime.startSecondHalf", "Start Second Half")}
      </button>

      <p className="text-xs text-center text-gray-600 mt-4">
        {t(
          "halftime.hint",
          "This will resume effective time and restart the match clock.",
        )}
      </p>
    </div>
  );
};

export default HalftimePanel;

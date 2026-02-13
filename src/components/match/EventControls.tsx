import React from "react";
import { Flag, CreditCard, Activity, UserPlus } from "lucide-react";

interface EventControlsProps {
  onEvent: (type: string, data?: any) => void;
  disabled?: boolean;
}

export const EventControls: React.FC<EventControlsProps> = ({
  onEvent,
  disabled,
}) => {
  const eventTypes = [
    {
      type: "Goal",
      label: "Goal",
      icon: Activity,
      color: "bg-green-600 hover:bg-green-700 text-white",
    },
    {
      type: "Foul",
      label: "Foul",
      icon: Flag,
      color: "bg-orange-500 hover:bg-orange-600 text-white",
    },
    {
      type: "Yellow Card",
      label: "Yellow Card",
      icon: CreditCard,
      color: "bg-yellow-400 hover:bg-yellow-500 text-black",
    },
    {
      type: "Red Card",
      label: "Red Card",
      icon: CreditCard,
      color: "bg-red-600 hover:bg-red-700 text-white",
    },
    {
      type: "Substitution",
      label: "Sub",
      icon: UserPlus,
      color: "bg-blue-500 hover:bg-blue-600 text-white",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {eventTypes.map((evt) => (
        <button
          key={evt.type}
          onClick={() => onEvent(evt.type)}
          disabled={disabled}
          className={`${evt.color} p-4 rounded-lg shadow-sm flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <evt.icon size={24} />
          <span className="font-semibold">{evt.label}</span>
        </button>
      ))}
    </div>
  );
};

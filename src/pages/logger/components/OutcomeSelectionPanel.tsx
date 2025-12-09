import { TFunction } from 'i18next';

interface OutcomeSelectionPanelProps {
  selectedAction: string | null;
  outcomes: string[];
  isSubmitting: boolean;
  onOutcomeSelect: (outcome: string) => void;
  onCancel: () => void;
  t: TFunction<'logger'>;
}

const OutcomeSelectionPanel = ({
  selectedAction,
  outcomes,
  isSubmitting,
  onOutcomeSelect,
  onCancel,
  t,
}: OutcomeSelectionPanelProps) => (
  <div className="bg-white rounded-lg shadow p-6">
    <h2 className="text-lg font-semibold mb-4">
      {t('selectOutcome')} - {selectedAction}
    </h2>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {outcomes.map((outcome, idx) => (
        <button
          key={outcome}
          onClick={() => onOutcomeSelect(outcome)}
          disabled={isSubmitting}
          data-testid={`outcome-btn-${outcome}`}
          className={`py-4 rounded-lg font-medium transition-colors ${
            isSubmitting
              ? 'bg-green-300 text-white cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {t(`outcome${outcome}`)}
          <span className="block text-xs opacity-60 font-mono mt-1">
            [{idx + 1}]
          </span>
        </button>
      ))}
      <button
        onClick={onCancel}
        className="py-4 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium transition-colors"
      >
        {t('cancel')}
      </button>
    </div>
  </div>
);

export default OutcomeSelectionPanel;

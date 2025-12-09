import { TFunction } from 'i18next';
import { Player, Team } from '../types';

interface RecipientSelectionPanelProps {
  team?: Team;
  selectedAction: string | null;
  isSubmitting: boolean;
  onRecipientSelect: (player: Player) => void;
  onCancel: () => void;
  t: TFunction<'logger'>;
}

const RecipientSelectionPanel = ({
  team,
  selectedAction,
  isSubmitting,
  onRecipientSelect,
  onCancel,
  t,
}: RecipientSelectionPanelProps) => {
  console.log('[RecipientSelectionPanel] Rendering with:', { 
    teamExists: !!team, 
    teamName: team?.name,
    playersCount: team?.players?.length,
    selectedAction 
  });
  
  if (!team) {
    console.warn('[RecipientSelectionPanel] team is undefined, not rendering');
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">
        {t('selectRecipient')} - {selectedAction}
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {team.players.map((player) => (
          <button
            key={player.id}
            onClick={() => onRecipientSelect(player)}
            disabled={isSubmitting}
            data-testid={`recipient-card-${player.id}`}
            className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-colors ${
              isSubmitting
                ? 'bg-purple-300 text-white cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            <div className="text-3xl font-bold">{player.jersey_number}</div>
            <div className="text-xs text-center px-1 mt-1 line-clamp-2">{player.full_name}</div>
          </button>
        ))}
        <button
          onClick={onCancel}
          className="aspect-square bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg flex items-center justify-center font-medium"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
};

export default RecipientSelectionPanel;

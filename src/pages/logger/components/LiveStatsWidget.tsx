import React, { useMemo } from 'react';
import { TFunction } from 'i18next';
import { MatchEvent } from '../../../store/useMatchLogStore';
import { Match } from '../types';

interface LiveStatsWidgetProps {
  events: MatchEvent[];
  match: Match | null;
  t: TFunction<'logger'>;
}

interface TeamStats {
  passes: number;
  passesComplete: number;
  shots: number;
  shotsOnTarget: number;
  fouls: number;
  corners: number;
  offsides: number;
}

const calculateTeamStats = (events: MatchEvent[], teamId: string): TeamStats => {
  const teamEvents = events.filter(e => e.team_id === teamId);
  
  return {
    passes: teamEvents.filter(e => e.type === 'Pass').length,
    passesComplete: teamEvents.filter(e => 
      e.type === 'Pass' && e.data?.outcome?.toLowerCase() === 'complete'
    ).length,
    shots: teamEvents.filter(e => e.type === 'Shot').length,
    shotsOnTarget: teamEvents.filter(e => 
      e.type === 'Shot' && ['goal', 'ontarget', 'saved'].includes(e.data?.outcome?.toLowerCase() || '')
    ).length,
    fouls: teamEvents.filter(e => e.type === 'FoulCommitted').length,
    corners: teamEvents.filter(e => 
      e.type === 'SetPiece' && e.data?.set_piece_type === 'Corner'
    ).length,
    offsides: teamEvents.filter(e => e.type === 'Offside').length,
  };
};

const StatBar: React.FC<{ 
  homeValue: number; 
  awayValue: number; 
  label: string;
  homeColor?: string;
  awayColor?: string;
}> = ({ 
  homeValue, 
  awayValue, 
  label,
  homeColor = 'bg-red-500',
  awayColor = 'bg-blue-500',
}) => {
  const total = homeValue + awayValue;
  const homePercent = total > 0 ? (homeValue / total) * 100 : 50;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-bold text-gray-800">{homeValue}</span>
        <span className="text-gray-500 font-medium">{label}</span>
        <span className="font-bold text-gray-800">{awayValue}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
        <div 
          className={`${homeColor} transition-all duration-500`}
          style={{ width: `${homePercent}%` }}
        />
        <div 
          className={`${awayColor} transition-all duration-500`}
          style={{ width: `${100 - homePercent}%` }}
        />
      </div>
    </div>
  );
};

const LiveStatsWidget: React.FC<LiveStatsWidgetProps> = ({
  events,
  match,
  t,
}) => {
  const stats = useMemo(() => {
    if (!match) return null;
    
    const homeStats = calculateTeamStats(events, match.home_team.id);
    const awayStats = calculateTeamStats(events, match.away_team.id);
    
    // Simple possession estimate based on pass volume
    const totalPasses = homeStats.passes + awayStats.passes;
    const possessionHome = totalPasses > 0 
      ? Math.round((homeStats.passes / totalPasses) * 100)
      : 50;
    
    return {
      home: homeStats,
      away: awayStats,
      possessionHome,
      possessionAway: 100 - possessionHome,
    };
  }, [events, match]);

  if (!match || !stats) {
    return null;
  }

  return (
    <div 
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"
      data-testid="live-stats-widget"
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-3 pb-2 border-b">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="font-semibold text-sm text-gray-800">
            {match.home_team.short_name}
          </span>
        </div>
        <span className="text-xs text-gray-500 font-medium uppercase">
          {t('liveStats', 'Live Stats')}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-800">
            {match.away_team.short_name}
          </span>
          <div className="w-3 h-3 rounded-full bg-blue-500" />
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-3">
        <StatBar 
          homeValue={stats.possessionHome} 
          awayValue={stats.possessionAway} 
          label={t('possession', 'Possession %')}
        />
        <StatBar 
          homeValue={stats.home.shots} 
          awayValue={stats.away.shots} 
          label={t('shots', 'Shots')}
        />
        <StatBar 
          homeValue={stats.home.shotsOnTarget} 
          awayValue={stats.away.shotsOnTarget} 
          label={t('shotsOnTarget', 'On Target')}
        />
        <StatBar 
          homeValue={stats.home.passes} 
          awayValue={stats.away.passes} 
          label={t('passes', 'Passes')}
        />
        <StatBar 
          homeValue={stats.home.fouls} 
          awayValue={stats.away.fouls} 
          label={t('fouls', 'Fouls')}
        />
        <StatBar 
          homeValue={stats.home.corners} 
          awayValue={stats.away.corners} 
          label={t('corners', 'Corners')}
        />
      </div>

      {/* Event Count */}
      <div className="mt-3 pt-2 border-t text-center">
        <span className="text-xs text-gray-500">
          {events.length} {t('eventsLogged', 'events logged')}
        </span>
      </div>
    </div>
  );
};

export default LiveStatsWidget;

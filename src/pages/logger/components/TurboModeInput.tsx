import React, { useState, useEffect } from 'react';
import { TFunction } from 'i18next';
import { 
  Zap, Check, X, ArrowRight, HelpCircle, AlertTriangle, 
  Home, Plane, BookOpen, ChevronDown, ChevronUp 
} from 'lucide-react';
import { TurboParseResult, getTurboPreview, checkDuplicateJerseys, TURBO_OUTCOME_CODES } from '../hooks/useTurboMode';
import type { Match } from '../types';

interface TurboModeInputProps {
  enabled: boolean;
  buffer: string;
  parseResult: TurboParseResult | null;
  match: Match | null;
  isProcessing: boolean;
  payloadPreview?: string;
  safetyWarning?: string | null;
  missingRecipient?: boolean;
  onInputChange: (value: string) => void;
  onExecute: () => void;
  onClear: () => void;
  onToggle: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  t: TFunction<'logger'>;
}

const TurboModeInput: React.FC<TurboModeInputProps> = ({
  enabled,
  buffer,
  parseResult,
  match,
  isProcessing,
  payloadPreview,
  safetyWarning,
  missingRecipient,
  onInputChange,
  onExecute,
  onClear,
  onToggle,
  inputRef,
  t,
}) => {
  const preview = getTurboPreview(parseResult, match);
  const isValid = parseResult?.valid ?? false;
  const canExecute = isValid && buffer.length >= 2 && !isProcessing && !missingRecipient;
  const duplicateJerseys = checkDuplicateJerseys(match);
  const needsTeamPrefix = parseResult?.needsTeamPrefix ?? false;
  const [showFullTutorial, setShowFullTutorial] = useState(false);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Backtick toggles turbo mode
      if (e.key === '`') {
        e.preventDefault();
        onToggle();
        return;
      }
      
      // If turbo mode is enabled and focused on input
      if (enabled && document.activeElement === inputRef.current) {
        if (e.key === 'Enter' && canExecute) {
          e.preventDefault();
          onExecute();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onClear();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, canExecute, onToggle, onExecute, onClear, inputRef]);

  // Auto-focus when enabled
  useEffect(() => {
    if (enabled) {
      inputRef.current?.focus();
    }
  }, [enabled, inputRef]);

  // Generate suggestions based on current state
  const getSuggestions = (): string[] => {
    if (!parseResult) return [];
    const suggestions: string[] = [];

    // If needs team prefix, suggest that first
    if (needsTeamPrefix && !parseResult.teamPrefix && parseResult.jerseyNumber) {
      suggestions.push(`h${parseResult.jerseyNumber}... (home)`);
      suggestions.push(`a${parseResult.jerseyNumber}... (away)`);
      return suggestions;
    }

    // If has action but no outcome, suggest outcomes
    if (parseResult.action && !parseResult.outcome) {
      const outcomes = TURBO_OUTCOME_CODES[parseResult.action];
      if (outcomes) {
        Object.entries(outcomes).forEach(([num, label]) => {
          suggestions.push(`${buffer}${num} (${label})`);
        });
      }
    }

    return suggestions.slice(0, 4);
  };

  const suggestions = getSuggestions();

  if (!enabled) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
        title={t('turbo.enableTitle', 'Enable Turbo Mode [`]')}
      >
        <Zap size={16} className="text-yellow-400" />
        <span className="text-sm font-medium">{t('turbo.label', 'Turbo')}</span>
        <kbd className="text-xs bg-gray-700 px-1.5 py-0.5 rounded">`</kbd>
      </button>
    );
  }

  return (
    <div 
      className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-4 border-2 border-yellow-400 shadow-lg shadow-yellow-400/10"
      data-testid="turbo-mode-input"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-yellow-400 animate-pulse" />
            <span className="text-white font-bold text-lg tracking-wide">{t('turbo.title', 'TURBO MODE')}</span>
          </div>
          <span className="text-yellow-400/80 text-xs bg-yellow-400/10 px-2 py-0.5 rounded-full">
            ⚡ {t('turbo.tagline', 'Single-Input Logging')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFullTutorial(!showFullTutorial)}
            className="text-gray-400 hover:text-yellow-400 p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
            title={showFullTutorial ? t('turbo.hideTutorial', 'Hide Tutorial') : t('turbo.showTutorial', 'Show Full Tutorial')}
          >
            <BookOpen size={16} />
          </button>
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
            title={t('turbo.exitTitle', 'Exit Turbo Mode [ESC]')}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Duplicate Jersey Warning */}
      {duplicateJerseys.length > 0 && (
        <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
          <span className="text-amber-300 text-xs">
            <strong>{t('turbo.duplicateTitle', 'Duplicate jerseys:')}</strong> #{duplicateJerseys.join(', #')} — 
            {t('turbo.duplicateBody', 'Use')} <kbd className="bg-gray-700 px-1 rounded mx-1">h</kbd> ({t('turbo.home', 'home')}) {t('turbo.or', 'or')} 
            <kbd className="bg-gray-700 px-1 rounded mx-1">a</kbd> ({t('turbo.away', 'away')}) {t('turbo.prefix', 'prefix')}
          </span>
        </div>
      )}

      {/* Team Indicator Pills */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-500 text-xs">{t('turbo.teamPrefix', 'Team prefix:')}</span>
        <div className="flex gap-1">
          <button
            onClick={() => {
              const currentInput = buffer;
              if (currentInput.startsWith('h') || currentInput.startsWith('a')) {
                onInputChange('h' + currentInput.substring(1));
              } else {
                onInputChange('h' + currentInput);
              }
              inputRef.current?.focus();
            }}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors
              ${parseResult?.teamPrefix === 'home' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
            `}
          >
            <Home size={12} />
            <span>{t('turbo.homePill', 'h = Home')}</span>
          </button>
          <button
            onClick={() => {
              const currentInput = buffer;
              if (currentInput.startsWith('h') || currentInput.startsWith('a')) {
                onInputChange('a' + currentInput.substring(1));
              } else {
                onInputChange('a' + currentInput);
              }
              inputRef.current?.focus();
            }}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors
              ${parseResult?.teamPrefix === 'away' 
                ? 'bg-red-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
            `}
          >
            <Plane size={12} />
            <span>{t('turbo.awayPill', 'a = Away')}</span>
          </button>
        </div>
      </div>

      {/* Input Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={buffer}
            onChange={(e) => onInputChange(e.target.value)}
              placeholder={t('turbo.placeholder', 'h10p1>7 = Home #10 Pass to #7')}
            className={`
              w-full px-4 py-3 rounded-lg text-lg font-mono font-bold
              bg-gray-900 border-2 transition-all
              placeholder:text-gray-600 placeholder:font-normal placeholder:text-sm
              ${isValid 
                ? 'border-green-500 text-green-400 ring-2 ring-green-500/20' 
                : needsTeamPrefix
                  ? 'border-amber-500 text-amber-400'
                  : buffer.length > 0 
                    ? 'border-red-500/50 text-white' 
                    : 'border-gray-700 text-white'}
              focus:outline-none focus:ring-2 focus:ring-yellow-400/50
            `}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {buffer.length > 0 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {needsTeamPrefix && !parseResult?.teamPrefix && (
                <AlertTriangle className="text-amber-400" size={18} />
              )}
              {isValid ? (
                <Check className="text-green-500" size={20} />
              ) : (
                <X className="text-gray-500" size={20} />
              )}
            </div>
          )}
        </div>
        
        <button
          onClick={onExecute}
          disabled={!canExecute}
          className={`
            px-6 py-3 rounded-lg font-bold text-white transition-all
            flex items-center gap-2
            ${canExecute 
              ? 'bg-green-600 hover:bg-green-500 hover:scale-105 shadow-lg shadow-green-600/30' 
              : 'bg-gray-700 cursor-not-allowed opacity-50'}
          `}
        >
          <ArrowRight size={20} />
          <span>{t('turbo.log', 'LOG')}</span>
        </button>
      </div>

      {/* Preview / Error / Suggestions */}
      <div className="mt-2 min-h-[28px]">
        {buffer.length > 0 ? (
          <div className={`text-sm ${isValid ? 'text-green-400' : needsTeamPrefix ? 'text-amber-400' : 'text-gray-400'}`}>
            <span className="flex items-center gap-2">
              {isValid ? <Check size={14} /> : needsTeamPrefix ? <AlertTriangle size={14} /> : null}
              {preview}
            </span>
          </div>
        ) : (
          <div className="text-gray-500 text-sm">
            {t('turbo.format', '⌨️ Format: [team][jersey][action][outcome][>recipient] — Example: h10p1>7')}
          </div>
        )}

        {(missingRecipient || safetyWarning || needsTeamPrefix) && (
          <div className="mt-2 text-xs text-amber-300 flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>
              {missingRecipient
                ? t('turbo.missingRecipient', 'Pass needs a recipient (use >#) before logging.')
                : safetyWarning || t('turbo.duplicateWarning', 'Duplicate jersey detected — add h/a prefix.')}
            </span>
          </div>
        )}

        {payloadPreview && isValid && !missingRecipient && (
          <div className="mt-2 text-xs text-gray-300 flex items-center gap-2">
            <span className="text-gray-500">{t('turbo.payload', 'Payload:')}</span>
            <span className="font-mono bg-gray-800 text-yellow-200 px-2 py-1 rounded">
              {payloadPreview}
            </span>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && !isValid && (
          <div className="flex flex-wrap gap-2 mt-2">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => {
                  const match = suggestion.match(/^([ha]?\d+[a-z]\d*)/);
                  if (match) {
                    onInputChange(match[1]);
                    inputRef.current?.focus();
                  }
                }}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded transition-colors"
              >
                <code className="text-yellow-400">{suggestion.split(' ')[0]}</code>
                <span className="text-gray-500 ml-1">{suggestion.includes('(') ? suggestion.substring(suggestion.indexOf('(')) : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Compact Quick Reference */}
      <div className="mt-4 pt-3 border-t border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <HelpCircle size={12} className="text-gray-500" />
            <span className="text-xs text-gray-500 font-medium">{t('turbo.actionCodes', 'Action Codes')}</span>
          </div>
          <button
            onClick={() => setShowFullTutorial(!showFullTutorial)}
            className="text-xs text-gray-500 hover:text-yellow-400 flex items-center gap-1"
          >
            {showFullTutorial ? t('turbo.less', 'Less') : t('turbo.more', 'More')}
            {showFullTutorial ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-xs">
          {[
            { code: 'p', name: t('turbo.codePass', 'Pass'), outcomes: t('turbo.outPass', '1=✓ 2=✗ 3=Key') },
            { code: 's', name: t('turbo.codeShot', 'Shot'), outcomes: t('turbo.outShot', '1=On 2=Off 4=Goal') },
            { code: 'd', name: t('turbo.codeDuel', 'Duel'), outcomes: t('turbo.outDuel', '1=Won 2=Lost') },
            { code: 'f', name: t('turbo.codeFoul', 'Foul'), outcomes: t('turbo.outFoul', '1=Commit 2=Won') },
            { code: 'y', name: t('turbo.codeCard', 'Card'), outcomes: t('turbo.outCard', '1=Y 2=2ndY 3=R') },
            { code: 'i', name: t('turbo.codeIntercept', 'Intercept'), outcomes: t('turbo.outIntercept', '1=Won 2=Lost') },
            { code: 'c', name: t('turbo.codeClear', 'Clear'), outcomes: t('turbo.outClear', '1=Good 2=Bad') },
            { code: 'b', name: t('turbo.codeBlock', 'Block'), outcomes: t('turbo.outBlock', '1=Effective') },
            { code: 'r', name: t('turbo.codeRecovery', 'Recovery'), outcomes: t('turbo.outRecovery', '1=Success') },
            { code: 'k', name: t('turbo.codeCorner', 'Corner'), outcomes: t('turbo.outCorner', '1-4 Types') },
            { code: 'g', name: t('turbo.codeGoalKick', 'GoalKick'), outcomes: t('turbo.outGoalKick', '1=Long 2=Short') },
            { code: 'v', name: t('turbo.codeSave', 'Save'), outcomes: t('turbo.outSave', '1-4 Types') },
            { code: 'n', name: t('turbo.codePenalty', 'Penalty'), outcomes: t('turbo.outPenalty', '1=Goal 2=Miss') },
            { code: 'x', name: t('turbo.codeSub', 'Sub'), outcomes: t('turbo.outSub', '1=On 2=Off') },
          ].map(({ code, name, outcomes }) => (
            <div 
              key={code}
              className="flex flex-col items-center p-1.5 bg-gray-800/50 rounded hover:bg-gray-700/50 transition-colors cursor-help"
              title={`${name}: ${outcomes}`}
            >
              <kbd className="bg-gray-700 text-yellow-400 px-1.5 py-0.5 rounded font-mono font-bold text-sm">
                {code}
              </kbd>
              <span className="text-gray-400 text-[10px] mt-0.5 truncate w-full text-center">{name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Full Tutorial (expandable) */}
      {showFullTutorial && (
        <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-4 animate-in slide-in-from-top-2 duration-200">
          {/* Format Explanation */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <h4 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
              📝 {t('turbo.formatTitle', 'Input Format')}
            </h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <code className="bg-gray-700 text-yellow-400 px-2 py-1 rounded font-mono">{t('turbo.formatCode', '[team][jersey][action][outcome][>recipient]')}</code>
              </div>
              <div className="grid grid-cols-5 gap-2 mt-2">
                <div className="text-center">
                  <div className="text-blue-400 font-bold">{t('turbo.formatTeam', 'Team')}</div>
                  <div className="text-gray-500">h/a</div>
                  <div className="text-gray-600 text-[10px]">{t('turbo.optional', '(optional)')}</div>
                </div>
                <div className="text-center">
                  <div className="text-green-400 font-bold">{t('turbo.formatJersey', 'Jersey')}</div>
                  <div className="text-gray-500">1-99</div>
                  <div className="text-gray-600 text-[10px]">{t('turbo.required', '(required)')}</div>
                </div>
                <div className="text-center">
                  <div className="text-purple-400 font-bold">{t('turbo.formatAction', 'Action')}</div>
                  <div className="text-gray-500">p,s,d...</div>
                  <div className="text-gray-600 text-[10px]">{t('turbo.required', '(required)')}</div>
                </div>
                <div className="text-center">
                  <div className="text-orange-400 font-bold">{t('turbo.formatOutcome', 'Outcome')}</div>
                  <div className="text-gray-500">1-5</div>
                  <div className="text-gray-600 text-[10px]">{t('turbo.ifNeeded', '(if needed)')}</div>
                </div>
                <div className="text-center">
                  <div className="text-yellow-300 font-bold">{t('turbo.formatRecipient', 'Recipient')}</div>
                  <div className="text-gray-500">&gt;7 or -7</div>
                  <div className="text-gray-600 text-[10px]">{t('turbo.forPasses', '(for passes)')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Team Prefix Explanation */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <h4 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
              🏠 {t('turbo.prefixTitle', 'Team Prefix (for duplicate jersey numbers)')}
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 p-2 bg-blue-500/10 rounded border border-blue-500/20">
                <kbd className="bg-blue-600 text-white px-2 py-1 rounded font-bold">h</kbd>
                <div>
                  <div className="text-blue-400 font-medium">{t('turbo.prefixHome', 'Home Team')}</div>
                  <div className="text-gray-500">{t('turbo.prefixExampleHome', 'e.g., h10p1')}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-red-500/10 rounded border border-red-500/20">
                <kbd className="bg-red-600 text-white px-2 py-1 rounded font-bold">a</kbd>
                <div>
                  <div className="text-red-400 font-medium">{t('turbo.prefixAway', 'Away Team')}</div>
                  <div className="text-gray-500">{t('turbo.prefixExampleAway', 'e.g., a10p1')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Examples */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <h4 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
              ✨ {t('turbo.examples', 'Examples')}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { cmd: 'h10p1', desc: t('turbo.ex1', 'Home #10 Pass Complete'), color: 'blue' },
                { cmd: 'h10p1>7', desc: t('turbo.ex2', 'Home #10 Pass Complete to #7'), color: 'blue' },
                { cmd: 'a7s4', desc: t('turbo.ex3', 'Away #7 Shot Goal!'), color: 'red' },
                { cmd: 'h5d1', desc: t('turbo.ex4', 'Home #5 Duel Won'), color: 'blue' },
                { cmd: 'a9f1', desc: t('turbo.ex5', 'Away #9 Foul Committed'), color: 'red' },
                { cmd: '10p1', desc: t('turbo.ex6', '#10 Pass (any team)'), color: 'gray' },
                { cmd: 'h1v1', desc: t('turbo.ex7', 'Home GK Save Held'), color: 'blue' },
                { cmd: 'a11y1', desc: t('turbo.ex8', 'Away #11 Yellow Card'), color: 'red' },
                { cmd: 'h10n1', desc: t('turbo.ex9', 'Home #10 Penalty Goal'), color: 'blue' },
              ].map(({ cmd, desc, color }) => (
                <button
                  key={cmd}
                  onClick={() => {
                    onInputChange(cmd);
                    inputRef.current?.focus();
                  }}
                  className={`
                    flex items-center gap-2 p-2 rounded transition-all hover:scale-102
                    ${color === 'blue' ? 'bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20' :
                      color === 'red' ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20' :
                      'bg-gray-700/50 hover:bg-gray-600/50 border border-gray-600/20'}
                  `}
                >
                  <code className="text-yellow-400 font-mono font-bold">{cmd}</code>
                  <span className="text-gray-400 text-xs">→ {desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* All Actions Reference */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <h4 className="text-white font-semibold text-sm mb-2">🎮 {t('turbo.allActions', 'All Action Codes')}</h4>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
              {[
                { code: 'p', name: t('turbo.codePass', 'Pass'), outcomes: t('turbo.outPassLong', '1=Complete, 2=Incomplete, 3=Key Pass') },
                { code: 's', name: t('turbo.codeShot', 'Shot'), outcomes: t('turbo.outShotLong', '1=On Target, 2=Off, 3=Blocked, 4=Goal, 5=Post') },
                { code: 'd', name: t('turbo.codeDuel', 'Duel'), outcomes: t('turbo.outDuelLong', '1=Won, 2=Lost, 3=Neutral') },
                { code: 'f', name: t('turbo.codeFoul', 'Foul'), outcomes: t('turbo.outFoulLong', '1=Committed, 2=Won') },
                { code: 'y', name: t('turbo.codeCard', 'Card'), outcomes: t('turbo.outCardLong', '1=Yellow, 2=2nd Yellow, 3=Red') },
                { code: 'i', name: t('turbo.codeIntercept', 'Interception'), outcomes: t('turbo.outInterceptLong', '1=Won, 2=Lost') },
                { code: 'c', name: t('turbo.codeClear', 'Clearance'), outcomes: t('turbo.outClearLong', '1=Effective, 2=Ineffective') },
                { code: 'b', name: t('turbo.codeBlock', 'Block'), outcomes: t('turbo.outBlockLong', '1=Effective') },
                { code: 'r', name: t('turbo.codeRecovery', 'Recovery'), outcomes: t('turbo.outRecoveryLong', '1=Successful') },
                { code: 'o', name: t('turbo.codeOffside', 'Offside'), outcomes: t('turbo.outOffsideLong', '1=Called') },
                { code: 'a', name: t('turbo.codeCarry', 'Carry'), outcomes: t('turbo.outCarryLong', '1=Success, 2=Dispossessed') },
                { code: 'k', name: t('turbo.codeCorner', 'Corner'), outcomes: t('turbo.outCornerLong', '1=Taken, 2=Short, 3=In, 4=Out') },
                { code: 'e', name: t('turbo.codeFreeKick', 'Free Kick'), outcomes: t('turbo.outFreeKickLong', '1=Taken, 2=Short, 3=Direct') },
                { code: 't', name: t('turbo.codeThrow', 'Throw-in'), outcomes: t('turbo.outThrowLong', '1=Completed, 2=Lost') },
                { code: 'g', name: t('turbo.codeGoalKick', 'Goal Kick'), outcomes: t('turbo.outGoalKickLong', '1=Long, 2=Short') },
                { code: 'n', name: t('turbo.codePenalty', 'Penalty'), outcomes: t('turbo.outPenaltyLong', '1=Scored, 2=Missed, 3=Saved') },
                { code: 'v', name: t('turbo.codeSave', 'Save'), outcomes: t('turbo.outSaveLong', '1=Held, 2=Parried, 3=Tipped') },
                { code: 'l', name: t('turbo.codeClaim', 'Claim'), outcomes: t('turbo.outClaimLong', '1=Success, 2=Fail') },
                { code: 'u', name: t('turbo.codePunch', 'Punch'), outcomes: t('turbo.outPunchLong', '1=Clear, 2=Weak') },
                { code: 'm', name: t('turbo.codeSmother', 'Smother'), outcomes: t('turbo.outSmotherLong', '1=Success, 2=Fail') },
                { code: 'x', name: t('turbo.codeSub', 'Substitution'), outcomes: t('turbo.outSubLong', '1=On, 2=Off') },
              ].map(({ code, name, outcomes }) => (
                <div key={code} className="flex items-start gap-1 py-0.5">
                  <kbd className="bg-gray-700 text-yellow-400 px-1 rounded font-mono font-bold flex-shrink-0">{code}</kbd>
                  <div>
                    <span className="text-white font-medium">{name}</span>
                    <span className="text-gray-500 ml-1 text-[10px]">{outcomes}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <h4 className="text-white font-semibold text-sm mb-2">⌨️ {t('turbo.shortcuts', 'Keyboard Shortcuts')}</h4>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-2">
                <kbd className="bg-gray-700 text-white px-2 py-1 rounded">Enter</kbd>
                <span className="text-gray-400">{t('turbo.shortcutEnter', 'Log event')}</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-gray-700 text-white px-2 py-1 rounded">Esc</kbd>
                <span className="text-gray-400">{t('turbo.shortcutEsc', 'Clear input')}</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-gray-700 text-white px-2 py-1 rounded">`</kbd>
                <span className="text-gray-400">{t('turbo.shortcutBacktick', 'Toggle Turbo Mode')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Status */}
      <div className="mt-3 pt-2 border-t border-gray-700/30 flex items-center justify-between text-xs text-gray-500">
        <span>{t('turbo.footerLeft', 'Press Enter to log • Esc to clear')}</span>
        <span className="flex items-center gap-1">
          <kbd className="bg-gray-700 px-1 rounded">`</kbd> {t('turbo.footerExit', 'to exit')}
        </span>
      </div>
    </div>
  );
};

export default TurboModeInput;

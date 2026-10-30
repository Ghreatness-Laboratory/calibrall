'use client';

import React, { useState } from 'react';
import { 
  FixtureLineupState, 
  LineupPlayer, 
  MarketPrediction, 
  PickRevisionRecord 
} from '@/types';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Users, 
  TrendingDown, 
  AlertCircle, 
  HelpCircle,
  History,
  Layers,
  ArrowRight
} from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { formatOdds, formatSelectionName } from '@/lib/prediction/marketCatalog';

interface Props {
  lineupState: FixtureLineupState;
  homeTeamName: string;
  awayTeamName: string;
  topPick?: MarketPrediction | null;
  revisions?: PickRevisionRecord[];
}

export default function LineupComparisonPanel({
  lineupState,
  homeTeamName,
  awayTeamName,
  topPick,
  revisions = [],
}: Props) {
  const [selectedTeamTab, setSelectedTeamTab] = useState<'home' | 'away'>('home');
  const [showBench, setShowBench] = useState<boolean>(true);

  const activeTeamData = selectedTeamTab === 'home' ? lineupState.home : lineupState.away;
  const activeTeamName = selectedTeamTab === 'home' ? homeTeamName : awayTeamName;
  const isConfirmed = lineupState.status === 'confirmed' && Boolean(activeTeamData.confirmed);
  const comparison = activeTeamData.comparison;

  const expectedStarters = activeTeamData.expected.starters;
  const confirmedStarters = activeTeamData.confirmed?.starters || [];
  const benchPlayers = (isConfirmed ? activeTeamData.confirmed?.bench : activeTeamData.expected.bench) || [];

  return (
    <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3.5">
      {/* 1. Header with Lineup Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-white/[0.07]">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-[650] text-[#ECF1EE] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#B6E63B]" />
              <span>Starting XI & tactical lineup comparison</span>
            </h3>
            {isConfirmed ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[10px] font-semibold bg-[#B6E63B]/[0.15] text-[#B6E63B] border border-[#B6E63B]/30">
                <CheckCircle2 className="w-3 h-3 text-[#B6E63B]" strokeWidth={2.2} />
                <span>Official XI confirmed</span>
              </span>
            ) : lineupState.isWithin30MinsOfKickoff ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <AlertCircle className="w-3 h-3 text-amber-400" strokeWidth={2} />
                <span>Lineup not released yet</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[10px] font-medium bg-[#151E19] text-[#8B9890] border border-white/[0.07]">
                <Clock className="w-3 h-3 text-[#5E6A63]" />
                <span>Expected XI · release ~{lineupState.expectedReleaseTimeFormatted}</span>
              </span>
            )}
          </div>
          <p className="text-[12px] text-[#8B9890]">
            {isConfirmed 
              ? 'Official team sheets verified against previous matchday rosters. Rotations and key absences tracked.'
              : 'Pre-release projections based on last match starters, minutes played, and known availability.'}
          </p>
        </div>

        {/* Team Switcher Tabs */}
        <div className="flex items-center bg-[#151E19] p-0.5 rounded-[9px] border border-white/[0.07] shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setSelectedTeamTab('home')}
            type="button"
            className={`px-3 py-1 rounded-[7px] text-[12px] font-semibold transition-colors ${
              selectedTeamTab === 'home'
                ? 'bg-[#101713] text-[#ECF1EE] shadow-sm'
                : 'text-[#8B9890] hover:text-[#ECF1EE]'
            }`}
          >
            {cleanDisplayText(homeTeamName)}
          </button>
          <button
            onClick={() => setSelectedTeamTab('away')}
            type="button"
            className={`px-3 py-1 rounded-[7px] text-[12px] font-semibold transition-colors ${
              selectedTeamTab === 'away'
                ? 'bg-[#101713] text-[#ECF1EE] shadow-sm'
                : 'text-[#8B9890] hover:text-[#ECF1EE]'
            }`}
          >
            {cleanDisplayText(awayTeamName)}
          </button>
        </div>
      </div>

      {/* 2. Sub-30-Minute Late Release Advisory (Zero-Guessing Rule) */}
      {!isConfirmed && lineupState.isWithin30MinsOfKickoff && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-[11px] space-y-1">
          <div className="flex items-center gap-2 text-amber-300 font-semibold text-[12.5px]">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Lineup not released yet</span>
          </div>
          <p className="text-[11.5px] text-[#8B9890] leading-relaxed">
            Official team sheets have not yet been registered by the match delegate. Calibrall strictly enforces a zero-guessing policy and does not fabricate speculative lineups within 30 minutes of kickoff. The Expected XI below reflects last matchday starters.
          </p>
        </div>
      )}

      {/* 3. Team Impact Summary Strip */}
      {comparison && comparison.impactSummary.length > 0 && (
        <div className="p-3 bg-[#151E19] border border-white/[0.07] rounded-[11px] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#B6E63B] font-semibold">
              Lineup impact summary · {cleanDisplayText(activeTeamName)}
            </span>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-[#8B9890]">Formation:</span>
              <span className="font-mono font-semibold text-[#ECF1EE]">
                {comparison.confirmedFormation || comparison.expectedFormation}
              </span>
              {comparison.formationChanged && (
                <span className="text-amber-300 text-[10px] font-mono px-1 rounded bg-amber-500/20">
                  Changed from {comparison.expectedFormation}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
            {comparison.impactSummary.map((summary, idx) => {
              const isWarning = summary.toLowerCase().includes('not in') || summary.toLowerCase().includes('backup') || summary.toLowerCase().includes('out');
              return (
                <div 
                  key={idx}
                  className={`p-2 rounded-[8px] flex items-start gap-2 border ${
                    isWarning 
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
                      : 'bg-[#101713] border-white/[0.05] text-[#ECF1EE]'
                  }`}
                >
                  {isWarning ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#B6E63B] shrink-0 mt-0.5" />
                  )}
                  <span className="leading-tight">{summary}</span>
                </div>
              );
            })}
          </div>

          {comparison.rotationCount > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-[#8B9890] pt-1 border-t border-white/[0.05]">
              <span className="font-semibold text-[#ECF1EE]">{comparison.rotationCount}</span>
              <span>starters rotated from previous match</span>
              <span className="text-[#5E6A63]">·</span>
              <span>Squad continuity score:</span>
              <span className="font-mono text-[#B6E63B] font-semibold">
                {Math.round(((11 - comparison.rotationCount) / 11) * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* 4. Side-by-Side Lineup Display: Expected XI vs Confirmed XI */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11.5px] px-1">
          <span className="font-semibold text-[#ECF1EE]">Player-by-player starting grid</span>
          <button
            onClick={() => setShowBench(!showBench)}
            type="button"
            className="text-[11px] text-[#8B9890] hover:text-[#ECF1EE] underline"
          >
            {showBench ? 'Hide bench substitutes' : 'Show bench substitutes'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Column 1: Expected XI (Strictly labeled "Expected XI", never "lineup") */}
          <div className="border border-white/[0.07] bg-[#151E19]/70 rounded-[12px] p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
              <div>
                <span className="text-[12.5px] font-[650] text-[#ECF1EE] block">Expected XI</span>
                <span className="text-[10.5px] text-[#8B9890]">Last match starters & minutes</span>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-[5px] bg-[#101713] border border-white/[0.07] text-[#8B9890]">
                {activeTeamData.expected.formation}
              </span>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {expectedStarters.map((player) => {
                const isMissingInConfirmed = isConfirmed && !confirmedStarters.some(c => c.playerName === player.playerName);
                return (
                  <div 
                    key={player.playerId} 
                    className={`py-1.5 flex items-center justify-between text-[12px] ${
                      isMissingInConfirmed ? 'opacity-40 line-through' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 text-[10.5px] font-mono text-[#5E6A63] text-center">
                        {player.jerseyNumber || '—'}
                      </span>
                      <span className="w-6 text-[10.5px] font-mono px-1 py-0.5 rounded bg-[#101713] text-[#8B9890] text-center shrink-0">
                        {player.position}
                      </span>
                      <span className="text-[#ECF1EE] truncate font-medium">
                        {cleanDisplayText(player.playerName)}
                      </span>
                      {player.isCaptain && (
                        <span className="text-[9.5px] font-mono px-1 rounded bg-amber-500/20 text-amber-300 font-bold shrink-0">
                          C
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10.5px] text-[#8B9890] shrink-0 font-mono">
                      {player.goals ? (
                        <span className="text-[#B6E63B] font-semibold">{player.goals}G</span>
                      ) : null}
                      {player.assists ? (
                        <span className="text-[#5eb6e8] font-semibold">{player.assists}A</span>
                      ) : null}
                      {isMissingInConfirmed && (
                        <span className="text-rose-400 font-sans font-semibold text-[10px] ml-1">
                          (OUT)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 2: Confirmed XI (or Pending placeholder) */}
          <div className="border border-white/[0.07] bg-[#151E19]/70 rounded-[12px] p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
              <div>
                <span className="text-[12.5px] font-[650] text-[#ECF1EE] block">Confirmed XI</span>
                <span className="text-[10.5px] text-[#8B9890]">Official match delegate sheet</span>
              </div>
              {isConfirmed ? (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-[5px] bg-[#B6E63B]/[0.15] border border-[#B6E63B]/30 text-[#B6E63B] font-semibold">
                  {activeTeamData.confirmed?.formation}
                </span>
              ) : (
                <span className="text-[10.5px] font-mono text-[#8B9890]">Awaiting release</span>
              )}
            </div>

            {isConfirmed ? (
              <div className="divide-y divide-white/[0.04]">
                {confirmedStarters.map((player) => {
                  const isNewStarter = !expectedStarters.some(e => e.playerName === player.playerName);
                  const isSurprise = comparison?.surpriseStarters.some(s => s.playerName === player.playerName);

                  return (
                    <div key={player.playerId} className="py-1.5 flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 text-[10.5px] font-mono text-[#5E6A63] text-center">
                          {player.jerseyNumber || '—'}
                        </span>
                        <span className="w-6 text-[10.5px] font-mono px-1 py-0.5 rounded bg-[#101713] text-[#8B9890] text-center shrink-0">
                          {player.position}
                        </span>
                        <span className={`truncate font-medium ${isNewStarter ? 'text-[#B6E63B] font-semibold' : 'text-[#ECF1EE]'}`}>
                          {cleanDisplayText(player.playerName)}
                        </span>
                        {player.isCaptain && (
                          <span className="text-[9.5px] font-mono px-1 rounded bg-amber-500/20 text-amber-300 font-bold shrink-0">
                            C
                          </span>
                        )}
                        {isNewStarter && (
                          <span className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                            isSurprise ? 'bg-amber-500/20 text-amber-300' : 'bg-[#B6E63B]/20 text-[#B6E63B]'
                          }`}>
                            {isSurprise ? 'Surprise starter' : 'New starter'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10.5px] text-[#8B9890] shrink-0 font-mono">
                        {player.goals ? (
                          <span className="text-[#B6E63B] font-semibold">{player.goals}G</span>
                        ) : null}
                        {player.assists ? (
                          <span className="text-[#5eb6e8] font-semibold">{player.assists}A</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center space-y-2">
                <Clock className="w-6 h-6 text-[#5E6A63] mx-auto" />
                <p className="text-[12px] text-[#8B9890] max-w-xs mx-auto">
                  {lineupState.isWithin30MinsOfKickoff 
                    ? 'Official lineup not released yet. Calibrall does not guess or interpolate.' 
                    : `Official team sheets are released ~60 minutes before kickoff (~${lineupState.expectedReleaseTimeFormatted}).`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bench Substitutes Section */}
        {showBench && benchPlayers.length > 0 && (
          <div className="p-3 bg-[#151E19]/40 border border-white/[0.05] rounded-[11px] space-y-1.5">
            <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#8B9890]">
              Bench & available substitutes ({benchPlayers.length} players)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {benchPlayers.map((b) => (
                <span 
                  key={b.playerId}
                  className={`text-[11px] px-2 py-0.5 rounded-[5px] border ${
                    b.status === 'sidelined'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 line-through'
                      : 'bg-[#101713] border-white/[0.06] text-[#ECF1EE]'
                  }`}
                >
                  <span className="text-[#5E6A63] font-mono mr-1">{b.position}</span>
                  <span>{cleanDisplayText(b.playerName)}</span>
                  {b.goals ? <span className="text-[#B6E63B] font-mono ml-1">{b.goals}G</span> : null}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5. Effect on the Picks & Record Integrity Revisions */}
      <div className="p-3.5 bg-[#151E19] border border-white/[0.07] rounded-[12px] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#B6E63B]" />
              <span className="text-[13px] font-[650] text-[#ECF1EE]">
                Effect on the picks & record integrity
              </span>
            </div>
            <p className="text-[11.5px] text-[#8B9890]">
              Step one: Highlight only. Pre-lineup probabilities are never silently overwritten without historical walk-forward proof.
            </p>
          </div>

          {comparison?.hasKeyPlayerOut && topPick && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Review: lineup changed</span>
            </span>
          )}
        </div>

        {/* Walk-forward highlight-only disclosure */}
        <div className="p-2.5 bg-[#101713] border border-white/[0.05] rounded-[8px] text-[11.5px] text-[#8B9890] space-y-1">
          <div className="flex items-center gap-2 text-[#ECF1EE] font-semibold">
            <History className="w-3.5 h-3.5 text-[#B6E63B]" />
            <span>Walk-forward adjustment protocol</span>
          </div>
          <p className="leading-relaxed">
            Per Calibrall governance, model probabilities remain <strong className="text-[#ECF1EE]">highlight-only</strong> unless a rolling out-of-sample backtest demonstrates that player-level adjustments reduce Brier score and log-loss. If player-level data is absent, the system stays strictly highlight-only.
          </p>
        </div>

        {/* Pick Revision Table: Revision 1 (Pre-lineup) vs Revision 2 (Post-lineup) */}
        {revisions && revisions.length > 0 ? (
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#8B9890]">
              Immutable pick revision audit ledger
            </span>
            <div className="border border-white/[0.07] rounded-[10px] overflow-hidden divide-y divide-white/[0.07]">
              {revisions.map((rev) => (
                <div key={rev.id} className="p-2.5 bg-[#101713] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                        rev.revisionNumber === 1 
                          ? 'bg-[#151E19] text-[#8B9890] border border-white/[0.1]'
                          : 'bg-[#B6E63B]/20 text-[#B6E63B] border border-[#B6E63B]/40'
                      }`}>
                        {rev.label}
                      </span>
                      <span className="font-semibold text-[#ECF1EE]">
                        {cleanDisplayText(formatSelectionName(rev.selection))}
                      </span>
                      {rev.odds && (
                        <span className="text-[11px] text-[#8B9890] font-mono">
                          @{formatOdds(rev.odds)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8B9890]">
                      {rev.changeSummary}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div>
                      <div className="text-[13px] font-semibold text-[#B6E63B] font-mono">
                        {(rev.probability * 100).toFixed(1)}%
                      </div>
                      <div className="text-[9.5px] text-[#5E6A63] font-mono">
                        Recorded {new Date(rev.recordedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} UTC
                      </div>
                    </div>
                    {rev.brierError !== undefined && (
                      <div className="border-l border-white/[0.07] pl-3">
                        <div className="text-[11px] font-mono text-[#ECF1EE]">
                          Brier: {rev.brierError.toFixed(4)}
                        </div>
                        <div className="text-[9.5px] text-[#8B9890] font-mono">
                          {rev.settlementStatus || 'Settled'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : topPick ? (
          <div className="p-2.5 bg-[#101713] border border-white/[0.05] rounded-[8px] flex items-center justify-between text-[12px]">
            <div>
              <span className="text-[10px] font-mono text-[#8B9890] block">Pre-lineup pick</span>
              <span className="font-semibold text-[#ECF1EE]">
                {cleanDisplayText(formatSelectionName(topPick.selection))}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[13px] font-semibold text-[#B6E63B] font-mono">
                {((topPick.calibratedProbability ?? topPick.modelProbability) * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-[#5E6A63] block">Pre-kickoff baseline</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

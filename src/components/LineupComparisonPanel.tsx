'use client';

import React, { useState } from 'react';
import {
  FixtureLineupState,
  MarketPrediction,
  PickRevisionRecord,
} from '@/types';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  AlertCircle,
  History,
} from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { formatOdds, formatSelectionName } from '@/lib/prediction/marketCatalog';
import { isTeamNewsEnabled } from '@/lib/prediction/featureFlags';

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

  if (!isTeamNewsEnabled()) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-5 text-center space-y-2.5">
        <div className="w-10 h-10 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center mx-auto text-[var(--text-2)]">
          <Users className="w-5 h-5" />
        </div>
        <h4 className="font-display text-[14px] font-semibold text-[var(--text)]">
          Team news pending
        </h4>
        <p className="text-[12.5px] text-[var(--text-2)] max-w-md mx-auto leading-[1.5]">
          Starting lineups are awaiting pre-match verification from free football feeds. Confidence stays honestly bounded until verified team sheets arrive.
        </p>
      </div>
    );
  }

  const activeTeamData = selectedTeamTab === 'home' ? lineupState.home : lineupState.away;
  const activeTeamName = selectedTeamTab === 'home' ? homeTeamName : awayTeamName;
  const isConfirmed = lineupState.status === 'confirmed' && Boolean(activeTeamData.confirmed);
  const comparison = activeTeamData.comparison;

  const expectedStarters = activeTeamData.expected.starters;
  const confirmedStarters = activeTeamData.confirmed?.starters || [];
  const benchPlayers =
    (isConfirmed ? activeTeamData.confirmed?.bench : activeTeamData.expected.bench) || [];

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-4">
      {/* Header with Lineup Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--accent)]" />
              <span>Starting XI &amp; tactical lineup comparison</span>
            </h3>
            {isConfirmed ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30">
                <CheckCircle2 className="w-3 h-3" strokeWidth={2.2} />
                <span>Official XI confirmed</span>
              </span>
            ) : lineupState.isWithin30MinsOfKickoff ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30">
                <AlertCircle className="w-3 h-3" strokeWidth={2} />
                <span>Lineup not released yet</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line)]">
                <Clock className="w-3 h-3 text-[var(--text-3)]" />
                <span>Expected XI · release ~{lineupState.expectedReleaseTimeFormatted}</span>
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
            {isConfirmed
              ? 'Official team sheets verified against previous matchday rosters. Rotations and key absences tracked.'
              : 'Pre-release projections based on last match starters, minutes played, and known availability.'}
          </p>
        </div>

        {/* Team Switcher Tabs */}
        <div className="flex items-center bg-[var(--surface-2)] p-1 rounded-[12px] border border-[var(--line)] shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setSelectedTeamTab('home')}
            type="button"
            className={`min-h-[38px] px-3 rounded-[9px] text-[12px] font-semibold transition-colors touch-press ${
              selectedTeamTab === 'home'
                ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--line)]'
                : 'text-[var(--text-2)] hover:text-[var(--text)]'
            }`}
          >
            {cleanDisplayText(homeTeamName)}
          </button>
          <button
            onClick={() => setSelectedTeamTab('away')}
            type="button"
            className={`min-h-[38px] px-3 rounded-[9px] text-[12px] font-semibold transition-colors touch-press ${
              selectedTeamTab === 'away'
                ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--line)]'
                : 'text-[var(--text-2)] hover:text-[var(--text)]'
            }`}
          >
            {cleanDisplayText(awayTeamName)}
          </button>
        </div>
      </div>

      {/* Sub-30-Minute Late Release Advisory */}
      {!isConfirmed && lineupState.isWithin30MinsOfKickoff && (
        <div className="p-3 bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] space-y-1">
          <div className="flex items-center gap-2 text-[var(--medium)] font-semibold text-[12.5px]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Lineup not released yet</span>
          </div>
          <p className="text-[12px] text-[var(--text-2)] leading-[1.5]">
            Official team sheets have not yet been registered by the match delegate. Calibrall strictly enforces a zero-guessing policy and does not fabricate speculative lineups within 30 minutes of kickoff.
          </p>
        </div>
      )}

      {/* Team Impact Summary Strip */}
      {comparison && comparison.impactSummary.length > 0 && (
        <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11.5px] font-semibold text-[var(--accent)]">
              Lineup impact · {cleanDisplayText(activeTeamName)}
            </span>
            <div className="flex items-center gap-2 text-[11px] tabular-nums">
              <span className="text-[var(--text-2)]">Formation:</span>
              <span className="font-semibold text-[var(--text)]">
                {comparison.confirmedFormation || comparison.expectedFormation}
              </span>
              {comparison.formationChanged && (
                <span className="text-[var(--medium)] text-[10.5px] px-1.5 py-0.5 rounded-full bg-[var(--medium-soft)]">
                  Changed from {comparison.expectedFormation}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
            {comparison.impactSummary.map((summary, idx) => {
              const isWarning =
                summary.toLowerCase().includes('not in') ||
                summary.toLowerCase().includes('backup') ||
                summary.toLowerCase().includes('out');
              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-[10px] flex items-start gap-2 border ${
                    isWarning
                      ? 'bg-[var(--danger-soft)] border-[var(--danger)]/30 text-[var(--danger)]'
                      : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text)]'
                  }`}
                >
                  {isWarning ? (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
                  )}
                  <span className="leading-snug">{summary}</span>
                </div>
              );
            })}
          </div>

          {comparison.rotationCount > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-2)] pt-1.5 border-t border-[var(--line)] tabular-nums">
              <span className="font-semibold text-[var(--text)]">{comparison.rotationCount}</span>
              <span>starters rotated from previous match</span>
              <span className="text-[var(--text-3)]">·</span>
              <span>Squad continuity:</span>
              <span className="text-[var(--accent)] font-semibold">
                {Math.round(((11 - comparison.rotationCount) / 11) * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Side-by-Side Lineup Display */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-display font-semibold text-[var(--text)]">
            Player-by-player starting grid
          </span>
          <button
            onClick={() => setShowBench(!showBench)}
            type="button"
            className="min-h-[44px] px-2 text-[11.5px] font-medium text-[var(--accent)] hover:underline touch-press"
          >
            {showBench ? 'Hide bench substitutes' : 'Show bench substitutes'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Expected XI */}
          <div className="border border-[var(--line)] bg-[var(--surface-2)] rounded-[12px] p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
              <div>
                <span className="text-[13px] font-semibold text-[var(--text)] block">Expected XI</span>
                <span className="text-[10.5px] text-[var(--text-2)]">Last match starters &amp; minutes</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--line)] text-[var(--text-2)] tabular-nums">
                {activeTeamData.expected.formation}
              </span>
            </div>

            <div className="divide-y divide-[var(--line)]">
              {expectedStarters.map((player) => {
                const isMissingInConfirmed =
                  isConfirmed && !confirmedStarters.some((c) => c.playerName === player.playerName);
                return (
                  <div
                    key={player.playerId}
                    className={`py-2 flex items-center justify-between text-[12.5px] ${
                      isMissingInConfirmed ? 'opacity-40 line-through' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 text-[10.5px] text-[var(--text-3)] text-center tabular-nums">
                        {player.jerseyNumber || '—'}
                      </span>
                      <span className="w-7 text-[10.5px] px-1 py-0.5 rounded-[6px] bg-[var(--surface)] text-[var(--text-2)] text-center shrink-0">
                        {player.position}
                      </span>
                      <span className="text-[var(--text)] truncate font-medium">
                        {cleanDisplayText(player.playerName)}
                      </span>
                      {player.isCaptain && (
                        <span className="text-[10.5px] px-1.5 rounded bg-[var(--medium-soft)] text-[var(--medium)] font-bold shrink-0">
                          C
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-2)] shrink-0 tabular-nums">
                      {player.goals ? (
                        <span className="text-[var(--accent)] font-semibold">{player.goals}G</span>
                      ) : null}
                      {player.assists ? (
                        <span className="text-[var(--info)] font-semibold">{player.assists}A</span>
                      ) : null}
                      {isMissingInConfirmed && (
                        <span className="text-[var(--danger)] font-semibold text-[10.5px] ml-1">
                          Out
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Confirmed XI */}
          <div className="border border-[var(--line)] bg-[var(--surface-2)] rounded-[12px] p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
              <div>
                <span className="text-[13px] font-semibold text-[var(--text)] block">Confirmed XI</span>
                <span className="text-[10.5px] text-[var(--text-2)]">Official match delegate sheet</span>
              </div>
              {isConfirmed ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[var(--accent)] font-semibold tabular-nums">
                  {activeTeamData.confirmed?.formation}
                </span>
              ) : (
                <span className="text-[10.5px] text-[var(--text-2)]">Awaiting release</span>
              )}
            </div>

            {isConfirmed ? (
              <div className="divide-y divide-[var(--line)]">
                {confirmedStarters.map((player) => {
                  const isNewStarter = !expectedStarters.some(
                    (e) => e.playerName === player.playerName
                  );
                  const isSurprise = comparison?.surpriseStarters.some(
                    (s) => s.playerName === player.playerName
                  );

                  return (
                    <div
                      key={player.playerId}
                      className="py-2 flex items-center justify-between text-[12.5px]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 text-[10.5px] text-[var(--text-3)] text-center tabular-nums">
                          {player.jerseyNumber || '—'}
                        </span>
                        <span className="w-7 text-[10.5px] px-1 py-0.5 rounded-[6px] bg-[var(--surface)] text-[var(--text-2)] text-center shrink-0">
                          {player.position}
                        </span>
                        <span
                          className={`truncate font-medium ${
                            isNewStarter ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text)]'
                          }`}
                        >
                          {cleanDisplayText(player.playerName)}
                        </span>
                        {player.isCaptain && (
                          <span className="text-[10.5px] px-1.5 rounded bg-[var(--medium-soft)] text-[var(--medium)] font-bold shrink-0">
                            C
                          </span>
                        )}
                        {isNewStarter && (
                          <span
                            className={`text-[10.5px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${
                              isSurprise
                                ? 'bg-[var(--medium-soft)] text-[var(--medium)]'
                                : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                            }`}
                          >
                            {isSurprise ? 'Surprise starter' : 'New starter'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-2)] shrink-0 tabular-nums">
                        {player.goals ? (
                          <span className="text-[var(--accent)] font-semibold">{player.goals}G</span>
                        ) : null}
                        {player.assists ? (
                          <span className="text-[var(--info)] font-semibold">{player.assists}A</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center space-y-2">
                <Clock className="w-6 h-6 text-[var(--text-3)] mx-auto" />
                <p className="text-[12.5px] text-[var(--text-2)] max-w-xs mx-auto leading-[1.5]">
                  {lineupState.isWithin30MinsOfKickoff
                    ? 'Official lineup not released yet. Calibrall does not guess or interpolate.'
                    : `Official team sheets are released ~60 minutes before kickoff (~${lineupState.expectedReleaseTimeFormatted}).`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bench Substitutes */}
        {showBench && benchPlayers.length > 0 && (
          <div className="p-3 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-2">
            <span className="text-[11.5px] font-medium text-[var(--text-2)] block">
              Bench &amp; available substitutes ({benchPlayers.length} players)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {benchPlayers.map((b) => (
                <span
                  key={b.playerId}
                  className={`text-[11px] px-2.5 py-1 rounded-full border ${
                    b.status === 'sidelined'
                      ? 'bg-[var(--danger-soft)] border-[var(--danger)]/30 text-[var(--danger)] line-through'
                      : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text)]'
                  }`}
                >
                  <span className="text-[var(--text-3)] mr-1">{b.position}</span>
                  <span>{cleanDisplayText(b.playerName)}</span>
                  {b.goals ? <span className="text-[var(--accent)] ml-1 tabular-nums">{b.goals}G</span> : null}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Effect on Picks & Record Integrity */}
      <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
              <span className="font-display text-[13.5px] font-semibold text-[var(--text)]">
                Effect on picks &amp; record integrity
              </span>
            </div>
            <p className="text-[12px] text-[var(--text-2)] leading-[1.5]">
              Pre-lineup probabilities are never silently overwritten without historical walk-forward proof.
            </p>
          </div>

          {comparison?.hasKeyPlayerOut && topPick && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/35 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Review: lineup changed</span>
            </span>
          )}
        </div>

        <div className="p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[10px] text-[12px] text-[var(--text-2)] space-y-1">
          <div className="flex items-center gap-2 text-[var(--text)] font-semibold">
            <History className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Walk-forward adjustment protocol</span>
          </div>
          <p className="leading-[1.5]">
            Model probabilities remain <strong className="text-[var(--text)]">highlight-only</strong> unless a rolling out-of-sample backtest proves player-level adjustments reduce Brier score and log-loss.
          </p>
        </div>

        {revisions && revisions.length > 0 ? (
          <div className="space-y-2 pt-1">
            <span className="text-[11.5px] font-medium text-[var(--text-2)] block">
              Immutable model revision ledger
            </span>
            <div className="border border-[var(--line)] rounded-[12px] overflow-hidden divide-y divide-[var(--line)]">
              {revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="p-3 bg-[var(--surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10.5px] px-2 py-0.5 rounded-full font-semibold ${
                          rev.revisionNumber === 1
                            ? 'bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line)]'
                            : 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/35'
                        }`}
                      >
                        {rev.label}
                      </span>
                      <span className="font-semibold text-[var(--text)]">
                        {cleanDisplayText(formatSelectionName(rev.selection))}
                      </span>
                      {rev.odds && (
                        <span className="text-[11px] text-[var(--text-2)] tabular-nums">
                          @{formatOdds(rev.odds)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-[var(--text-2)]">{rev.changeSummary}</p>
                  </div>

                  <div className="flex items-center gap-4 text-right shrink-0 tabular-nums">
                    <div>
                      <div className="font-display text-[14px] font-bold text-[var(--accent)]">
                        {(rev.probability * 100).toFixed(1)}%
                      </div>
                      <div className="text-[10.5px] text-[var(--text-3)]">
                        Recorded{' '}
                        {new Date(rev.recordedAt).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        UTC
                      </div>
                    </div>
                    {rev.brierError !== undefined && (
                      <div className="border-l border-[var(--line)] pl-3">
                        <div className="text-[11.5px] text-[var(--text)]">
                          Brier: {rev.brierError.toFixed(4)}
                        </div>
                        <div className="text-[10.5px] text-[var(--text-2)]">
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
          <div className="p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[10px] flex items-center justify-between text-[12.5px]">
            <div>
              <span className="text-[10.5px] text-[var(--text-2)] block">Pre-lineup pick</span>
              <span className="font-semibold text-[var(--text)]">
                {cleanDisplayText(formatSelectionName(topPick.selection))}
              </span>
            </div>
            <div className="text-right tabular-nums">
              <span className="font-display text-[14px] font-bold text-[var(--accent)]">
                {((topPick.calibratedProbability ?? topPick.modelProbability) * 100).toFixed(1)}%
              </span>
              <span className="text-[10.5px] text-[var(--text-3)] block">Pre-kickoff baseline</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

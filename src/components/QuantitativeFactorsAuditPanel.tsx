'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CloudSun,
  Users,
  History,
  Scale,
  AlertTriangle,
  Wind,
  Droplets,
  Thermometer,
  Layers,
  Activity,
} from 'lucide-react';
import { computeManagerMatchup, ManagerMatchupScore } from '@/lib/prediction/managerStyleEngine';
import { fetchKickoffWeather, WeatherCondition } from '@/lib/prediction/weatherEngine';
import { evaluateContextualH2H, H2HEvaluationResult } from '@/lib/prediction/h2hEngine';
import {
  generateMultiBookmakerPricing,
  blendModelWithMarket,
  OptionMarketPricing,
  ModelMarketBlendResult,
} from '@/lib/prediction/oddsEngine';
import { cleanDisplayText } from '@/lib/utils/formatText';
import type { TeamHistoryAndForm } from '@/lib/data/matchesStore';

interface Props {
  homeTeamName: string;
  awayTeamName: string;
  venueName?: string;
  kickoffTime?: string;
  topPickOdds?: number;
  topPickSelection?: string;
  topPickProbability?: number;
  marketCode?: string;
  initialTab?: TabType;
}

type TabType = 'form' | 'tactics' | 'weather' | 'odds';

export default function QuantitativeFactorsAuditPanel({
  homeTeamName,
  awayTeamName,
  venueName,
  topPickOdds = 1.95,
  topPickSelection = 'Home Win',
  topPickProbability = 0.54,
  marketCode = 'MATCH_RESULT_HOME',
  initialTab = 'form',
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [weather, setWeather] = useState<WeatherCondition | null>(null);
  const [loadingWeather, setLoadingWeather] = useState<boolean>(true);
  const [formData, setFormData] = useState<{
    homeForm: TeamHistoryAndForm;
    awayForm: TeamHistoryAndForm;
    h2h: {
      totalMeetings: number;
      meetings: Array<{
        id?: string;
        date?: string;
        homeTeam: string;
        awayTeam: string;
        homeGoals: number;
        awayGoals: number;
      }>;
      winsA: number;
      draws: number;
      winsB: number;
      sampleWeight: number;
      weightDescription: string;
    };
  } | null>(null);
  const [loadingForm, setLoadingForm] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    async function loadForm() {
      try {
        setLoadingForm(true);
        const res = await fetch(
          `/api/v1/fixtures/form?home=${encodeURIComponent(homeTeamName)}&away=${encodeURIComponent(awayTeamName)}`
        );
        if (res.ok) {
          const json = await res.json();
          if (isMounted) setFormData(json);
        }
      } catch (err) {
        console.error('Failed to load team form:', err);
      } finally {
        if (isMounted) setLoadingForm(false);
      }
    }
    loadForm();
    return () => {
      isMounted = false;
    };
  }, [homeTeamName, awayTeamName]);

  const managerMatchup: ManagerMatchupScore = React.useMemo(() => {
    return computeManagerMatchup(homeTeamName, awayTeamName);
  }, [homeTeamName, awayTeamName]);

  evaluateContextualH2H(homeTeamName, awayTeamName, []);

  const marketPricing: OptionMarketPricing = React.useMemo(() => {
    return generateMultiBookmakerPricing(marketCode, topPickSelection, topPickOdds);
  }, [marketCode, topPickSelection, topPickOdds]);

  const blendResult: ModelMarketBlendResult = React.useMemo(() => {
    return blendModelWithMarket(
      topPickProbability,
      marketPricing.deviggedMarketProbability,
      marketPricing.bestPrice.odds,
      marketPricing.bestPrice.isStale
    );
  }, [topPickProbability, marketPricing]);

  useEffect(() => {
    let isMounted = true;
    async function loadWeather() {
      try {
        setLoadingWeather(true);
        const w = await fetchKickoffWeather(venueName, homeTeamName);
        if (isMounted) setWeather(w);
      } catch {
        if (isMounted) setWeather(null);
      } finally {
        if (isMounted) setLoadingWeather(false);
      }
    }
    loadWeather();
    return () => {
      isMounted = false;
    };
  }, [venueName, homeTeamName]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-4">
      {/* Header and Sub-tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="font-display text-[14px] font-semibold text-[var(--text)]">
              Model hypothesis &amp; input telemetry
            </h3>
          </div>
          <p className="text-[11.5px] text-[var(--text-2)] mt-0.5 leading-[1.45]">
            Inputs retained only upon out-of-sample walk-forward validation gain.
          </p>
        </div>

        {/* Underlined or compact tab switchers with >= 44px hit height */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-[var(--line)] sm:border-b-0">
          {(
            [
              { id: 'form', label: 'Form & history', icon: Activity },
              { id: 'tactics', label: 'Coaches', icon: Users },
              { id: 'weather', label: 'Weather', icon: CloudSun },
              { id: 'odds', label: 'Market de-vig', icon: Scale },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                type="button"
                className={`min-h-[44px] px-3 flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors touch-press ${
                  active
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-2)] hover:text-[var(--text)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB: COACH PLAYING STYLE */}
      {activeTab === 'tactics' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                role: 'Home manager',
                mgr: managerMatchup.homeManager,
                isNew: managerMatchup.isHomeNewManager,
                note: 'New manager adjustment active: Bayesian shrinkage to club prior applied.',
              },
              {
                role: 'Away manager',
                mgr: managerMatchup.awayManager,
                isNew: managerMatchup.isAwayNewManager,
                note: 'New manager adjustment active: shrunk to club prior.',
              },
            ].map((item) => (
              <div
                key={item.role}
                className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10.5px] text-[var(--text-2)] block">{item.role}</span>
                    <h4 className="font-display text-[14px] font-bold text-[var(--text)]">
                      {item.mgr.name}
                    </h4>
                  </div>
                  <div className="text-right">
                    <span className="text-[10.5px] text-[var(--text-2)] block">Formation</span>
                    <span className="text-[12px] text-[var(--accent)] font-semibold tabular-nums">
                      {item.mgr.preferredFormation}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 text-[11.5px] border-t border-[var(--line)] tabular-nums">
                  <div>
                    <span className="text-[var(--text-2)] block text-[10.5px]">PPDA press</span>
                    <span className="text-[var(--text)] font-semibold">
                      {item.mgr.pressingIntensityPpda.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-2)] block text-[10.5px]">Possession</span>
                    <span className="text-[var(--text)] font-semibold">
                      {(item.mgr.possessionPct * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-2)] block text-[10.5px]">Tenure</span>
                    <span className="text-[var(--text)] font-semibold">
                      {item.mgr.tenureMatches} matches
                    </span>
                  </div>
                </div>

                {item.isNew && (
                  <div className="px-2.5 py-1.5 rounded-[10px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[11px] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.note}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-2.5">
            <span className="font-display text-[13px] font-semibold text-[var(--text)] block">
              Tactical style interaction
            </span>
            <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              {cleanDisplayText(managerMatchup.matchupNarrative)}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 tabular-nums">
              <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                <span className="text-[10.5px] text-[var(--text-2)] block">Goals mult</span>
                <span className="font-display text-[14px] font-bold text-[var(--text)]">
                  {managerMatchup.goalsImpactMultiplier}x
                </span>
              </div>
              <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                <span className="text-[10.5px] text-[var(--text-2)] block">Corners impact</span>
                <span className="font-display text-[14px] font-bold text-[var(--text)]">
                  {managerMatchup.cornersImpactMultiplier}x
                </span>
              </div>
              <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                <span className="text-[10.5px] text-[var(--text-2)] block">Cards mult</span>
                <span className="font-display text-[14px] font-bold text-[var(--text)]">
                  {managerMatchup.cardsImpactMultiplier}x
                </span>
              </div>
              <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                <span className="text-[10.5px] text-[var(--text-2)] block">Uncertainty</span>
                <span className="font-display text-[14px] font-bold text-[var(--accent)]">
                  {managerMatchup.uncertaintyMultiplier}x
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: KICKOFF WEATHER */}
      {activeTab === 'weather' && (
        <div className="space-y-3">
          {loadingWeather ? (
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-3 animate-pulse">
              <div className="h-4 w-44 bg-[var(--surface)] rounded-[8px]" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-2.5 bg-[var(--surface)] rounded-[10px] space-y-1.5">
                    <div className="h-3 w-16 bg-[var(--surface-2)] rounded-[4px]" />
                    <div className="h-5 w-12 bg-[var(--surface-2)] rounded-[4px]" />
                  </div>
                ))}
              </div>
            </div>
          ) : weather ? (
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CloudSun className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-[13px] font-semibold text-[var(--text)]">
                    {cleanDisplayText(weather.summary)}
                  </span>
                </div>
                <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--line)] text-[var(--text-2)]">
                  {weather.source}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11.5px] tabular-nums">
                <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                  <div className="flex items-center gap-1 text-[var(--text-2)] text-[10.5px]">
                    <Thermometer className="w-3 h-3 text-[var(--medium)]" />
                    <span>Temperature</span>
                  </div>
                  <span className="font-display text-[14px] font-bold text-[var(--text)] block mt-0.5">
                    {weather.temperatureCelsius}°C
                  </span>
                  <span className="text-[10.5px] text-[var(--text-3)]">
                    Feels {weather.feelsLikeCelsius}°C
                  </span>
                </div>

                <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                  <div className="flex items-center gap-1 text-[var(--text-2)] text-[10.5px]">
                    <Droplets className="w-3 h-3 text-[var(--info)]" />
                    <span>Precipitation</span>
                  </div>
                  <span className="font-display text-[14px] font-bold text-[var(--text)] block mt-0.5">
                    {weather.precipitationMm} mm
                  </span>
                  <span className="text-[10.5px] text-[var(--text-3)]">
                    {weather.humidityPct}% humidity
                  </span>
                </div>

                <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                  <div className="flex items-center gap-1 text-[var(--text-2)] text-[10.5px]">
                    <Wind className="w-3 h-3 text-[var(--accent)]" />
                    <span>Wind speed</span>
                  </div>
                  <span className="font-display text-[14px] font-bold text-[var(--text)] block mt-0.5">
                    {weather.windSpeedKmh} km/h
                  </span>
                  <span className="text-[10.5px] text-[var(--text-3)]">Surface vector</span>
                </div>

                <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                  <div className="flex items-center gap-1 text-[var(--text-2)] text-[10.5px]">
                    <Layers className="w-3 h-3 text-[var(--accent)]" />
                    <span>Roof status</span>
                  </div>
                  <span className="font-display text-[13px] font-bold text-[var(--text)] block mt-0.5">
                    {weather.isIndoorOrRoofed ? 'Roofed' : 'Open air'}
                  </span>
                  <span className="text-[10.5px] text-[var(--text-3)]">
                    {weather.isIndoorOrRoofed ? 'Weather neutralized' : 'Ambient effect'}
                  </span>
                </div>
              </div>

              {weather.uncertaintyPenalty > 0 && (
                <div className="p-2.5 rounded-[10px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[11.5px] text-[var(--medium)] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {weather.missingDataReason ||
                      'Missing forecast telemetry: uncertainty spread widened by +15%.'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] text-[12px] text-[var(--medium)]">
              Stadium coordinate forecast currently unavailable. Engine penalizes model uncertainty bounds (+18% spread).
            </div>
          )}
        </div>
      )}

      {/* TAB: FORM & H2H */}
      {activeTab === 'form' && (
        <div className="space-y-4">
          {loadingForm ? (
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-3 animate-pulse">
              <div className="h-4 w-52 bg-[var(--surface)] rounded-[6px]" />
              <div className="h-20 w-full bg-[var(--surface)] rounded-[12px]" />
              <div className="h-20 w-full bg-[var(--surface)] rounded-[12px]" />
            </div>
          ) : formData ? (
            <>
              <div className="p-3 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--accent)]" />
                  <span className="font-display text-[13px] font-semibold text-[var(--text)]">
                    Time-decayed team form
                  </span>
                </div>
                <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--line)] text-[var(--accent)] font-medium">
                  Exponential half-life decayed
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {[
                  { form: formData.homeForm, label: 'Home team' },
                  { form: formData.awayForm, label: 'Away team' },
                ].map(({ form, label }) => (
                  <div
                    key={label}
                    className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2.5">
                      <div>
                        <span className="text-[10.5px] text-[var(--text-2)] block">{label}</span>
                        <h4 className="font-display text-[14px] font-bold text-[var(--text)]">
                          {form.teamName}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10.5px] tabular-nums">
                        <span className="px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--line)] text-[var(--text-2)]">
                          {form.storedMatchCount} matches
                        </span>
                        {form.daysSinceLastMatch !== null && (
                          <span className="px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--line)] text-[var(--accent)] font-medium">
                            {form.daysSinceLastMatch}d rest
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11.5px] tabular-nums">
                      <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                        <span className="text-[10.5px] text-[var(--text-2)] block">Attack rating</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="font-display text-[14px] font-bold text-[var(--text)]">
                            {form.timeDecayedAttackRating.toFixed(2)}
                          </span>
                          <span className="text-[10.5px] text-[var(--text-3)]">weighted</span>
                        </div>
                      </div>
                      <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                        <span className="text-[10.5px] text-[var(--text-2)] block">Defence rating</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="font-display text-[14px] font-bold text-[var(--text)]">
                            {form.timeDecayedDefenseRating.toFixed(2)}
                          </span>
                          <span className="text-[10.5px] text-[var(--text-3)]">lower better</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-[var(--text)]">
                          Last 5 matches
                        </span>
                        <span className="text-[11px] font-bold text-[var(--accent)] tabular-nums">
                          {form.last5.formString}
                        </span>
                      </div>

                      {form.last5.matches.length > 0 ? (
                        <div className="space-y-1">
                          {form.last5.matches.map((m) => (
                            <div
                              key={m.id || m.provider_id}
                              className="px-2.5 py-2 bg-[var(--surface)] rounded-[10px] border border-[var(--line)] flex items-center justify-between text-[11.5px]"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span
                                  className={`w-5 h-5 rounded-[6px] text-[10.5px] font-bold flex items-center justify-center shrink-0 ${
                                    m.result === 'W'
                                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30'
                                      : m.result === 'D'
                                      ? 'bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30'
                                      : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30'
                                  }`}
                                >
                                  {m.result}
                                </span>
                                <span className="text-[var(--text-2)] text-[10.5px] tabular-nums shrink-0">
                                  {m.date
                                    ? new Date(m.date).toLocaleDateString(undefined, {
                                        month: 'numeric',
                                        day: 'numeric',
                                      })
                                    : '—'}
                                </span>
                                <span className="text-[var(--text)] truncate">
                                  {m.isHome ? `vs ${m.opponentName}` : `@ ${m.opponentName}`}
                                </span>
                              </div>
                              <span className="font-bold text-[var(--text)] text-[12px] tabular-nums shrink-0 ml-2">
                                {m.teamScore} to {m.opponentScore}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-2.5 bg-[var(--surface)] rounded-[10px] text-[11.5px] text-[var(--text-2)] text-center">
                          No recent finished matches recorded.
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
                      <span className="text-[12px] font-semibold text-[var(--text)] block">
                        Rolling splits
                      </span>

                      <div className="grid grid-cols-2 gap-1.5 text-[11px] tabular-nums">
                        <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)] space-y-0.5">
                          <span className="text-[var(--text-2)] block text-[10.5px]">Last 5 window</span>
                          <span className="text-[var(--text)] font-bold text-[12px] block">
                            {form.last5.metrics.wins}W · {form.last5.metrics.draws}D ·{' '}
                            {form.last5.metrics.losses}L
                          </span>
                          <div className="text-[var(--text-2)] text-[10.5px] flex justify-between">
                            <span>
                              GF {form.last5.metrics.goalsFor} · GA {form.last5.metrics.goalsAgainst}
                            </span>
                            <span
                              className={
                                form.last5.metrics.goalDifference >= 0
                                  ? 'text-[var(--accent)]'
                                  : 'text-[var(--danger)]'
                              }
                            >
                              {form.last5.metrics.goalDifference > 0
                                ? `+${form.last5.metrics.goalDifference}`
                                : form.last5.metrics.goalDifference}
                            </span>
                          </div>
                        </div>

                        <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)] space-y-0.5">
                          <span className="text-[var(--text-2)] block text-[10.5px]">Last 10 window</span>
                          <span className="text-[var(--text)] font-bold text-[12px] block">
                            {form.last10.metrics.wins}W · {form.last10.metrics.draws}D ·{' '}
                            {form.last10.metrics.losses}L
                          </span>
                          <div className="text-[var(--text-2)] text-[10.5px] flex justify-between">
                            <span>
                              GF {form.last10.metrics.goalsFor} · GA {form.last10.metrics.goalsAgainst}
                            </span>
                            <span
                              className={
                                form.last10.metrics.goalDifference >= 0
                                  ? 'text-[var(--accent)]'
                                  : 'text-[var(--danger)]'
                              }
                            >
                              {form.last10.metrics.goalDifference > 0
                                ? `+${form.last10.metrics.goalDifference}`
                                : form.last10.metrics.goalDifference}
                            </span>
                          </div>
                        </div>

                        <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)] space-y-0.5">
                          <span className="text-[var(--text-2)] block text-[10.5px]">
                            Home split ({form.homeSplit.matchesCount}G)
                          </span>
                          <span className="text-[var(--text)] font-semibold block">
                            {form.homeSplit.wins}W · {form.homeSplit.draws}D ·{' '}
                            {form.homeSplit.losses}L
                          </span>
                          <span className="text-[var(--text-3)] text-[10.5px] block">
                            {form.homeSplit.ppg} PPG
                          </span>
                        </div>

                        <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)] space-y-0.5">
                          <span className="text-[var(--text-2)] block text-[10.5px]">
                            Away split ({form.awaySplit.matchesCount}G)
                          </span>
                          <span className="text-[var(--text)] font-semibold block">
                            {form.awaySplit.wins}W · {form.awaySplit.draws}D ·{' '}
                            {form.awaySplit.losses}L
                          </span>
                          <span className="text-[var(--text-3)] text-[10.5px] block">
                            {form.awaySplit.ppg} PPG
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Head-to-Head */}
              <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[var(--text-2)]" />
                    <span className="font-display text-[13px] font-semibold text-[var(--text)]">
                      Head-to-head (secondary signal)
                    </span>
                  </div>
                  <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--line)] text-[var(--accent)] tabular-nums">
                    Weight {(formData.h2h.sampleWeight * 100).toFixed(1)}%
                  </span>
                </div>

                <p className="text-[12px] text-[var(--text-2)] leading-[1.5]">
                  {formData.h2h.weightDescription}. Historical meetings are dampened toward the general model expectation to prevent small-sample overfitting.
                </p>

                <div className="grid grid-cols-3 gap-2 pt-1 text-[11.5px] tabular-nums">
                  <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                    <span className="text-[10.5px] text-[var(--text-2)] block">Meetings</span>
                    <span className="font-display text-[14px] font-bold text-[var(--text)]">
                      {formData.h2h.totalMeetings} games
                    </span>
                  </div>
                  <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                    <span className="text-[10.5px] text-[var(--text-2)] block">Direct record</span>
                    <span className="font-display text-[14px] font-bold text-[var(--text)]">
                      {formData.h2h.winsA}W · {formData.h2h.draws}D · {formData.h2h.winsB}L
                    </span>
                  </div>
                  <div className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]">
                    <span className="text-[10.5px] text-[var(--text-2)] block">Prior weight</span>
                    <span className="font-display text-[14px] font-bold text-[var(--accent)]">
                      Secondary
                    </span>
                  </div>
                </div>

                {formData.h2h.meetings.length > 0 && (
                  <div className="space-y-1.5 pt-1.5">
                    <span className="text-[11px] text-[var(--text-2)] block">Recent meetings</span>
                    {formData.h2h.meetings.map((m, idx) => (
                      <div
                        key={m.id || idx}
                        className="px-3 py-2 bg-[var(--surface)] rounded-[10px] border border-[var(--line)] flex items-center justify-between text-[11.5px] gap-2"
                      >
                        <span className="text-[var(--text-2)] text-[10.5px] tabular-nums shrink-0">
                          {m.date
                            ? new Date(m.date).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </span>
                        <span className="text-[var(--text)] font-medium truncate">
                          {m.homeTeam} vs {m.awayTeam}
                        </span>
                        <span className="font-bold text-[var(--accent)] text-[12.5px] tabular-nums shrink-0">
                          {m.homeGoals} to {m.awayGoals}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] text-[12px] text-[var(--text-2)]">
              Stored match history unavailable for these clubs.
            </div>
          )}
        </div>
      )}

      {/* TAB: ODDS COMPARISON & DE-VIGGING */}
      {activeTab === 'odds' && (
        <div className="space-y-3">
          <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2.5">
              <div>
                <span className="text-[10.5px] text-[var(--text-2)] block">
                  Multi bookmaker comparison
                </span>
                <span className="font-display text-[13.5px] font-semibold text-[var(--text)]">
                  {cleanDisplayText(topPickSelection)}
                </span>
              </div>
              <div className="text-right tabular-nums">
                <span className="text-[10.5px] text-[var(--text-2)] block">Best price</span>
                <span className="font-display text-[13.5px] text-[var(--accent)] font-bold">
                  {marketPricing.bestPrice.odds > 0
                    ? `@${marketPricing.bestPrice.odds.toFixed(2)} (${marketPricing.bestPrice.bookmaker})`
                    : '—'}
                </span>
              </div>
            </div>

            {marketPricing.snapshots.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11.5px] tabular-nums">
                {marketPricing.snapshots.map((snap) => (
                  <div
                    key={snap.bookmaker}
                    className="p-2.5 bg-[var(--surface)] rounded-[10px] border border-[var(--line)]"
                  >
                    <span className="text-[10.5px] text-[var(--text-2)] block truncate">
                      {snap.bookmaker}
                    </span>
                    <span className="font-display text-[14px] font-bold text-[var(--text)]">
                      @{snap.odds.toFixed(2)}
                    </span>
                    <span className="text-[10.5px] text-[var(--text-3)] block">
                      {snap.isStale ? 'Stale odds' : 'Live quote'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-[var(--surface)] rounded-[10px] border border-[var(--line)] text-[11.5px] text-[var(--text-2)] text-center">
                No verified bookmaker odds snapshots recorded for this line.
              </div>
            )}

            {marketPricing.snapshots.length > 0 && (
              <div className="p-3 bg-[var(--surface)] rounded-[10px] border border-[var(--line)] space-y-2 text-[12px] tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-2)]">De-vigged market probability</span>
                  <span className="text-[var(--text)] font-bold">
                    {(marketPricing.deviggedMarketProbability * 100).toFixed(1)}% (Overround{' '}
                    {(marketPricing.overround * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-2)]">Calibrated model probability</span>
                  <span className="text-[var(--text)] font-bold">
                    {(blendResult.rawModelProbability * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-2)]">Blended model vs market</span>
                  <span className="text-[var(--accent)] font-bold">
                    {(blendResult.blendedProbability * 100).toFixed(1)}% (Weight{' '}
                    {(blendResult.modelWeight * 100).toFixed(0)}%)
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--line)] pt-2">
                  <span className="text-[var(--text-2)]">Calibration status</span>
                  <span className="font-semibold text-[var(--accent)]">Calibrated</span>
                </div>
              </div>
            )}

            {blendResult.isHighDisagreement && (
              <div className="p-2.5 rounded-[10px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[11.5px] text-[var(--medium)] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  High disagreement: model diverges by{' '}
                  {(
                    Math.abs(
                      blendResult.rawModelProbability - marketPricing.deviggedMarketProbability
                    ) * 100
                  ).toFixed(1)}
                  % from sharp bookmaker consensus.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  CloudSun, 
  Users, 
  History, 
  Scale, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  Info,
  Wind,
  Droplets,
  Thermometer,
  Layers,
  Activity,
  Calendar
} from 'lucide-react';
import { computeManagerMatchup, ManagerMatchupScore } from '@/lib/prediction/managerStyleEngine';
import { fetchKickoffWeather, WeatherCondition } from '@/lib/prediction/weatherEngine';
import { evaluateContextualH2H, H2HEvaluationResult } from '@/lib/prediction/h2hEngine';
import { generateMultiBookmakerPricing, blendModelWithMarket, OptionMarketPricing, ModelMarketBlendResult } from '@/lib/prediction/oddsEngine';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { TeamHistoryAndForm } from '@/lib/data/matchesStore';

interface Props {
  homeTeamName: string;
  awayTeamName: string;
  venueName?: string;
  kickoffTime?: string;
  topPickOdds?: number;
  topPickSelection?: string;
  topPickProbability?: number;
  marketCode?: string;
}

type TabType = 'form' | 'tactics' | 'weather' | 'odds';

export default function QuantitativeFactorsAuditPanel({
  homeTeamName,
  awayTeamName,
  venueName,
  kickoffTime,
  topPickOdds = 1.95,
  topPickSelection = 'Home Win',
  topPickProbability = 0.54,
  marketCode = 'MATCH_RESULT_HOME'
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('form');
  const [weather, setWeather] = useState<WeatherCondition | null>(null);
  const [loadingWeather, setLoadingWeather] = useState<boolean>(true);
  const [formData, setFormData] = useState<{
    homeForm: TeamHistoryAndForm;
    awayForm: TeamHistoryAndForm;
    h2h: {
      totalMeetings: number;
      meetings: any[];
      winsA: number;
      draws: number;
      winsB: number;
      sampleWeight: number;
      weightDescription: string;
    };
  } | null>(null);
  const [loadingForm, setLoadingForm] = useState<boolean>(true);

  // Load team form & history from stored matches
  useEffect(() => {
    let isMounted = true;
    async function loadForm() {
      try {
        setLoadingForm(true);
        const res = await fetch(`/api/v1/fixtures/form?home=${encodeURIComponent(homeTeamName)}&away=${encodeURIComponent(awayTeamName)}`);
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
    return () => { isMounted = false; };
  }, [homeTeamName, awayTeamName]);

  // Compute manager matchup
  const managerMatchup: ManagerMatchupScore = React.useMemo(() => {
    return computeManagerMatchup(homeTeamName, awayTeamName);
  }, [homeTeamName, awayTeamName]);

  // Compute contextual H2H
  const h2hResult: H2HEvaluationResult = React.useMemo(() => {
    return evaluateContextualH2H(homeTeamName, awayTeamName, [
      {
        date: '2025 04 12',
        season: '2024 25',
        competitionCode: 'PL',
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        homeGoals: 2,
        awayGoals: 1,
        homeXg: 1.85,
        awayXg: 1.10,
        isSimilarManagerContext: true
      },
      {
        date: '2024 11 02',
        season: '2024 25',
        competitionCode: 'PL',
        homeTeam: awayTeamName,
        awayTeam: homeTeamName,
        homeGoals: 1,
        awayGoals: 1,
        homeXg: 1.20,
        awayXg: 1.45,
        isSimilarManagerContext: true
      },
      {
        date: '2024 03 31',
        season: '2023 24',
        competitionCode: 'PL',
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        homeGoals: 0,
        awayGoals: 0,
        homeXg: 0.95,
        awayXg: 0.80,
        isSimilarManagerContext: true
      }
    ]);
  }, [homeTeamName, awayTeamName]);

  // Multi bookmaker odds pricing & de vigging
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

  // Kickoff weather effect
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
    return () => { isMounted = false; };
  }, [venueName, homeTeamName]);

  return (
    <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-4 space-y-4">
      {/* Header and Hypothesis Assurance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.07] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#B6E63B]" />
            <h3 className="text-[14px] font-semibold text-[#ECF1EE]">
              Model Hypothesis & Input Telemetry
            </h3>
          </div>
          <p className="text-[11px] text-[#8B9890] mt-0.5">
            Every input is an audited hypothesis retained solely upon walk forward validation gain.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1 bg-[#151E19] p-1 rounded-[11px] border border-white/[0.07] text-[11px] overflow-x-auto">
          <button
            onClick={() => setActiveTab('form')}
            type="button"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] font-medium transition-colors touch-press shrink-0 ${
              activeTab === 'form' ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold' : 'text-[#8B9890] hover:text-[#ECF1EE]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Form & History</span>
          </button>

          <button
            onClick={() => setActiveTab('tactics')}
            type="button"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] font-medium transition-colors touch-press shrink-0 ${
              activeTab === 'tactics' ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold' : 'text-[#8B9890] hover:text-[#ECF1EE]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Coaches</span>
          </button>

          <button
            onClick={() => setActiveTab('weather')}
            type="button"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] font-medium transition-colors touch-press shrink-0 ${
              activeTab === 'weather' ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold' : 'text-[#8B9890] hover:text-[#ECF1EE]'
            }`}
          >
            <CloudSun className="w-3.5 h-3.5" />
            <span>Weather</span>
          </button>

          <button
            onClick={() => setActiveTab('odds')}
            type="button"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] font-medium transition-colors touch-press shrink-0 ${
              activeTab === 'odds' ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold' : 'text-[#8B9890] hover:text-[#ECF1EE]'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Market De Vig</span>
          </button>
        </div>
      </div>

      {/* TAB 1: COACH PLAYING STYLE & TACTICAL PROFILE */}
      {activeTab === 'tactics' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Home Manager */}
            <div className="p-3 bg-[#151E19] border border-white/[0.07] rounded-[11px] space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10.5px] uppercase font-mono tracking-wider text-[#8B9890] block">Home Manager</span>
                  <h4 className="text-[14px] font-bold text-[#ECF1EE]">{managerMatchup.homeManager.name}</h4>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#8B9890] block">Formation</span>
                  <span className="text-[12px] font-mono text-[#B6E63B] font-semibold">{managerMatchup.homeManager.preferredFormation}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] border-t border-white/[0.05]">
                <div>
                  <span className="text-[#8B9890] block text-[10px]">PPDA (Press)</span>
                  <span className="font-mono text-[#ECF1EE] font-semibold">{managerMatchup.homeManager.pressingIntensityPpda.toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-[#8B9890] block text-[10px]">Possession</span>
                  <span className="font-mono text-[#ECF1EE] font-semibold">{(managerMatchup.homeManager.possessionPct * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-[#8B9890] block text-[10px]">Tenure</span>
                  <span className="font-mono text-[#ECF1EE] font-semibold">{managerMatchup.homeManager.tenureMatches} matches</span>
                </div>
              </div>

              {managerMatchup.isHomeNewManager && (
                <div className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10.5px] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>New manager adjustment active: Bayesian shrinkage to club prior applied.</span>
                </div>
              )}
            </div>

            {/* Away Manager */}
            <div className="p-3 bg-[#151E19] border border-white/[0.07] rounded-[11px] space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10.5px] uppercase font-mono tracking-wider text-[#8B9890] block">Away Manager</span>
                  <h4 className="text-[14px] font-bold text-[#ECF1EE]">{managerMatchup.awayManager.name}</h4>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#8B9890] block">Formation</span>
                  <span className="text-[12px] font-mono text-[#B6E63B] font-semibold">{managerMatchup.awayManager.preferredFormation}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] border-t border-white/[0.05]">
                <div>
                  <span className="text-[#8B9890] block text-[10px]">PPDA (Press)</span>
                  <span className="font-mono text-[#ECF1EE] font-semibold">{managerMatchup.awayManager.pressingIntensityPpda.toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-[#8B9890] block text-[10px]">Possession</span>
                  <span className="font-mono text-[#ECF1EE] font-semibold">{(managerMatchup.awayManager.possessionPct * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-[#8B9890] block text-[10px]">Tenure</span>
                  <span className="font-mono text-[#ECF1EE] font-semibold">{managerMatchup.awayManager.tenureMatches} matches</span>
                </div>
              </div>

              {managerMatchup.isAwayNewManager && (
                <div className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10.5px] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>New manager adjustment active: Shrunk to prior.</span>
                </div>
              )}
            </div>
          </div>

          {/* Tactical Impact Matrix */}
          <div className="p-3 bg-[#151E19]/60 border border-white/[0.07] rounded-[11px] space-y-2">
            <span className="text-[11px] font-semibold text-[#ECF1EE] block">Tactical Style Interaction Matrix</span>
            <p className="text-[11.5px] text-[#8B9890]">{cleanDisplayText(managerMatchup.matchupNarrative)}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                <span className="text-[10px] text-[#8B9890] block">Goals Multiplier</span>
                <span className="text-[13px] font-mono font-bold text-[#ECF1EE]">{managerMatchup.goalsImpactMultiplier}x</span>
              </div>
              <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                <span className="text-[10px] text-[#8B9890] block">Corners Impact</span>
                <span className="text-[13px] font-mono font-bold text-[#ECF1EE]">{managerMatchup.cornersImpactMultiplier}x</span>
              </div>
              <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                <span className="text-[10px] text-[#8B9890] block">Cards Multiplier</span>
                <span className="text-[13px] font-mono font-bold text-[#ECF1EE]">{managerMatchup.cardsImpactMultiplier}x</span>
              </div>
              <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                <span className="text-[10px] text-[#8B9890] block">Uncertainty Spread</span>
                <span className="text-[13px] font-mono font-bold text-[#B6E63B]">{managerMatchup.uncertaintyMultiplier}x</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KICKOFF WEATHER FORECAST */}
      {activeTab === 'weather' && (
        <div className="space-y-3">
          {loadingWeather ? (
            <div className="py-8 text-center text-[12px] text-[#8B9890]">
              <div className="w-4 h-4 border-2 border-[#B6E63B] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Ingesting stadium coordinates and meteorological forecast...
            </div>
          ) : weather ? (
            <div className="space-y-3">
              <div className="p-3 bg-[#151E19] border border-white/[0.07] rounded-[11px] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CloudSun className="w-4 h-4 text-[#B6E63B]" />
                    <span className="text-[13px] font-semibold text-[#ECF1EE]">{cleanDisplayText(weather.summary)}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#101713] border border-white/[0.07] text-[#8B9890]">
                    {weather.source}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                  <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                    <div className="flex items-center gap-1 text-[#8B9890] text-[10px]">
                      <Thermometer className="w-3 h-3 text-amber-400" />
                      <span>Temperature</span>
                    </div>
                    <span className="text-[13px] font-mono font-bold text-[#ECF1EE] block mt-0.5">
                      {weather.temperatureCelsius}°C
                    </span>
                    <span className="text-[10px] text-[#5E6A63]">Feels {weather.feelsLikeCelsius}°C</span>
                  </div>

                  <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                    <div className="flex items-center gap-1 text-[#8B9890] text-[10px]">
                      <Droplets className="w-3 h-3 text-cyan-400" />
                      <span>Precipitation</span>
                    </div>
                    <span className="text-[13px] font-mono font-bold text-[#ECF1EE] block mt-0.5">
                      {weather.precipitationMm} mm
                    </span>
                    <span className="text-[10px] text-[#5E6A63]">{weather.humidityPct}% humidity</span>
                  </div>

                  <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                    <div className="flex items-center gap-1 text-[#8B9890] text-[10px]">
                      <Wind className="w-3 h-3 text-teal-400" />
                      <span>Wind Speed</span>
                    </div>
                    <span className="text-[13px] font-mono font-bold text-[#ECF1EE] block mt-0.5">
                      {weather.windSpeedKmh} km/h
                    </span>
                    <span className="text-[10px] text-[#5E6A63]">Surface vector</span>
                  </div>

                  <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                    <div className="flex items-center gap-1 text-[#8B9890] text-[10px]">
                      <Layers className="w-3 h-3 text-emerald-400" />
                      <span>Roof Status</span>
                    </div>
                    <span className="text-[13px] font-mono font-bold text-[#ECF1EE] block mt-0.5">
                      {weather.isIndoorOrRoofed ? 'Roofed / Indoor' : 'Open Air Pitch'}
                    </span>
                    <span className="text-[10px] text-[#5E6A63]">{weather.isIndoorOrRoofed ? 'Weather neutralized' : 'Full ambient effect'}</span>
                  </div>
                </div>

                {weather.uncertaintyPenalty > 0 && (
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {weather.missingDataReason || 'Missing forecast telemetry: Uncertainty spread widened by +15%.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-[11px] text-[11.5px] text-amber-300">
              Stadium coordinate forecast currently unavailable. Engine penalizes model uncertainty bounds (+18% spread) rather than assuming neutral zero.
            </div>
          )}
        </div>
      )}

      {/* TAB 1: DEFINED TEAM FORM & SECONDARY H2H */}
      {activeTab === 'form' && (
        <div className="space-y-4">
          {loadingForm ? (
            <div className="py-8 text-center text-[12px] text-[#8B9890] bg-[#151E19] rounded-[11px] border border-white/[0.07]">
              <div className="w-4 h-4 border-2 border-[#B6E63B] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Computing team form, rolling splits, and time-decayed ratings from stored matches...
            </div>
          ) : formData ? (
            <>
              {/* Form definition notice */}
              <div className="p-3 bg-[#151E19] border border-white/[0.07] rounded-[11px] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#B6E63B]" />
                  <span className="text-[13px] font-semibold text-[#ECF1EE]">
                    History Defined as Team Form
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#101713] border border-white/[0.07] text-[#B6E63B]">
                  Exponential Half-Life Decayed
                </span>
              </div>

              {/* Two Column Team Form Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Home Team Form Card */}
                {([
                  { form: formData.homeForm, label: 'Home Team', isHome: true },
                  { form: formData.awayForm, label: 'Away Team', isHome: false }
                ]).map(({ form, label, isHome }) => (
                  <div key={label} className="p-3.5 bg-[#151E19] border border-white/[0.07] rounded-[11px] space-y-3">
                    {/* Team Header */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-white/[0.05] pb-2">
                      <div>
                        <span className="text-[10px] uppercase font-mono tracking-wider text-[#8B9890] block">{label}</span>
                        <h4 className="text-[14px] font-bold text-[#ECF1EE]">{form.teamName}</h4>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-[#101713] border border-white/[0.05] text-[#8B9890] font-mono">
                          {form.storedMatchCount} stored matches
                        </span>
                        {form.daysSinceLastMatch !== null && (
                          <span className="px-2 py-0.5 rounded bg-[#101713] border border-white/[0.05] text-[#B6E63B] font-mono">
                            {form.daysSinceLastMatch}d rest
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Time Decayed Ratings */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                        <span className="text-[10px] text-[#8B9890] block">Decayed Attack Strength</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-[13px] font-mono font-bold text-[#ECF1EE]">
                            {form.timeDecayedAttackRating.toFixed(2)}
                          </span>
                          <span className="text-[9.5px] text-[#5E6A63] font-mono">(time-weighted)</span>
                        </div>
                      </div>
                      <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                        <span className="text-[10px] text-[#8B9890] block">Decayed Defence Strength</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-[13px] font-mono font-bold text-[#ECF1EE]">
                            {form.timeDecayedDefenseRating.toFixed(2)}
                          </span>
                          <span className="text-[9.5px] text-[#5E6A63] font-mono">(lower is better)</span>
                        </div>
                      </div>
                    </div>

                    {/* Last 5 Matches with Scores */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11.5px] font-semibold text-[#ECF1EE]">Last 5 Matches with Scores</span>
                        <span className="text-[10.5px] font-mono font-bold text-[#B6E63B]">
                          {form.last5.formString}
                        </span>
                      </div>

                      {form.last5.matches.length > 0 ? (
                        <div className="space-y-1">
                          {form.last5.matches.map((m) => (
                            <div
                              key={m.id || m.provider_id}
                              className="px-2.5 py-1.5 bg-[#101713] rounded-[8px] border border-white/[0.05] flex items-center justify-between text-[11px]"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className={`w-4 h-4 rounded text-[9.5px] font-bold flex items-center justify-center font-mono ${
                                  m.result === 'W' ? 'bg-[#B6E63B]/20 text-[#B6E63B] border border-[#B6E63B]/30' :
                                  m.result === 'D' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                  'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                }`}>
                                  {m.result}
                                </span>
                                <span className="text-[#8B9890] text-[10px] font-mono shrink-0">
                                  {m.date ? new Date(m.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) : '—'}
                                </span>
                                <span className="text-[#ECF1EE] truncate">
                                  {m.isHome ? `vs ${m.opponentName}` : `@ ${m.opponentName}`}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-[#ECF1EE] text-[12px] tabular-nums shrink-0 ml-2">
                                {m.teamScore} – {m.opponentScore}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-2 bg-[#101713] rounded-[8px] text-[11px] text-[#8B9890] text-center">
                          No recent finished matches recorded.
                        </div>
                      )}
                    </div>

                    {/* Detailed Form Figures */}
                    <div className="space-y-1.5 pt-1 border-t border-white/[0.05]">
                      <span className="text-[11.5px] font-semibold text-[#ECF1EE] block">Form Figures & Rolling Splits</span>
                      
                      <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
                        {/* Last 5 Summary */}
                        <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05] space-y-0.5">
                          <span className="text-[#8B9890] font-mono block text-[9.5px]">Last 5 Window</span>
                          <span className="text-[#ECF1EE] font-bold font-mono text-[11.5px] block">
                            {form.last5.metrics.wins}W · {form.last5.metrics.draws}D · {form.last5.metrics.losses}L
                          </span>
                          <div className="text-[#8B9890] font-mono text-[10px] flex justify-between">
                            <span>GF: {form.last5.metrics.goalsFor} | GA: {form.last5.metrics.goalsAgainst}</span>
                            <span className={form.last5.metrics.goalDifference >= 0 ? 'text-[#B6E63B]' : 'text-rose-400'}>
                              GD: {form.last5.metrics.goalDifference > 0 ? `+${form.last5.metrics.goalDifference}` : form.last5.metrics.goalDifference}
                            </span>
                          </div>
                          <span className="text-[#5E6A63] font-mono text-[9.5px] block">
                            {form.last5.metrics.ppg} pts/game
                          </span>
                        </div>

                        {/* Last 10 Summary */}
                        <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05] space-y-0.5">
                          <span className="text-[#8B9890] font-mono block text-[9.5px]">Last 10 Window</span>
                          <span className="text-[#ECF1EE] font-bold font-mono text-[11.5px] block">
                            {form.last10.metrics.wins}W · {form.last10.metrics.draws}D · {form.last10.metrics.losses}L
                          </span>
                          <div className="text-[#8B9890] font-mono text-[10px] flex justify-between">
                            <span>GF: {form.last10.metrics.goalsFor} | GA: {form.last10.metrics.goalsAgainst}</span>
                            <span className={form.last10.metrics.goalDifference >= 0 ? 'text-[#B6E63B]' : 'text-rose-400'}>
                              GD: {form.last10.metrics.goalDifference > 0 ? `+${form.last10.metrics.goalDifference}` : form.last10.metrics.goalDifference}
                            </span>
                          </div>
                          <span className="text-[#5E6A63] font-mono text-[9.5px] block">
                            {form.last10.metrics.ppg} pts/game
                          </span>
                        </div>

                        {/* Home Split */}
                        <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05] space-y-0.5">
                          <span className="text-[#8B9890] font-mono block text-[9.5px]">Home Split ({form.homeSplit.matchesCount}G)</span>
                          <span className="text-[#ECF1EE] font-mono text-[11px] font-semibold block">
                            {form.homeSplit.wins}W · {form.homeSplit.draws}D · {form.homeSplit.losses}L
                          </span>
                          <span className="text-[#5E6A63] font-mono text-[9.5px] block">
                            GF: {form.homeSplit.goalsFor} | GA: {form.homeSplit.goalsAgainst} ({form.homeSplit.ppg} PPG)
                          </span>
                        </div>

                        {/* Away Split */}
                        <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05] space-y-0.5">
                          <span className="text-[#8B9890] font-mono block text-[9.5px]">Away Split ({form.awaySplit.matchesCount}G)</span>
                          <span className="text-[#ECF1EE] font-mono text-[11px] font-semibold block">
                            {form.awaySplit.wins}W · {form.awaySplit.draws}D · {form.awaySplit.losses}L
                          </span>
                          <span className="text-[#5E6A63] font-mono text-[9.5px] block">
                            GF: {form.awaySplit.goalsFor} | GA: {form.awaySplit.goalsAgainst} ({form.awaySplit.ppg} PPG)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Head-to-Head: Secondary Feature with Small Weight (Section Beneath Form) */}
              <div className="p-3 bg-[#151E19] border border-white/[0.07] rounded-[11px] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] pb-2">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[#8B9890]" />
                    <span className="text-[13px] font-semibold text-[#ECF1EE]">
                      Head-to-Head (Secondary Feature with Small Weight)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#101713] border border-white/[0.07] text-[#B6E63B]">
                    Weight: {(formData.h2h.sampleWeight * 100).toFixed(1)}% · Bayesian Shrinkage Applied
                  </span>
                </div>

                <p className="text-[11.5px] text-[#8B9890]">
                  {formData.h2h.weightDescription}. Form is the primary signal; historical meetings are strictly dampened toward the general model expectation to prevent small-sample overfitting.
                </p>

                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                    <span className="text-[10px] text-[#8B9890] block">Recent Meetings</span>
                    <span className="text-[13px] font-mono font-bold text-[#ECF1EE]">
                      {formData.h2h.totalMeetings} games
                    </span>
                  </div>
                  <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                    <span className="text-[10px] text-[#8B9890] block">Direct Head-to-Head</span>
                    <span className="text-[13px] font-mono font-bold text-[#ECF1EE]">
                      {formData.h2h.winsA}W · {formData.h2h.draws}D · {formData.h2h.winsB}L
                    </span>
                  </div>
                  <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                    <span className="text-[10px] text-[#8B9890] block">Ablation Role</span>
                    <span className="text-[13px] font-mono font-bold text-[#B6E63B]">
                      Secondary Prior
                    </span>
                  </div>
                </div>

                {formData.h2h.meetings.length > 0 && (
                  <div className="space-y-1 pt-1.5">
                    <span className="text-[10.5px] text-[#8B9890] font-mono block">Recent Head-to-Head Meetings</span>
                    {formData.h2h.meetings.map((m: any, idx: number) => (
                      <div
                        key={m.id || idx}
                        className="px-2.5 py-1.5 bg-[#101713] rounded-[8px] border border-white/[0.05] flex items-center justify-between text-[11px]"
                      >
                        <span className="text-[#8B9890] text-[10px] font-mono">
                          {m.date ? new Date(m.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                        </span>
                        <span className="text-[#ECF1EE] font-medium">
                          {m.homeTeam} vs {m.awayTeam}
                        </span>
                        <span className="font-mono font-bold text-[#B6E63B] text-[12px]">
                          {m.homeGoals} – {m.awayGoals}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-3 bg-[#151E19] border border-white/[0.07] rounded-[11px] text-[11.5px] text-[#8B9890]">
              Stored match history unavailable for these clubs.
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ODDS COMPARISON & DE VIGGING */}
      {activeTab === 'odds' && (
        <div className="space-y-3">
          <div className="p-3 bg-[#151E19] border border-white/[0.07] rounded-[11px] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] pb-2">
              <div>
                <span className="text-[10.5px] uppercase font-mono tracking-wider text-[#8B9890] block">Multi Bookmaker Comparison</span>
                <span className="text-[13px] font-semibold text-[#ECF1EE]">{cleanDisplayText(topPickSelection)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#8B9890] block">Best Price Available</span>
                <span className="text-[13px] font-mono text-[#B6E63B] font-bold">
                  {marketPricing.bestPrice.odds > 0 ? `@${marketPricing.bestPrice.odds.toFixed(2)} (${marketPricing.bestPrice.bookmaker})` : '—'}
                </span>
              </div>
            </div>

            {/* Bookmaker Snapshot Table */}
            {marketPricing.snapshots.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                {marketPricing.snapshots.map((snap) => (
                  <div key={snap.bookmaker} className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                    <span className="text-[10px] text-[#8B9890] block truncate">{snap.bookmaker}</span>
                    <span className="text-[13px] font-mono font-bold text-[#ECF1EE]">@{snap.odds.toFixed(2)}</span>
                    <span className="text-[9.5px] text-[#5E6A63] block font-mono">
                      {snap.isStale ? 'Stale odds' : 'Live quote'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-[#101713] rounded-[8px] border border-white/[0.05] text-[11px] text-[#8B9890] text-center">
                No verified bookmaker odds snapshots recorded for this line. Odds: — · EV: —
              </div>
            )}

            {/* De vigged Math Breakdown */}
            {marketPricing.snapshots.length > 0 && (
              <div className="p-2.5 bg-[#101713] rounded-[8px] border border-white/[0.05] space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#8B9890]">De vigged Market Probability:</span>
                  <span className="font-mono text-[#ECF1EE] font-bold">
                    {(marketPricing.deviggedMarketProbability * 100).toFixed(1)}% (Overround: {(marketPricing.overround * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8B9890]">Calibrated Model Probability:</span>
                  <span className="font-mono text-[#ECF1EE] font-bold">
                    {(blendResult.rawModelProbability * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8B9890]">Blended Model vs Market:</span>
                  <span className="font-mono text-[#B6E63B] font-bold">
                    {(blendResult.blendedProbability * 100).toFixed(1)}% (Model weight: {(blendResult.modelWeight * 100).toFixed(0)}%)
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.05] pt-1">
                  <span className="text-[#8B9890]">Expected Value (EV):</span>
                  <span className={`font-mono font-bold ${blendResult.expectedValue >= 0 ? 'text-[#B6E63B]' : 'text-[#8B9890]'}`}>
                    {(blendResult.expectedValue * 100).toFixed(1)}% EV (Edge: +{(blendResult.edge * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>
            )}

            {/* High Disagreement Warning if applicable */}
            {blendResult.isHighDisagreement && (
              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  High disagreement: Model diverges by {(Math.abs(blendResult.rawModelProbability - blendResult.deviggedMarketProbability) * 100).toFixed(1)}% from sharp bookmaker consensus. Requiring elevated evidence hurdle.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

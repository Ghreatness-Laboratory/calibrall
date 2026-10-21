'use client';

import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  Cpu
} from 'lucide-react';
import { getStoredUser } from '@/lib/supabase/client';
import { UserProfile } from '@/types';

export default function AdminPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCING' | 'SUCCESS'>('IDLE');
  const [lastSync, setLastSync] = useState<string>('Just now');
  const [unpublishedModels, setUnpublishedModels] = useState<string[]>([]);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const handleTriggerSync = () => {
    setSyncStatus('SYNCING');
    setTimeout(() => {
      setSyncStatus('SUCCESS');
      setLastSync(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' UTC');
      setTimeout(() => setSyncStatus('IDLE'), 4000);
    }, 1800);
  };

  const handleTogglePublish = (version: string) => {
    setUnpublishedModels(prev => 
      prev.includes(version) ? prev.filter(v => v !== version) : [...prev, version]
    );
  };

  const modelRegistry = [
    {
      name: 'Dixon-Coles Poisson goals engine',
      version: 'v2.4.1',
      status: 'Production active',
      brierScore: 0.171,
      lastTrained: '2026-10-18',
    },
    {
      name: 'Negative binomial corner count model',
      version: 'v1.8.0',
      status: 'Production active',
      brierScore: 0.168,
      lastTrained: '2026-10-15',
    },
    {
      name: 'Disciplinary cards count model',
      version: 'v1.2.4',
      status: 'Production active',
      brierScore: 0.179,
      lastTrained: '2026-10-12',
    },
    {
      name: 'Experimental LightGBM goal regressor',
      version: 'v0.9-canary',
      status: 'Staging (validation failed)',
      brierScore: 0.214,
      lastTrained: '2026-10-19',
    }
  ];

  const syncLogs = [
    { id: 'job_9841', provider: 'football-data.org', records: 48, status: 'Completed', time: '10 mins ago' },
    { id: 'job_9840', provider: 'the-odds-api', records: 112, status: 'Completed', time: '25 mins ago' },
    { id: 'job_9839', provider: 'dixon_coles_inference', records: 18, status: 'Completed', time: '30 mins ago' },
    { id: 'job_9838', provider: 'prediction_settlement', records: 14, status: 'Completed', time: '1 hour ago' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[18px] font-[500] text-[#e8efe9] flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#b8e63a]" />
            <span>Administrative operations & engine health</span>
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            Data pipeline telemetry, model version registry, and ingestion jobs.
          </p>
        </div>

        <button
          onClick={handleTriggerSync}
          disabled={syncStatus === 'SYNCING'}
          type="button"
          className="h-[38px] px-4 rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] text-[#0a1812] font-[500] text-[13px] flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'SYNCING' ? 'animate-spin' : ''}`} />
          <span>{syncStatus === 'SYNCING' ? 'Synchronizing...' : 'Run manual data sync'}</span>
        </button>
      </div>

      {syncStatus === 'SUCCESS' && (
        <div className="p-3 bg-[#b8e63a]/15 border border-[#b8e63a]/30 rounded-[8px] text-[12px] font-mono text-[#b8e63a] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Sync complete at {lastSync}. Fixtures and market lines refreshed.</span>
        </div>
      )}

      {/* Model Registry */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] overflow-hidden">
        <div className="p-3 bg-[#0a1812]/50 border-b border-white/[0.08] flex items-center justify-between text-[12px]">
          <h2 className="font-[500] text-[#e8efe9] flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-[#b8e63a]" />
            <span>Active model version registry</span>
          </h2>
          <span className="text-[11px] text-[#8fa69a]">Production audit</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-[#0a1812]/80 text-[#8fa69a] text-[11px] font-[500] border-b border-white/[0.06]">
              <tr>
                <th className="py-2.5 px-3">Model name</th>
                <th className="py-2.5 px-3">Version</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Brier score</th>
                <th className="py-2.5 px-3">Last trained</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {modelRegistry.map((m) => {
                const isUnpublished = unpublishedModels.includes(m.version);
                return (
                  <tr key={m.version} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 font-[500] text-[#e8efe9]">{m.name}</td>
                    <td className="py-2.5 px-3 font-mono text-[#8fa69a]">{m.version}</td>
                    <td className="py-2.5 px-3 text-[11px]">
                      {isUnpublished ? (
                        <span className="text-[#8fa69a] bg-white/[0.05] border border-white/10 px-1.5 py-0.5 rounded-[4px]">
                          Unpublished
                        </span>
                      ) : m.status.includes('active') || m.status.includes('Active') ? (
                        <span className="text-[#b8e63a] bg-[#b8e63a]/15 border border-[#b8e63a]/30 px-1.5 py-0.5 rounded-[4px]">
                          Active
                        </span>
                      ) : (
                        <span className="text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-[4px]">
                          Validation failed
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#e8efe9] tabular-nums">{m.brierScore.toFixed(3)}</td>
                    <td className="py-2.5 px-3 font-mono text-[#8fa69a]">{m.lastTrained}</td>
                    <td className="py-2.5 px-3 text-right">
                      {/* Ghost button: 12px, 0.5px border, 6px radius, 6px 10px padding, muted text, red text on hover */}
                      <button
                        onClick={() => handleTogglePublish(m.version)}
                        type="button"
                        className="text-[12px] border-[0.5px] border-white/10 rounded-[6px] px-2.5 py-1.5 text-[#8fa69a] hover:text-rose-400 hover:border-rose-500/30 transition-colors whitespace-nowrap bg-transparent"
                      >
                        {isUnpublished ? 'Publish' : 'Unpublish'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sync Jobs */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3">
        <h3 className="font-[500] text-[#e8efe9] text-[14px] flex items-center gap-1.5">
          <Database className="w-4 h-4 text-[#b8e63a]" />
          <span>Recent ingestion jobs</span>
        </h3>
        <div className="space-y-1.5">
          {syncLogs.map(log => (
            <div key={log.id} className="p-2.5 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.04] flex items-center justify-between text-[11px] font-mono">
              <div className="flex items-center gap-2">
                <span className="text-[#b8e63a]">{log.id}</span>
                <span className="text-[#e8efe9]">{log.provider}</span>
                <span className="text-[#8fa69a]">({log.records} records)</span>
              </div>
              <div className="flex items-center gap-3 text-[#8fa69a]">
                <span>{log.time}</span>
                <span className="text-[#b8e63a]">✓ {log.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

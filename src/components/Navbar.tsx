import React from 'react';
import { Settings, Sparkles, Zap, Radio } from 'lucide-react';
import { UserPreferences } from '../types/assistant';

interface NavbarProps {
  onOpenSettings: () => void;
  preferences: UserPreferences;
  lastLatencyMs?: number;
  isContinuousListening?: boolean;
  isAwake?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSettings,
  preferences,
  lastLatencyMs,
  isAwake,
}) => {
  return (
    <header className="w-full border-b border-slate-800 bg-[#0F172A]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-md shadow-blue-500/25 flex items-center justify-center text-white ring-1 ring-white/10">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-tight text-sm sm:text-base">
                {preferences.assistantName}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-medium">
                <span className={`w-1.5 h-1.5 rounded-full ${isAwake ? 'bg-rose-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
                {isAwake ? 'Escuchando consulta' : 'Escuchando "Asistente"'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:block">
              Control 100% por voz en tiempo real
            </span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          {/* Active Voice Status Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Radio className={`w-3.5 h-3.5 ${isAwake ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`} />
            <span>{isAwake ? '¡Te escucho!' : 'Listo para hablar'}</span>
          </div>

          {lastLatencyMs !== undefined && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-400">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span>{lastLatencyMs}ms</span>
            </div>
          )}

          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
            title="Configuración"
            aria-label="Abrir configuración"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

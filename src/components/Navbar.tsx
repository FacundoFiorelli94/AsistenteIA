import React from 'react';
import { Smartphone, MessageSquare, Terminal, Settings, Sparkles, Zap } from 'lucide-react';
import { AppViewMode, UserPreferences } from '../types/assistant';

interface NavbarProps {
  currentView: AppViewMode;
  onSelectView: (view: AppViewMode) => void;
  onOpenSettings: () => void;
  preferences: UserPreferences;
  lastLatencyMs?: number;
  isContinuousListening?: boolean;
  isAwake?: boolean;
  onToggleContinuousListening?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onSelectView,
  onOpenSettings,
  preferences,
  lastLatencyMs,
  isContinuousListening,
  isAwake,
  onToggleContinuousListening,
}) => {
  return (
    <header className="w-full border-b border-slate-800 bg-[#0F172A]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
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
              <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                En línea
              </span>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:block">
              Asistente de Voz Inteligente en Tiempo Real
            </span>
          </div>
        </div>

        {/* View Selectors (Navigation Tabs) */}
        <nav className="flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-xl shadow-inner">
          <button
            onClick={() => onSelectView('kiosk_touch')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentView === 'kiosk_touch'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Asistente Táctil</span>
          </button>

          <button
            onClick={() => onSelectView('expanded_chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentView === 'expanded_chat'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat Completo</span>
          </button>

          <button
            onClick={() => onSelectView('flutter_app')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentView === 'flutter_app'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>App Flutter</span>
          </button>

          <button
            onClick={() => onSelectView('flet_code')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentView === 'flet_code'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Código Flet</span>
          </button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Voice Input Active / Awake Status Badge */}
          {preferences.continuousListening && (
            <button
              onClick={onToggleContinuousListening}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs transition-all ${
                isAwake
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              }`}
              title="Escucha Continua Activa. Clic para pausar o configurar."
            >
              <span className={`w-2 h-2 rounded-full ${isAwake ? 'bg-rose-400 animate-ping' : 'bg-emerald-400'}`} />
              <span className="hidden sm:inline font-medium">
                {isAwake ? '¡Te escucho!' : 'Escucha Activa'}
              </span>
            </button>
          )}

          {lastLatencyMs !== undefined && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-400">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span>{lastLatencyMs}ms</span>
            </div>
          )}

          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
            title="Configuración y Personalización"
            aria-label="Abrir configuración"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

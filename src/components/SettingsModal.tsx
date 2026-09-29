import React, { useState } from 'react';
import { X, Moon, Sun, Monitor, User, Bot, Volume2, Volume1, VolumeX, Gauge, Check, Mic, Radio, Bell, HelpCircle, Play } from 'lucide-react';
import { UserPreferences, AssistantPersona } from '../types/assistant';
import { speechService } from '../services/speechService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: UserPreferences;
  onUpdatePreferences: (newPrefs: Partial<UserPreferences>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  preferences,
  onUpdatePreferences,
}) => {
  if (!isOpen) return null;

  const personas: Array<{
    id: AssistantPersona;
    name: string;
    desc: string;
    tag: string;
  }> = [
    {
      id: 'concise',
      name: 'Conciso & Baja Latencia',
      desc: 'Respuestas directas, rápidas y fluidas para el día a día.',
      tag: 'Recomendado',
    },
    {
      id: 'technical',
      name: 'Especialista Técnico & Código',
      desc: 'Enfocado en programación, arquitectura de software y tecnología.',
      tag: 'Técnico',
    },
    {
      id: 'friendly',
      name: 'Amigable & Compañero',
      desc: 'Tono cercano, empático y conversacional para uso doméstico diario.',
      tag: 'Cálido',
    },
    {
      id: 'executive',
      name: 'Ejecutivo & Productividad',
      desc: 'Puntos clave, síntesis accionables y organización de tareas.',
      tag: 'Directo',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Personalización del Asistente
            </h2>
            <p className="text-xs text-slate-400">
              Adapta la experiencia, voz, tono y apariencia a tus necesidades.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Nombres y Perfil */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
            Identidad
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-slate-400 block mb-1">Tu Nombre</span>
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus-within:border-blue-500">
                <User className="w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={preferences.userName}
                  onChange={(e) => onUpdatePreferences({ userName: e.target.value })}
                  placeholder="Tu nombre"
                  className="bg-transparent text-sm text-white outline-none w-full"
                />
              </div>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block mb-1">Nombre del Asistente</span>
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus-within:border-blue-500">
                <Bot className="w-4 h-4 text-blue-400" />
                <input
                  type="text"
                  value={preferences.assistantName}
                  onChange={(e) => onUpdatePreferences({ assistantName: e.target.value })}
                  placeholder="Nombre de la IA"
                  className="bg-transparent text-sm text-white outline-none w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. Voice Input / Escucha Continua & Wake Word (REQUERIDO) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Entrada de Voz (Voice Input)
            </label>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Web Speech API
            </span>
          </div>

          {/* Toggle Principal de Voice Input */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-xl mt-0.5 ${preferences.continuousListening ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-slate-800 text-slate-400'}`}>
                  <Radio className={`w-5 h-5 ${preferences.continuousListening ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      Modo Escucha Continua (Voice Input)
                    </span>
                    {preferences.continuousListening && (
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    )}
                  </div>
                  <span className="text-xs text-slate-400 leading-relaxed block mt-0.5">
                    Permite despertar al asistente diciendo su nombre o ejecutar comandos por voz en segundo plano sin tocar la pantalla.
                  </span>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={preferences.continuousListening}
                  onChange={(e) => onUpdatePreferences({ continuousListening: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Sub-configuración si Voice Input está activado */}
            {preferences.continuousListening && (
              <div className="pt-3 border-t border-slate-800/80 space-y-3 text-xs">
                {/* Sonido de Activación */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Bell className="w-3.5 h-3.5 text-blue-400" />
                    <span>Sonido de confirmación al despertar (Chime)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.wakeWordSound}
                    onChange={(e) => onUpdatePreferences({ wakeWordSound: e.target.checked })}
                    className="accent-blue-500 cursor-pointer w-4 h-4 rounded"
                  />
                </div>

                {/* Wake word info */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Palabras de activación (Wake Words):</span>
                  </div>
                  <div className="font-mono text-[11px] text-blue-300 flex flex-wrap gap-1.5 pt-1">
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">"Oye {preferences.assistantName}"</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">"Hola {preferences.assistantName}"</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">"{preferences.assistantName}"</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">"Asistente"</span>
                  </div>
                </div>

                {/* Comandos de Voz admitidos */}
                <div className="space-y-1 pt-1">
                  <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                    <HelpCircle className="w-3 h-3 text-slate-500" />
                    Comandos de voz rápidos admitidos:
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">
                      <strong className="text-slate-200">"Modo táctil":</strong> vista principal
                    </div>
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">
                      <strong className="text-slate-200">"Modo chat":</strong> abrir chat
                    </div>
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">
                      <strong className="text-slate-200">"Ver código":</strong> abrir código
                    </div>
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">
                      <strong className="text-slate-200">"Silencio":</strong> parar voz
                    </div>
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">
                      <strong className="text-slate-200">"Limpiar pantalla":</strong> reiniciar
                    </div>
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">
                      <strong className="text-slate-200">"Desactivar escucha":</strong> apagar
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Personalidad y Tono */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
            Personalidad & Latencia
          </label>
          <div className="space-y-2">
            {personas.map((p) => {
              const isSelected = preferences.persona === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onUpdatePreferences({ persona: p.id })}
                  className={`w-full p-3 rounded-2xl border text-left transition-all flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'bg-blue-600/10 border-blue-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{p.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {p.tag}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{p.desc}</p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0 mt-1" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Audio & Voz (TTS) */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
            Voz & Salida de Audio (TTS)
          </label>

          {/* Toggle Lectura Automática */}
          <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-2xl">
            <div className="flex items-center gap-3">
              <Volume2 className="w-5 h-5 text-blue-400" />
              <div>
                <span className="text-sm font-medium text-white block">
                  Lectura Automática por Voz
                </span>
                <span className="text-xs text-slate-400">
                  Reproducir en altavoz tras recibir respuesta
                </span>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.autoSpeak}
                onChange={(e) => onUpdatePreferences({ autoSpeak: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Control Deslizante de Volumen */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                {(preferences.volume ?? 1) === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (preferences.volume ?? 1) < 0.5 ? (
                  <Volume1 className="w-4 h-4 text-blue-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-blue-400" />
                )}
                <span className="font-medium">Volumen de la voz</span>
              </div>
              <span className="font-mono text-blue-400 font-bold">
                {Math.round((preferences.volume ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={preferences.volume ?? 1}
              onChange={(e) => {
                const vol = parseFloat(e.target.value);
                onUpdatePreferences({ volume: vol });
                speechService.setVolume(vol);
              }}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          {/* Control Deslizante de Velocidad */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-slate-400" />
                <span className="font-medium">Velocidad de habla</span>
              </div>
              <span className="font-mono text-blue-400 font-bold">{preferences.speechRate}x</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.4"
              step="0.05"
              value={preferences.speechRate}
              onChange={(e) => onUpdatePreferences({ speechRate: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          {/* Botón de Prueba de Voz y Volumen */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                speechService.speak(
                  `¡Hola! El volumen actual de ${preferences.assistantName} está al ${Math.round(
                    (preferences.volume ?? 1) * 100
                  )} por ciento.`,
                  {
                    rate: preferences.speechRate,
                    volume: preferences.volume ?? 1,
                  }
                );
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
            >
              <Play className="w-3.5 h-3.5 text-blue-400 fill-blue-400" />
              <span>Probar Voz y Volumen</span>
            </button>
          </div>
        </div>

        {/* 5. Modo Oscuro / Automático */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
            Apariencia
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'dark', label: 'Dark Slate', icon: Moon },
              { id: 'light', label: 'Claro', icon: Sun },
              { id: 'auto', label: 'Automático', icon: Monitor },
            ].map((themeOpt) => {
              const isSelected = preferences.theme === themeOpt.id;
              const Icon = themeOpt.icon;
              return (
                <button
                  key={themeOpt.id}
                  onClick={() => onUpdatePreferences({ theme: themeOpt.id as any })}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-2 transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-semibold">{themeOpt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition-colors"
          >
            Guardar y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};


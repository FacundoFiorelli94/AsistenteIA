import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Mic, MicOff, Send, Volume2, VolumeX, Copy, Check, RotateCcw, AlertCircle } from 'lucide-react';
import { UserPreferences, VoiceCommandAction } from '../types/assistant';
import { speechService } from '../services/speechService';
import { AudioWaveform } from './AudioWaveform';

interface TouchKioskViewProps {
  onSendMessage: (text: string) => void;
  latestResponse: string;
  isProcessing: boolean;
  isSpeaking?: boolean;
  statusText: string;
  preferences: UserPreferences;
  latencyMs?: number;
  ttftMs?: number;
  isAwake?: boolean;
  onVoiceCommand?: (action: VoiceCommandAction) => void;
}

export const TouchKioskView: React.FC<TouchKioskViewProps> = ({
  onSendMessage,
  latestResponse,
  isProcessing,
  isSpeaking = false,
  statusText,
  preferences,
  latencyMs,
  ttftMs,
  isAwake,
  onVoiceCommand,
}) => {
  const [inputText, setInputText] = useState('');
  const [copied, setCopied] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const responseScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll response box to bottom when new text arrives
  useEffect(() => {
    if (responseScrollRef.current) {
      responseScrollRef.current.scrollTop = responseScrollRef.current.scrollHeight;
    }
  }, [latestResponse]);

  // Handle voice mic toggle with smart collision handling and barge-in
  const toggleListening = async () => {
    // 1. If assistant is speaking, clicking the mic immediately cuts off the speech (barge-in)
    if (isSpeaking) {
      speechService.stopSpeaking();
      return;
    }

    // 2. Microphone is ALWAYS active: clicking the mic wakes up the assistant directly without needing to say "Asistente"
    if (isAwake) {
      speechService.setAwakeState(false);
    } else {
      speechService.setAwakeState(true);
      speechService.playChime('wake');
    }
  };

  // Play/stop audio TTS
  const toggleSpeechAudio = () => {
    if (isSpeaking) {
      speechService.stopSpeaking();
    } else {
      if (!latestResponse) return;
      speechService.speak(latestResponse, {
        rate: preferences.speechRate,
        volume: preferences.volume ?? 1,
      });
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || isProcessing) return;
    const textToSend = inputText.trim();
    setInputText('');
    onSendMessage(textToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = () => {
    if (!latestResponse) return;
    navigator.clipboard.writeText(latestResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const samplePrompts = [
    '¿Qué hora es?',
    'Dame 3 ideas para cenar rápido y saludable',
    'Explícame la teoría de la relatividad en breve',
    'Cuéntame un dato curioso',
  ];

  return (
    <div className="flex flex-col items-center justify-center p-2 sm:p-4 select-none w-full max-w-4xl mx-auto">
      {/* Top Status Bar with Clean Minimalist Latency */}
      <div className="w-full max-w-[680px] flex items-center justify-between mb-3 px-1 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-medium text-slate-300">Voz Activa · Di "Asistente"</span>
        </div>

        <div className="flex items-center gap-2">
          {latencyMs !== undefined && (
            <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-full bg-slate-900 text-blue-400 border border-slate-800">
              ⚡ {ttftMs ? `${ttftMs}ms TTFT · ` : ''}{latencyMs}ms
            </span>
          )}
        </div>
      </div>

      {/* Main Elegant Card Container */}
      <div
        className="w-full max-w-[680px] bg-slate-900/90 backdrop-blur-xl rounded-[28px] p-6 sm:p-8 border border-slate-800/90 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden flex flex-col items-center justify-center"
      >
        {/* Subtle Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-24 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* 1. Header Centrado */}
        <div className="flex flex-col items-center justify-center gap-1.5 mb-3 relative z-10">
          <div className="flex items-center justify-center gap-3">
            <div className="p-2 rounded-2xl bg-gradient-to-tr from-blue-600/30 to-indigo-500/20 border border-blue-500/30 shadow-lg shadow-blue-500/10">
              <Sparkles className="w-6 h-6 text-[#60A5FA] animate-pulse" />
            </div>
            <h1 className="text-2xl sm:text-[26px] font-bold text-white tracking-tight">
              {preferences.assistantName}
            </h1>
          </div>

          {/* 2. Indicador de estado dinámico */}
          <div className="flex items-center gap-2 h-6">
            {speechError ? (
              <p className="text-[12px] text-rose-400 font-medium flex items-center gap-1.5 animate-fade-in">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{speechError}</span>
              </p>
            ) : (
              <p className="text-[13px] text-slate-400 italic tracking-wide">
                {isSpeaking
                  ? 'Hablando en tiempo real · Di "Silencio" para parar'
                  : isAwake
                  ? '¡Te escucho! Di tu consulta...'
                  : isProcessing
                  ? 'Generando respuesta en tiempo real...'
                  : 'Siempre activo · Di "Asistente"'}
              </p>
            )}
            {!speechError && (isAwake || isSpeaking || isProcessing) && (
              <AudioWaveform
                isActive={true}
                type={isAwake ? 'listening' : isSpeaking ? 'speaking' : 'processing'}
              />
            )}
          </div>
        </div>

        {/* 3. Caja de Respuestas Elevada */}
        <div className="w-full max-w-[600px] mt-2 mb-1 z-10">
          <div
            ref={responseScrollRef}
            className="w-full min-h-[160px] max-h-[220px] bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 overflow-y-auto flex flex-col justify-start relative shadow-inner transition-all focus:outline-none scroll-smooth"
            tabIndex={0}
          >
            <div className="text-slate-200 text-[15px] sm:text-[16px] leading-relaxed select-text whitespace-pre-wrap font-normal">
              {latestResponse ? (
                <span className="text-white">{latestResponse}</span>
              ) : (
                <span className="text-slate-500 italic">
                  Las respuestas aparecerán aquí. Di "Asistente" en cualquier momento para hablar en tiempo real.
                </span>
              )}
            </div>
          </div>

          {/* Barra de Acciones separada fuera del recuadro de texto */}
          {latestResponse && (
            <div className="flex items-center justify-between px-2 pt-2.5 pb-1">
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? 'bg-rose-400 animate-ping' : 'bg-blue-400'}`} />
                <span>{isSpeaking ? 'Reproduciendo voz en tiempo real...' : 'Respuesta del Asistente'}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSpeechAudio}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all shadow-sm ${
                    isSpeaking
                      ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/30 animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:text-white'
                  }`}
                  title={isSpeaking ? 'Interrumpir voz' : 'Escuchar respuesta por voz'}
                >
                  {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-blue-400" />}
                  <span>{isSpeaking ? 'Silenciar voz' : 'Escuchar voz'}</span>
                </button>

                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:text-white text-xs font-medium transition-all shadow-sm"
                  title="Copiar texto de la respuesta"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. Barra de Interacción Inferior */}
        <div className="w-full max-w-[600px] flex items-center gap-2.5 mt-2 z-10">
          {/* Botón táctil de micrófono */}
          <button
            onClick={toggleListening}
            className={`w-[50px] h-[50px] rounded-2xl flex items-center justify-center transition-all duration-200 shrink-0 touch-target focus:outline-none focus:ring-2 focus:ring-blue-400/50 relative ${
              isSpeaking
                ? 'bg-rose-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse'
                : isAwake
                ? 'bg-rose-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)] scale-105 ring-4 ring-rose-500/20'
                : 'bg-slate-800/90 border border-emerald-500/40 text-emerald-400 hover:bg-slate-700 active:scale-95'
            }`}
            title={
              isSpeaking
                ? 'Asistente hablando · Clic para silenciar (Barge-in)'
                : isAwake
                ? 'Escuchando consulta activa'
                : 'Micrófono siempre activo · Clic para despertar directamente'
            }
            aria-label="Micrófono"
          >
            {!isAwake && !isSpeaking && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
            {isSpeaking ? (
              <VolumeX className="w-6 h-6 animate-pulse text-white" />
            ) : isAwake ? (
              <MicOff className="w-6 h-6 animate-pulse" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </button>

          {/* Campo de texto integrado */}
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              placeholder="Escribe tu consulta o di 'Asistente'..."
              className="w-full h-[50px] bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-2xl px-4 text-[15px] text-white placeholder-slate-500 outline-none transition-all duration-200 disabled:opacity-50 shadow-inner"
            />
            {inputText && (
              <button
                onClick={() => setInputText('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1 rounded-lg"
                aria-label="Limpiar campo"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Botón "Enviar" */}
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isProcessing}
            className={`h-[50px] px-5 sm:px-6 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm transition-all duration-200 shrink-0 touch-target focus:outline-none focus:ring-2 focus:ring-blue-400/50 shadow-md ${
              !inputText.trim() || isProcessing
                ? 'bg-blue-600/40 text-white/40 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-blue-500/20 active:scale-95'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Enviar</span>
          </button>
        </div>

        {/* Sugerencias Rápidas */}
        <div className="w-full max-w-[600px] flex items-center gap-2 mt-4 overflow-x-auto pb-1 text-xs z-10 scrollbar-none">
          <span className="text-slate-500 shrink-0 text-[11px] font-medium">Ejemplos de voz:</span>
          {samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => {
                setInputText(prompt);
                onSendMessage(prompt);
              }}
              className="whitespace-nowrap px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-800/80 hover:border-slate-700 transition-colors text-[11px]"
            >
              "Asistente, {prompt.toLowerCase().replace(/[¿?]/g, '')}"
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

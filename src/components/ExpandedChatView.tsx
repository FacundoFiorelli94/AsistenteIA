import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Mic, MicOff, Send, Volume2, VolumeX, Copy, Check, RotateCcw, User, Bot, Clock } from 'lucide-react';
import { ChatMessage, UserPreferences, VoiceCommandAction } from '../types/assistant';
import { speechService } from '../services/speechService';
import { AudioWaveform } from './AudioWaveform';

interface ExpandedChatViewProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
  preferences: UserPreferences;
  onClearHistory: () => void;
  onVoiceCommand?: (action: VoiceCommandAction) => void;
}

export const ExpandedChatView: React.FC<ExpandedChatViewProps> = ({
  messages,
  onSendMessage,
  isProcessing,
  preferences,
  onClearHistory,
  onVoiceCommand,
}) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  const toggleListening = async () => {
    if (isListening) {
      speechService.stopListening();
      setIsListening(false);
      if (inputText.trim()) {
        const text = inputText.trim();
        setInputText('');
        onSendMessage(text);
      }
    } else {
      setIsListening(true);
      const started = await speechService.startListening(
        (transcript) => {
          setInputText(transcript);
        },
        (command) => {
          setIsListening(false);
          if (command.type === 'query' && command.prompt.trim()) {
            setInputText('');
            onSendMessage(command.prompt.trim());
          } else if (onVoiceCommand) {
            onVoiceCommand(command);
          }
        },
        (error) => {
          console.warn('Speech error:', error);
          setIsListening(false);
        },
        () => {
          setIsListening(false);
        }
      );
      if (!started) setIsListening(false);
    }
  };

  const handleSpeak = (messageId: string, text: string) => {
    if (playingMessageId === messageId) {
      speechService.stopSpeaking();
      setPlayingMessageId(null);
    } else {
      setPlayingMessageId(messageId);
      speechService.speak(text, {
        rate: preferences.speechRate,
        volume: preferences.volume ?? 1,
        onEnd: () => setPlayingMessageId(null),
      });
    }
  };

  const handleCopy = (messageId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSend = () => {
    if (!inputText.trim() || isProcessing) return;
    const text = inputText.trim();
    setInputText('');
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const promptShortcuts = [
    { title: '💡 Ideas creativas', query: 'Dame 3 ideas creativas para organizar mi semana de forma productiva.' },
    { title: '⚡ Explicación clara', query: 'Explícame qué es la computación cuántica en tres frases sencillas.' },
    { title: '🧠 Enfoque y hábitos', query: '¿Cuáles son los mejores hábitos diarios para mantener alta energía y concentración?' },
    { title: '⏱️ Streaming y latencia', query: '¿Cómo funciona el streaming en tiempo real para obtener respuestas sin espera?' },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
      {/* Header Info */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/60 rounded-t-2xl border border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Bot className="w-4 h-4 text-blue-400" />
          <span className="font-semibold">{preferences.assistantName}</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400 capitalize">Modo {preferences.persona}</span>
        </div>

        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar historial</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/80 border-x border-slate-800 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Sparkles className="w-8 h-8 animate-pulse" />
            </div>

            <div className="space-y-2 max-w-md">
              <h2 className="text-xl font-bold text-white tracking-tight">
                ¡Hola {preferences.userName}!
              </h2>
              <p className="text-sm text-slate-400">
                Tu asistente con procesamiento en tiempo real está listo. Puedes usar comandos de voz o texto para interactuar.
              </p>
            </div>

            {/* Quick Suggestions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg mt-4">
              {promptShortcuts.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(item.query)}
                  className="p-3 text-left rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/40 transition-all text-xs group"
                >
                  <span className="font-semibold text-slate-200 block mb-1 group-hover:text-blue-400 transition-colors">
                    {item.title}
                  </span>
                  <span className="text-slate-400 line-clamp-1">
                    {item.query}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'model' && (
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-1">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                }`}
              >
                <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap select-text">
                  {msg.text}
                  {msg.isStreaming && (
                    <span className="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse align-middle" />
                  )}
                </div>

                {/* Message Footer / Telemetry */}
                <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-white/10 text-[11px] text-slate-400">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.latencyMs !== undefined && (
                      <span className="text-emerald-400 font-mono text-[10px]">
                        ⚡ {msg.ttftMs ? `${msg.ttftMs}ms TTFT · ` : ''}{msg.latencyMs}ms
                      </span>
                    )}
                  </div>

                  {msg.role === 'model' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleSpeak(msg.id, msg.text)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        title="Escuchar por voz"
                      >
                        {playingMessageId === msg.id ? (
                          <VolumeX className="w-3.5 h-3.5 text-blue-400" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        title="Copiar texto"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-1">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input Dock */}
      <div className="p-3 sm:p-4 bg-slate-900 border border-slate-800 rounded-b-2xl">
        {/* Waveform indicator if recording */}
        {isListening && (
          <div className="flex items-center justify-center gap-2 py-1 text-xs text-rose-400">
            <span>Escuchando micrófono en directo...</span>
            <AudioWaveform isActive={true} type="listening" />
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={toggleListening}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all shrink-0 ${
              isListening
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                : 'bg-slate-800 border border-slate-700 text-blue-400 hover:bg-slate-700'
            }`}
            title={isListening ? 'Detener voz' : 'Hablar'}
          >
            {isListening ? <MicOff className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            placeholder="Pregunta lo que desees al asistente..."
            className="flex-1 h-11 bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl px-4 text-sm text-white placeholder-slate-500 outline-none transition-colors"
          />

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isProcessing}
            className={`h-11 px-5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
              !inputText.trim() || isProcessing
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md active:scale-95'
            }`}
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

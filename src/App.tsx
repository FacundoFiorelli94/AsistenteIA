import { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { TouchKioskView } from './components/TouchKioskView';
import { ExpandedChatView } from './components/ExpandedChatView';
import { FletPythonView } from './components/FletPythonView';
import { FlutterSimulatorView } from './components/FlutterSimulatorView';
import { SettingsModal } from './components/SettingsModal';
import { ChatMessage, AppViewMode, UserPreferences, VoiceCommandAction } from './types/assistant';
import { streamAssistantResponse } from './services/geminiService';
import { speechService } from './services/speechService';

const DEFAULT_PREFERENCES: UserPreferences = {
  userName: 'Usuario',
  assistantName: 'ASISTENTE IA',
  persona: 'concise',
  autoSpeak: true,
  speechRate: 1.05,
  theme: 'dark',
  kioskScale: 1.0,
  continuousListening: true, // Default enabled for hands-free "Hola Asistente"
  wakeWordSound: true,
  volume: 1.0,
};

export default function App() {
  const [viewMode, setViewMode] = useState<AppViewMode>('kiosk_touch');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [latestResponse, setLatestResponse] = useState<string>(
    '¡Hola! Soy tu Asistente IA. Di "Hola Asistente" o presiona el micrófono para hablarme en tiempo real.'
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Listo');
  const [lastLatencyMs, setLastLatencyMs] = useState<number | undefined>(undefined);
  const [lastTtftMs, setLastTtftMs] = useState<number | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAwake, setIsAwake] = useState<boolean>(false);

  // Load preferences from localStorage or default
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const saved = localStorage.getItem('asistente_preferences');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_PREFERENCES,
          ...parsed,
          volume: parsed.volume !== undefined ? parsed.volume : 1.0,
          // Always keep continuousListening enabled by default unless explicitly disabled
          continuousListening: parsed.continuousListening !== undefined ? parsed.continuousListening : true,
        };
      }
    } catch (e) {
      console.warn('Could not read localStorage:', e);
    }
    return DEFAULT_PREFERENCES;
  });

  // Keep speechService volume in sync with user preferences
  useEffect(() => {
    speechService.setVolume(preferences.volume ?? 1.0);
  }, [preferences.volume]);

  // Hook speaking state callback
  useEffect(() => {
    speechService.setSpeakingStateCallback((speaking) => {
      setIsSpeaking(speaking);
    });
  }, []);

  // Save preferences
  useEffect(() => {
    try {
      localStorage.setItem('asistente_preferences', JSON.stringify(preferences));
    } catch (e) {
      console.warn('Could not save to localStorage:', e);
    }
  }, [preferences]);

  // Handle Automatic Dark Mode vs Light Mode
  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === 'dark') {
      root.classList.add('dark');
      root.style.backgroundColor = '#0F172A';
    } else if (preferences.theme === 'light') {
      root.classList.remove('dark');
      root.style.backgroundColor = '#F8FAFC';
    } else {
      const hour = new Date().getHours();
      const isNight = hour >= 19 || hour < 7;
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isNight || systemPrefersDark) {
        root.classList.add('dark');
        root.style.backgroundColor = '#0F172A';
      } else {
        root.classList.remove('dark');
        root.style.backgroundColor = '#F8FAFC';
      }
    }
  }, [preferences.theme]);

  // AbortController for cancelable requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // ── ANTI-COLLISION & BARGE-IN ──────────────────────────────────────────
    // Stop any ongoing speech or prior fetch request immediately so voices don't overlap
    speechService.stopSpeaking();

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
    };

    const modelMessageId = `model-${Date.now()}`;
    const initialModelMessage: ChatMessage = {
      id: modelMessageId,
      role: 'model',
      text: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, initialModelMessage]);
    setIsProcessing(true);
    setStatusText('Generando respuesta en tiempo real...');
    setLatestResponse('');

    let accumulatedText = '';
    let speechStreamBuffer = '';

    // History for multi-turn (last 6 items)
    const conversationHistory = messages.slice(-6).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    await streamAssistantResponse(
      text,
      conversationHistory,
      preferences.persona,
      preferences.userName,
      {
        onChunk: (chunk: string) => {
          accumulatedText += chunk;
          setLatestResponse(accumulatedText);

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === modelMessageId
                ? { ...msg, text: accumulatedText, isStreaming: true }
                : msg
            )
          );

          // ── REAL-TIME SENTENCE STREAMING SPEECH SYNTHESIS ──
          // As Groq streams chunks, detect sentence boundaries (. ? ! \n :)
          // and start speaking the completed sentence immediately without waiting!
          if (preferences.autoSpeak) {
            speechStreamBuffer += chunk;

            // Match full sentence up to punctuation mark
            const match = speechStreamBuffer.match(/^([\s\S]*?[.?!:\n]+(?:\s+|$))([\s\S]*)$/);
            if (match) {
              const sentenceToSpeak = match[1].trim();
              speechStreamBuffer = match[2];

              if (sentenceToSpeak && sentenceToSpeak.length > 2) {
                speechService.enqueueStreamSpeech(sentenceToSpeak, {
                  rate: preferences.speechRate,
                  volume: preferences.volume ?? 1.0,
                });
              }
            }
          }
        },
        onFirstToken: (ttftMs: number) => {
          setLastTtftMs(ttftMs);
        },
        onDone: (metrics) => {
          setIsProcessing(false);
          setLastLatencyMs(metrics.totalDurationMs);
          setLastTtftMs(metrics.ttftMs);
          setStatusText(`Listo · ${metrics.totalDurationMs}ms`);

          // Flush any trailing speech words in the buffer
          if (preferences.autoSpeak && speechStreamBuffer.trim()) {
            speechService.enqueueStreamSpeech(speechStreamBuffer.trim(), {
              rate: preferences.speechRate,
              volume: preferences.volume ?? 1.0,
            });
            speechStreamBuffer = '';
          }

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === modelMessageId
                ? {
                    ...msg,
                    text: accumulatedText,
                    isStreaming: false,
                    latencyMs: metrics.totalDurationMs,
                    ttftMs: metrics.ttftMs,
                  }
                : msg
            )
          );
        },
        onError: (err: string) => {
          setIsProcessing(false);
          setStatusText('Error al procesar consulta');
          const errorMsg = `Error: ${err}`;
          setLatestResponse(errorMsg);

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === modelMessageId
                ? { ...msg, text: errorMsg, isStreaming: false }
                : msg
            )
          );
        },
      },
      controller.signal
    );
  }, [messages, preferences.autoSpeak, preferences.persona, preferences.speechRate, preferences.userName, preferences.volume]);

  const handleClearHistory = () => {
    speechService.stopSpeaking();
    setMessages([]);
    setLatestResponse(
      'Historial reiniciado. Di "Hola Asistente" o presiona el micrófono para consultar algo.'
    );
    setStatusText('Listo');
  };

  const handleUpdatePreferences = (newPrefs: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...newPrefs }));
  };

  // Voice command dispatcher
  const handleVoiceCommand = useCallback((action: VoiceCommandAction) => {
    if (action.type === 'navigate') {
      setViewMode(action.target);
      setStatusText(
        `Navegando a ${
          action.target === 'kiosk_touch'
            ? 'pantalla táctil'
            : action.target === 'expanded_chat'
            ? 'chat'
            : action.target === 'flutter_app'
            ? 'flutter'
            : 'código python'
        } por voz`
      );
    } else if (action.type === 'clear') {
      handleClearHistory();
    } else if (action.type === 'stop_speech') {
      speechService.stopSpeaking();
      setStatusText('Audio silenciado');
    } else if (action.type === 'open_settings') {
      setIsSettingsOpen(true);
    } else if (action.type === 'toggle_listening') {
      handleUpdatePreferences({ continuousListening: action.enable });
    } else if (action.type === 'query') {
      handleSendMessage(action.prompt);
    }
  }, [handleSendMessage]);

  // Continuous voice listening is perpetually active and auto-unlocked
  useEffect(() => {
    const startAudio = () => {
      speechService.startContinuousListening({
        assistantName: preferences.assistantName,
        onWakeChange: (awake) => {
          setIsAwake(awake);
        },
        onCommand: (action) => {
          handleVoiceCommand(action);
        },
        onError: (err) => {
          console.warn('Continuous listening speech error:', err);
        },
      });
    };

    startAudio();

    // Auto-unlock on first document touch/click if browser blocked mic before user gesture
    const onFirstInteraction = () => {
      startAudio();
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction);
    };

    window.addEventListener('pointerdown', onFirstInteraction);
    window.addEventListener('keydown', onFirstInteraction);

    return () => {
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction);
      speechService.stopContinuousListening();
    };
  }, [preferences.assistantName, handleVoiceCommand]);

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-300 ${
        preferences.theme === 'light' ? 'bg-[#F8FAFC] text-slate-900' : 'bg-[#0F172A] text-[#F8FAFC]'
      }`}
    >
      {/* Top Navbar without clutter tabs */}
      <Navbar
        onOpenSettings={() => setIsSettingsOpen(true)}
        preferences={preferences}
        lastLatencyMs={lastLatencyMs}
        isAwake={isAwake}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 w-full">
        {viewMode === 'kiosk_touch' && (
          <TouchKioskView
            onSendMessage={handleSendMessage}
            latestResponse={latestResponse}
            isProcessing={isProcessing}
            isSpeaking={isSpeaking}
            statusText={statusText}
            preferences={preferences}
            latencyMs={lastLatencyMs}
            ttftMs={lastTtftMs}
            isAwake={isAwake}
            onVoiceCommand={handleVoiceCommand}
          />
        )}

        {viewMode === 'expanded_chat' && (
          <ExpandedChatView
            messages={messages}
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            preferences={preferences}
            onClearHistory={handleClearHistory}
            onVoiceCommand={handleVoiceCommand}
          />
        )}

        {viewMode === 'flutter_app' && <FlutterSimulatorView preferences={preferences} />}

        {viewMode === 'flet_code' && <FletPythonView />}
      </main>

      {/* Settings Modal with Voice Input toggle */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        preferences={preferences}
        onUpdatePreferences={handleUpdatePreferences}
      />
    </div>
  );
}

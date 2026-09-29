// Browser Speech-to-Text, Continuous Listening, Wake Word and Text-to-Speech service
import { VoiceCommandAction } from '../types/assistant';

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
    webkitAudioContext?: typeof AudioContext;
  }
}

export class SpeechService {
  private recognition: any = null;
  private isListening: boolean = false;
  private isContinuousMode: boolean = false;
  private isSpeaking: boolean = false;
  private isAwake: boolean = false;
  private volume: number = 1.0; // 0.0 to 1.0

  private wakeTimeout: any = null;
  private restartTimer: any = null;
  private silenceTimer: any = null;
  private currentSessionText: string = '';

  private assistantName: string = 'ASISTENTE IA';
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onCommandCallback: ((command: VoiceCommandAction) => void) | null = null;
  private onWakeStateChange: ((isAwake: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor() {
    // Lazy initialize when user interacts to avoid audio context / mic permission locks
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public getVolume(): number {
    return this.volume;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  private createRecognitionInstance(continuous: boolean) {
    if (typeof window === 'undefined') return null;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return null;

    // Clean up previous instance if any
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch (e) {
        // Ignore abort errors
      }
    }

    const rec = new SpeechRec();
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = 'es-ES';
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const currentText = (finalTranscript || interimTranscript).trim();
      const isFinal = !!finalTranscript;

      if (!currentText) return;

      this.currentSessionText = currentText;

      // Dispatch to caller
      if (this.onTranscriptCallback) {
        this.onTranscriptCallback(currentText, isFinal);
      }

      if (this.isContinuousMode) {
        this.handleContinuousSpeechResult(currentText, isFinal);
      } else {
        // One-shot manual listening: reset silence auto-submit timer
        clearTimeout(this.silenceTimer);

        if (isFinal) {
          // If browser finalized sentence, submit after brief pause
          this.silenceTimer = setTimeout(() => {
            if (this.currentSessionText && this.isListening) {
              const textToSubmit = this.currentSessionText;
              this.stopListening();
              if (this.onCommandCallback) {
                this.onCommandCallback({ type: 'query', prompt: textToSubmit });
              }
            }
          }, 600);
        } else {
          // Interim results: wait for 1.4s of silence before auto-submitting
          this.silenceTimer = setTimeout(() => {
            if (this.currentSessionText && this.isListening) {
              const textToSubmit = this.currentSessionText;
              this.stopListening();
              if (this.onCommandCallback) {
                this.onCommandCallback({ type: 'query', prompt: textToSubmit });
              }
            }
          }, 1400);
        }
      }
    };

    rec.onerror = (event: any) => {
      console.warn('Speech recognition event error:', event.error);

      // Common non-fatal events in continuous mode
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        return;
      }

      let userMsg = 'Error en reconocimiento de voz';
      if (event.error === 'not-allowed') {
        userMsg = 'Acceso al micrófono denegado. Por favor permite el micrófono en tu navegador.';
      } else if (event.error === 'network') {
        userMsg = 'Error de conexión con el servicio de reconocimiento de voz.';
      }

      if (this.onErrorCallback) {
        this.onErrorCallback(userMsg);
      }
    };

    rec.onend = () => {
      const wasListening = this.isListening;
      this.isListening = false;

      // In manual mode, if speech ended and we had captured text, trigger submit
      if (!this.isContinuousMode && this.currentSessionText.trim()) {
        const textToSubmit = this.currentSessionText.trim();
        this.currentSessionText = '';
        if (this.onCommandCallback) {
          this.onCommandCallback({ type: 'query', prompt: textToSubmit });
        }
      }

      if (this.isContinuousMode && !this.isSpeaking) {
        // Auto-restart continuous listening in background
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          if (this.isContinuousMode && !this.isSpeaking && !this.isListening) {
            try {
              this.recognition = this.createRecognitionInstance(true);
              this.recognition?.start();
              this.isListening = true;
            } catch (e) {
              // Ignore restart collision
            }
          }
        }, 400);
      } else {
        if (this.onEndCallback) {
          this.onEndCallback();
        }
      }
    };

    return rec;
  }

  public playChime(type: 'wake' | 'success' | 'command' = 'wake') {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const currentVol = Math.max(0.01, this.volume);

      if (type === 'wake') {
        // High dual-tone friendly chime
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(880, now + 0.08);
        osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.22); // D6

        gain.gain.setValueAtTime(0.09 * currentVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now + 0.08);
        osc1.stop(now + 0.2);
        osc2.stop(now + 0.3);
      } else {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5

        gain.gain.setValueAtTime(0.08 * currentVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {
      // AudioContext could be blocked by autoplay policies
    }
  }

  // Parse voice commands and wake words
  private parseCommandOrWakeWord(rawText: string): {
    command: VoiceCommandAction | null;
    isWakeWord: boolean;
    isGreeting: boolean;
    queryText: string;
  } {
    // Normalize string: lowercase, remove punctuation
    const text = rawText
      .toLowerCase()
      .replace(/[¿?¡!.,]/g, '')
      .trim();

    const assistantName = this.assistantName.toLowerCase().trim();

    // 1. Direct System Commands
    if (
      text.includes('ir a quiosco') ||
      text.includes('modo quiosco') ||
      text.includes('modo táctil') ||
      text.includes('pantalla táctil') ||
      text.includes('pantalla 7')
    ) {
      return { command: { type: 'navigate', target: 'kiosk_touch' }, isWakeWord: false, isGreeting: false, queryText: '' };
    }

    if (
      text.includes('ir a chat') ||
      text.includes('modo chat') ||
      text.includes('abrir chat') ||
      text.includes('ver chat')
    ) {
      return { command: { type: 'navigate', target: 'expanded_chat' }, isWakeWord: false, isGreeting: false, queryText: '' };
    }

    if (
      text.includes('ir a flutter') ||
      text.includes('modo flutter') ||
      text.includes('abrir flutter') ||
      text.includes('ver flutter') ||
      text.includes('pantalla flutter')
    ) {
      return { command: { type: 'navigate', target: 'flutter_app' }, isWakeWord: false, isGreeting: false, queryText: '' };
    }

    if (
      text.includes('ver código') ||
      text.includes('modo python') ||
      text.includes('script python') ||
      text.includes('abrir python') ||
      text.includes('ver script') ||
      text.includes('modo flet')
    ) {
      return { command: { type: 'navigate', target: 'flet_code' }, isWakeWord: false, isGreeting: false, queryText: '' };
    }

    if (
      text.includes('abrir ajustes') ||
      text.includes('abrir configuración') ||
      text.includes('ir a configuración') ||
      text.includes('ajustes')
    ) {
      return { command: { type: 'open_settings' }, isWakeWord: false, isGreeting: false, queryText: '' };
    }

    if (
      text.includes('limpiar historial') ||
      text.includes('borrar historial') ||
      text.includes('limpiar pantalla') ||
      text.includes('reiniciar pantalla')
    ) {
      return { command: { type: 'clear' }, isWakeWord: false, isGreeting: false, queryText: '' };
    }

    if (
      text.includes('silencio') ||
      text.includes('detener voz') ||
      text.includes('detener audio') ||
      text.includes('parar voz') ||
      text.includes('cállate') ||
      text.includes('para')
    ) {
      return { command: { type: 'stop_speech' }, isWakeWord: false, isGreeting: false, queryText: '' };
    }

    if (
      text.includes('apagar micrófono') ||
      text.includes('desactivar escucha') ||
      text.includes('detener escucha')
    ) {
      return { command: { type: 'toggle_listening', enable: false }, isWakeWord: false, isGreeting: false, queryText: '' };
    }

    // 2. Greetings Recognition: "hola asistente", "buenos días asistente", "hola aura", etc.
    const greetingPatterns = [
      `hola ${assistantName}`,
      'hola asistente',
      'buenos días asistente',
      'buenas tardes asistente',
      'buenas noches asistente',
      'hola qué tal',
      'hola',
    ];

    for (const greeting of greetingPatterns) {
      if (text === greeting || text.startsWith(greeting + ' ')) {
        const remainder = text.slice(greeting.length).trim();
        const fullPrompt = remainder ? `Hola, ${remainder}` : '¡Hola! ¿Cómo estás?';
        return {
          command: { type: 'query', prompt: fullPrompt },
          isWakeWord: true,
          isGreeting: true,
          queryText: fullPrompt,
        };
      }
    }

    // 3. General Wake Word Triggers: "oye asistente", "hey asistente", "asistente"
    const wakePatterns = [
      `oye ${assistantName}`,
      `hey ${assistantName}`,
      `ok ${assistantName}`,
      assistantName,
      'oye asistente',
      'hey asistente',
      'asistente',
      'despierta',
    ];

    for (const pattern of wakePatterns) {
      if (text.startsWith(pattern) || text.includes(pattern)) {
        const idx = text.indexOf(pattern);
        const remainder = text.slice(idx + pattern.length).trim();
        return {
          command: remainder ? { type: 'query', prompt: remainder } : null,
          isWakeWord: true,
          isGreeting: false,
          queryText: remainder,
        };
      }
    }

    return { command: null, isWakeWord: false, isGreeting: false, queryText: '' };
  }

  private handleContinuousSpeechResult(transcript: string, isFinal: boolean) {
    const { command, isWakeWord, isGreeting, queryText } = this.parseCommandOrWakeWord(transcript);

    // 1. Direct System Command (navigate, clear, stop speech)
    if (command && command.type !== 'query' && isFinal) {
      this.playChime('command');
      if (this.onCommandCallback) {
        this.onCommandCallback(command);
      }
      this.setAwakeState(false);
      return;
    }

    // 2. Greeting Command (e.g. "Hola Asistente")
    if (isGreeting && command && command.type === 'query' && isFinal) {
      this.playChime('wake');
      if (this.onCommandCallback) {
        this.onCommandCallback(command);
      }
      this.setAwakeState(false);
      return;
    }

    // 3. Wake Word Detected
    if (isWakeWord) {
      if (!this.isAwake) {
        this.setAwakeState(true);
        this.playChime('wake');
      }

      // If user spoke query in the same sentence (e.g. "Oye Asistente, ¿cuál es el clima?")
      if (queryText && isFinal) {
        if (this.onCommandCallback) {
          this.onCommandCallback({ type: 'query', prompt: queryText });
        }
        this.setAwakeState(false);
        return;
      }
    } else if (this.isAwake && isFinal && transcript.trim()) {
      // If assistant was already awake and user spoke a query
      if (this.onCommandCallback) {
        this.onCommandCallback({ type: 'query', prompt: transcript.trim() });
      }
      this.setAwakeState(false);
    }
  }

  private setAwakeState(awake: boolean) {
    this.isAwake = awake;
    if (this.onWakeStateChange) {
      this.onWakeStateChange(awake);
    }

    clearTimeout(this.wakeTimeout);
    if (awake) {
      // Auto sleep after 9 seconds of inactivity if no query is spoken
      this.wakeTimeout = setTimeout(() => {
        this.setAwakeState(false);
      }, 9000);
    }
  }

  // Start continuous listening mode (background voice wake & command processor)
  public startContinuousListening(options: {
    assistantName: string;
    onTranscript?: (text: string, isFinal: boolean) => void;
    onCommand: (command: VoiceCommandAction) => void;
    onWakeChange?: (isAwake: boolean) => void;
    onError?: (err: string) => void;
  }): boolean {
    if (!this.isSupported()) return false;

    this.assistantName = options.assistantName || 'ASISTENTE IA';
    this.onTranscriptCallback = options.onTranscript || null;
    this.onCommandCallback = options.onCommand;
    this.onWakeStateChange = options.onWakeChange || null;
    this.onErrorCallback = options.onError || null;
    this.isContinuousMode = true;

    try {
      this.recognition = this.createRecognitionInstance(true);
      if (!this.recognition) return false;
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (e: any) {
      console.warn('Continuous listening start error:', e);
      return false;
    }
  }

  // Stop continuous listening mode
  public stopContinuousListening() {
    this.isContinuousMode = false;
    clearTimeout(this.restartTimer);
    clearTimeout(this.wakeTimeout);
    clearTimeout(this.silenceTimer);
    this.setAwakeState(false);

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isListening = false;
    }
  }

  public getIsContinuousActive(): boolean {
    return this.isContinuousMode;
  }

  public getIsAwake(): boolean {
    return this.isAwake;
  }

  // Manual one-shot listening for touch button
  public async startListening(
    onTranscript: (text: string, isFinal: boolean) => void,
    onCommand: (command: VoiceCommandAction) => void,
    onError?: (err: string) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    if (!this.isSupported()) {
      if (onError) onError('El reconocimiento de voz no está disponible en este navegador.');
      return false;
    }

    // Try requesting mic permission if not granted
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (e: any) {
      console.warn('Microphone permission warning:', e);
      if (onError) {
        onError('Permiso de micrófono no concedido. Habilita el micrófono en tu navegador.');
      }
      return false;
    }

    this.isContinuousMode = false;
    this.currentSessionText = '';
    this.onTranscriptCallback = onTranscript;
    this.onCommandCallback = onCommand;
    this.onErrorCallback = onError || null;
    this.onEndCallback = onEnd || null;

    try {
      this.recognition = this.createRecognitionInstance(false);
      if (!this.recognition) return false;

      this.recognition.start();
      this.isListening = true;
      this.playChime('wake');
      return true;
    } catch (e: any) {
      console.warn('Could not start speech recognition:', e);
      if (onError) onError(e?.message || 'Error al iniciar micrófono');
      this.isListening = false;
      return false;
    }
  }

  public stopListening() {
    clearTimeout(this.silenceTimer);
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isListening = false;
    }
  }

  public speak(
    text: string,
    options?: { rate?: number; pitch?: number; volume?: number; onEnd?: () => void; onStart?: () => void }
  ) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    this.isSpeaking = true;

    // Temporarily pause recognition to avoid capturing speaker output
    if (this.isContinuousMode && this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }

    const cleanText = text
      .replace(/[#*`_~\[\]()]/g, ' ')
      .replace(/\n+/g, '. ')
      .trim();

    if (!cleanText) {
      this.isSpeaking = false;
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    utterance.rate = options?.rate || 1.05;
    utterance.pitch = options?.pitch || 1.0;
    utterance.volume = options?.volume !== undefined ? Math.max(0, Math.min(1, options.volume)) : this.volume;

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(
      (v) =>
        v.lang.startsWith('es') &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Sabina') ||
          v.name.includes('Alvaro') ||
          v.name.includes('Jorge') ||
          v.name.includes('Monica'))
    ) || voices.find((v) => v.lang.startsWith('es'));

    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }

    const handleSpeechFinish = () => {
      this.isSpeaking = false;
      if (options?.onEnd) options.onEnd();

      // Resume continuous listening if it was active
      if (this.isContinuousMode && !this.isListening) {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          if (this.isContinuousMode && !this.isSpeaking) {
            try {
              this.recognition = this.createRecognitionInstance(true);
              this.recognition?.start();
              this.isListening = true;
            } catch (e) {}
          }
        }, 400);
      }
    };

    utterance.onstart = () => {
      this.isSpeaking = true;
      if (options?.onStart) options.onStart();
    };

    utterance.onend = handleSpeechFinish;
    utterance.onerror = handleSpeechFinish;

    window.speechSynthesis.speak(utterance);
  }

  public stopSpeaking() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;

      // Resume continuous listening if active
      if (this.isContinuousMode && !this.isListening) {
        try {
          this.recognition = this.createRecognitionInstance(true);
          this.recognition?.start();
          this.isListening = true;
        } catch (e) {}
      }
    }
  }
}

export const speechService = new SpeechService();

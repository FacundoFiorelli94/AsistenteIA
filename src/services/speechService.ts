// Browser Speech-to-Text, Continuous Listening, Wake Word and Streaming Text-to-Speech service
import { VoiceCommandAction } from '../types/assistant';

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface SpeechOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

export class SpeechService {
  private recognition: any = null;
  private isListening: boolean = false;
  private isContinuousMode: boolean = false;
  private isSpeaking: boolean = false;
  private isAwake: boolean = false;
  private volume: number = 1.0; // 0.0 to 1.0

  // Streaming speech synthesis queue
  private speechQueue: string[] = [];
  private isQueuePlaying: boolean = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentSpokenSentence: string = '';
  private recentSpokenHistory: string[] = [];

  // Wake word & session timers
  private wakeTimeout: any = null;
  private restartTimer: any = null;
  private silenceTimer: any = null;
  private currentSessionText: string = '';
  private lastExecutedCommandTime: number = 0;
  private lastExecutedText: string = '';

  private assistantName: string = 'ASISTENTE IA';
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onCommandCallback: ((command: VoiceCommandAction) => void) | null = null;
  private onWakeStateChange: ((isAwake: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onEndCallback: (() => void) | null = null;
  private onSpeakingStateChange: ((isSpeaking: boolean) => void) | null = null;

  private micStream: MediaStream | null = null;

  constructor() {
    // Check voice support
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

  public setSpeakingStateCallback(callback: ((isSpeaking: boolean) => void) | null) {
    this.onSpeakingStateChange = callback;
  }

  /**
   * Request mic permissions with hardware Acoustic Echo Cancellation (AEC)
   * to prevent speaker audio from bleeding into the microphone.
   */
  public async requestMicrophoneAccess(): Promise<boolean> {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      return true;
    } catch (err) {
      console.warn('Microphone permission request error:', err);
      return false;
    }
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

      // ─── ANTI-COLLISION & BARGE-IN ──────────────────────────────────────────
      // If the assistant is currently speaking:
      if (this.isSpeaking) {
        // Check if user is saying an interruption/barge-in command
        const normalized = currentText.toLowerCase().replace(/[¿?¡!.,]/g, '').trim();
        const isInterruption =
          normalized.includes('para') ||
          normalized.includes('detente') ||
          normalized.includes('detén') ||
          normalized.includes('silencio') ||
          normalized.includes('cállate') ||
          normalized.includes('basta') ||
          normalized.includes('alto') ||
          normalized.includes('stop') ||
          normalized.includes('hola asistente') ||
          normalized.includes('oye asistente') ||
          normalized.includes('asistente');

        if (isInterruption) {
          // Immediately silence the assistant!
          this.stopSpeaking();
          this.playChime('command');
          if (this.onWakeStateChange) this.onWakeStateChange(true);
          return;
        }

        // Loopback echo filter: if the transcript closely matches what the assistant is speaking,
        // ignore it so the assistant doesn't hear itself and talk to itself!
        if (this.isSelfEcho(currentText)) {
          return;
        }

        // If it's a genuine user speech while assistant is talking, barge-in!
        if (currentText.length > 5) {
          this.stopSpeaking();
        }
      }

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
          this.silenceTimer = setTimeout(() => {
            if (this.currentSessionText && this.isListening) {
              const textToSubmit = this.currentSessionText;
              this.stopListening();
              if (this.onCommandCallback) {
                this.executeCommandSafely({ type: 'query', prompt: textToSubmit });
              }
            }
          }, 600);
        } else {
          this.silenceTimer = setTimeout(() => {
            if (this.currentSessionText && this.isListening) {
              const textToSubmit = this.currentSessionText;
              this.stopListening();
              if (this.onCommandCallback) {
                this.executeCommandSafely({ type: 'query', prompt: textToSubmit });
              }
            }
          }, 1400);
        }
      }
    };

    rec.onerror = (event: any) => {
      // Non-fatal events in continuous mode
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        return;
      }

      console.warn('Speech recognition warning:', event.error);
      let userMsg = 'Error en reconocimiento de voz';
      if (event.error === 'not-allowed') {
        userMsg = 'Acceso al micrófono denegado. Permite el micrófono en tu navegador.';
      } else if (event.error === 'network') {
        userMsg = 'Error de conexión con el servicio de reconocimiento de voz.';
      }

      if (this.onErrorCallback) {
        this.onErrorCallback(userMsg);
      }
    };

    rec.onend = () => {
      this.isListening = false;

      // In manual mode, if speech ended and we had captured text, trigger submit
      if (!this.isContinuousMode && this.currentSessionText.trim()) {
        const textToSubmit = this.currentSessionText.trim();
        this.currentSessionText = '';
        if (this.onCommandCallback) {
          this.executeCommandSafely({ type: 'query', prompt: textToSubmit });
        }
      }

      // Auto-restart in continuous mode if active
      if (this.isContinuousMode) {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          if (this.isContinuousMode && !this.isListening) {
            try {
              this.recognition = this.createRecognitionInstance(true);
              this.recognition?.start();
              this.isListening = true;
            } catch (e) {
              // Ignore restart collision
            }
          }
        }, 300);
      } else {
        if (this.onEndCallback) {
          this.onEndCallback();
        }
      }
    };

    return rec;
  }

  /**
   * Checks whether the recognized text is the speaker's own output (Acoustic Loopback Echo).
   */
  private isSelfEcho(recognizedText: string): boolean {
    const normRecognized = recognizedText.toLowerCase().replace(/[¿?¡!.,]/g, '').trim();
    if (!normRecognized) return false;

    // Check against current sentence being spoken
    if (this.currentSpokenSentence) {
      const normCurrent = this.currentSpokenSentence.toLowerCase().replace(/[¿?¡!.,]/g, '').trim();
      if (normCurrent.includes(normRecognized) || normRecognized.includes(normCurrent)) {
        return true;
      }
    }

    // Check against recent history of spoken phrases
    for (const phrase of this.recentSpokenHistory.slice(-5)) {
      const normPhrase = phrase.toLowerCase().replace(/[¿?¡!.,]/g, '').trim();
      if (normPhrase.includes(normRecognized) || normRecognized.includes(normPhrase)) {
        return true;
      }
    }

    return false;
  }

  public playChime(type: 'wake' | 'success' | 'command' = 'wake') {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const currentVol = Math.max(0.01, this.volume);

      if (type === 'wake') {
        // High dual-tone friendly wake chime
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
  public parseCommandOrWakeWord(rawText: string): {
    command: VoiceCommandAction | null;
    isWakeWord: boolean;
    isGreeting: boolean;
    queryText: string;
  } {
    const text = rawText
      .toLowerCase()
      .replace(/[¿?¡!.,]/g, '')
      .trim();

    const name = this.assistantName.toLowerCase().trim();

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
      text.includes('detente') ||
      text.includes('para') ||
      text.includes('basta')
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

    // 2. Greetings Recognition: "hola asistente", "hola asistente ia", "buenos días asistente"
    const greetingPatterns = [
      `hola ${name}`,
      'hola asistente ia',
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
          isGreeting: !remainder, // true if user ONLY said the greeting without extra query
          queryText: remainder,
        };
      }
    }

    // 3. General Wake Word Triggers: "oye asistente", "hey asistente", "asistente", etc.
    const wakePatterns = [
      `oye ${name}`,
      `hey ${name}`,
      `ok ${name}`,
      name,
      'oye asistente ia',
      'oye asistente',
      'hey asistente',
      'ok asistente',
      'asistente ia',
      'asistente',
      'despierta',
    ];

    for (const pattern of wakePatterns) {
      if (text === pattern || text.startsWith(pattern + ' ') || text.includes(pattern)) {
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

  /**
   * Executes a command or query safely, preventing duplicates or collisions.
   */
  private executeCommandSafely(command: VoiceCommandAction) {
    const now = Date.now();
    const commandKey = command.type === 'query' ? command.prompt : command.type;

    // Mutex debounce: drop exact duplicate command if fired within 800ms
    if (this.lastExecutedText === commandKey && now - this.lastExecutedCommandTime < 800) {
      return;
    }

    this.lastExecutedCommandTime = now;
    this.lastExecutedText = commandKey;

    if (this.onCommandCallback) {
      this.onCommandCallback(command);
    }
  }

  private handleContinuousSpeechResult(transcript: string, isFinal: boolean) {
    const { command, isWakeWord, isGreeting, queryText } = this.parseCommandOrWakeWord(transcript);

    // 1. Direct System Command (navigate, clear, stop speech)
    if (command && command.type !== 'query') {
      if (isFinal || transcript.length > 6) {
        this.playChime('command');
        this.executeCommandSafely(command);
        this.setAwakeState(false);
      }
      return;
    }

    // 2. Wake Word Detected!
    if (isWakeWord) {
      if (!this.isAwake) {
        this.setAwakeState(true);
        this.playChime('wake');
      }

      // Case A: User said Wake Word + Question in the SAME sentence (e.g. "Hola Asistente, ¿cuál es el clima?")
      if (queryText && isFinal) {
        this.executeCommandSafely({ type: 'query', prompt: queryText });
        this.setAwakeState(false);
        return;
      }

      // Case B: User said ONLY "Hola Asistente"
      if (isGreeting && isFinal) {
        // Acknowledge with a warm, natural quick greeting and keep listening for follow-up!
        this.speak('¡Hola! Te escucho. ¿En qué puedo ayudarte?', {
          onEnd: () => {
            // Keep awake for 8 seconds after greeting finishes so user can ask question
            this.setAwakeState(true);
          },
        });
        return;
      }
    } else if (this.isAwake && isFinal && transcript.trim()) {
      // 3. Assistant was already awake and user spoke a follow-up query
      this.executeCommandSafely({ type: 'query', prompt: transcript.trim() });
      this.setAwakeState(false);
    }
  }

  public setAwakeState(awake: boolean) {
    this.isAwake = awake;
    if (this.onWakeStateChange) {
      this.onWakeStateChange(awake);
    }

    clearTimeout(this.wakeTimeout);
    if (awake) {
      // Auto sleep after 8 seconds of inactivity if no query is spoken
      this.wakeTimeout = setTimeout(() => {
        this.setAwakeState(false);
      }, 8000);
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

    // Also request mic with echo cancellation if not yet granted
    this.requestMicrophoneAccess().catch(() => {});

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

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
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

    // Stop any ongoing speech before listening so user is never interrupted
    this.stopSpeaking();

    // Request mic access with AEC
    await this.requestMicrophoneAccess();

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

  // ─── REAL-TIME STREAMING TTS PIPELINE ───────────────────────────────────────

  /**
   * Enqueues a single sentence chunk to be spoken in real time as Groq streams it.
   */
  public enqueueStreamSpeech(sentence: string, options?: SpeechOptions) {
    const clean = sentence
      .replace(/[#*`_~\[\]()]/g, ' ')
      .replace(/\n+/g, '. ')
      .trim();

    if (!clean) return;

    this.speechQueue.push(clean);

    if (!this.isQueuePlaying) {
      this.playNextInQueue(options);
    }
  }

  private playNextInQueue(options?: SpeechOptions) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (this.speechQueue.length === 0) {
      this.isQueuePlaying = false;
      this.isSpeaking = false;
      if (this.onSpeakingStateChange) this.onSpeakingStateChange(false);
      if (options?.onEnd) options.onEnd();
      return;
    }

    this.isQueuePlaying = true;
    this.isSpeaking = true;
    if (this.onSpeakingStateChange) this.onSpeakingStateChange(true);

    const textToSpeak = this.speechQueue.shift()!;
    this.currentSpokenSentence = textToSpeak;
    this.recentSpokenHistory.push(textToSpeak);
    if (this.recentSpokenHistory.length > 10) {
      this.recentSpokenHistory.shift();
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
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
          v.name.includes('Helena') ||
          v.name.includes('Raul') ||
          v.name.includes('Monica'))
    ) || voices.find((v) => v.lang.startsWith('es'));

    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }

    this.currentUtterance = utterance;

    const onFinish = () => {
      this.currentUtterance = null;
      // Immediately play next queued sentence
      this.playNextInQueue(options);
    };

    utterance.onend = onFinish;
    utterance.onerror = onFinish;

    if (options?.onStart && this.speechQueue.length === 0) {
      utterance.onstart = options.onStart;
    }

    window.speechSynthesis.speak(utterance);
  }

  /**
   * Speak a full block of text (one-shot mode).
   */
  public speak(text: string, options?: SpeechOptions) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    this.stopSpeaking();

    const cleanText = text
      .replace(/[#*`_~\[\]()]/g, ' ')
      .replace(/\n+/g, '. ')
      .trim();

    if (!cleanText) return;

    // Split long text into natural sentences to avoid Chrome's 15-second speech freeze bug
    const sentences = cleanText.match(/[^.!?]+[.!?]*/g) || [cleanText];
    for (const s of sentences) {
      const trimmed = s.trim();
      if (trimmed) {
        this.speechQueue.push(trimmed);
      }
    }

    this.playNextInQueue(options);
  }

  /**
   * Stop speaking immediately (Barge-in / Interruption).
   */
  public stopSpeaking() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.speechQueue = [];
    this.isQueuePlaying = false;
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.currentSpokenSentence = '';
    if (this.onSpeakingStateChange) {
      this.onSpeakingStateChange(false);
    }
  }
}

export const speechService = new SpeechService();

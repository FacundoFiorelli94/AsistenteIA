export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  latencyMs?: number;
  ttftMs?: number;
  isStreaming?: boolean;
}

export type AssistantPersona = 'concise' | 'technical' | 'friendly' | 'executive';

export interface PersonaConfig {
  id: AssistantPersona;
  name: string;
  badge: string;
  description: string;
  iconName: string;
}

export interface UserPreferences {
  userName: string;
  assistantName: string;
  persona: AssistantPersona;
  autoSpeak: boolean;
  speechRate: number; // 0.8 - 1.5
  theme: 'dark' | 'light' | 'auto';
  kioskScale: number; // For preview sizing
  continuousListening: boolean; // Voice Input toggle
  wakeWordSound: boolean; // Sound chime on wake
  volume: number; // 0.0 - 1.0 (speech synthesis volume)
}

export type VoiceCommandAction =
  | { type: 'navigate'; target: AppViewMode }
  | { type: 'clear' }
  | { type: 'stop_speech' }
  | { type: 'open_settings' }
  | { type: 'toggle_listening'; enable: boolean }
  | { type: 'query'; prompt: string };

export type AppViewMode = 'kiosk_touch' | 'expanded_chat' | 'flutter_app' | 'flet_code' | 'settings';

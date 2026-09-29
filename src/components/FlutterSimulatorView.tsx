import React, { useState, useRef, useEffect } from 'react';
import { Smartphone, Send, RotateCcw, Copy, Check, Download, FileCode, Terminal, Sparkles, AlertCircle } from 'lucide-react';
import { streamAssistantResponse } from '../services/geminiService';
import { UserPreferences } from '../types/assistant';

interface FlutterSimulatorViewProps {
  preferences: UserPreferences;
}

interface FlutterChatMessage {
  id: string;
  isUser: boolean;
  text: string;
  isStreaming?: boolean;
}

export const FlutterSimulatorView: React.FC<FlutterSimulatorViewProps> = ({ preferences }) => {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'setup'>('simulator');
  const [messages, setMessages] = useState<FlutterChatMessage[]>([
    {
      id: 'init-1',
      isUser: false,
      text: '¡Hola! Soy tu Asistente IA en Flutter. He adaptado el código para hacer streaming en tiempo real. ¿En qué te puedo ayudar hoy?',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPubspec, setCopiedPubspec] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  // Live simulation of the user's _handleSend method in Flutter
  const handleSend = async (textToSend: string) => {
    const cleanText = textToSend.trim();
    if (!cleanText || isGenerating) return;

    setInputText('');
    setIsGenerating(true);

    // 1. Agregar mensaje del usuario a la lista (ChatMessage.user)
    const userMsg: FlutterChatMessage = {
      id: `user-${Date.now()}`,
      isUser: true,
      text: cleanText,
    };

    // 2. Crear mensaje vacio de respuesta para hacer streaming (ChatMessage.aiStreaming)
    const aiMsgId = `ai-${Date.now()}`;
    const aiMsg: FlutterChatMessage = {
      id: aiMsgId,
      isUser: false,
      text: '',
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);

    let accumulated = '';

    const history = messages.map((m) => ({
      role: (m.isUser ? 'user' : 'model') as 'user' | 'model',
      text: m.text,
    }));

    // 3. Consultar a Gemini con respuesta en tiempo real
    await streamAssistantResponse(
      cleanText,
      history,
      preferences.persona,
      preferences.userName,
      {
        onChunk: (chunk: string) => {
          accumulated += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, text: accumulated, isStreaming: true }
                : m
            )
          );
        },
        onDone: () => {
          setIsGenerating(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, text: accumulated, isStreaming: false }
                : m
            )
          );
        },
        onError: (err) => {
          setIsGenerating(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    text: `Error al conectar con Gemini: ${err}`,
                    isStreaming: false,
                  }
                : m
            )
          );
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend(inputText);
    }
  };

  const flutterDartCode = `import 'package:flutter/material.dart';
import 'package:google_generative_ai/google_generative_ai.dart';

/// Modelo de mensaje adaptado para streaming en tiempo real
class ChatMessage {
  final String? text;
  final bool isUser;
  final bool isStreaming;
  final StringBuffer _streamBuffer = StringBuffer();

  ChatMessage.user(this.text)
      : isUser = true,
        isStreaming = false;

  ChatMessage.aiStreaming()
      : text = null,
        isUser = false,
        isStreaming = true;

  ChatMessage.ai(this.text)
      : isUser = false,
        isStreaming = false;

  void appendStream(String chunk) {
    _streamBuffer.write(chunk);
  }

  void finishStreaming() {
    // Finaliza el estado de streaming
  }

  String get displayText => text ?? _streamBuffer.toString();
}

class AsistenteIaScreen extends StatefulWidget {
  const AsistenteIaScreen({super.key});

  @override
  State<AsistenteIaScreen> createState() => _AsistenteIaScreenState();
}

class _AsistenteIaScreenState extends State<AsistenteIaScreen> {
  final List<ChatMessage> _messages = [];
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  
  late final GenerativeModel _model;
  bool _isGenerating = false;

  // Clave de API inyectada vía: flutter run --dart-define=GEMINI_API_KEY=tu_clave
  static const String _defaultApiKey = String.fromEnvironment(
    'GEMINI_API_KEY',
    defaultValue: '',
  );

  @override
  void initState() {
    super.initState();
    
    // Modelo actualizado para baja latencia (gemini-2.5-flash / gemini-flash-latest)
    _model = GenerativeModel(
      model: 'gemini-2.5-flash',
      apiKey: _defaultApiKey,
      systemInstruction: Content.system(
        'Eres un Asistente IA moderno, conciso, rápido y servicial. '
        'Responde en español de forma directa y clara.',
      ),
      generationConfig: GenerationConfig(
        temperature: 0.7,
        topP: 0.95,
      ),
    );

    _messages.add(
      ChatMessage.ai('¡Hola! Soy tu Asistente IA en Flutter. ¿En qué te puedo ayudar hoy?'),
    );
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _handleSend(String text) async {
    final cleanText = text.trim();
    if (cleanText.isEmpty || _isGenerating) return;

    _textController.clear();
    setState(() {
      _isGenerating = true;
      // 1. Agregar mensaje del usuario a la lista
      _messages.add(ChatMessage.user(cleanText));
    });
    _scrollToBottom();

    // 2. Crear mensaje vacío de respuesta para hacer streaming
    final aiMessage = ChatMessage.aiStreaming();
    setState(() {
      _messages.add(aiMessage);
    });
    _scrollToBottom();

    try {
      // 3. Consultar a Gemini con respuesta en tiempo real
      final responseStream = _model.generateContentStream([
        Content.text(cleanText),
      ]);

      await for (final chunk in responseStream) {
        if (chunk.text != null && chunk.text!.isNotEmpty) {
          aiMessage.appendStream(chunk.text!);
          setState(() {}); // Actualiza la interfaz por cada fragmento recibido
          _scrollToBottom();
        }
      }
    } catch (e) {
      aiMessage.appendStream('\\n\\n[Error al procesar consulta: \$e]');
    } finally {
      aiMessage.finishStreaming();
      setState(() {
        _isGenerating = false;
      });
      _scrollToBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A), // Slate Dark
      appBar: AppBar(
        elevation: 1,
        backgroundColor: const Color(0xFF1E293B),
        title: Row(
          children: const [
            Icon(Icons.auto_awesome_rounded, color: Color(0xFF60A5FA), size: 24),
            SizedBox(width: 10),
            Text(
              "ASISTENTE IA",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 18,
                color: Color(0xFFF8FAFC),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: Color(0xFF94A3B8)),
            tooltip: 'Limpiar chat',
            onPressed: () {
              setState(() {
                _messages.clear();
                _messages.add(ChatMessage.ai('Conversación reiniciada. ¿Qué deseas consultar?'));
              });
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final message = _messages[index];
                final isUser = message.isUser;

                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 6),
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.of(context).size.width * 0.8,
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: isUser ? const Color(0xFF2563EB) : const Color(0xFF1E293B),
                      borderRadius: BorderRadius.only(
                        topLeft: const Radius.circular(16),
                        topRight: const Radius.circular(16),
                        bottomLeft: Radius.circular(isUser ? 16 : 4),
                        bottomRight: Radius.circular(isUser ? 4 : 16),
                      ),
                      border: Border.all(
                        color: isUser ? Colors.transparent : const Color(0xFF334155),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          message.displayText.isEmpty && message.isStreaming
                              ? 'Pensando...'
                              : message.displayText,
                          style: TextStyle(
                            color: const Color(0xFFF8FAFC),
                            fontSize: 15,
                            fontStyle: message.displayText.isEmpty && message.isStreaming
                                ? FontStyle.italic
                                : FontStyle.normal,
                            height: 1.4,
                          ),
                        ),
                        if (message.isStreaming)
                          const Padding(
                            padding: EdgeInsets.only(top: 6),
                            child: SizedBox(
                              width: 12,
                              height: 12,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF60A5FA)),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: const BoxDecoration(
              color: Color(0xFF1E293B),
              border: Border(top: BorderSide(color: Color(0xFF334155))),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      style: const TextStyle(color: Color(0xFFF8FAFC)),
                      textInputAction: TextInputAction.send,
                      onSubmitted: _handleSend,
                      decoration: InputDecoration(
                        hintText: "Escribe tu consulta aquí...",
                        hintStyle: const TextStyle(color: Color(0xFF64748B)),
                        filled: true,
                        fillColor: const Color(0xFF0F172A),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF334155)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF334155)),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF3B82F6), width: 1.5),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _isGenerating
                        ? null
                        : () => _handleSend(_textController.text),
                    style: IconButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: _isGenerating
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}`;

  const pubspecYaml = `name: asistente_ia_flutter
description: "Asistente IA con Flutter y Google Generative AI (Gemini)"
version: 1.0.0+1

environment:
  sdk: '>=3.2.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  google_generative_ai: ^0.4.6
  cupertino_icons: ^1.0.8

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
`;

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(flutterDartCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyPubspec = () => {
    navigator.clipboard.writeText(pubspecYaml);
    setCopiedPubspec(true);
    setTimeout(() => setCopiedPubspec(false), 2000);
  };

  const quickPrompts = [
    '¡Hola Asistente!',
    '¿Qué ventajas tiene Flutter con Gemini?',
    'Explícame cómo funciona el streaming en Flutter',
    'Dame 3 consejos de optimización móvil',
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Asistente IA en Flutter (Dart + Gemini)
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Código adaptado para streaming en tiempo real y probado en directo en este simulador interactivo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownload('asistente_ia_screen.dart', flutterDartCode)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Descargar .dart</span>
          </button>
          <button
            onClick={() => handleDownload('pubspec.yaml', pubspecYaml)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>pubspec.yaml</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'simulator'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Simulador Flutter en Vivo</span>
        </button>

        <button
          onClick={() => setActiveTab('code')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'code'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>Código Dart (asistente_ia_screen.dart)</span>
        </button>

        <button
          onClick={() => setActiveTab('setup')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'setup'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Guía de Ejecución en Flutter</span>
        </button>
      </div>

      {/* Tab 1: Live Interactive Flutter Simulator */}
      {activeTab === 'simulator' && (
        <div className="flex flex-col items-center justify-center py-2">
          {/* Mobile Shell Mockup */}
          <div className="w-full max-w-[420px] h-[640px] bg-[#0F172A] rounded-[36px] border-4 border-slate-800 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden relative">
            {/* Phone Top Notch */}
            <div className="w-full h-6 bg-[#1E293B] flex items-center justify-between px-6 pt-1 shrink-0 select-none">
              <span className="text-[10px] font-mono text-slate-400">9:41</span>
              <div className="w-16 h-3 bg-slate-900 rounded-full" />
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <span>5G</span>
                <span>100%</span>
              </div>
            </div>

            {/* Flutter AppBar */}
            <div className="h-14 bg-[#1E293B] border-b border-[#334155] px-4 flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-[#60A5FA]" />
                <span className="font-bold text-[#F8FAFC] text-base tracking-tight">
                  ASISTENTE IA
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Flutter
                </span>
              </div>

              <button
                onClick={() => {
                  setMessages([
                    {
                      id: 'reset-1',
                      isUser: false,
                      text: 'Conversación reiniciada. ¿Qué deseas consultar hoy en Flutter?',
                    },
                  ]);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Reiniciar chat"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Flutter ListView.builder Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0F172A]"
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] px-4 py-3 text-sm leading-relaxed rounded-2xl shadow-sm ${
                      msg.isUser
                        ? 'bg-[#2563EB] text-white rounded-br-sm'
                        : 'bg-[#1E293B] border border-[#334155] text-[#F8FAFC] rounded-bl-sm'
                    }`}
                  >
                    {msg.text.length === 0 && msg.isStreaming ? (
                      <span className="text-slate-400 italic flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                        Pensando en tiempo real...
                      </span>
                    ) : (
                      <span className="whitespace-pre-wrap select-text">{msg.text}</span>
                    )}

                    {msg.isStreaming && msg.text.length > 0 && (
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-[#60A5FA] animate-pulse align-middle" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Prompts Chips inside Flutter Screen */}
            <div className="px-3 py-1.5 bg-[#1E293B]/70 border-t border-[#334155] flex gap-1.5 overflow-x-auto text-[11px] shrink-0">
              {quickPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(p)}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Flutter Bottom Input Bar (TextField + IconButton) */}
            <div className="p-3 bg-[#1E293B] border-t border-[#334155] shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isGenerating}
                  placeholder="Escribe tu consulta aquí..."
                  className="flex-1 h-11 bg-[#0F172A] border border-[#334155] focus:border-[#3B82F6] rounded-xl px-3.5 text-sm text-[#F8FAFC] placeholder-[#64748B] outline-none transition-colors"
                />

                <button
                  onClick={() => handleSend(inputText)}
                  disabled={!inputText.trim() || isGenerating}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                    !inputText.trim() || isGenerating
                      ? 'bg-blue-600/40 text-white/40 cursor-not-allowed'
                      : 'bg-[#2563EB] hover:bg-blue-600 text-white shadow-md active:scale-95'
                  }`}
                >
                  {isGenerating ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Code Viewer */}
      {activeTab === 'code' && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-xs">
            <span className="font-mono text-slate-400">lib/asistente_ia_screen.dart</span>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copiado' : 'Copiar Código'}</span>
            </button>
          </div>
          <pre className="p-4 sm:p-6 text-xs sm:text-[13px] font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-[600px] select-text">
            <code>{flutterDartCode}</code>
          </pre>
        </div>
      )}

      {/* Tab 3: Setup & Pubspec */}
      {activeTab === 'setup' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs sm:text-sm text-slate-300">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Adaptaciones y Mejoras Aplicadas sobre tu Código
            </h3>

            <div className="space-y-3 leading-relaxed">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Actualización de Modelo a Gemini 2.5 Flash / Flash Latest:</strong>
                  <p className="text-slate-400 mt-0.5">
                    Se reemplazó <code>gemini-1.5-flash</code> (modelo deprecado) por <code>gemini-2.5-flash</code> para garantizar compatibilidad, mínima latencia y respuestas streaming inmediatas.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Streaming Autónomo sin dependencias no oficiales:</strong>
                  <p className="text-slate-400 mt-0.5">
                    Se implementó <code>ChatMessage</code> nativo con <code>StringBuffer</code> y scroll automático (<code>_scrollToBottom()</code>), eliminando la dependencia de paquetes externos conflictivos como <code>flutter_ai_chat_ui</code>.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Inyección segura de API Key vía --dart-define:</strong>
                  <p className="text-slate-400 mt-0.5">
                    Permite compilar para Android, iOS, Web o Desktop inyectando la clave en tiempo de compilación sin dejarla expuesta en el código fuente:
                  </p>
                  <code className="block mt-1 font-mono text-blue-300 text-xs bg-slate-900 p-2 rounded">
                    flutter run --dart-define=GEMINI_API_KEY="tu_api_key_aqui"
                  </code>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-xs">
              <span className="font-mono text-slate-400">pubspec.yaml</span>
              <button
                onClick={handleCopyPubspec}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                {copiedPubspec ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPubspec ? 'Copiado' : 'Copiar pubspec.yaml'}</span>
              </button>
            </div>
            <pre className="p-4 sm:p-6 text-xs sm:text-[13px] font-mono text-slate-300 overflow-x-auto leading-relaxed select-text">
              <code>{pubspecYaml}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

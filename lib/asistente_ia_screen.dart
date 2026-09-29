import 'package:flutter/material.dart';
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

  // Clave de API inyectada preferiblemente vía: flutter run --dart-define=GEMINI_API_KEY=tu_clave
  static const String _defaultApiKey = String.fromEnvironment(
    'GEMINI_API_KEY',
    defaultValue: '',
  );

  @override
  void initState() {
    super.initState();
    
    // Inicializar modelo actualizado (gemini-2.5-flash o gemini-flash-latest para baja latencia)
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

    // Mensaje de bienvenida inicial
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
      aiMessage.appendStream('\n\n[Error al procesar consulta: $e]');
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
    final theme = Theme.of(context);
    
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
          // Lista de mensajes con scroll automático
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
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.15),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
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

          // Barra inferior de entrada
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
                      disabledBackgroundColor: const Color(0xFF1E3A8A),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      padding: const EdgeInsets.all(12),
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
}

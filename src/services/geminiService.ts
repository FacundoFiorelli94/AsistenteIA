// Assistant API client service for real-time low latency streaming
import { AssistantPersona } from '../types/assistant';

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onFirstToken?: (ttftMs: number) => void;
  onDone: (metrics: { ttftMs: number; totalDurationMs: number; model?: string }) => void;
  onError: (error: string) => void;
}

export async function streamAssistantResponse(
  prompt: string,
  history: Array<{ role: 'user' | 'model'; text: string }>,
  persona: AssistantPersona,
  userName: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const startTime = performance.now();
  let receivedFirstToken = false;

  try {
    const response = await fetch('/api/assistant/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        history,
        persona,
        userName,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || 'Error en el servidor'}`);
    }

    if (!response.body) {
      throw new Error('Respuesta del servidor vacía');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const data = JSON.parse(jsonStr);

            if (data.error) {
              callbacks.onError(data.error);
              return;
            }

            if (data.text) {
              if (!receivedFirstToken) {
                receivedFirstToken = true;
                const ttft = Math.round(performance.now() - startTime);
                if (callbacks.onFirstToken) callbacks.onFirstToken(ttft);
              }
              callbacks.onChunk(data.text);
            }

            if (data.done) {
              const totalDuration = Math.round(performance.now() - startTime);
              callbacks.onDone({
                ttftMs: data.ttftMs ?? Math.round(performance.now() - startTime),
                totalDurationMs: data.totalDurationMs ?? totalDuration,
                model: data.model,
              });
              return;
            }
          } catch (e) {
            console.error('Failed to parse SSE line:', jsonStr, e);
          }
        }
      }
    }

    // Finished stream
    const finalDuration = Math.round(performance.now() - startTime);
    callbacks.onDone({
      ttftMs: finalDuration,
      totalDurationMs: finalDuration,
    });
  } catch (err: any) {
    if (signal?.aborted) {
      return;
    }
    console.error('Error during streaming response:', err);
    callbacks.onError(err?.message || 'Error de conexión con el Asistente IA');
  }
}

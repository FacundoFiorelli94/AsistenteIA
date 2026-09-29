import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// ─── Groq client via native fetch (no SDK needed) ────────────────────────────
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Models in priority order — confirmed available on this account
const GROQ_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'allam-2-7b',
];

function getGroqKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

// ─── Health check / status endpoint ──────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  const key = getGroqKey();
  res.json({
    status: 'online',
    hasApiKey: !!key,
    model: GROQ_MODELS[0],
    provider: 'groq',
    mode: key ? 'groq_cloud_live' : 'offline',
  });
});

// ─── SSE Streaming chat endpoint ─────────────────────────────────────────────
app.post('/api/assistant/chat', async (req, res) => {
  const { prompt, history = [], persona = 'concise', userName = 'Usuario' } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'El parámetro prompt es requerido.' });
  }

  // Setup Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const startTime = Date.now();
  let firstTokenTime: number | null = null;

  // ── Conversational Human Voice Persona prompts ──
  const voiceGuidelines = `
REGLAS DE CONVERSACIÓN POR VOZ HUMANA EN TIEMPO REAL:
- Estás conversando por voz en directo con ${userName}. Tus respuestas serán leídas por un sintetizador de voz.
- Habla como una persona de carne y hueso: cercano, educado, natural, cálido y fluido.
- NUNCA uses formato markdown, asteriscos (**), viñetas (- o *), numerales (#) ni emojis, porque la voz los leería mal o sonaría robótica.
- Usa comas y puntos para que la voz haga pausas naturales de respiración y entonación.
- Mantén las respuestas breves y dinámicas (1 a 3 oraciones), como en una charla humana real, salvo que te pidan una explicación detallada.
- Responde siempre en español natural.`;

  const personaInstructions: Record<string, string> = {
    concise: `Eres un asistente de voz inteligente, ágil y conversacional. ${voiceGuidelines}`,
    technical: `Eres un asistente técnico conversacional. Explica conceptos con claridad y precisión sin tecnicismos innecesarios. ${voiceGuidelines}`,
    friendly: `Eres un asistente muy cercano, empático y afectuoso. ${voiceGuidelines}`,
    executive: `Eres un asistente ejecutivo conciso, resolutivo y muy profesional. ${voiceGuidelines}`,
  };

  const systemInstruction = personaInstructions[persona] || personaInstructions.concise;
  const groqKey = getGroqKey();

  if (groqKey) {
    // Build OpenAI-compatible messages array
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemInstruction },
    ];

    // Add last 6 turns of history
    for (const turn of history.slice(-6)) {
      if (turn.text && (turn.role === 'user' || turn.role === 'model')) {
        messages.push({
          role: turn.role === 'model' ? 'assistant' : 'user',
          content: turn.text,
        });
      }
    }
    messages.push({ role: 'user', content: prompt });

    // Try each model in priority order
    for (const model of GROQ_MODELS) {
      try {
        const groqRes = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 1024,
            stream: true,
          }),
        });

        if (!groqRes.ok) {
          const errText = await groqRes.text();
          console.warn(`Groq model ${model} error ${groqRes.status}: ${errText}`);
          // 429 = rate limit → try next model; other errors may also warrant trying next
          continue;
        }

        if (!groqRes.body) {
          console.warn(`Groq model ${model}: empty response body`);
          continue;
        }

        // Stream SSE from Groq → client
        const reader = groqRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let usedModel = model;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') continue;

            try {
              const chunk = JSON.parse(payload);
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                if (!firstTokenTime) firstTokenTime = Date.now();
                res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
              }
            } catch {
              // malformed chunk — skip
            }
          }
        }

        const totalDuration = Date.now() - startTime;
        const ttft = firstTokenTime ? firstTokenTime - startTime : totalDuration;

        res.write(
          `data: ${JSON.stringify({
            done: true,
            ttftMs: ttft,
            totalDurationMs: totalDuration,
            model: usedModel,
            provider: 'groq',
          })}\n\n`
        );
        res.end();
        return;
      } catch (err: any) {
        console.warn(`Groq model ${model} fetch error:`, err?.message || err);
        // Try next model
      }
    }

    // All Groq models failed
    console.error('All Groq models exhausted.');
  }

  // ── Fallback: no AI available ──
  const fallbackMessage =
    'No fue posible conectar con el modelo de IA en este momento. Por favor verifica la conexión o vuelve a intentar tu consulta.';
  const words = fallbackMessage.split(' ');
  for (let i = 0; i < words.length; i++) {
    const chunk = (i === 0 ? '' : ' ') + words[i];
    res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    await new Promise((r) => setTimeout(r, 20));
  }

  const duration = Date.now() - startTime;
  res.write(
    `data: ${JSON.stringify({
      done: true,
      ttftMs: 30,
      totalDurationMs: duration,
      model: 'offline',
    })}\n\n`
  );
  res.end();
});

// ─── Vite / Static files ──────────────────────────────────────────────────────
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Asistente IA server running on port ${PORT} (Groq-powered 🚀)`);
  });
}

startServer();

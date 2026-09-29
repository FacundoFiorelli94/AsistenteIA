import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import os from 'os';

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// ─── Groq client via native fetch (no heavy SDK needed) ──────────────────────
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const GROQ_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'allam-2-7b',
];

function getGroqKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

// ─── LANGCHAIN-INSPIRED TOOL LAYER ───────────────────────────────────────────
// Tools provide ground-truth real-time data so the assistant never hallucinates.

interface ToolResult {
  toolName: string;
  data: string;
}

const WMO_WEATHER_MAP: Record<number, string> = {
  0: 'cielo despejado',
  1: 'principalmente despejado',
  2: 'parcialmente nublado',
  3: 'cubierto o nublado',
  45: 'niebla',
  48: 'niebla con escarcha',
  51: 'llovizna ligera',
  53: 'llovizna moderada',
  55: 'llovizna densa',
  61: 'lluvia ligera',
  63: 'lluvia moderada',
  65: 'lluvia fuerte',
  71: 'nevada ligera',
  80: 'chubascos dispersos',
  95: 'tormenta eléctrica',
};

async function toolGetLiveWeather(cityName: string): Promise<string> {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=es&format=json`,
      { signal: AbortSignal.timeout(3500) }
    );
    const geoData = await geoRes.json();
    if (!geoData.results || !geoData.results.length) {
      return `No se encontraron datos meteorológicos para "${cityName}".`;
    }

    const { latitude, longitude, name, country } = geoData.results[0];
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m`,
      { signal: AbortSignal.timeout(3500) }
    );
    const wData = await weatherRes.json();
    const current = wData.current;
    const condition = WMO_WEATHER_MAP[current.weather_code] || 'tiempo estable';

    return `Clima actual en ${name}, ${country}: ${Math.round(current.temperature_2m)}°C, con ${condition}, humedad del ${current.relative_humidity_2m}% y viento a ${Math.round(current.wind_speed_10m)} km/h.`;
  } catch (err: any) {
    return `Error consultando clima: ${err?.message || 'servicio no disponible'}`;
  }
}

function toolCalculateMath(expression: string): string | null {
  try {
    // Only accept safe arithmetic expressions: numbers, +, -, *, /, %, (, ), .
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '').trim();
    if (!sanitized || sanitized.length < 2) return null;
    // Disallow dangerous patterns
    if (/[a-zA-Z_$`]/.test(sanitized)) return null;

    const fn = new Function(`return (${sanitized})`);
    const result = fn();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return `${sanitized} = ${Math.round(result * 1000) / 1000}`;
    }
  } catch {
    // Not a valid math expr
  }
  return null;
}

function toolGetSystemDiagnostics(): string {
  const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const uptimeMinutes = Math.round(os.uptime() / 60);
  return `Sistema operativo: ${os.type()} ${os.arch()}, Memoria libre: ${freeMemMb} MB de ${totalMemMb} MB, Tiempo activo del equipo: ${uptimeMinutes} minutos.`;
}

/**
 * LangChain-style Intent Router: inspects prompt and executes matching tool in parallel (<200ms)
 */
async function executeToolsForPrompt(prompt: string): Promise<ToolResult | null> {
  const lower = prompt.toLowerCase();

  // 1. Weather Tool intent
  const weatherKeywords = ['clima', 'tiempo', 'temperatura', 'va a llover', 'lluvia', 'pronóstico', 'pronostico'];
  if (weatherKeywords.some((kw) => lower.includes(kw))) {
    // Extract city name if mentioned e.g. "en Madrid", "en Buenos Aires", "en Santiago"
    const match = lower.match(/(?:en|de|para)\s+([a-záéíóúüñ\s]+?)(?:\?|$|\.|\,)/i);
    const city = match ? match[1].trim() : 'Buenos Aires';
    if (city.length >= 3 && !city.includes('este momento') && !city.includes('hoy')) {
      const data = await toolGetLiveWeather(city);
      return { toolName: 'ClimaEnVivo', data };
    } else {
      const data = await toolGetLiveWeather('Buenos Aires');
      return { toolName: 'ClimaEnVivo', data };
    }
  }

  // 2. Math Tool intent
  const mathKeywords = ['cuánto es', 'cuanto es', 'calcula', 'calcular', 'suma', 'multiplica', 'divide'];
  if (mathKeywords.some((kw) => lower.includes(kw)) || /[\d]+\s*[\+\-\*\/]\s*[\d]+/.test(prompt)) {
    const exprMatch = prompt.match(/([0-9\s+\-*/().%]+)/);
    if (exprMatch && exprMatch[1].trim().length >= 3) {
      const mathRes = toolCalculateMath(exprMatch[1]);
      if (mathRes) {
        return { toolName: 'CalculadoraMatematica', data: mathRes };
      }
    }
  }

  // 3. System diagnostics intent
  if (lower.includes('estado del sistema') || lower.includes('memoria libre') || lower.includes('diagnóstico')) {
    return { toolName: 'DiagnosticoSistema', data: toolGetSystemDiagnostics() };
  }

  return null;
}

// ─── Health check / status endpoint ──────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  const key = getGroqKey();
  res.json({
    status: 'online',
    hasApiKey: !!key,
    model: GROQ_MODELS[0],
    provider: 'groq',
    framework: 'langchain_conversational_core',
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

  // ── LANGCHAIN TEMPORAL & SPATIAL CONTEXT ──
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  // Execute tools if applicable
  const toolResult = await executeToolsForPrompt(prompt);

  // ── Conversational Human Voice Persona prompts ──
  const voiceGuidelines = `
REGLAS OBLIGATORIAS PARA CONVERSACIÓN POR VOZ HUMANA EN TIEMPO REAL:
1. Estás conversando por voz en directo con ${userName}. Tus respuestas serán leídas por un sintetizador de voz.
2. Habla exactamente como una persona agradable, educada, natural, cercana y fluida.
3. CONTEXTO TEMPORAL ACTUAL: Hoy es ${dateStr}, y la hora actual es ${timeStr}. Úsalo con total exactitud cuando te pregunten qué hora es, qué día o qué fecha.
4. NUNCA uses formato markdown, asteriscos (**), viñetas (- o *), numerales (#) ni emojis, ya que rompen la pronunciación del sintetizador de voz.
5. Usa comas y puntos para que la voz haga pausas y entonaciones humanas naturales.
6. Mantén las respuestas breves y dinámicas (1 a 3 oraciones), como en una conversación humana real.
7. Responde siempre en español natural.`;

  const personaInstructions: Record<string, string> = {
    concise: `Eres un asistente de voz inteligente, ágil y conversacional. ${voiceGuidelines}`,
    technical: `Eres un asistente técnico conversacional. Explica conceptos con claridad y precisión sin tecnicismos innecesarios. ${voiceGuidelines}`,
    friendly: `Eres un asistente muy cercano, empático y afectuoso. ${voiceGuidelines}`,
    executive: `Eres un asistente ejecutivo conciso, resolutivo y muy profesional. ${voiceGuidelines}`,
  };

  const systemInstruction = personaInstructions[persona] || personaInstructions.concise;
  const groqKey = getGroqKey();

  if (groqKey) {
    // Build OpenAI-compatible messages array (LangChain ChatPromptTemplate format)
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemInstruction },
    ];

    // LangChain ConversationBufferWindowMemory: last 6 turns
    for (const turn of history.slice(-6)) {
      if (turn.text && (turn.role === 'user' || turn.role === 'model')) {
        messages.push({
          role: turn.role === 'model' ? 'assistant' : 'user',
          content: turn.text,
        });
      }
    }

    // If tool was executed, inject observation directly into conversation
    if (toolResult) {
      messages.push({
        role: 'system',
        content: `[DATO VERIFICADO EN VIVO DE HERRAMIENTA '${toolResult.toolName}']: ${toolResult.data}. Usa esta información exacta para responder al usuario con tu tono de voz natural.`,
      });
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
            temperature: 0.65,
            max_tokens: 384,
            stream: true,
          }),
        });

        if (!groqRes.ok) {
          const errText = await groqRes.text();
          console.warn(`Groq model ${model} error ${groqRes.status}: ${errText}`);
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
      }
    }

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
    console.log(`Asistente IA server running on port ${PORT} (Groq + LangChain Tools 🚀)`);
  });
}

startServer();

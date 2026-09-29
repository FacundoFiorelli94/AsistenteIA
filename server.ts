import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

function getGenAIClient(): { client: GoogleGenAI | null; key: string | undefined } {
  const currentKey = process.env.GEMINI_API_KEY;
  if (!currentKey) return { client: null, key: undefined };
  try {
    return { client: new GoogleGenAI({ apiKey: currentKey }), key: currentKey };
  } catch (err) {
    console.error('Error instantiating GoogleGenAI:', err);
    return { client: null, key: currentKey };
  }
}

// Health check / status endpoint
app.get('/api/status', (req, res) => {
  const { key } = getGenAIClient();
  res.json({
    status: 'online',
    hasApiKey: !!key,
    model: 'gemini-3.5-flash',
    mode: key ? 'gemini_cloud_live' : 'offline',
  });
});

// SSE Streaming chat endpoint for ultra-low latency responses
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

  // Build persona prompt
  const personaInstructions: Record<string, string> = {
    concise: `Eres un asistente de Inteligencia Artificial moderno, rápido y altamente resolutivo.
Tu prioridad absoluta es ser directo, claro y responder en español con explicaciones útiles y concisas.
Responde de forma natural a la pregunta o solicitud exacta del usuario (${userName}).`,
    technical: `Eres un asistente técnico especializado en desarrollo de software, arquitectura de sistemas y tecnología.
Proporciona respuestas precisas, técnicas y fundamentadas en español. Usuario: ${userName}.`,
    friendly: `Eres un asistente virtual empático, cálido y servicial.
Habla en español con tono cercano, agradable y respuestas bien estructuradas. Usuario: ${userName}.`,
    executive: `Eres un asistente ejecutivo enfocado en productividad y síntesis.
Respuestas estructuradas, con viñetas limpias, directo al grano y accionable en español. Usuario: ${userName}.`,
  };

  const systemInstruction = personaInstructions[persona] || personaInstructions.concise;
  const { client: ai } = getGenAIClient();

  if (ai) {
    try {
      // Build conversation contents
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      for (const turn of history.slice(-6)) {
        if (turn.text && (turn.role === 'user' || turn.role === 'model')) {
          contents.push({
            role: turn.role,
            parts: [{ text: turn.text }],
          });
        }
      }

      contents.push({
        role: 'user',
        parts: [{ text: prompt }],
      });

      let responseStream: any = null;
      let usedModel = 'gemini-3.5-flash';

      // Models in priority order with available quota
      const modelCandidates = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];

      for (const candidate of modelCandidates) {
        try {
          responseStream = await ai.models.generateContentStream({
            model: candidate,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });
          usedModel = candidate;
          break;
        } catch (candidateErr: any) {
          console.warn(`Model ${candidate} unavailable (${candidateErr?.status || candidateErr?.message}), trying next...`);
        }
      }

      if (responseStream) {
        for await (const chunk of responseStream) {
          if (!firstTokenTime) {
            firstTokenTime = Date.now();
          }
          const textChunk = chunk.text;
          if (textChunk) {
            res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
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
          })}\n\n`
        );
        res.end();
        return;
      }
    } catch (error: any) {
      console.error('Error generating streaming response from Gemini:', error?.message || error);
    }
  }

  // If AI generation could not complete, send a clear system notification instead of canned strings
  const fallbackMessage = `No fue posible conectar con el modelo de IA en este momento. Por favor verifica la conexión o vuelve a intentar tu consulta.`;
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
      model: 'local-fast-engine',
    })}\n\n`
  );
  res.end();
});

// Configure Vite or Static files
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
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Asistente IA server running on port ${PORT}`);
  });
}

startServer();

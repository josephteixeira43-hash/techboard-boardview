// src/core/ai/services/aiService.ts
// Serviço central de comunicação com a API Groq
// Convertido de CommonJS para ESM TypeScript

export const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "llama-3.3-70b-versatile";

interface CallAIParams {
  systemPrompt: string;
  userMessage: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callAI({
  systemPrompt,
  userMessage,
  apiKey,
  maxTokens = 2000,
  temperature = 0.2,
}: CallAIParams): Promise<string> {
  // Next.js: usa variável server-side
  const key = apiKey
    || process.env.GROQ_API_KEY
    || process.env.REACT_APP_GROQ_API_KEY;

  if (!key) throw new Error("GROQ_API_KEY não configurada");

  const body = {
    model: GROQ_MODEL,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userMessage },
    ],
  };

  const resp = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq API ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// src/core/ai/techAIEngine.ts
// TECH AI ENGINE — Cérebro central do Tech Board Pro
// Convertido de CommonJS para ESM TypeScript

import { contextManager, BoardviewContext, SchematicContext, USBContext, TroubleshootingContext, PDFContext } from "./contextManager";
import { buildSystemPrompt, buildUserMessage, detectMode, AIMode } from "./promptBuilder";
import { callAI } from "./services/aiService";

export interface DiagnosisResult {
  response: string;
  mode: AIMode;
  activeContexts: string[];
  timestamp: string;
}

export interface GenerateDiagnosisParams {
  userPrompt?: string;
  extraContext?: Record<string, any>;
  debugLog?: (msg: string) => void;
  maxTokens?: number;
}

export async function generateDiagnosis({
  userPrompt = "",
  extraContext = {},
  debugLog,
  maxTokens = 2000,
}: GenerateDiagnosisParams): Promise<DiagnosisResult> {
  const log = (msg: string) => {
    console.log(`[TechAIEngine] ${msg}`);
    debugLog?.(msg);
  };

  const activeContexts = {
    ...contextManager.getActiveContexts(),
    ...extraContext,
  };

  const mode = detectMode(activeContexts);
  log(`Modo detectado: ${mode}`);
  log(`Contextos ativos: ${Object.keys(activeContexts).join(", ") || "nenhum"}`);

  const systemPrompt = buildSystemPrompt(activeContexts);
  const userMessage = buildUserMessage(userPrompt, activeContexts);

  log("Chamando Groq API...");
  const response = await callAI({ systemPrompt, userMessage, maxTokens });
  log(`Resposta recebida (${response.length} chars)`);

  return {
    response,
    mode,
    activeContexts: Object.keys(activeContexts),
    timestamp: new Date().toISOString(),
  };
}

// ── Context updaters ────────────────────────────────────────────────────────

export function updateUsbContext(data: USBContext | null) {
  contextManager.setContext("usb", data);
}

export function updateBoardviewContext(data: BoardviewContext | null) {
  contextManager.setContext("boardview", data);
}

export function updateSchematicContext(data: SchematicContext | null) {
  contextManager.setContext("schematic", data);
}

export function updateTroubleshootingContext(data: TroubleshootingContext | null) {
  contextManager.setContext("troubleshooting", data);
}

export function updatePDFContext(data: PDFContext | null) {
  contextManager.setContext("pdf", data);
}

export function clearContext(type: Parameters<typeof contextManager.clearContext>[0]) {
  contextManager.clearContext(type);
}

export function clearAllContexts() {
  contextManager.clearAll();
}

// Re-exporta o contextManager para uso direto
export { contextManager };

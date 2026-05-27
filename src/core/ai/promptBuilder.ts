// src/core/ai/promptBuilder.ts
// Constrói o prompt ideal baseado nos contextos ativos
// Convertido de CommonJS para ESM TypeScript

import { ActiveContexts } from "./contextManager";

export type AIMode =
  | "USB_BOARDVIEW"
  | "USB_SCHEMATIC"
  | "USB_LIVE"
  | "BOARDVIEW"
  | "SCHEMATIC"
  | "TROUBLESHOOTING"
  | "PDF"
  | "MANUAL";

const SYSTEM_PROMPT_BASE = `Você é o TECH AI ENGINE, um sistema de IA especialista em manutenção profissional de smartphones e placas-mãe.

Você tem acesso a múltiplos contextos técnicos simultaneamente:
- Dados USB do dispositivo conectado
- Componentes do BoardView (nome, categoria, coordenadas, tensão)
- Linhas elétricas do Schematic (nets, power rails)
- Base de troubleshooting técnico
- Documentos PDF técnicos

Responda sempre em português brasileiro de forma técnica e profissional.
Use nomenclatura real de componentes (PMIC, UFS, CPU, SOC, PA, LNA, etc.)
Cite tensões reais, test points reais e procedimentos técnicos específicos.
Seja objetivo e direto — o técnico precisa de informações acionáveis.`;

export function buildSystemPrompt(activeContexts: ActiveContexts): string {
  const modes: string[] = [];
  if (activeContexts.usb)              modes.push("USB_LIVE");
  if (activeContexts.boardview)        modes.push("BOARDVIEW");
  if (activeContexts.schematic)        modes.push("SCHEMATIC");
  if (activeContexts.troubleshooting)  modes.push("TROUBLESHOOTING");
  if (activeContexts.pdf)              modes.push("PDF");

  const modeStr = modes.length > 0
    ? `\nModos ativos: ${modes.join(", ")}`
    : "\nModo: MANUAL (sem contexto ativo)";

  return SYSTEM_PROMPT_BASE + modeStr;
}

export function buildUserMessage(userPrompt: string, activeContexts: ActiveContexts): string {
  const parts: string[] = [];

  if (activeContexts.usb) {
    const u = activeContexts.usb;
    parts.push(`=== DISPOSITIVO USB CONECTADO ===
Marca: ${u.brand || "N/A"}
Modelo: ${u.model || "N/A"}
Android: ${u.androidVersion || "N/A"}
CPU: ${u.cpu || "N/A"}
Serial: ${u.serial || "N/A"}
Bateria: ${u.batteryVoltage || "N/A"}
Modo USB: ${u.mode || "N/A"}
Bootloader: ${u.bootloaderStatus || "N/A"}
Logs recentes: ${JSON.stringify((u.logs || []).slice(-10))}`);
  }

  if (activeContexts.boardview) {
    const b = activeContexts.boardview;
    parts.push(`=== COMPONENTE SELECIONADO NO BOARDVIEW ===
Nome: ${b.name || "N/A"}
Categoria: ${b.category || "N/A"}
Part Code: ${b.part_code || "N/A"}
Descrição: ${b.description || "N/A"}
Linha Elétrica: ${b.electricalLine || "N/A"}
Tensão: ${b.voltage || "N/A"}
Lado: ${b.side || "N/A"}
Coordenadas: X=${b.x ?? "N/A"}, Y=${b.y ?? "N/A"}
Defeitos comuns: ${b.commonFaults?.join(", ") || "N/A"}`);
  }

  if (activeContexts.schematic) {
    const s = activeContexts.schematic;
    parts.push(`=== LINHA ELÉTRICA NO SCHEMATIC ===
Net: ${s.net || "N/A"}
Tensão: ${s.voltage || "N/A"}
Power Rail: ${s.powerRail || "N/A"}
Página: ${s.pageIndex !== undefined ? s.pageIndex + 1 : "N/A"}`);
  }

  if (activeContexts.troubleshooting) {
    const t = activeContexts.troubleshooting;
    parts.push(`=== SINTOMA ATIVO ===
Dispositivo: ${t.deviceModel || "N/A"}
Sintoma: ${t.symptom || "N/A"}`);
  }

  if (activeContexts.pdf) {
    const p = activeContexts.pdf;
    parts.push(`=== DOCUMENTO PDF ATIVO ===
Arquivo: ${p.fileName || "N/A"}
Página: ${p.pageIndex !== undefined ? p.pageIndex + 1 : "N/A"}
Trecho extraído: ${p.extractedText?.slice(0, 500) || "N/A"}`);
  }

  if (userPrompt.trim()) {
    parts.push(`=== PERGUNTA DO TÉCNICO ===
${userPrompt}`);
  }

  return parts.join("\n\n") || "Analise o contexto atual e forneça um diagnóstico técnico.";
}

export function detectMode(activeContexts: ActiveContexts): AIMode {
  if (activeContexts.usb && activeContexts.boardview) return "USB_BOARDVIEW";
  if (activeContexts.usb && activeContexts.schematic) return "USB_SCHEMATIC";
  if (activeContexts.usb)             return "USB_LIVE";
  if (activeContexts.boardview)       return "BOARDVIEW";
  if (activeContexts.schematic)       return "SCHEMATIC";
  if (activeContexts.troubleshooting) return "TROUBLESHOOTING";
  if (activeContexts.pdf)             return "PDF";
  return "MANUAL";
}

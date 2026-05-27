// src/app/api/ai/route.ts
// Endpoint único de IA — substitui api/diagnostic e api/schematics/ai
// Usa o TechAIEngine central

import { NextRequest, NextResponse } from "next/server";
import { generateDiagnosis } from "@/core/ai/techAIEngine";
import {
  BoardviewContext,
  SchematicContext,
  USBContext,
  TroubleshootingContext,
  PDFContext,
} from "@/core/ai/contextManager";

export interface AIRequest {
  /** Pergunta do técnico */
  userPrompt?: string;
  /** Contextos opcionais passados diretamente */
  context?: {
    usb?: USBContext;
    boardview?: BoardviewContext;
    schematic?: SchematicContext;
    troubleshooting?: TroubleshootingContext;
    pdf?: PDFContext;
  };
  /** Máximo de tokens (padrão: 2000) */
  maxTokens?: number;
}

export interface AIResponse {
  response: string;
  mode: string;
  activeContexts: string[];
  timestamp: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: AIRequest = await req.json();

    const result = await generateDiagnosis({
      userPrompt: body.userPrompt ?? "",
      extraContext: body.context ?? {},
      maxTokens: body.maxTokens ?? 2000,
    });

    return NextResponse.json(result satisfies AIResponse);
  } catch (e: any) {
    console.error("[API/AI]", e.message);

    // Fallback estruturado para não quebrar o frontend
    return NextResponse.json({
      response: `Erro ao processar diagnóstico: ${e.message}. Verifique se GROQ_API_KEY está configurada.`,
      mode: "ERROR",
      activeContexts: [],
      timestamp: new Date().toISOString(),
    } satisfies AIResponse, { status: 500 });
  }
}

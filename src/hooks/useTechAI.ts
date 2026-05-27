"use client";
// src/hooks/useTechAI.ts
// Hook React para o TechAIEngine unificado
// Substitui todos os hooks de IA anteriores

import { useState, useCallback } from "react";
import type { AIRequest, AIResponse } from "@/app/api/ai/route";
import type { BoardviewContext, SchematicContext, USBContext, TroubleshootingContext, PDFContext } from "@/core/ai/contextManager";

export interface UseTechAIReturn {
  // Estado
  response: string;
  mode: string;
  activeContexts: string[];
  loading: boolean;
  error: string | null;

  // Ação principal
  diagnose: (params: {
    userPrompt?: string;
    boardview?: BoardviewContext;
    schematic?: SchematicContext;
    usb?: USBContext;
    troubleshooting?: TroubleshootingContext;
    pdf?: PDFContext;
  }) => Promise<string>;

  // Reset
  clear: () => void;
}

export function useTechAI(): UseTechAIReturn {
  const [response, setResponse] = useState("");
  const [mode, setMode] = useState("");
  const [activeContexts, setActiveContexts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diagnose = useCallback(async ({
    userPrompt = "",
    boardview,
    schematic,
    usb,
    troubleshooting,
    pdf,
  }: {
    userPrompt?: string;
    boardview?: BoardviewContext;
    schematic?: SchematicContext;
    usb?: USBContext;
    troubleshooting?: TroubleshootingContext;
    pdf?: PDFContext;
  }): Promise<string> => {
    setLoading(true);
    setError(null);

    try {
      const body: AIRequest = {
        userPrompt,
        context: {
          ...(boardview      && { boardview }),
          ...(schematic      && { schematic }),
          ...(usb            && { usb }),
          ...(troubleshooting && { troubleshooting }),
          ...(pdf            && { pdf }),
        },
      };

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: AIResponse = await res.json();
      setResponse(data.response);
      setMode(data.mode);
      setActiveContexts(data.activeContexts);
      return data.response;
    } catch (e: any) {
      const msg = e.message ?? "Erro desconhecido";
      setError(msg);
      return "";
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResponse("");
    setMode("");
    setActiveContexts([]);
    setError(null);
  }, []);

  return {
    response,
    mode,
    activeContexts,
    loading,
    error,
    diagnose,
    clear,
  };
}

// src/app/api/search/route.ts
// Global Search IA — busca inteligente em todos os documentos indexados

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface SearchResult {
  type: "component" | "troubleshooting" | "electrical_part" | "schematic" | "voltage";
  title: string;
  description: string;
  relevance: number;
  metadata: Record<string, any>;
  deviceId?: string;
  pageIndex?: number;
  coordinates?: { x: number; y: number; width: number; height: number };
}

export interface GlobalSearchResponse {
  query: string;
  results: SearchResult[];
  aiSummary: string;
  relatedComponents: string[];
  relatedSymptoms: string[];
  suggestedActions: string[];
  totalFound: number;
}

async function searchWithGroq(query: string, context: string): Promise<{
  summary: string;
  relatedComponents: string[];
  relatedSymptoms: string[];
  suggestedActions: string[];
}> {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 600,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: `Você é especialista técnico em manutenção de smartphones.
Analise a busca do técnico e os dados encontrados.
Responda APENAS com JSON válido:
{
  "summary": "resumo técnico do que foi encontrado",
  "relatedComponents": ["U5003", "PAM1000"],
  "relatedSymptoms": ["sem carga", "bateria não carrega"],
  "suggestedActions": ["Medir tensão VBAT", "Verificar U5003"]
}`,
          },
          {
            role: "user",
            content: `Busca: "${query}"\n\nDados encontrados:\n${context}`,
          },
        ],
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON not found");
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      summary: `Resultados para "${query}"`,
      relatedComponents: [],
      relatedSymptoms: [],
      suggestedActions: [],
    };
  }
}

export async function POST(req: NextRequest) {
  const { query, deviceId, limit = 20 } = await req.json();

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query vazia" }, { status: 400 });
  }

  const results: SearchResult[] = [];
  const q = query.trim();

  // ── 1. Busca em board_components ──────────────────────────────────────────
  try {
    let compQuery = supabase
      .from("board_components")
      .select("*")
      .ilike("name", `%${q}%`)
      .limit(limit);

    if (deviceId) compQuery = compQuery.eq("device_id", deviceId);

    const { data: components } = await compQuery;

    (components ?? []).forEach((c) => {
      results.push({
        type: "component",
        title: c.name,
        description: c.description || `Tipo: ${c.type} | Linha: ${c.electrical_line}`,
        relevance: c.name.toLowerCase() === q.toLowerCase() ? 100 : 80,
        metadata: {
          type: c.type,
          electricalLine: c.electrical_line,
          voltage: c.voltage,
          commonFaults: c.common_faults,
          pageIndex: c.page_index,
        },
        deviceId: c.device_id,
        pageIndex: c.page_index,
        coordinates: { x: c.x, y: c.y, width: c.width, height: c.height },
      });
    });
  } catch (e) {
    console.error("Component search error:", e);
  }

  // ── 2. Busca em electrical_parts ──────────────────────────────────────────
  try {
    let eplQuery = supabase
      .from("electrical_parts")
      .select("*")
      .or(`name.ilike.%${q}%,description.ilike.%${q}%,part_code.ilike.%${q}%`)
      .limit(limit);

    if (deviceId) eplQuery = eplQuery.eq("device_id", deviceId);

    const { data: parts } = await eplQuery;

    (parts ?? []).forEach((p) => {
      results.push({
        type: "electrical_part",
        title: p.name || p.part_code,
        description: p.description || p.part_code,
        relevance: 75,
        metadata: {
          partCode: p.part_code,
          designLoc: p.design_loc,
          category: p.category,
        },
        deviceId: p.device_id,
      });
    });
  } catch (e) {
    console.error("EPL search error:", e);
  }

  // ── 3. Busca em troubleshooting ───────────────────────────────────────────
  try {
    let tshQuery = supabase
      .from("troubleshooting")
      .select("*")
      .or(`symptom.ilike.%${q}%,solution.ilike.%${q}%,cause.ilike.%${q}%`)
      .limit(limit);

    if (deviceId) tshQuery = tshQuery.eq("device_id", deviceId);

    const { data: tshItems } = await tshQuery;

    (tshItems ?? []).forEach((t) => {
      results.push({
        type: "troubleshooting",
        title: t.symptom,
        description: t.solution || t.cause || "",
        relevance: 70,
        metadata: {
          cause: t.cause,
          solution: t.solution,
          severity: t.severity,
          affectedComponents: t.affected_components,
        },
        deviceId: t.device_id,
      });
    });
  } catch (e) {
    console.error("Troubleshooting search error:", e);
  }

  // ── 4. Busca em voltages ──────────────────────────────────────────────────
  try {
    let vQuery = supabase
      .from("voltages")
      .select("*")
      .or(`name.ilike.%${q}%,component.ilike.%${q}%,description.ilike.%${q}%`)
      .limit(10);

    if (deviceId) vQuery = vQuery.eq("device_id", deviceId);

    const { data: voltages } = await vQuery;

    (voltages ?? []).forEach((v) => {
      results.push({
        type: "voltage",
        title: v.name || v.component,
        description: `${v.value ?? ""} — ${v.description ?? ""}`,
        relevance: 65,
        metadata: {
          value: v.value,
          component: v.component,
          testPoint: v.test_point,
        },
        deviceId: v.device_id,
      });
    });
  } catch (e) {
    console.error("Voltage search error:", e);
  }

  // ── 5. Busca em ocr_cache (texto extraído dos PDFs) ───────────────────────
  try {
    let ocrQuery = supabase
      .from("ocr_cache")
      .select("device_id, file_url, page_index, raw_text")
      .ilike("raw_text", `%${q}%`)
      .limit(10);

    if (deviceId) ocrQuery = ocrQuery.eq("device_id", deviceId);

    const { data: ocrItems } = await ocrQuery;

    (ocrItems ?? []).forEach((o) => {
      // Extrai trecho relevante do texto
      const idx = o.raw_text?.toLowerCase().indexOf(q.toLowerCase()) ?? -1;
      const snippet = idx >= 0
        ? o.raw_text.substring(Math.max(0, idx - 60), idx + 120)
        : "";

      results.push({
        type: "schematic",
        title: `PDF — Página ${o.page_index + 1}`,
        description: snippet || "Encontrado no documento",
        relevance: 60,
        metadata: {
          fileUrl: o.file_url,
          snippet,
        },
        deviceId: o.device_id,
        pageIndex: o.page_index,
      });
    });
  } catch (e) {
    console.error("OCR cache search error:", e);
  }

  // ── Ordena por relevância ─────────────────────────────────────────────────
  results.sort((a, b) => b.relevance - a.relevance);

  // ── Contexto para a IA ────────────────────────────────────────────────────
  const aiContext = results
    .slice(0, 8)
    .map(r => `[${r.type.toUpperCase()}] ${r.title}: ${r.description}`)
    .join("\n");

  // ── Análise IA ────────────────────────────────────────────────────────────
  const aiAnalysis = await searchWithGroq(q, aiContext);

  const response: GlobalSearchResponse = {
    query: q,
    results: results.slice(0, limit),
    aiSummary: aiAnalysis.summary,
    relatedComponents: aiAnalysis.relatedComponents,
    relatedSymptoms: aiAnalysis.relatedSymptoms,
    suggestedActions: aiAnalysis.suggestedActions,
    totalFound: results.length,
  };

  return NextResponse.json(response);
}

// GET para busca rápida sem IA (autocomplete)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") ?? "";
  const deviceId = searchParams.get("deviceId") ?? undefined;

  if (!query || query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions: string[] = [];

  try {
    const { data: components } = await supabase
      .from("board_components")
      .select("name")
      .ilike("name", `${query}%`)
      .limit(8);

    (components ?? []).forEach(c => {
      if (!suggestions.includes(c.name)) suggestions.push(c.name);
    });
  } catch {}

  try {
    const { data: parts } = await supabase
      .from("electrical_parts")
      .select("name")
      .ilike("name", `${query}%`)
      .limit(5);

    (parts ?? []).forEach(p => {
      if (p.name && !suggestions.includes(p.name)) suggestions.push(p.name);
    });
  } catch {}

  return NextResponse.json({ suggestions: suggestions.slice(0, 10) });
}

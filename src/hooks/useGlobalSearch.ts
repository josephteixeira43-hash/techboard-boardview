"use client";
// hooks/useGlobalSearch.ts
// Hook para Global Search IA — busca em todos os documentos

import { useState, useCallback, useRef } from "react";
import { GlobalSearchResponse, SearchResult } from "@/app/api/search/route";

export function useGlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [relatedComponents, setRelatedComponents] = useState<string[]>([]);
  const [relatedSymptoms, setRelatedSymptoms] = useState<string[]>([]);
  const [suggestedActions, setSuggestedActions] = useState<string[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<NodeJS.Timeout>();

  const search = useCallback(async (q: string, deviceId?: string) => {
    if (!q.trim()) {
      setResults([]);
      setAiSummary("");
      setRelatedComponents([]);
      setRelatedSymptoms([]);
      setSuggestedActions([]);
      setTotalFound(0);
      return;
    }

    setLoading(true);
    setError(null);
    setQuery(q);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, deviceId, limit: 30 }),
      });

      if (!res.ok) throw new Error("Erro na busca");

      const data: GlobalSearchResponse = await res.json();
      setResults(data.results);
      setAiSummary(data.aiSummary);
      setRelatedComponents(data.relatedComponents);
      setRelatedSymptoms(data.relatedSymptoms);
      setSuggestedActions(data.suggestedActions);
      setTotalFound(data.totalFound);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Autocomplete com debounce
  const fetchSuggestions = useCallback((q: string, deviceId?: string) => {
    clearTimeout(debounceRef.current);
    if (q.length < 2) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (deviceId) params.set("deviceId", deviceId);
        const res = await fetch(`/api/search?${params}`);
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      } catch {}
    }, 200);
  }, []);

  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
    setAiSummary("");
    setRelatedComponents([]);
    setRelatedSymptoms([]);
    setSuggestedActions([]);
    setTotalFound(0);
    setSuggestions([]);
    setError(null);
  }, []);

  // Filtra resultados por tipo
  const getByType = useCallback((type: SearchResult["type"]) =>
    results.filter(r => r.type === type),
  [results]);

  return {
    query,
    results,
    aiSummary,
    relatedComponents,
    relatedSymptoms,
    suggestedActions,
    totalFound,
    loading,
    error,
    suggestions,
    search,
    fetchSuggestions,
    clear,
    getByType,
  };
}

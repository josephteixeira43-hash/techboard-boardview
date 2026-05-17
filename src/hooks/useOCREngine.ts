"use client";
import { useRef, useState, useCallback } from "react";

export interface OCRResult {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
  pageIndex: number;
}

export interface OCRHighlight {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  pageIndex: number;
  isCurrent: boolean;
}

// Cache de resultados OCR por página
const ocrCache = new Map<string, OCRResult[]>();

export function useOCREngine() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [highlights, setHighlights] = useState<OCRHighlight[]>([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const workerRef = useRef<any>(null);

  // Inicializa worker Tesseract
  async function getWorker() {
    if (workerRef.current) return workerRef.current;
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (m: any) => {
        if (m.status === "recognizing text") {
          setProgress(Math.round(m.progress * 100));
        }
      },
    });
    workerRef.current = worker;
    return worker;
  }

  // Processa OCR em uma página do canvas
  const processPage = useCallback(async (
    canvas: HTMLCanvasElement,
    pageIndex: number,
    cacheKey: string
  ): Promise<OCRResult[]> => {
    // Verifica cache
    const cached = ocrCache.get(`${cacheKey}-${pageIndex}`);
    if (cached) return cached;

    const worker = await getWorker();

    // Converte canvas para blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), "image/png");
    });

    const { data } = await worker.recognize(blob);

    const results: OCRResult[] = [];
    data.words.forEach((word: any) => {
      if (word.confidence > 40 && word.text.trim().length > 1) {
        results.push({
          text: word.text.trim(),
          bbox: word.bbox,
          confidence: word.confidence,
          pageIndex,
        });
      }
    });
console.log("OCR words found:", results.slice(0, 20).map(r => r.text));
    ocrCache.set(`${cacheKey}-${pageIndex}`, results);
    return results;
  }, []);
  

  // Busca no OCR
  const searchOCR = useCallback((
    query: string,
    results: OCRResult[],
    currentPage: number,
    canvasWidth: number,
    canvasHeight: number,
    scale: number
  ) => {
    if (!query.trim()) {
      setHighlights([]);
      return [];
    }

    const q = query.toLowerCase();
    const matches: OCRHighlight[] = [];

    results.forEach((r, i) => {
      if (r.text.toLowerCase().includes(q) && r.pageIndex === currentPage) {
        matches.push({
          x: r.bbox.x0,
          y: r.bbox.y0,
          width: r.bbox.x1 - r.bbox.x0,
          height: r.bbox.y1 - r.bbox.y0,
          text: r.text,
          pageIndex: r.pageIndex,
          isCurrent: matches.length === 0,
        });
      }
    });

    // Marca o atual
    if (matches.length > 0) {
      matches[currentMatch % matches.length].isCurrent = true;
    }

    setHighlights(matches);
    return matches;
  }, [currentMatch]);

  // Processa OCR da página atual
  const runOCR = useCallback(async (
    canvas: HTMLCanvasElement,
    pageIndex: number,
    fileUrl: string
  ) => {
    setProcessing(true);
    setProgress(0);

    try {
      const results = await processPage(canvas, pageIndex, fileUrl);
      setOcrResults(prev => {
        // Remove resultados anteriores dessa página
        const filtered = prev.filter(r => r.pageIndex !== pageIndex);
        return [...filtered, ...results];
      });
    } catch (e) {
      console.error("OCR error:", e);
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  }, [processPage]);

  const goToMatch = useCallback((index: number, total: number) => {
    const i = ((index % total) + total) % total;
    setCurrentMatch(i);
    setHighlights(prev => prev.map((h, idx) => ({ ...h, isCurrent: idx === i })));
  }, []);

  const clearHighlights = () => {
    setHighlights([]);
    setCurrentMatch(0);
  };

  return {
    processing,
    progress,
    ocrResults,
    highlights,
    currentMatch,
    runOCR,
    searchOCR,
    goToMatch,
    clearHighlights,
  };
}

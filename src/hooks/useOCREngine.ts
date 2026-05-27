"use client";
import { useRef, useState, useCallback } from "react";
import { preprocessCanvasForOCR } from "@/lib/ocrPreprocessor";

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

const ocrCache = new Map<string, OCRResult[]>();

export function useOCREngine() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [highlights, setHighlights] = useState<OCRHighlight[]>([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const workerRef = useRef<any>(null);

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
    await worker.setParameters({
      tessedit_pageseg_mode: "1",
    });
    workerRef.current = worker;
    return worker;
  }

  const processPage = useCallback(async (
    canvas: HTMLCanvasElement,
    pageIndex: number,
    cacheKey: string
  ): Promise<OCRResult[]> => {
    const cached = ocrCache.get(`${cacheKey}-${pageIndex}`);
    if (cached) return cached;

    const worker = await getWorker();

    // Inverte pixel a pixel: fundo preto → branco para OCR funcionar
    const invertedCanvas = document.createElement("canvas");
    invertedCanvas.width = canvas.width;
    invertedCanvas.height = canvas.height;
    const invertCtx = invertedCanvas.getContext("2d", { willReadFrequently: true })!;
    invertCtx.drawImage(canvas, 0, 0);
    const imgData = invertCtx.getImageData(0, 0, invertedCanvas.width, invertedCanvas.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i]     = 255 - imgData.data[i];
      imgData.data[i + 1] = 255 - imgData.data[i + 1];
      imgData.data[i + 2] = 255 - imgData.data[i + 2];
    }
    invertCtx.putImageData(imgData, 0, 0);

    const cleanCanvas = await preprocessCanvasForOCR(invertedCanvas, {
      removeHighlights: true,
      binarize: true,
      binarizeThreshold: 160,
      enhanceContrast: true,
      contrastFactor: 2.5,
      upscale: 4,
    });

    const blob = await new Promise<Blob>((resolve) => {
      cleanCanvas.toBlob((b) => resolve(b!), "image/png");
    });

    const { data } = await worker.recognize(blob, {}, {
      text: true,
      blocks: true,
      hocr: false,
      tsv: false,
      box: false,
    });

    const results: OCRResult[] = [];
    const upscale = 4;
    const canvasW = cleanCanvas.width / upscale;
    const canvasH = cleanCanvas.height / upscale;

    const words =
      data.words ??
      data.lines?.flatMap((l: any) => l.words ?? []) ??
      data.blocks?.flatMap((b: any) =>
        b.paragraphs?.flatMap((p: any) =>
          p.lines?.flatMap((l: any) => l.words ?? []) ?? []
        ) ?? []
      ) ?? [];

    if (words.length > 0) {
      words.forEach((word: any) => {
        if (word.confidence > 40 && word.text?.trim().length > 1) {
          results.push({
            text: word.text.trim(),
            bbox: {
              x0: word.bbox.x0 / upscale,
              y0: word.bbox.y0 / upscale,
              x1: word.bbox.x1 / upscale,
              y1: word.bbox.y1 / upscale,
            },
            confidence: word.confidence,
            pageIndex,
          });
        }
      });
    } else if (data.text) {
      const lines = data.text.split("\n").filter((l: string) => l.trim().length > 1);
      const lineH = canvasH / Math.max(lines.length, 1);

      lines.forEach((line: string, lineIdx: number) => {
        const tokens = line.trim().split(/\s+/);
        const tokenW = canvasW / Math.max(tokens.length, 1);

        tokens.forEach((token: string, tokenIdx: number) => {
          if (token.length > 1) {
            results.push({
              text: token,
              bbox: {
                x0: tokenIdx * tokenW,
                y0: lineIdx * lineH,
                x1: (tokenIdx + 1) * tokenW,
                y1: (lineIdx + 1) * lineH,
              },
              confidence: 80,
              pageIndex,
            });
          }
        });
      });
    }

    console.log("OCR words found:", results.map(r => r.text).join(", "));
    ocrCache.set(`${cacheKey}-${pageIndex}`, results);
    return results;
  }, []);

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

    results.forEach((r) => {
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

    if (matches.length > 0) {
      matches[currentMatch % matches.length].isCurrent = true;
    }

    setHighlights(matches);
    return matches;
  }, [currentMatch]);

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

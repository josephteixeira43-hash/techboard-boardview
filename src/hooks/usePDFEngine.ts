"use client";
import { useEffect, useRef, useState, useCallback } from "react";

let pdfjsLib: any = null;

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import("pdfjs-dist");
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjsLib;
}

export interface PDFPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  thumbnail?: string;
}

export interface SearchResult {
  pageIndex: number;
  matchIndex: number;
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export function usePDFEngine(url: string | null) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.5);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [pageInfos, setPageInfos] = useState<PDFPageInfo[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);

  // Carrega o PDF
  useEffect(() => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setSearchResults([]);
    setCurrentPage(1);

    getPdfJs().then(async (lib) => {
      try {
        const doc = await lib.getDocument({
          url,
          cMapUrl: `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/cmaps/`,
          cMapPacked: true,
        }).promise;
        pdfDocRef.current = doc;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);

        // Gera infos das páginas
        const infos: PDFPageInfo[] = [];
        for (let i = 1; i <= Math.min(doc.numPages, 50); i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 0.2 });
          infos.push({ pageNumber: i, width: vp.width, height: vp.height });
        }
        setPageInfos(infos);
        setLoading(false);
      } catch (e: any) {
        setError("Erro ao carregar PDF: " + e.message);
        setLoading(false);
      }
    });

    return () => {
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    };
  }, [url]);

  // Renderiza página no canvas
  const renderPage = useCallback(async (pageNum: number, zoom: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoom, rotation });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: ctx,
        viewport,
        enableWebGL: false,
        renderInteractiveForms: false,
      };

      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;
    } catch (e: any) {
      if (e.name !== "RenderingCancelledException") {
        console.error("Render error:", e);
      }
    }
  }, [rotation]);

  useEffect(() => {
    renderPage(currentPage, scale);
  }, [currentPage, scale, rotation, renderPage, pdfDoc]);

  // Busca no PDF
  const searchInPDF = useCallback(async (query: string) => {
    if (!pdfDocRef.current || !query.trim()) {
      setSearchResults([]);
      return;
    }

    const results: SearchResult[] = [];
    const q = query.toLowerCase();

    for (let i = 1; i <= pdfDocRef.current.numPages; i++) {
      const page = await pdfDocRef.current.getPage(i);
      const textContent = await page.getTextContent();

      textContent.items.forEach((item: any, idx: number) => {
        if (item.str && item.str.toLowerCase().includes(q)) {
          results.push({
            pageIndex: i,
            matchIndex: idx,
            str: item.str,
            transform: item.transform,
            width: item.width,
            height: item.height,
          });
        }
      });
    }

    setSearchResults(results);
    setCurrentMatch(0);

    if (results.length > 0) {
      setCurrentPage(results[0].pageIndex);
    }

    return results;
  }, []);

  const goToMatch = useCallback((index: number) => {
    if (!searchResults.length) return;
    const i = ((index % searchResults.length) + searchResults.length) % searchResults.length;
    setCurrentMatch(i);
    setCurrentPage(searchResults[i].pageIndex);
  }, [searchResults]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 5));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.3));
  const zoomFit = () => setScale(1.0);
  const zoomWidth = () => setScale(1.5);
  const rotate = () => setRotation((r) => (r + 90) % 360);
  const nextPage = () => setCurrentPage((p) => Math.min(p + 1, totalPages));
  const prevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));

  return {
    canvasRef,
    pdfDoc,
    totalPages,
    currentPage,
    setCurrentPage,
    scale,
    setScale,
    rotation,
    loading,
    error,
    searchResults,
    currentMatch,
    pageInfos,
    searchInPDF,
    goToMatch,
    zoomIn,
    zoomOut,
    zoomFit,
    zoomWidth,
    rotate,
    nextPage,
    prevPage,
  };
}

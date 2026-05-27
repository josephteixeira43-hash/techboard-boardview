/**
 * useOCR.ts
 * Hook React para OCR com pré-processamento integrado — TechBoard Pro
 *
 * Uso:
 *   const { runOCR, isProcessing, progress, result, previewURL } = useOCR();
 *   await runOCR(canvas);          // canvas normal
 *   await runOCR(pdfPage, true);   // página PDF.js
 */

import { useState, useCallback, useRef } from 'react';
import Tesseract from 'tesseract.js';
import {
  preprocessCanvasForOCR,
  preprocessPDFPageForOCR,
  getPreviewDataURL,
  PreprocessOptions,
} from '@/lib/ocrPreprocessor';

export interface OCRResult {
  text: string;
  confidence: number;
  words: Tesseract.Word[];
  lines: Tesseract.Line[];
}

export interface UseOCROptions {
  /** Idiomas para o Tesseract (padrão: 'por+eng') */
  lang?: string;
  /** Opções de pré-processamento */
  preprocessOptions?: PreprocessOptions;
  /** Escala de renderização da página PDF (padrão: 2.0) */
  pdfScale?: number;
}

export function useOCR(options: UseOCROptions = {}) {
  const {
    lang = 'por+eng',
    preprocessOptions = {},
    pdfScale = 2.0,
  } = options;

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [result, setResult] = useState<OCRResult | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Tesseract.Worker | null>(null);

  const initWorker = useCallback(async () => {
    if (workerRef.current) return workerRef.current;

    const worker = await Tesseract.createWorker(lang, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          setProgress(Math.round(m.progress * 100));
          setProgressLabel('Reconhecendo texto...');
        } else if (m.status === 'loading tesseract core') {
          setProgressLabel('Carregando Tesseract...');
        } else if (m.status === 'initializing tesseract') {
          setProgressLabel('Inicializando...');
        } else if (m.status === 'loading language traineddata') {
          setProgressLabel(`Carregando idioma (${lang})...`);
        }
      },
    });

    workerRef.current = worker;
    return worker;
  }, [lang]);

  /**
   * Executa OCR em um canvas ou página PDF.js.
   *
   * @param source  — HTMLCanvasElement OU PDFPageProxy
   * @param isPDF   — true se for página PDF.js
   */
  const runOCR = useCallback(
    async (source: HTMLCanvasElement | any, isPDF = false) => {
      setIsProcessing(true);
      setProgress(0);
      setError(null);
      setResult(null);

      try {
        // 1. Pré-processamento
        setProgressLabel('Removendo marcações coloridas...');
        let processedCanvas: HTMLCanvasElement;

        if (isPDF) {
          processedCanvas = await preprocessPDFPageForOCR(
            source,
            pdfScale,
            preprocessOptions
          );
        } else {
          processedCanvas = await preprocessCanvasForOCR(source, preprocessOptions);
        }

        // 2. Gera preview da imagem pré-processada
        const preview = processedCanvas.toDataURL('image/png');
        setPreviewURL(preview);

        // 3. Inicializa worker Tesseract
        setProgressLabel('Inicializando OCR...');
        const worker = await initWorker();

        // 4. Executa reconhecimento
        setProgressLabel('Reconhecendo texto...');
        const { data } = await worker.recognize(processedCanvas);

        setResult({
          text: data.text,
          confidence: data.confidence,
          words: data.words,
          lines: data.lines,
        });

        setProgress(100);
        setProgressLabel('Concluído!');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido no OCR';
        setError(msg);
        console.error('[useOCR]', err);
      } finally {
        setIsProcessing(false);
      }
    },
    [initWorker, preprocessOptions, pdfScale]
  );

  /**
   * Gera apenas o preview sem rodar OCR completo.
   * Útil para mostrar ao usuário o que será processado.
   */
  const generatePreview = useCallback(
    async (source: HTMLCanvasElement | any, isPDF = false) => {
      try {
        let processedCanvas: HTMLCanvasElement;
        if (isPDF) {
          processedCanvas = await preprocessPDFPageForOCR(source, pdfScale, preprocessOptions);
        } else {
          processedCanvas = await preprocessCanvasForOCR(source, preprocessOptions);
        }
        const url = await getPreviewDataURL(processedCanvas);
        setPreviewURL(url);
        return url;
      } catch (err) {
        console.error('[useOCR] generatePreview error:', err);
        return null;
      }
    },
    [preprocessOptions, pdfScale]
  );

  const reset = useCallback(() => {
    setResult(null);
    setPreviewURL(null);
    setError(null);
    setProgress(0);
    setProgressLabel('');
  }, []);

  const terminate = useCallback(async () => {
    if (workerRef.current) {
      await workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  return {
    runOCR,
    generatePreview,
    reset,
    terminate,
    isProcessing,
    progress,
    progressLabel,
    result,
    previewURL,
    error,
  };
}
